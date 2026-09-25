import { describe, it, expect } from 'vitest';
import {
  parseGeminiStream,
  parseAnthropicStream,
  parseOpenAiCompatStream,
} from './streamParsers';
import type { NormalizedStreamChunk } from './types';

// Helper to convert array of string chunks into an async iterable of strings/buffers
async function* toAsyncStream(chunks: string[]): AsyncIterable<string> {
  for (const chunk of chunks) {
    yield chunk;
  }
}

async function collectChunks(iterable: AsyncIterable<NormalizedStreamChunk>): Promise<NormalizedStreamChunk[]> {
  const result: NormalizedStreamChunk[] = [];
  for await (const chunk of iterable) {
    result.push(chunk);
  }
  return result;
}

describe('streamParsers', () => {
  describe('parseGeminiStream', () => {
    it('parses standard conversational text chunks and usage', async () => {
      const ssePayload = [
        'data: {"candidates":[{"content":{"parts":[{"text":"Hello "}]}}]}\n\n',
        'data: {"candidates":[{"content":{"parts":[{"text":"world!"}]}}]}\n\n',
        'data: {"usageMetadata":{"promptTokenCount":10,"candidatesTokenCount":5,"totalTokenCount":15}}\n\n',
      ];

      const chunks = await collectChunks(parseGeminiStream(toAsyncStream(ssePayload)));

      expect(chunks).toEqual([
        { type: 'text', text: 'Hello ' },
        { type: 'text', text: 'world!' },
        { type: 'usage', inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      ]);
    });

    it('separates Gemini 2.0/2.5 Flash thinking blocks into thinking chunks', async () => {
      const ssePayload = [
        'data: {"candidates":[{"content":{"parts":[{"text":"Let me analyze the request.","thought":true}]}}]}\n\n',
        'data: {"candidates":[{"content":{"parts":[{"text":"The solution is 42.","thought":false}]}}]}\n\n',
      ];

      const chunks = await collectChunks(parseGeminiStream(toAsyncStream(ssePayload)));

      expect(chunks).toEqual([
        { type: 'thinking', text: 'Let me analyze the request.' },
        { type: 'text', text: 'The solution is 42.' },
      ]);
    });

    it('parses Gemini function calls into complete tool calls', async () => {
      const ssePayload = [
        'data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"read_file","args":{"path":"src/index.ts"}}}]}}]}\n\n',
      ];

      const chunks = await collectChunks(parseGeminiStream(toAsyncStream(ssePayload)));

      expect(chunks.length).toBe(1);
      expect(chunks[0].type).toBe('tool_call_complete');
      if (chunks[0].type === 'tool_call_complete') {
        expect(chunks[0].name).toBe('read_file');
        expect(chunks[0].input).toEqual({ path: 'src/index.ts' });
        expect(typeof chunks[0].id).toBe('string');
      }
    });

    it('handles chunk fragmentation across packet boundaries', async () => {
      const fragmentedPayload = [
        'data: {"candidates":[{"content":{"parts":[{"te',
        'xt":"Seamless chunk"}]}}]}\n\n',
      ];

      const chunks = await collectChunks(parseGeminiStream(toAsyncStream(fragmentedPayload)));
      expect(chunks).toEqual([{ type: 'text', text: 'Seamless chunk' }]);
    });
  });

  describe('parseAnthropicStream', () => {
    it('parses text deltas and usage metrics', async () => {
      const ssePayload = [
        'event: message_start\ndata: {"type":"message_start","message":{"usage":{"input_tokens":25}}}\n\n',
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hi there!"}}\n\n',
        'event: message_delta\ndata: {"type":"message_delta","usage":{"output_tokens":12}}\n\n',
        'event: message_stop\ndata: {"type":"message_stop"}\n\n',
      ];

      const chunks = await collectChunks(parseAnthropicStream(toAsyncStream(ssePayload)));

      expect(chunks).toContainEqual({ type: 'text', text: 'Hi there!' });
      expect(chunks).toContainEqual({ type: 'usage', inputTokens: 25, outputTokens: 12, totalTokens: 37 });
    });

    it('extracts Anthropic thinking deltas', async () => {
      const ssePayload = [
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"thinking","thinking":""}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"thinking_delta","thinking":"Let us consider edge cases."}}\n\n',
        'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
        'event: content_block_start\ndata: {"type":"content_block_start","index":1,"content_block":{"type":"text","text":""}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":1,"delta":{"type":"text_delta","text":"All tests pass."}}\n\n',
      ];

      const chunks = await collectChunks(parseAnthropicStream(toAsyncStream(ssePayload)));

      expect(chunks).toEqual([
        { type: 'thinking', text: 'Let us consider edge cases.' },
        { type: 'text', text: 'All tests pass.' },
      ]);
    });

    it('accumulates input_json_delta and yields complete tool call on content_block_stop', async () => {
      const ssePayload = [
        'event: content_block_start\ndata: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_01","name":"run_command"}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"command\\": "}}\n\n',
        'event: content_block_delta\ndata: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"\\"git status\\"}"}}\n\n',
        'event: content_block_stop\ndata: {"type":"content_block_stop","index":0}\n\n',
      ];

      const chunks = await collectChunks(parseAnthropicStream(toAsyncStream(ssePayload)));

      expect(chunks).toEqual([
        {
          type: 'tool_call_complete',
          id: 'toolu_01',
          name: 'run_command',
          input: { command: 'git status' },
        },
      ]);
    });
  });

  describe('parseOpenAiCompatStream', () => {
    it('parses standard OpenAI chat completion delta stream', async () => {
      const ssePayload = [
        'data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"OpenAI!"}}]}\n\n',
        'data: {"usage":{"prompt_tokens":12,"completion_tokens":8,"total_tokens":20}}\n\n',
        'data: [DONE]\n\n',
      ];

      const chunks = await collectChunks(parseOpenAiCompatStream(toAsyncStream(ssePayload)));

      expect(chunks).toEqual([
        { type: 'text', text: 'Hello ' },
        { type: 'text', text: 'OpenAI!' },
        { type: 'usage', inputTokens: 12, outputTokens: 8, totalTokens: 20 },
      ]);
    });

    it('extracts DeepSeek reasoning_content into thinking chunks', async () => {
      const ssePayload = [
        'data: {"choices":[{"delta":{"reasoning_content":"Thinking through the math..."}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"Result is 100."}}]}\n\n',
        'data: [DONE]\n\n',
      ];

      const chunks = await collectChunks(parseOpenAiCompatStream(toAsyncStream(ssePayload)));

      expect(chunks).toEqual([
        { type: 'thinking', text: 'Thinking through the math...' },
        { type: 'text', text: 'Result is 100.' },
      ]);
    });

    it('extracts inline <think> tags from models that stream reasoning in content', async () => {
      const ssePayload = [
        'data: {"choices":[{"delta":{"content":"<think>Pondering step 1. "}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"Step 2.</think>Here is the final answer."}}]}\n\n',
        'data: [DONE]\n\n',
      ];

      const chunks = await collectChunks(parseOpenAiCompatStream(toAsyncStream(ssePayload)));

      expect(chunks).toEqual([
        { type: 'thinking', text: 'Pondering step 1. ' },
        { type: 'thinking', text: 'Step 2.' },
        { type: 'text', text: 'Here is the final answer.' },
      ]);
    });

    it('correctly handles chunk-fragmented inline <think> and </think> tags across chunk boundaries', async () => {
      const ssePayload = [
        'data: {"choices":[{"delta":{"content":"Preamble <th"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"ink>Split thought</th"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"ink>End text"}}]}\n\n',
        'data: [DONE]\n\n',
      ];

      const chunks = await collectChunks(parseOpenAiCompatStream(toAsyncStream(ssePayload)));

      expect(chunks).toEqual([
        { type: 'text', text: 'Preamble ' },
        { type: 'thinking', text: 'Split thought' },
        { type: 'text', text: 'End text' },
      ]);
    });

    it('assembles multi-chunk OpenAI tool calls into tool_call_complete', async () => {
      const ssePayload = [
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"id":"call_99","function":{"name":"search_codebase","arguments":"{\\"query\\":"}}]}}]}\n\n',
        'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":" \\"login\\"}"}}]}}]}\n\n',
        'data: [DONE]\n\n',
      ];

      const chunks = await collectChunks(parseOpenAiCompatStream(toAsyncStream(ssePayload)));

      expect(chunks).toEqual([
        {
          type: 'tool_call_complete',
          id: 'call_99',
          name: 'search_codebase',
          input: { query: 'login' },
        },
      ]);
    });
  });
});
