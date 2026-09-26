/**
 * First-Party Native Agent Runtime Engine (ADR-0003, Spec #61, Issue #64).
 *
 * Implements AgentRuntimeAdapter to stream conversational responses, separate thinking blocks,
 * manage sliding-window context compaction, and route native provider calls (Gemini, Anthropic,
 * OpenAI, DeepSeek, OpenRouter, Ollama, Kilo Gateway).
 */
import type Database from 'better-sqlite3';
import { NATIVE_PROVIDER_IDS } from '@shared/types';
import type { NativeProviderId, SessionPermissionMode } from '@shared/types';
import { NATIVE_RUNTIME_LIMITS } from '@shared/constants';
import type {
  AgentRuntimeAdapter,
  AgentRuntimeStreamCallbacks,
  ToolGateFunction,
} from '../types';
import type { ProviderRunBridge } from '../providerBridge';
import type { ProviderAuthManager } from '../ProviderAuthManager';
import type { ModelCatalogManager } from '../catalog/ModelCatalogManager';
import type { SettingsManager } from '../../SettingsManager';
import { resolveArabicLocaleGuidance } from '../locale';
import { ContextCompactor } from './ContextCompactor';
import { guardedPostSse } from './transport';
import {
  parseGeminiStream,
  parseAnthropicStream,
  parseOpenAiCompatStream,
} from './streamParsers';
import {
  toOpenAiTools,
  toAnthropicTools,
  toGeminiTools,
  executeNativeTool,
  type NativeToolExecutionContext,
  type NativeToolMemoryManager,
} from './tools';
import { loadWorkspaceModes, resolveActiveMode } from './modes/modeDiscovery';
import type { ConversationMessage, NormalizedStreamChunk } from './types';


export const DEFAULT_PROVIDER_BASE_URLS = NATIVE_RUNTIME_LIMITS.defaultProviderBaseUrls;
export const DEFAULT_CONTEXT_LIMITS = NATIVE_RUNTIME_LIMITS.defaultContextLimits;

/**
 * Parses composite model strings (e.g. "gemini:gemini-2.5-flash", "deepseek:deepseek-r1").
 */
export function parseNativeModelId(modelId: string): {
  provider: NativeProviderId;
  rawModelName: string;
} {
  let cleanId = modelId;
  if (cleanId === 'native' || cleanId === 'native:default') {
    return { provider: 'gemini', rawModelName: 'gemini-2.5-flash' };
  }
  if (cleanId.startsWith('native:')) {
    cleanId = cleanId.slice('native:'.length);
  }
  const colonIdx = cleanId.indexOf(':');
  if (colonIdx !== -1) {
    const prefix = cleanId.slice(0, colonIdx);
    const rest = cleanId.slice(colonIdx + 1);
    if (NATIVE_PROVIDER_IDS.includes(prefix as NativeProviderId)) {
      return { provider: prefix as NativeProviderId, rawModelName: rest };
    }
  }
  return { provider: 'gemini', rawModelName: cleanId };
}

export class NativeAgentRuntime implements AgentRuntimeAdapter {
  readonly provider = 'native' as const;
  private readonly compactor: ContextCompactor;
  private isDisposed = false;

  constructor(
    private readonly authManager: ProviderAuthManager,
    private readonly catalogManager: ModelCatalogManager,
    private readonly settings: SettingsManager,
    private readonly db: Database.Database,
    private memoryManager?: NativeToolMemoryManager,
  ) {
    this.compactor = new ContextCompactor(this.db);
  }

  setMemoryManager(memory: NativeToolMemoryManager): void {
    this.memoryManager = memory;
  }

  private askUserQuestionHandler?: (
    sessionId: string,
    question: string,
    options?: string[],
    signal?: AbortSignal,
  ) => Promise<string>;

  setAskUserQuestionHandler(
    handler: (sessionId: string, question: string, options?: string[], signal?: AbortSignal) => Promise<string>,
  ): void {
    this.askUserQuestionHandler = handler;
  }

  /**
   * Executes a streaming run turn against the resolved native provider API.
   */
  async run(
    sessionId: string,
    prompt: string,
    cwd: string,
    abort: AbortController,
    permMode: SessionPermissionMode,

    stream: AgentRuntimeStreamCallbacks,
    bridge?: ProviderRunBridge,
    gate?: ToolGateFunction,
  ): Promise<void> {
    if (this.isDisposed) {
      throw new Error('NativeAgentRuntime has been disposed.');
    }

    const effectiveBridge: ProviderRunBridge = bridge ?? {
      ensureStreaming: () => stream.ensureStreaming(),
      queueDelta: (text) => stream.queueDelta(text),
      finishStreaming: (finalText) => stream.finishStreaming(finalText),
      onToolUse: () => undefined,
      onToolResult: () => undefined,
      onInit: () => undefined,
      onResult: () => undefined,
      diag: () => undefined,
    };

    const currentModelId = this.settings.getAll().agent.model;
    const { provider, rawModelName } = parseNativeModelId(currentModelId);

    // 1. Resolve Credentials & Base URL
    const apiKey = this.authManager.getEffectiveApiKey(provider) ?? undefined;
    if (!apiKey && provider !== 'ollama') {
      throw new Error(
        `API key missing for provider "${provider}". Please configure your API key in Settings > Providers.`,
      );
    }

    const configuredBaseUrl = this.authManager.getEffectiveBaseUrl(provider);
    const baseUrl = (configuredBaseUrl || DEFAULT_PROVIDER_BASE_URLS[provider]).replace(/\/+$/, '');

    // Dynamic Context Limit from Model Catalog with fallback
    const cachedModels = this.catalogManager.getCachedModelsSync(provider);
    const matchedModel = cachedModels.find(
      (m) => m.id === currentModelId || m.id === `${provider}:${rawModelName}` || m.name === rawModelName,
    );
    const contextLimit =
      matchedModel?.contextLength ??
      matchedModel?.contextWindow ??
      DEFAULT_CONTEXT_LIMITS[provider] ??
      NATIVE_RUNTIME_LIMITS.fallbackContextLimit;

    // 2. Hydrate History & Compact Context (Preserving Arabic LocaleContext at System Level)
    const history = this.compactor.hydrateHistory(sessionId);
    const currentTurn: ConversationMessage = { role: 'user', content: prompt };
    const allMessages = [...history, currentTurn];

    const allSettings = this.settings.getAll();
    const localeGuidance = resolveArabicLocaleGuidance(
      allSettings.agent.languageGuidance,
      allSettings.appearance.locale,
      prompt,
    );

    const workspaceModes = loadWorkspaceModes(cwd);
    const activeMode = resolveActiveMode(permMode, workspaceModes);

    let systemPrompt =
      'You are Zeus, an intelligent pair-programming coding agent. Help the user solve their programming task efficiently and cleanly.';
    if (activeMode.roleDefinition) {
      systemPrompt += `\n\nActive Mode (${activeMode.name}):\n${activeMode.roleDefinition}`;
    }
    if (activeMode.customInstructions) {
      systemPrompt += `\n\nMode Custom Instructions:\n${activeMode.customInstructions}`;
    }

    effectiveBridge.ensureStreaming();

    const MAX_TURNS = 25;
    let turn = 0;
    const conversationMessages: ConversationMessage[] = [...allMessages];
    let fullText = '';

    try {
      while (turn < MAX_TURNS && !abort.signal.aborted) {
        turn++;

        const compacted = this.compactor.compactMessages(conversationMessages, {
          systemPrompt,
          localeGuidance,
          contextLimit,
        });

        let streamResult: {
          text: string;
          toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>;
        };

        if (provider === 'gemini') {
          const url = `${baseUrl}/v1beta/models/${encodeURIComponent(rawModelName)}:streamGenerateContent?alt=sse`;
          const headers: Record<string, string> = {};
          if (apiKey) headers['x-goog-api-key'] = apiKey;

          const geminiFormatted = this.compactor.toGeminiFormat(compacted);
          const geminiBody = {
            ...geminiFormatted,
            tools: toGeminiTools(activeMode, workspaceModes),
          };
          const sseStream = await guardedPostSse(url, geminiBody, {
            headers,
            allowPrivate: false,
            signal: abort.signal,
          });

          streamResult = await this.consumeNormalizedStream(
            parseGeminiStream(sseStream),
            effectiveBridge,
            abort,
          );
        } else if (provider === 'anthropic') {
          const url = `${baseUrl}/v1/messages`;
          const headers: Record<string, string> = {
            'anthropic-version': '2023-06-01',
          };
          if (apiKey) headers['x-api-key'] = apiKey;

          const isThinkingModel = rawModelName.includes('3-7') || rawModelName.includes('thinking');
          const formatted = this.compactor.toAnthropicFormat(compacted);
          const anthropicBody: Record<string, unknown> = {
            model: rawModelName,
            stream: true,
            max_tokens: isThinkingModel ? 16384 : 8192,
            system: formatted.system,
            messages: formatted.messages,
            tools: toAnthropicTools(activeMode, workspaceModes),
            ...(isThinkingModel ? { thinking: { type: 'enabled', budget_tokens: 4096 } } : {}),
          };

          const sseStream = await guardedPostSse(url, anthropicBody, {
            headers,
            allowPrivate: false,
            signal: abort.signal,
          });

          streamResult = await this.consumeNormalizedStream(
            parseAnthropicStream(sseStream),
            effectiveBridge,
            abort,
          );
        } else {
          // OpenAI-Compatible (OpenAI, DeepSeek, OpenRouter, Ollama, Kilo Gateway)
          const url = `${baseUrl}/chat/completions`;
          const headers: Record<string, string> = {};
          if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

          const openAiMessages = this.compactor.toOpenAiFormat(compacted);
          const openAiBody = {
            model: rawModelName,
            stream: true,
            stream_options: { include_usage: true },
            messages: openAiMessages,
            tools: toOpenAiTools(activeMode, workspaceModes),
          };

          const allowPrivate = provider === 'ollama';

          const sseStream = await guardedPostSse(url, openAiBody, {
            headers,
            allowPrivate,
            signal: abort.signal,
          });

          streamResult = await this.consumeNormalizedStream(
            parseOpenAiCompatStream(sseStream),
            effectiveBridge,
            abort,
          );
        }

        if (streamResult.text) {
          fullText = streamResult.text;
        }

        // If no tool calls, model provided its final response
        if (streamResult.toolCalls.length === 0) {
          break;
        }

        // Append assistant's turn with tool calls
        conversationMessages.push({
          role: 'assistant',
          content: streamResult.text,
          toolCalls: streamResult.toolCalls,
        });

    let workspaceId: string | null = null;
    try {
      const sessionRow = this.db
        .prepare('SELECT workspace_id FROM sessions WHERE id = ?')
        .get(sessionId) as { workspace_id: string } | undefined;
      workspaceId = sessionRow?.workspace_id ?? null;
    } catch {
      // best-effort
    }

      let taskCompleted = false;
      let taskCompletionSummary = '';

      // Synchronously execute each tool call through 3-Layer Security Gating
      for (const tc of streamResult.toolCalls) {
        if (abort.signal.aborted) break;

        const askHandler = this.askUserQuestionHandler;
        const toolContext: NativeToolExecutionContext = {
          workspaceRoot: cwd,
          sessionId,
          abortSignal: abort.signal,
          memoryManager: this.memoryManager,
          workspaceId,
          activeMode,
          askUserQuestion: askHandler
            ? (q, opts, sig) => askHandler(sessionId, q, opts, sig)
            : undefined,
          onTaskCompletion: (result, cmd) => {
            taskCompleted = true;
            taskCompletionSummary = cmd ? `${result}\n\nVerification Command:\n${cmd}` : result;
          },
        };

        const toolResult = await executeNativeTool({
          id: tc.id,
          name: tc.name,
          input: tc.input,
          context: toolContext,
          gate,
          bridge: effectiveBridge,
        });

        conversationMessages.push({
          role: 'tool',
          name: tc.name,
          toolCallId: tc.id,
          content: toolResult.output,
        });

        if (tc.name === 'attempt_completion' && toolResult.success) {
          taskCompleted = true;
          taskCompletionSummary = toolResult.output;
          break;
        }
      }

      if (taskCompleted) {
        fullText = taskCompletionSummary || fullText;
        break;
      }
    }

      effectiveBridge.finishStreaming(fullText);
      effectiveBridge.onResult(true, fullText);
    } catch (err) {
      if (abort.signal.aborted) {
        effectiveBridge.finishStreaming(fullText);
        return;
      }
      const message = err instanceof Error ? err.message : String(err);
      effectiveBridge.diag('request', 'error', 'Native agent stream failed', message);
      effectiveBridge.onResult(false, message);
      throw err;
    }
  }

  private async consumeNormalizedStream(
    stream: AsyncIterable<NormalizedStreamChunk>,
    effectiveBridge: ProviderRunBridge,
    abort: AbortController,
  ): Promise<{
    text: string;
    toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }>;
  }> {
    let textAccumulator = '';
    const toolCalls: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

    for await (const chunk of stream) {
      if (abort.signal.aborted) break;
      if (chunk.type === 'text') {
        textAccumulator += chunk.text;
        effectiveBridge.queueDelta(chunk.text);
      } else if (chunk.type === 'thinking') {
        effectiveBridge.onThinking?.(chunk.text);
      } else if (chunk.type === 'usage') {
        effectiveBridge.onUsage?.({
          inputTokens: chunk.inputTokens,
          outputTokens: chunk.outputTokens,
          totalTokens: chunk.totalTokens,
        });
      } else if (chunk.type === 'tool_call_complete') {
        toolCalls.push({
          id: chunk.id,
          name: chunk.name,
          input: chunk.input,
        });
      }
    }
    return { text: textAccumulator, toolCalls };
  }


  async closeSession(_sessionId: string): Promise<void> {
    void _sessionId;
  }

  dispose(): void {
    this.isDisposed = true;
  }
}
