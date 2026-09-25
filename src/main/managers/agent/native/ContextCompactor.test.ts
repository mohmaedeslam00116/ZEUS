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
  });
});
