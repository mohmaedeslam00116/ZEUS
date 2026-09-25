import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { ContextCompactor, estimateTokens } from './ContextCompactor';
import type { ConversationMessage } from './types';

describe('ContextCompactor', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE agent_messages (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL,
        text TEXT NOT NULL,
        thinking TEXT,
        created_at INTEGER NOT NULL
      );
    `);
  });

  describe('estimateTokens', () => {
    it('estimates ~4 chars per token for English text', () => {
      const text = 'Hello world, this is a test of token estimation.';
      const tokens = estimateTokens(text);
      expect(tokens).toBe(Math.ceil(text.length / 4));
    });

    it('estimates ~2 chars per token for Arabic and non-ASCII text', () => {
      const arabicText = 'مرحبا بك في وكيل زيوس الأصيل';
      const tokens = estimateTokens(arabicText);
      expect(tokens).toBeGreaterThan(Math.ceil(arabicText.length / 4));
    });
  });

  describe('hydrateHistory', () => {
    it('loads and orders messages from SQLite agent_messages table', () => {
      const compactor = new ContextCompactor(db);
      const now = Date.now();

      db.prepare(`
        INSERT INTO agent_messages (id, session_id, role, text, thinking, created_at)
        VALUES 
          ('m1', 'session_1', 'user', 'First question', NULL, ?),
          ('m2', 'session_1', 'assistant', 'First answer', 'I am thinking', ?)
      `).run(now, now + 10);

      const history = compactor.hydrateHistory('session_1');
      expect(history.length).toBe(2);
      expect(history[0]).toEqual({
        role: 'user',
        content: 'First question',
        thinking: undefined,
      });
      expect(history[1]).toEqual({
        role: 'assistant',
        content: 'First answer',
        thinking: 'I am thinking',
      });
    });
  });

  describe('compactMessages', () => {
    it('preserves system prompt and all turns when within context limit', () => {
      const compactor = new ContextCompactor(db);
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'Turn 1' },
        { role: 'assistant', content: 'Reply 1' },
        { role: 'user', content: 'Turn 2' },
      ];

      const compacted = compactor.compactMessages(messages, {
        systemPrompt: 'You are Zeus, an expert developer.',
        contextLimit: 32000,
      });

      expect(compacted[0].role).toBe('system');
      expect(compacted[0].content).toContain('You are Zeus');
      expect(compacted.slice(1)).toEqual(messages);
    });

    it('injects locale context guidance into system prompt', () => {
      const compactor = new ContextCompactor(db);
      const messages: ConversationMessage[] = [{ role: 'user', content: 'مرحبا' }];

      const compacted = compactor.compactMessages(messages, {
        systemPrompt: 'Base instructions.',
        localeGuidance: 'Prefer Modern Standard Arabic for explanations. Keep code in English.',
        contextLimit: 32000,
      });

      expect(compacted[0].role).toBe('system');
      expect(compacted[0].content).toContain('Prefer Modern Standard Arabic');
      expect(compacted[0].content).toContain('Base instructions.');
    });

    it('preserves initial user intent while pruning middle turns on tight context budget', () => {
      const compactor = new ContextCompactor(db);
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'INITIAL INTENT: Build an entire operating system.' }, // First turn
        { role: 'assistant', content: 'A very very long reply 1 '.repeat(50) },
        { role: 'user', content: 'A very very long message 2 '.repeat(50) },
        { role: 'assistant', content: 'A very very long reply 2 '.repeat(50) },
        { role: 'user', content: 'LATEST: What was my initial intent?' }, // Latest turn
      ];

      // Set a small budget (e.g. 200 tokens)
      const compacted = compactor.compactMessages(messages, {
        systemPrompt: 'System',
        contextLimit: 300,
      });

      expect(compacted[0].role).toBe('system');
      // Must retain initial user intent
      expect(compacted.some((m) => m.content.includes('INITIAL INTENT:'))).toBe(true);
      // Must retain latest user question
      expect(compacted.some((m) => m.content.includes('LATEST:'))).toBe(true);
      // Must include compaction notice
      expect(compacted.some((m) => m.content.includes('summarized/compacted'))).toBe(true);
    });
  });

  describe('vendor formatters', () => {
    it('formats messages into Gemini contents and systemInstruction', () => {
      const compactor = new ContextCompactor(db);
      const messages: ConversationMessage[] = [
        { role: 'system', content: 'Be concise' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there' },
      ];

      const geminiPayload = compactor.toGeminiFormat(messages);
      expect(geminiPayload.systemInstruction?.parts[0].text).toBe('Be concise');
      expect(geminiPayload.contents).toEqual([
        { role: 'user', parts: [{ text: 'Hello' }] },
        { role: 'model', parts: [{ text: 'Hi there' }] },
      ]);
    });

    it('formats messages into Anthropic system string and user/assistant messages', () => {
      const compactor = new ContextCompactor(db);
      const messages: ConversationMessage[] = [
        { role: 'system', content: 'System instructions' },
        { role: 'user', content: 'Question' },
        { role: 'assistant', content: 'Answer' },
      ];

      const anthropicPayload = compactor.toAnthropicFormat(messages);
      expect(anthropicPayload.system).toBe('System instructions');
      expect(anthropicPayload.messages).toEqual([
        { role: 'user', content: 'Question' },
        { role: 'assistant', content: 'Answer' },
      ]);
    });

    it('formats messages into OpenAI format directly', () => {
      const compactor = new ContextCompactor(db);
      const messages: ConversationMessage[] = [
        { role: 'system', content: 'System instructions' },
        { role: 'user', content: 'Question' },
      ];

      const openAiMessages = compactor.toOpenAiFormat(messages);
      expect(openAiMessages).toEqual([
        { role: 'system', content: 'System instructions' },
        { role: 'user', content: 'Question' },
      ]);
    });

    it('serializes tool calls and tool results across providers', () => {
      const compactor = new ContextCompactor(db);
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'Read file please' },
        {
          role: 'assistant',
          content: 'Reading file...',
          toolCalls: [{ id: 'call_1', name: 'read_file', input: { path: 'a.txt' } }],
        },
        {
          role: 'tool',
          name: 'read_file',
          toolCallId: 'call_1',
          content: '1 | Hello',
        },
      ];

      // OpenAI
      const openAi = compactor.toOpenAiFormat(messages);
      expect(openAi[1].tool_calls).toBeDefined();
      expect(openAi[1].tool_calls?.[0].id).toBe('call_1');
      expect(openAi[1].tool_calls?.[0].function.name).toBe('read_file');
      expect(openAi[2].role).toBe('tool');
      expect(openAi[2].tool_call_id).toBe('call_1');

      // Anthropic
      const anthropic = compactor.toAnthropicFormat(messages);
      expect(Array.isArray(anthropic.messages[1].content)).toBe(true);
      const anthropicTurn1 = anthropic.messages[1].content as Array<Record<string, unknown>>;
      expect(anthropicTurn1[1].type).toBe('tool_use');
      expect(Array.isArray(anthropic.messages[2].content)).toBe(true);
      const anthropicTurn2 = anthropic.messages[2].content as Array<Record<string, unknown>>;
      expect(anthropicTurn2[0].type).toBe('tool_result');

      // Gemini
      const gemini = compactor.toGeminiFormat(messages);
      expect(gemini.contents[1].role).toBe('model');
      const geminiPart1 = gemini.contents[1].parts[1] as { functionCall: { name: string } };
      expect(geminiPart1.functionCall.name).toBe('read_file');
      expect(gemini.contents[2].role).toBe('user');
      const geminiPart2 = gemini.contents[2].parts[0] as { functionResponse: { name: string } };
      expect(geminiPart2.functionResponse.name).toBe('read_file');
    });

    it('coalesces multiple consecutive tool results into a single user message for Anthropic and Gemini', () => {
      const compactor = new ContextCompactor(db);
      const messages: ConversationMessage[] = [
        { role: 'user', content: 'Run two tools' },
        {
          role: 'assistant',
          content: 'Running...',
          toolCalls: [
            { id: 'call_1', name: 'read_file', input: { path: 'a.txt' } },
            { id: 'call_2', name: 'read_file', input: { path: 'b.txt' } },
          ],
        },
        {
          role: 'tool',
          name: 'read_file',
          toolCallId: 'call_1',
          content: 'Content A',
        },
        {
          role: 'tool',
          name: 'read_file',
          toolCallId: 'call_2',
          content: 'Content B',
        },
      ];

      // Anthropic: should have 3 messages total (user, assistant, user containing 2 tool_results)
      const anthropic = compactor.toAnthropicFormat(messages);
      expect(anthropic.messages.length).toBe(3);
      expect(anthropic.messages[2].role).toBe('user');
      const anthropicBlocks = anthropic.messages[2].content as Array<{ type: string; tool_use_id: string }>;
      expect(anthropicBlocks.length).toBe(2);
      expect(anthropicBlocks[0].tool_use_id).toBe('call_1');
      expect(anthropicBlocks[1].tool_use_id).toBe('call_2');

      // Gemini: should have 3 contents total (user, model, user containing 2 parts)
      const gemini = compactor.toGeminiFormat(messages);
      expect(gemini.contents.length).toBe(3);
      expect(gemini.contents[2].role).toBe('user');
      expect(gemini.contents[2].parts.length).toBe(2);
    });
  });
});

