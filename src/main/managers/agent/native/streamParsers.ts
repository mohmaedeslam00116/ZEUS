/**
 * Stream parsers for native multi-provider LLM outputs.
 * Converts vendor SSE events (Gemini, Anthropic, OpenAI-compatible) into normalized stream chunks.
 */
import type { NormalizedStreamChunk } from './types';

/**
 * Splits raw byte or string stream chunks into individual SSE lines.
 */
export async function* splitSseLines(stream: AsyncIterable<string | Buffer>): AsyncIterable<string> {
  let buffer = '';
  for await (const rawChunk of stream) {
    buffer += typeof rawChunk === 'string' ? rawChunk : rawChunk.toString('utf8');
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      yield line;
    }
  }
  if (buffer.length > 0) {
    yield buffer;
  }
}

/**
 * Parses Google Gemini `streamGenerateContent` SSE stream.
 */
export async function* parseGeminiStream(
  stream: AsyncIterable<string | Buffer>,
): AsyncIterable<NormalizedStreamChunk> {
  for await (const line of splitSseLines(stream)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const jsonStr = trimmed.slice(5).trim();
    if (!jsonStr || jsonStr === '[DONE]') continue;

    try {
      const data = JSON.parse(jsonStr) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{
              text?: string;
              thought?: boolean;
              functionCall?: {
                id?: string;
                name: string;
                args?: Record<string, unknown>;
              };
            }>;
          };
          finishReason?: string;
        }>;
        usageMetadata?: {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
          totalTokenCount?: number;
        };
      };

      if (data.candidates && data.candidates.length > 0) {
        const parts = data.candidates[0]?.content?.parts || [];
        for (const part of parts) {
          if (part.functionCall) {
            yield {
              type: 'tool_call_complete',
              id: part.functionCall.id || `call_${Math.random().toString(36).slice(2, 10)}`,
              name: part.functionCall.name,
              input: part.functionCall.args || {},
            };
          } else if (part.thought === true) {
            if (part.text) {
              yield { type: 'thinking', text: part.text };
            }
          } else if (part.text) {
            yield { type: 'text', text: part.text };
          }
        }
      }

      if (data.usageMetadata) {
        yield {
          type: 'usage',
          inputTokens: data.usageMetadata.promptTokenCount,
          outputTokens: data.usageMetadata.candidatesTokenCount,
          totalTokens: data.usageMetadata.totalTokenCount,
        };
      }
    } catch {
      // Ignore unparseable SSE lines
    }
  }
}

/**
 * Parses Anthropic Messages API `/v1/messages` SSE stream.
 */
export async function* parseAnthropicStream(
  stream: AsyncIterable<string | Buffer>,
): AsyncIterable<NormalizedStreamChunk> {
  const activeToolCalls = new Map<number, { id: string; name: string; jsonAccumulator: string }>();
  let inputTokens = 0;
  let outputTokens = 0;

  for await (const line of splitSseLines(stream)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const jsonStr = trimmed.slice(5).trim();
    if (!jsonStr || jsonStr === '[DONE]') continue;

    try {
      const event = JSON.parse(jsonStr) as {
        type: string;
        index?: number;
        message?: {
          usage?: { input_tokens?: number; output_tokens?: number };
        };
        content_block?: {
          type: string;
          id?: string;
          name?: string;
          text?: string;
          thinking?: string;
        };
        delta?: {
          type: string;
          text?: string;
          thinking?: string;
          partial_json?: string;
        };
        usage?: {
          input_tokens?: number;
          output_tokens?: number;
        };
      };

      switch (event.type) {
        case 'message_start':
          if (event.message?.usage?.input_tokens !== undefined) {
            inputTokens = event.message.usage.input_tokens;
          }
          break;

        case 'content_block_start':
          if (event.content_block?.type === 'tool_use' && event.index !== undefined) {
            activeToolCalls.set(event.index, {
              id: event.content_block.id || `toolu_${Math.random().toString(36).slice(2, 10)}`,
              name: event.content_block.name || '',
              jsonAccumulator: '',
            });
          }
          break;

        case 'content_block_delta':
          if (event.delta?.type === 'text_delta' && event.delta.text) {
            yield { type: 'text', text: event.delta.text };
          } else if (event.delta?.type === 'thinking_delta' && event.delta.thinking) {
            yield { type: 'thinking', text: event.delta.thinking };
          } else if (event.delta?.type === 'input_json_delta' && event.delta.partial_json) {
            const current = activeToolCalls.get(event.index ?? 0);
            if (current) {
              current.jsonAccumulator += event.delta.partial_json;
            }
          }
          break;

        case 'content_block_stop': {
          const finished = activeToolCalls.get(event.index ?? 0);
          if (finished) {
            let parsedArgs: Record<string, unknown> = {};
            try {
              if (finished.jsonAccumulator.trim()) {
                parsedArgs = JSON.parse(finished.jsonAccumulator);
              }
            } catch {
              parsedArgs = { raw: finished.jsonAccumulator };
            }
            yield {
              type: 'tool_call_complete',
              id: finished.id,
              name: finished.name,
              input: parsedArgs,
            };
            activeToolCalls.delete(event.index ?? 0);
          }
          break;
        }

        case 'message_delta':
          if (event.usage?.output_tokens !== undefined) {
            outputTokens = event.usage.output_tokens;
          }
          yield {
            type: 'usage',
            inputTokens,
            outputTokens,
            totalTokens: inputTokens + outputTokens,
          };
          break;
      }
    } catch {
      // Ignore unparseable SSE lines
    }
  }
}

/**
 * Parses OpenAI-compatible `/chat/completions` SSE stream.
 * Covers OpenAI, DeepSeek, OpenRouter, Ollama, and Kilo Gateway.
 * Supports reasoning_content and inline <think>...</think> tags.
 */
export async function* parseOpenAiCompatStream(
  stream: AsyncIterable<string | Buffer>,
): AsyncIterable<NormalizedStreamChunk> {
  const activeToolCalls = new Map<number, { id: string; name: string; argsAccumulator: string }>();
  let inThinkTag = false;
  let tagBuffer = '';

  for await (const line of splitSseLines(stream)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const jsonStr = trimmed.slice(5).trim();
    if (jsonStr === '[DONE]') break;
    if (!jsonStr) continue;

    try {
      const data = JSON.parse(jsonStr) as {
        choices?: Array<{
          delta?: {
            content?: string | null;
            reasoning_content?: string | null;
            tool_calls?: Array<{
              index: number;
              id?: string;
              function?: {
                name?: string;
                arguments?: string;
              };
            }>;
          };
          finish_reason?: string | null;
        }>;
        usage?: {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
        };
      };

      const choice = data.choices?.[0];
      if (choice?.delta) {
        const delta = choice.delta;

        // 1. Explicit reasoning_content (DeepSeek R1, OpenRouter, vLLM, Kilo)
        if (delta.reasoning_content) {
          yield { type: 'thinking', text: delta.reasoning_content };
        }

        // 2. Regular content with possible inline <think>...</think> tags, buffered across chunk splits
        if (delta.content) {
          let text = tagBuffer + delta.content;
          tagBuffer = '';

          while (text.length > 0) {
            if (!inThinkTag) {
              const startIdx = text.indexOf('<think>');
              if (startIdx !== -1) {
                const before = text.slice(0, startIdx);
                if (before) yield { type: 'text', text: before };
                inThinkTag = true;
                text = text.slice(startIdx + 7);
              } else {
                // Check if text ends with a partial prefix of "<think>"
                let matchedPartial = false;
                for (let len = Math.min(6, text.length); len >= 1; len--) {
                  const tail = text.slice(-len);
                  if ('<think>'.startsWith(tail)) {
                    const before = text.slice(0, -len);
                    if (before) yield { type: 'text', text: before };
                    tagBuffer = tail;
                    matchedPartial = true;
                    break;
                  }
                }
                if (!matchedPartial) {
                  yield { type: 'text', text };
                }
                text = '';
              }
            } else {
              const endIdx = text.indexOf('</think>');
              if (endIdx !== -1) {
                const thought = text.slice(0, endIdx);
                if (thought) yield { type: 'thinking', text: thought };
                inThinkTag = false;
                text = text.slice(endIdx + 8);
              } else {
                // Check if text ends with a partial prefix of "</think>"
                let matchedPartial = false;
                for (let len = Math.min(7, text.length); len >= 1; len--) {
                  const tail = text.slice(-len);
                  if ('</think>'.startsWith(tail)) {
                    const thought = text.slice(0, -len);
                    if (thought) yield { type: 'thinking', text: thought };
                    tagBuffer = tail;
                    matchedPartial = true;
                    break;
                  }
                }
                if (!matchedPartial) {
                  yield { type: 'thinking', text };
                }
                text = '';
              }
            }
          }
        }

        // 3. Tool calls accumulation
        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0;
            let existing = activeToolCalls.get(idx);
            if (!existing) {
              existing = {
                id: tc.id || `call_${Math.random().toString(36).slice(2, 10)}`,
                name: tc.function?.name || '',
                argsAccumulator: '',
              };
              activeToolCalls.set(idx, existing);
            } else {
              if (tc.id) existing.id = tc.id;
              if (tc.function?.name) existing.name = tc.function.name;
            }
            if (tc.function?.arguments) {
              existing.argsAccumulator += tc.function.arguments;
            }
          }
        }
      }

      if (data.usage) {
        yield {
          type: 'usage',
          inputTokens: data.usage.prompt_tokens,
          outputTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        };
      }
    } catch {
      // Ignore unparseable SSE lines
    }
  }

  // Flush any trailing buffered tag content
  if (tagBuffer) {
    if (inThinkTag) {
      yield { type: 'thinking', text: tagBuffer };
    } else {
      yield { type: 'text', text: tagBuffer };
    }
    tagBuffer = '';
  }

  // Flush any completed tool calls
  for (const [, tool] of activeToolCalls) {
    let parsedArgs: Record<string, unknown> = {};
    try {
      if (tool.argsAccumulator.trim()) {
        parsedArgs = JSON.parse(tool.argsAccumulator);
      }
    } catch {
      parsedArgs = { raw: tool.argsAccumulator };
    }
    yield {
      type: 'tool_call_complete',
      id: tool.id,
      name: tool.name,
      input: parsedArgs,
    };
  }
}
