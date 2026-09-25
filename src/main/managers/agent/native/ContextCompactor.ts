/**
 * Context Engine for ZEUS Native Agent Runtime.
 *
 * Owns conversation history hydration from SQLite, token budget estimation,
 * sliding-window compaction with system prompt & initial intent preservation,
 * and multi-vendor message payload translation.
 */
import type Database from 'better-sqlite3';
import type { ConversationMessage } from './types';

/**
 * Fast, resilient token counter heuristic.
 * Estimates ~4 characters per token for standard English/ASCII,
 * and ~2 characters per token for non-ASCII/Arabic/multilingual content.
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  let asciiCount = 0;
  let nonAsciiCount = 0;

  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) < 128) {
      asciiCount++;
    } else {
      nonAsciiCount++;
    }
  }

  const estimated = Math.ceil(asciiCount / 4) + Math.ceil(nonAsciiCount / 2);
  return Math.max(1, estimated);
}

export interface CompactOptions {
  systemPrompt: string;
  localeGuidance?: string;
  contextLimit: number;
}

export class ContextCompactor {
  constructor(private readonly db: Database.Database) {}

  /**
   * Hydrates previous conversation messages from SQLite `agent_messages`.
   */
  hydrateHistory(sessionId: string): ConversationMessage[] {
    const rows = this.db
      .prepare(`
        SELECT role, text, thinking
        FROM agent_messages
        WHERE session_id = ?
        ORDER BY created_at ASC
      `)
      .all(sessionId) as Array<{ role: string; text: string; thinking?: string | null }>;

    return rows.map((r) => ({
      role: r.role === 'assistant' ? 'assistant' : 'user',
      content: r.text,
      thinking: r.thinking || undefined,
    }));
  }

  /**
   * Performs sliding-window context compaction.
   * Preserves:
   * 1. System prompt & injected locale guidance.
   * 2. Initial user intent (first message).
   * 3. Latest turns that fit within 80% of the model's token limit.
   */
  compactMessages(
    messages: ConversationMessage[],
    options: CompactOptions,
  ): ConversationMessage[] {
    const fullSystemPrompt = options.localeGuidance
      ? `${options.localeGuidance}\n\n${options.systemPrompt}`
      : options.systemPrompt;

    const systemMessage: ConversationMessage = {
      role: 'system',
      content: fullSystemPrompt,
    };

    const maxBudget = Math.floor(options.contextLimit * 0.8);
    const systemTokens = estimateTokens(fullSystemPrompt);
    let remainingBudget = Math.max(100, maxBudget - systemTokens);

    const nonSystemMessages = messages.filter((m) => m.role !== 'system');
    if (nonSystemMessages.length === 0) {
      return [systemMessage];
    }

    // Check if everything fits as-is
    const allTokens = nonSystemMessages.reduce((sum, m) => sum + estimateTokens(m.content), 0);
    if (allTokens <= remainingBudget) {
      return [systemMessage, ...nonSystemMessages];
    }

    // Needs compaction:
    // 1. Initial user intent (first message)
    const initialUserMessage = nonSystemMessages[0];
    const initialTokens = estimateTokens(initialUserMessage.content);
    remainingBudget = Math.max(50, remainingBudget - initialTokens);

    // 2. Compaction notice placeholder
    const compactionNotice: ConversationMessage = {
      role: 'system',
      content: '[Earlier conversation turns summarized/compacted to preserve context limit]',
    };
    const noticeTokens = estimateTokens(compactionNotice.content);
    remainingBudget = Math.max(0, remainingBudget - noticeTokens);

    // 3. Sliding window from the end (latest messages first)
    const candidates = nonSystemMessages.slice(1);
    const chosenLatest: ConversationMessage[] = [];
    let currentLatestTokens = 0;

    for (let i = candidates.length - 1; i >= 0; i--) {
      const msg = candidates[i];
      const cost = estimateTokens(msg.content);
      if (currentLatestTokens + cost <= remainingBudget) {
        chosenLatest.unshift(msg);
        currentLatestTokens += cost;
      } else {
        break;
      }
    }

    return [systemMessage, initialUserMessage, compactionNotice, ...chosenLatest];
  }

  /**
   * Formats normalized messages for Google Gemini generateContent.
   */
  toGeminiFormat(messages: ConversationMessage[]): {
    systemInstruction?: { parts: Array<{ text: string }> };
    contents: Array<{ role: 'user' | 'model'; parts: Array<Record<string, unknown>> }>;
  } {
    let systemText = '';
    const contents: Array<{ role: 'user' | 'model'; parts: Array<Record<string, unknown>> }> = [];

    for (const m of messages) {
      if (m.role === 'system') {
        systemText += (systemText ? '\n\n' : '') + m.content;
      } else if (m.role === 'tool') {
        const functionResponsePart = {
          functionResponse: {
            name: m.name || 'tool',
            response: { output: m.content },
          },
        };
        const prev = contents[contents.length - 1];
        if (prev && prev.role === 'user') {
          prev.parts.push(functionResponsePart);
        } else {
          contents.push({
            role: 'user',
            parts: [functionResponsePart],
          });
        }
      } else if (m.role === 'assistant') {
        const parts: Array<Record<string, unknown>> = [];
        if (m.content) parts.push({ text: m.content });
        if (m.toolCalls && m.toolCalls.length > 0) {
          for (const tc of m.toolCalls) {
            parts.push({
              functionCall: {
                name: tc.name,
                args: tc.input,
              },
            });
          }
        }
        if (parts.length > 0) {
          contents.push({ role: 'model', parts });
        }
      } else {
        contents.push({
          role: 'user',
          parts: [{ text: m.content }],
        });
      }
    }

    return {
      systemInstruction: systemText ? { parts: [{ text: systemText }] } : undefined,
      contents,
    };
  }

  /**
   * Formats normalized messages for Anthropic Messages API.
   */
  toAnthropicFormat(messages: ConversationMessage[]): {
    system?: string;
    messages: Array<{ role: 'user' | 'assistant'; content: unknown }>;
  } {
    let system = '';
    const anthropicMessages: Array<{ role: 'user' | 'assistant'; content: unknown }> = [];

    for (const m of messages) {
      if (m.role === 'system') {
        system += (system ? '\n\n' : '') + m.content;
      } else if (m.role === 'tool') {
        const toolResultBlock = {
          type: 'tool_result',
          tool_use_id: m.toolCallId || '',
          content: m.content,
        };
        const prev = anthropicMessages[anthropicMessages.length - 1];
        if (prev && prev.role === 'user' && Array.isArray(prev.content)) {
          (prev.content as unknown[]).push(toolResultBlock);
        } else {
          anthropicMessages.push({
            role: 'user',
            content: [toolResultBlock],
          });
        }
      } else if (m.role === 'assistant') {
        if (m.toolCalls && m.toolCalls.length > 0) {
          const contentList: unknown[] = [];
          if (m.content) contentList.push({ type: 'text', text: m.content });
          for (const tc of m.toolCalls) {
            contentList.push({
              type: 'tool_use',
              id: tc.id,
              name: tc.name,
              input: tc.input,
            });
          }
          anthropicMessages.push({
            role: 'assistant',
            content: contentList,
          });
        } else {
          anthropicMessages.push({
            role: 'assistant',
            content: m.content,
          });
        }
      } else {
        anthropicMessages.push({
          role: 'user',
          content: m.content,
        });
      }
    }

    return {
      system: system || undefined,
      messages: anthropicMessages,
    };
  }

  /**
   * Formats normalized messages for OpenAI-compatible /chat/completions.
   */
  toOpenAiFormat(messages: ConversationMessage[]): Array<{
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string | null;
    tool_call_id?: string;
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: {
        name: string;
        arguments: string;
      };
    }>;
  }> {
    return messages.map((m) => {
      if (m.role === 'tool') {
        return {
          role: 'tool',
          content: m.content,
          tool_call_id: m.toolCallId || '',
        };
      }
      if (m.role === 'assistant') {
        if (m.toolCalls && m.toolCalls.length > 0) {
          return {
            role: 'assistant',
            content: m.content || null,
            tool_calls: m.toolCalls.map((tc) => ({
              id: tc.id,
              type: 'function',
              function: {
                name: tc.name,
                arguments: typeof tc.input === 'string' ? tc.input : JSON.stringify(tc.input),
              },
            })),
          };
        }
        return {
          role: 'assistant',
          content: m.content,
        };
      }
      return {
        role: m.role === 'system' ? 'system' : 'user',
        content: m.content,
      };
    });
  }
}

