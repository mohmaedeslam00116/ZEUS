import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { readFileTool } from './readFile';
import { writeFileTool } from './writeFile';
import { editFileTool } from './editFile';
import { runCommandTool } from './runCommand';
import { searchCodebaseTool } from './searchCodebase';
import { fetchWebContentTool } from './fetchWebContent';
import { memorySaveTool, memoryRecallTool, memoryForgetTool } from './memory';
import { listDirectoryTreeTool } from './directoryTree';
import { viewCodeSymbolsTool } from './codeSymbols';
import { askFollowupQuestionTool, attemptCompletionTool } from './interactive';
import { gitCheckpointTool, gitCommitTool } from './git';
import { executeNativeTool } from './executor';
import { toOpenAiTools, toAnthropicTools, toGeminiTools, getNativeToolsForMode } from './registry';
import * as transport from '../transport';
import type { ProviderRunBridge } from '../../providerBridge';
import type { ZeusModeConfig } from '@shared/types';


vi.mock('../../../sandbox/policy', () => ({
  crownJewelPaths: () => [
    path.resolve(os.tmpdir(), 'userData/secrets'),
    path.resolve(os.tmpdir(), 'userData/zeus.db'),
  ],
}));

describe('Native Tool Suite & 3-Layer Security Gating', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'zeus-tools-test-'));
  });

  afterEach(async () => {
    try {
      await fs.promises.rm(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('read_file', () => {
    it('reads file with 1-based line numbers', async () => {
      const filePath = path.join(tmpDir, 'test.txt');
      await fs.promises.writeFile(filePath, 'first line\nsecond line\nthird line', 'utf8');

      const res = await readFileTool.execute(
        { path: 'test.txt' },
        { workspaceRoot: tmpDir, sessionId: 's1' },
      );

      expect(res.success).toBe(true);
      expect(res.output).toContain('1 | first line');
      expect(res.output).toContain('2 | second line');
      expect(res.output).toContain('3 | third line');
    });

    it('slices line ranges precisely', async () => {
      const filePath = path.join(tmpDir, 'test.txt');
      await fs.promises.writeFile(filePath, 'one\ntwo\nthree\nfour\nfive', 'utf8');

      const res = await readFileTool.execute(
        { path: 'test.txt', start_line: 2, end_line: 4 },
        { workspaceRoot: tmpDir, sessionId: 's1' },
      );

      expect(res.success).toBe(true);
      expect(res.output).not.toContain('one');
      expect(res.output).toContain('2 | two');
      expect(res.output).toContain('3 | three');
      expect(res.output).toContain('4 | four');
      expect(res.output).not.toContain('five');
    });

    it('returns error when file does not exist', async () => {
      const res = await readFileTool.execute(
        { path: 'non_existent.txt' },
        { workspaceRoot: tmpDir, sessionId: 's1' },
      );
      expect(res.success).toBe(false);
      expect(res.output).toContain('File not found');
    });

    it('detects binary files', async () => {
      const binPath = path.join(tmpDir, 'binary.dat');
      const buf = Buffer.from([0x00, 0x01, 0x02, 0xff]);
      await fs.promises.writeFile(binPath, buf);

      const res = await readFileTool.execute(
        { path: 'binary.dat' },
        { workspaceRoot: tmpDir, sessionId: 's1' },
      );
      expect(res.success).toBe(true);
      expect(res.output).toContain('[Binary file');
    });
  });

  describe('write_file', () => {
    it('creates file and missing parent directories', async () => {
      const res = await writeFileTool.execute(
        { path: 'sub/nested/file.txt', content: 'hello world' },
        { workspaceRoot: tmpDir, sessionId: 's1' },
      );

      expect(res.success).toBe(true);
      expect(res.output).toContain('Successfully wrote');

      const written = await fs.promises.readFile(
        path.join(tmpDir, 'sub/nested/file.txt'),
        'utf8',
      );
      expect(written).toBe('hello world');
    });
  });

  describe('edit_file', () => {
    it('applies precise replacement and outputs unified diff', async () => {
      const filePath = path.join(tmpDir, 'code.ts');
      await fs.promises.writeFile(filePath, 'const a = 1;\nconst b = 2;\nconst c = 3;', 'utf8');

      const res = await editFileTool.execute(
        {
          path: 'code.ts',
          target_content: 'const b = 2;',
          replacement_content: 'const b = 42;',
        },
        { workspaceRoot: tmpDir, sessionId: 's1' },
      );

      expect(res.success).toBe(true);
      expect(res.output).toContain('Unified diff preview:');
      expect(res.output).toContain('-const b = 2;');
      expect(res.output).toContain('+const b = 42;');

      const updated = await fs.promises.readFile(filePath, 'utf8');
      expect(updated).toBe('const a = 1;\nconst b = 42;\nconst c = 3;');
    });

    it('rejects replacement when target content is not found', async () => {
      const filePath = path.join(tmpDir, 'code.ts');
      await fs.promises.writeFile(filePath, 'const a = 1;', 'utf8');

      const res = await editFileTool.execute(
        {
          path: 'code.ts',
          target_content: 'missing text',
          replacement_content: 'new text',
        },
        { workspaceRoot: tmpDir, sessionId: 's1' },
      );

      expect(res.success).toBe(false);
      expect(res.output).toContain('Target content not found in code.ts');
    });

    it('rejects ambiguous target content when multiple occurrences exist', async () => {
      const filePath = path.join(tmpDir, 'code.ts');
      await fs.promises.writeFile(filePath, 'foo\nfoo\nbar', 'utf8');

      const res = await editFileTool.execute(
        {
          path: 'code.ts',
          target_content: 'foo',
          replacement_content: 'baz',
        },
        { workspaceRoot: tmpDir, sessionId: 's1' },
      );

      expect(res.success).toBe(false);
      expect(res.output).toContain('Target content occurs multiple times');
    });
  });

  describe('run_command', () => {
    it('executes shell command and captures stdout and exit code', async () => {
      const res = await runCommandTool.execute(
        { command: 'node -e "console.log(\'test-output\')"' },
        { workspaceRoot: tmpDir, sessionId: 's1' },
      );

      expect(res.success).toBe(true);
      expect(res.output).toContain('Exit code: 0');
      expect(res.output).toContain('test-output');
    });

    it('handles non-zero exit codes', async () => {
      const res = await runCommandTool.execute(
        { command: 'node -e "process.exit(42)"' },
        { workspaceRoot: tmpDir, sessionId: 's1' },
      );

      expect(res.success).toBe(false);
      expect(res.output).toContain('Exit code: 42');
    });
  });

  describe('search_codebase', () => {
    it('searches text across files and ignores node_modules', async () => {
      await fs.promises.writeFile(path.join(tmpDir, 'main.ts'), 'function startApp() {}', 'utf8');
      await fs.promises.mkdir(path.join(tmpDir, 'node_modules'), { recursive: true });
      await fs.promises.writeFile(
        path.join(tmpDir, 'node_modules/dep.ts'),
        'function startApp() {}',
        'utf8',
      );

      const res = await searchCodebaseTool.execute(
        { query: 'startApp' },
        { workspaceRoot: tmpDir, sessionId: 's1' },
      );

      expect(res.success).toBe(true);
      expect(res.output).toContain('main.ts:1: function startApp() {}');
      expect(res.output).not.toContain('node_modules');
    });

    it('supports regex search', async () => {
      await fs.promises.writeFile(path.join(tmpDir, 'calc.ts'), 'const x = 12345;', 'utf8');

      const res = await searchCodebaseTool.execute(
        { query: '\\d{5}', is_regex: true },
        { workspaceRoot: tmpDir, sessionId: 's1' },
      );

      expect(res.success).toBe(true);
      expect(res.output).toContain('calc.ts:1: const x = 12345;');
    });
  });

  describe('fetch_web_content', () => {
    it('converts HTML to clean readable text', async () => {
      const spy = vi.spyOn(transport, 'guardedGet').mockResolvedValue(`
        <html>
          <head><title>Test</title><style>.hidden { display: none; }</style></head>
          <body>
            <h1>Heading</h1>
            <p>This is a paragraph with <a href="https://example.com">link</a>.</p>
            <script>console.log("bad script");</script>
          </body>
        </html>
      `);

      const res = await fetchWebContentTool.execute(
        { url: 'https://example.com/docs' },
        { workspaceRoot: tmpDir, sessionId: 's1' },
      );

      expect(res.success).toBe(true);
      expect(res.output).toContain('# Heading');
      expect(res.output).toContain('This is a paragraph with [link](https://example.com).');
      expect(res.output).not.toContain('bad script');
      expect(res.output).not.toContain('<style>');

      spy.mockRestore();
    });
  });

  describe('3-Layer Security Gating (executeNativeTool)', () => {
    it('Layer 1: denies path traversal before permission gate or execution', async () => {
      const gate = vi.fn();
      const bridge = {
        ensureStreaming: vi.fn(),
        queueDelta: vi.fn(),
        finishStreaming: vi.fn(),
        onToolUse: vi.fn(),
        onToolResult: vi.fn(),
      };

      const res = await executeNativeTool({
        id: 'c1',
        name: 'read_file',
        input: { path: '../outside.txt' },
        context: { workspaceRoot: tmpDir, sessionId: 's1' },
        gate,
        bridge: bridge as unknown as ProviderRunBridge,
      });

      expect(res.success).toBe(false);
      expect(res.output).toContain('Access denied: path escapes workspace boundaries');
      expect(gate).not.toHaveBeenCalled(); // Layer 1 denies before Layer 2 prompt!
      expect(bridge.onToolUse).toHaveBeenCalledWith('c1', 'read_file', { path: '../outside.txt' });
      expect(bridge.onToolResult).toHaveBeenCalledWith('c1', 'error', expect.stringContaining('Access denied'));
    });

    it('Layer 1: denies tool execution when tool is disabled in active mode persona', async () => {
      const gate = vi.fn();
      const bridge = {
        ensureStreaming: vi.fn(),
        queueDelta: vi.fn(),
        finishStreaming: vi.fn(),
        onToolUse: vi.fn(),
        onToolResult: vi.fn(),
      };

      const architectMode: ZeusModeConfig = {
        slug: 'architect',
        name: 'Architect',
        roleDefinition: 'Architect role',
        groups: ['read', 'interactive', 'memory'],
      };

      const res = await executeNativeTool({
        id: 'c-mode-1',
        name: 'write_file',
        input: { path: 'file.txt', content: 'content' },
        context: {
          workspaceRoot: tmpDir,
          sessionId: 's1',
          activeMode: architectMode,
        },
        gate,
        bridge: bridge as unknown as ProviderRunBridge,
      });

      expect(res.success).toBe(false);
      expect(res.output).toContain('Access denied: Tool "write_file" (group: "edit") is disabled in "Architect" mode');
      expect(gate).not.toHaveBeenCalled(); // Denied before Layer 2 prompt!
      expect(bridge.onToolResult).toHaveBeenCalledWith('c-mode-1', 'error', expect.stringContaining('Access denied'));
    });

    it('Layer 2: blocks execution when decideToolUse denies approval', async () => {
      const gate = vi.fn().mockResolvedValue({
        behavior: 'deny',
        message: 'User rejected write to production file',
      });
      const bridge = {
        ensureStreaming: vi.fn(),
        queueDelta: vi.fn(),
        finishStreaming: vi.fn(),
        onToolUse: vi.fn(),
        onToolResult: vi.fn(),
      };

      const res = await executeNativeTool({
        id: 'c2',
        name: 'write_file',
        input: { path: 'safe.txt', content: 'hello' },
        context: { workspaceRoot: tmpDir, sessionId: 's1' },
        gate,
        bridge: bridge as unknown as ProviderRunBridge,
      });

      expect(res.success).toBe(false);
      expect(res.output).toContain('Permission denied: User rejected write to production file');
      expect(gate).toHaveBeenCalledWith('write_file', { path: 'safe.txt', content: 'hello' }, undefined);
      expect(fs.existsSync(path.join(tmpDir, 'safe.txt'))).toBe(false); // Action was not executed
      expect(bridge.onToolResult).toHaveBeenCalledWith('c2', 'error', expect.stringContaining('Permission denied'));
    });

    it('Layer 3: executes tool when approved by gate', async () => {
      const gate = vi.fn().mockResolvedValue({ behavior: 'allow' });
      const bridge = {
        ensureStreaming: vi.fn(),
        queueDelta: vi.fn(),
        finishStreaming: vi.fn(),
        onToolUse: vi.fn(),
        onToolResult: vi.fn(),
      };

      const res = await executeNativeTool({
        id: 'c3',
        name: 'write_file',
        input: { path: 'allowed.txt', content: 'approved content' },
        context: { workspaceRoot: tmpDir, sessionId: 's1' },
        gate,
        bridge: bridge as unknown as ProviderRunBridge,
      });

      expect(res.success).toBe(true);
      expect(fs.existsSync(path.join(tmpDir, 'allowed.txt'))).toBe(true);
      expect(bridge.onToolResult).toHaveBeenCalledWith('c3', 'done', expect.stringContaining('Successfully wrote'));
    });

  });

  describe('memory tools', () => {
    interface MockMemoryRecord {
      id: string;
      title: string;
      body: string;
      tier: string;
      workspaceId?: string | null;
      snippet?: string;
      archived?: boolean;
    }
    let mockMemories: Map<string, MockMemoryRecord>;
    let mockMemoryManager: {
      create: ReturnType<typeof vi.fn>;
      search: ReturnType<typeof vi.fn>;
      get: ReturnType<typeof vi.fn>;
      delete: ReturnType<typeof vi.fn>;
      setArchived: ReturnType<typeof vi.fn>;
    };

    beforeEach(() => {
      mockMemories = new Map();
      mockMemoryManager = {
        create: vi.fn((input: { title: string; body: string; tier: string; workspaceId?: string | null }) => {
          const id = 'mem-' + Math.random().toString(36).slice(2, 9);
          const record: MockMemoryRecord = { id, ...input };
          mockMemories.set(id, record);
          return record;
        }),
        search: vi.fn((query: string, opts?: { tiers?: string[] }) => {
          const hits: MockMemoryRecord[] = [];
          for (const m of mockMemories.values()) {
            if (m.title.includes(query) || m.body.includes(query)) {
              if (!opts?.tiers || opts.tiers.includes(m.tier)) {
                hits.push({ ...m, snippet: `Match: ${m.body}` });
              }
            }
          }
          return hits;
        }),
        get: vi.fn((id: string) => mockMemories.get(id) ?? null),
        delete: vi.fn((id: string) => {
          mockMemories.delete(id);
        }),
        setArchived: vi.fn((id: string, archived: boolean) => {
          const record = mockMemories.get(id);
          if (record) {
            record.archived = archived;
          }
        }),
      };
    });

    describe('memory_save', () => {
      it('validates required fields', async () => {
        const res = await memorySaveTool.execute(
          { title: '', body: 'some body', tier: 'decision' },
          { workspaceRoot: tmpDir, sessionId: 's1', memoryManager: mockMemoryManager },
        );
        expect(res.success).toBe(false);
        expect(res.output).toContain('must be a non-empty string');

        const res2 = await memorySaveTool.execute(
          { title: 'Valid Title', body: '', tier: 'decision' },
          { workspaceRoot: tmpDir, sessionId: 's1', memoryManager: mockMemoryManager },
        );
        expect(res2.success).toBe(false);
        expect(res2.output).toContain('must be a non-empty string');

        const res3 = await memorySaveTool.execute(
          { title: 'Valid Title', body: 'Valid body', tier: 'unknown_tier' },
          { workspaceRoot: tmpDir, sessionId: 's1', memoryManager: mockMemoryManager },
        );
        expect(res3.success).toBe(false);
        expect(res3.output).toContain('invalid tier');
      });

      it('saves memory successfully with workspace scope', async () => {
        const res = await memorySaveTool.execute(
          {
            title: 'Use Vitest for Unit Tests',
            body: 'Always use Vitest with mocked services for lightning-fast test cycles.',
            tier: 'convention',
            scope: 'workspace',
          },
          {
            workspaceRoot: tmpDir,
            sessionId: 's1',
            workspaceId: 'ws-123',
            memoryManager: mockMemoryManager,
          },
        );

        expect(res.success).toBe(true);
        expect(res.output).toContain('Memory successfully saved');
        expect(res.output).toContain('Use Vitest for Unit Tests');
        expect(mockMemoryManager.create).toHaveBeenCalledWith(
          expect.objectContaining({
            title: 'Use Vitest for Unit Tests',
            tier: 'convention',
            workspaceId: 'ws-123',
          }),
        );
      });

      it('handles missing MemoryManager gracefully', async () => {
        const res = await memorySaveTool.execute(
          { title: 'Title', body: 'Body', tier: 'decision' },
          { workspaceRoot: tmpDir, sessionId: 's1' },
        );
        expect(res.success).toBe(false);
        expect(res.output).toContain('MemoryManager is not available');
      });
    });

    describe('memory_recall', () => {
      it('validates query string', async () => {
        const res = await memoryRecallTool.execute(
          { query: '' },
          { workspaceRoot: tmpDir, sessionId: 's1', memoryManager: mockMemoryManager },
        );
        expect(res.success).toBe(false);
        expect(res.output).toContain('must be a non-empty string');
      });

      it('searches and formats matching memories', async () => {
        mockMemories.set('m1', {
          id: 'm1',
          title: 'Database Architecture',
          body: 'We use SQLite with WAL mode and bound parameters.',
          tier: 'architecture',
        });

        const res = await memoryRecallTool.execute(
          { query: 'SQLite' },
          { workspaceRoot: tmpDir, sessionId: 's1', memoryManager: mockMemoryManager },
        );

        expect(res.success).toBe(true);
        expect(res.output).toContain('Found 1 matching memories');
        expect(res.output).toContain('Database Architecture');
        expect(res.output).toContain('m1');
      });

      it('handles query with no matches', async () => {
        const res = await memoryRecallTool.execute(
          { query: 'NonExistentTerm' },
          { workspaceRoot: tmpDir, sessionId: 's1', memoryManager: mockMemoryManager },
        );

        expect(res.success).toBe(true);
        expect(res.output).toContain('No memories found matching query');
      });
    });

    describe('memory_forget', () => {
      it('validates id input', async () => {
        const res = await memoryForgetTool.execute(
          { id: '' },
          { workspaceRoot: tmpDir, sessionId: 's1', memoryManager: mockMemoryManager },
        );
        expect(res.success).toBe(false);
        expect(res.output).toContain('must be a non-empty string');
      });

      it('archives memory by default (soft delete)', async () => {
        mockMemories.set('arch-1', {
          id: 'arch-1',
          title: 'Soft delete rule',
          body: 'Archived convention',
          tier: 'convention',
        });

        const res = await memoryForgetTool.execute(
          { id: 'arch-1', reason: 'Superseded by Spec #67' },
          { workspaceRoot: tmpDir, sessionId: 's1', memoryManager: mockMemoryManager },
        );

        expect(res.success).toBe(true);
        expect(res.output).toContain('successfully archived');
        expect(res.output).toContain('Superseded by Spec #67');
        expect(mockMemoryManager.setArchived).toHaveBeenCalledWith('arch-1', true);
      });

      it('permanently deletes memory when mode is delete', async () => {
        mockMemories.set('del-1', {
          id: 'del-1',
          title: 'Hard delete rule',
          body: 'Permanently removed',
          tier: 'convention',
        });

        const res = await memoryForgetTool.execute(
          { id: 'del-1', mode: 'delete' },
          { workspaceRoot: tmpDir, sessionId: 's1', memoryManager: mockMemoryManager },
        );

        expect(res.success).toBe(true);
        expect(res.output).toContain('permanently deleted');
        expect(mockMemoryManager.delete).toHaveBeenCalledWith('del-1');
      });

      it('returns error when memory does not exist', async () => {
        const res = await memoryForgetTool.execute(
          { id: 'ghost-id' },
          { workspaceRoot: tmpDir, sessionId: 's1', memoryManager: mockMemoryManager },
        );
        expect(res.success).toBe(false);
        expect(res.output).toContain('Memory not found');
      });
    });
  });

  describe('list_directory_tree', () => {
    it('generates hierarchical tree structure', async () => {
      await fs.promises.mkdir(path.join(tmpDir, 'src', 'main'), { recursive: true });
      await fs.promises.mkdir(path.join(tmpDir, 'src', 'renderer'), { recursive: true });
      await fs.promises.writeFile(path.join(tmpDir, 'src', 'main', 'index.ts'), 'console.log();');
      await fs.promises.writeFile(path.join(tmpDir, 'package.json'), '{}');

      const res = await listDirectoryTreeTool.execute(
        { path: '.', maxDepth: 3 },
        { workspaceRoot: tmpDir, sessionId: 's1' },
      );

      expect(res.success).toBe(true);
      expect(res.output).toContain('src/');
      expect(res.output).toContain('main/');
      expect(res.output).toContain('index.ts');
      expect(res.output).toContain('package.json');
    });

    it('ignores node_modules and .git folders', async () => {
      await fs.promises.mkdir(path.join(tmpDir, 'node_modules', 'pkg'), { recursive: true });
      await fs.promises.mkdir(path.join(tmpDir, '.git', 'objects'), { recursive: true });
      await fs.promises.writeFile(path.join(tmpDir, 'node_modules', 'pkg', 'index.js'), '');
      await fs.promises.writeFile(path.join(tmpDir, 'app.ts'), '');

      const res = await listDirectoryTreeTool.execute(
        { path: '.' },
        { workspaceRoot: tmpDir, sessionId: 's1' },
      );

      expect(res.success).toBe(true);
      expect(res.output).toContain('app.ts');
      expect(res.output).not.toContain('node_modules');
      expect(res.output).not.toContain('.git');
    });

    it('enforces Layer 1 path containment', async () => {
      const res = await listDirectoryTreeTool.execute(
        { path: '../../etc' },
        { workspaceRoot: tmpDir, sessionId: 's1' },
      );
      expect(res.success).toBe(false);
      expect(res.output).toContain('escapes workspace boundaries');
    });

    it('truncates output when entries exceed XP-01 ceiling (150 items)', async () => {
      const bulkDir = path.join(tmpDir, 'bulk');
      await fs.promises.mkdir(bulkDir, { recursive: true });
      for (let i = 0; i < 160; i++) {
        await fs.promises.writeFile(path.join(bulkDir, `file_${i}.txt`), 'content');
      }

      const res = await listDirectoryTreeTool.execute(
        { path: 'bulk' },
        { workspaceRoot: tmpDir, sessionId: 's1' },
      );

      expect(res.success).toBe(true);
      expect(res.output).toContain('output truncated at 150 entries (XP-01 ceiling)');
    });
  });

  describe('view_code_symbols', () => {
    it('extracts classes, interfaces, types, functions, and methods with line numbers', async () => {
      const code = `
export interface UserConfig {
  name: string;
}

export type UserRole = 'admin' | 'guest';

export class UserManager {
  private user: UserConfig;

  async loadUser(id: string): Promise<UserConfig> {
    return this.user;
  }
}

export function createManager(): UserManager {
  return new UserManager();
}
`;
      const filePath = path.join(tmpDir, 'symbols.ts');
      await fs.promises.writeFile(filePath, code, 'utf8');

      const res = await viewCodeSymbolsTool.execute(
        { path: 'symbols.ts' },
        { workspaceRoot: tmpDir, sessionId: 's1' },
      );

      expect(res.success).toBe(true);
      expect(res.output).toContain('[interface] interface UserConfig (line 2)');
      expect(res.output).toContain('[type] type UserRole (line 6)');
      expect(res.output).toContain('[class] class UserManager (line 8)');
      expect(res.output).toContain('[method] loadUser(id: string) (line 11)');
      expect(res.output).toContain('[function] function createManager() (line 16)');
    });

    it('filters symbols by kind', async () => {
      const code = `
export class ServiceA {}
export function helper(): void {}
`;
      const filePath = path.join(tmpDir, 'filtered.ts');
      await fs.promises.writeFile(filePath, code, 'utf8');

      const res = await viewCodeSymbolsTool.execute(
        { path: 'filtered.ts', kind: 'function' },
        { workspaceRoot: tmpDir, sessionId: 's1' },
      );

      expect(res.success).toBe(true);
      expect(res.output).toContain('[function] function helper');
      expect(res.output).not.toContain('[class] class ServiceA');
    });

    it('enforces Layer 1 workspace containment', async () => {
      const res = await viewCodeSymbolsTool.execute(
        { path: '../outside.ts' },
        { workspaceRoot: tmpDir, sessionId: 's1' },
      );
      expect(res.success).toBe(false);
      expect(res.output).toContain('escapes workspace boundaries');
    });

    it('returns error when file does not exist', async () => {
      const res = await viewCodeSymbolsTool.execute(
        { path: 'ghost.ts' },
        { workspaceRoot: tmpDir, sessionId: 's1' },
      );
      expect(res.success).toBe(false);
      expect(res.output).toContain('File not found');
    });

    it('truncates output when symbols exceed XP-01 ceiling (100 symbols)', async () => {
      const fnLines: string[] = [];
      for (let i = 0; i < 110; i++) {
        fnLines.push(`export function func_${i}(): void {}`);
      }
      const bulkFile = path.join(tmpDir, 'many_functions.ts');
      await fs.promises.writeFile(bulkFile, fnLines.join('\n'), 'utf8');

      const res = await viewCodeSymbolsTool.execute(
        { path: 'many_functions.ts' },
        { workspaceRoot: tmpDir, sessionId: 's1' },
      );

      expect(res.success).toBe(true);
      expect(res.output).toContain('truncated at 100 symbols (XP-01 ceiling)');
    });
  });

  describe('ask_followup_question', () => {
    it('rejects missing or empty question parameter', async () => {
      const res = await askFollowupQuestionTool.execute(
        { question: '' },
        { workspaceRoot: tmpDir, sessionId: 's1' },
      );
      expect(res.success).toBe(false);
      expect(res.output).toContain('non-empty string');
    });

    it('rejects question exceeding 2000 characters', async () => {
      const longQuestion = 'a'.repeat(2001);
      const res = await askFollowupQuestionTool.execute(
        { question: longQuestion },
        { workspaceRoot: tmpDir, sessionId: 's1' },
      );
      expect(res.success).toBe(false);
      expect(res.output).toContain('exceeds the maximum length of 2000 characters');
    });

    it('returns answer from askUserQuestion handler when provided', async () => {
      const mockAsk = vi.fn().mockResolvedValue('PostgreSQL');
      const res = await askFollowupQuestionTool.execute(
        {
          question: 'Which database do you prefer?',
          options: ['PostgreSQL', 'SQLite', 'MongoDB'],
        },
        {
          workspaceRoot: tmpDir,
          sessionId: 's1',
          askUserQuestion: mockAsk,
        },
      );

      expect(mockAsk).toHaveBeenCalledWith(
        'Which database do you prefer?',
        ['PostgreSQL', 'SQLite', 'MongoDB'],
        undefined,
      );
      expect(res.success).toBe(true);
      expect(res.output).toBe('PostgreSQL');
    });

    it('handles error thrown by askUserQuestion gracefully', async () => {
      const mockAsk = vi.fn().mockRejectedValue(new Error('Prompt dismissed by user'));
      const res = await askFollowupQuestionTool.execute(
        { question: 'Continue?' },
        {
          workspaceRoot: tmpDir,
          sessionId: 's1',
          askUserQuestion: mockAsk,
        },
      );

      expect(res.success).toBe(false);
      expect(res.output).toContain('Failed to receive answer from user: Prompt dismissed by user');
    });

    it('returns error when askUserQuestion handler is omitted', async () => {
      const res = await askFollowupQuestionTool.execute(
        {
          question: 'Which database?',
          options: ['PostgreSQL', 'SQLite'],
        },
        { workspaceRoot: tmpDir, sessionId: 's1' },
      );

      expect(res.success).toBe(false);
      expect(res.output).toContain('No askUserQuestion handler is available in the current execution context');
    });

    it('rejects non-array options parameter', async () => {
      const res = await askFollowupQuestionTool.execute(
        { question: 'Pick one', options: 'invalid' as unknown as string[] },
        { workspaceRoot: tmpDir, sessionId: 's1' },
      );
      expect(res.success).toBe(false);
      expect(res.output).toContain('"options" must be an array of strings');
    });

    it('rejects options exceeding 10 choices', async () => {
      const elevenOptions = Array.from({ length: 11 }, (_, i) => `Opt ${i + 1}`);
      const res = await askFollowupQuestionTool.execute(
        { question: 'Pick one', options: elevenOptions },
        { workspaceRoot: tmpDir, sessionId: 's1' },
      );
      expect(res.success).toBe(false);
      expect(res.output).toContain('"options" cannot exceed 10 choices');
    });

    it('rejects option item exceeding 120 characters', async () => {
      const longOption = 'a'.repeat(121);
      const res = await askFollowupQuestionTool.execute(
        { question: 'Pick one', options: [longOption] },
        { workspaceRoot: tmpDir, sessionId: 's1' },
      );
      expect(res.success).toBe(false);
      expect(res.output).toContain('exceeds maximum length of 120 characters');
    });

    it('rejects empty or whitespace-only option items', async () => {
      const res = await askFollowupQuestionTool.execute(
        { question: 'Pick one', options: ['Valid', '   '] },
        { workspaceRoot: tmpDir, sessionId: 's1' },
      );
      expect(res.success).toBe(false);
      expect(res.output).toContain('Each item in "options" must be a non-empty string');
    });

    it('rejects when abortSignal is already aborted', async () => {
      const abort = new AbortController();
      abort.abort();

      const res = await askFollowupQuestionTool.execute(
        { question: 'Will this run?' },
        {
          workspaceRoot: tmpDir,
          sessionId: 's1',
          abortSignal: abort.signal,
        },
      );

      expect(res.success).toBe(false);
      expect(res.output).toContain('Turn was aborted');
    });
  });

  describe('attempt_completion', () => {
    it('rejects missing or empty result parameter', async () => {
      const res = await attemptCompletionTool.execute(
        { result: '' },
        { workspaceRoot: tmpDir, sessionId: 's1' },
      );
      expect(res.success).toBe(false);
      expect(res.output).toContain('non-empty string');
    });

    it('rejects result exceeding 10000 characters', async () => {
      const longResult = 'a'.repeat(10001);
      const res = await attemptCompletionTool.execute(
        { result: longResult },
        { workspaceRoot: tmpDir, sessionId: 's1' },
      );
      expect(res.success).toBe(false);
      expect(res.output).toContain('"result" exceeds maximum length of 10000 characters');
    });

    it('rejects non-string command parameter', async () => {
      const res = await attemptCompletionTool.execute(
        { result: 'Done', command: 12345 as unknown as string },
        { workspaceRoot: tmpDir, sessionId: 's1' },
      );
      expect(res.success).toBe(false);
      expect(res.output).toContain('"command" must be a string if provided');
    });

    it('rejects command exceeding 500 characters', async () => {
      const longCmd = 'a'.repeat(501);
      const res = await attemptCompletionTool.execute(
        { result: 'Done', command: longCmd },
        { workspaceRoot: tmpDir, sessionId: 's1' },
      );
      expect(res.success).toBe(false);
      expect(res.output).toContain('"command" exceeds maximum length of 500 characters');
    });

    it('handles onTaskCompletion callback error safely', async () => {
      const throwingCallback = vi.fn().mockImplementation(() => {
        throw new Error('Callback failed');
      });
      const res = await attemptCompletionTool.execute(
        { result: 'Done' },
        { workspaceRoot: tmpDir, sessionId: 's1', onTaskCompletion: throwingCallback },
      );
      expect(res.success).toBe(false);
      expect(res.output).toContain('Task completion callback error: Callback failed');
    });

    it('formats completion output with result and optional command', async () => {
      const onCompletion = vi.fn();
      const res = await attemptCompletionTool.execute(
        {
          result: 'Refactored auth module and added unit tests.',
          command: 'npm test',
        },
        {
          workspaceRoot: tmpDir,
          sessionId: 's1',
          onTaskCompletion: onCompletion,
        },
      );

      expect(onCompletion).toHaveBeenCalledWith(
        'Refactored auth module and added unit tests.',
        'npm test',
      );
      expect(res.success).toBe(true);
      expect(res.output).toContain('Task Completion Summary:\nRefactored auth module and added unit tests.');
      expect(res.output).toContain('Verification Command:\nnpm test');
    });

    it('formats completion output without command when command is omitted', async () => {
      const res = await attemptCompletionTool.execute(
        { result: 'Everything completed.' },
        { workspaceRoot: tmpDir, sessionId: 's1' },
      );

      expect(res.success).toBe(true);
      expect(res.output).toBe('Task Completion Summary:\nEverything completed.');
      expect(res.output).not.toContain('Verification Command');
    });
  });

  describe('git_checkpoint', () => {
    it('validates label presence and length limit', async () => {
      const emptyRes = await gitCheckpointTool.execute(
        {},
        { workspaceRoot: tmpDir, sessionId: 's1' },
      );
      expect(emptyRes.success).toBe(false);
      expect(emptyRes.error).toContain('non-empty string');

      const longLabel = 'a'.repeat(141);
      const longRes = await gitCheckpointTool.execute(
        { label: longLabel },
        { workspaceRoot: tmpDir, sessionId: 's1' },
      );
      expect(longRes.success).toBe(false);
      expect(longRes.error).toContain('exceeds maximum length of 140');
    });

    it('creates checkpoint via gitManager when provided', async () => {
      const mockGit = {
        createCheckpoint: vi.fn().mockResolvedValue({
          id: 'cp-123',
          ref: 'refs/zeus/checkpoints/s1/1234567890',
          commit: 'abcdef1234567890abcdef',
          label: 'before auth refactor',
          files: ['src/auth.ts', 'package.json'],
          createdAt: 1234567890,
        }),
        stage: vi.fn(),
        stageAll: vi.fn(),
        commit: vi.fn(),
        status: vi.fn(),
      };

      const res = await gitCheckpointTool.execute(
        { label: 'before auth refactor' },
        { workspaceRoot: tmpDir, sessionId: 's1', workspaceId: 'ws-1', gitManager: mockGit },
      );

      expect(res.success).toBe(true);
      expect(mockGit.createCheckpoint).toHaveBeenCalledWith(
        'ws-1',
        's1',
        'before auth refactor',
        { auto: false },
      );
      expect(res.output).toContain('Successfully created git checkpoint:');
      expect(res.output).toContain('refs/zeus/checkpoints/s1/1234567890');
      expect(res.output).toContain('abcdef12');
      expect(res.output).toContain('Files preserved: 2');
    });

    it('returns error when gitManager returns null (e.g. non-repo workspace)', async () => {
      const mockGit = {
        createCheckpoint: vi.fn().mockResolvedValue(null),
        stage: vi.fn(),
        stageAll: vi.fn(),
        commit: vi.fn(),
        status: vi.fn(),
      };

      const res = await gitCheckpointTool.execute(
        { label: 'test checkpoint' },
        { workspaceRoot: tmpDir, sessionId: 's1', workspaceId: 'ws-1', gitManager: mockGit },
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain('Failed to create checkpoint');
    });

    it('returns error when standalone workspace is not a git repository', async () => {
      const res = await gitCheckpointTool.execute(
        { label: 'initial snapshot' },
        { workspaceRoot: tmpDir, sessionId: 's-fallback' },
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain('Workspace is not a valid Git repository');
    });

    it('enforces mode persona scoping (blocked in architect/ask, allowed in code/test)', async () => {
      const architectMode: ZeusModeConfig = {
        slug: 'architect',
        name: 'Architect',
        roleDefinition: 'Architect role',
        groups: ['read', 'interactive', 'memory'],
      };

      const res = await executeNativeTool({
        id: 'tc-cp-arch',
        name: 'git_checkpoint',
        input: { label: 'architect checkpoint' },
        context: { workspaceRoot: tmpDir, sessionId: 's1', activeMode: architectMode },
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('disabled in "Architect" mode');
    });
  });

  describe('git_commit', () => {
    it('validates message presence and length limit', async () => {
      const emptyRes = await gitCommitTool.execute(
        {},
        { workspaceRoot: tmpDir, sessionId: 's1' },
      );
      expect(emptyRes.success).toBe(false);
      expect(emptyRes.error).toContain('Commit message must be a non-empty string');

      const longMessage = `feat: ${'a'.repeat(500)}`;
      const longRes = await gitCommitTool.execute(
        { message: longMessage },
        { workspaceRoot: tmpDir, sessionId: 's1' },
      );
      expect(longRes.success).toBe(false);
      expect(longRes.error).toContain('exceeds maximum length of 500');
    });

    it('validates Conventional Commits format and rejects invalid types', async () => {
      const invalidRes1 = await gitCommitTool.execute(
        { message: 'just random stuff' },
        { workspaceRoot: tmpDir, sessionId: 's1' },
      );
      expect(invalidRes1.success).toBe(false);
      expect(invalidRes1.error).toContain('Conventional Commits format');

      const invalidRes2 = await gitCommitTool.execute(
        { message: 'foo(bar): some message' },
        { workspaceRoot: tmpDir, sessionId: 's1' },
      );
      expect(invalidRes2.success).toBe(false);
      expect(invalidRes2.error).toContain('Invalid Conventional Commit type "foo"');

      const invalidRes3 = await gitCommitTool.execute(
        { message: 'feat: ' },
        { workspaceRoot: tmpDir, sessionId: 's1' },
      );
      expect(invalidRes3.success).toBe(false);
      expect(invalidRes3.error).toContain('Conventional Commits format');
    });

    it('enforces Layer 1 path containment on files argument', async () => {
      const traversalRes = await gitCommitTool.execute(
        { message: 'feat: add stuff', files: ['../outside.txt'] },
        { workspaceRoot: tmpDir, sessionId: 's1' },
      );
      expect(traversalRes.success).toBe(false);
      expect(traversalRes.error).toContain('Access denied');

      const crownJewelTarget = path.resolve(os.tmpdir(), 'userData/secrets');
      const jewelRes = await gitCommitTool.execute(
        { message: 'feat: leak secret', files: [crownJewelTarget] },
        { workspaceRoot: tmpDir, sessionId: 's1' },
      );
      expect(jewelRes.success).toBe(false);
      expect(jewelRes.error).toContain('Access denied');

      const tooManyFiles = Array.from({ length: 101 }, (_, i) => `file_${i}.txt`);
      const limitRes = await gitCommitTool.execute(
        { message: 'feat: bulk files', files: tooManyFiles },
        { workspaceRoot: tmpDir, sessionId: 's1' },
      );
      expect(limitRes.success).toBe(false);
      expect(limitRes.error).toContain('Cannot stage more than 100 files');
    });

    it('returns error when there are no staged changes to commit', async () => {
      const mockGit = {
        createCheckpoint: vi.fn(),
        stage: vi.fn(),
        stageAll: vi.fn(),
        commit: vi.fn(),
        status: vi.fn().mockResolvedValue({
          files: [{ path: 'file.txt', staged: false }],
        }),
      };

      const res = await gitCommitTool.execute(
        { message: 'feat(core): implement core logic' },
        { workspaceRoot: tmpDir, sessionId: 's1', workspaceId: 'ws-1', gitManager: mockGit },
      );

      expect(res.success).toBe(false);
      expect(res.error).toContain('No staged changes to commit');
    });

    it('stages specified files and commits successfully via gitManager', async () => {
      const mockGit = {
        createCheckpoint: vi.fn(),
        stage: vi.fn().mockResolvedValue(undefined),
        stageAll: vi.fn().mockResolvedValue(undefined),
        status: vi.fn().mockResolvedValue({
          files: [{ path: 'src/index.ts', staged: true }],
        }),
        commit: vi.fn().mockResolvedValue({
          hash: '1234567890abcdef1234567890abcdef12345678',
          subject: 'feat(auth): add jwt validation',
        }),
      };

      const res = await gitCommitTool.execute(
        {
          message: 'feat(auth): add jwt validation',
          files: ['src/index.ts'],
        },
        { workspaceRoot: tmpDir, sessionId: 's1', workspaceId: 'ws-1', gitManager: mockGit },
      );

      expect(res.success).toBe(true);
      expect(mockGit.stage).toHaveBeenCalledWith('ws-1', 'src/index.ts');
      expect(mockGit.commit).toHaveBeenCalledWith('ws-1', 'feat(auth): add jwt validation');
      expect(res.output).toContain('Successfully created git commit:');
      expect(res.output).toContain('12345678');
      expect(res.output).toContain('feat(auth): add jwt validation');
      expect(res.output).toContain('Staged files: 1');
    });

    it('stages all changes when files argument is omitted', async () => {
      const mockGit = {
        createCheckpoint: vi.fn(),
        stage: vi.fn(),
        stageAll: vi.fn().mockResolvedValue(undefined),
        status: vi.fn().mockResolvedValue({
          files: [
            { path: 'a.ts', staged: true },
            { path: 'b.ts', staged: true },
          ],
        }),
        commit: vi.fn().mockResolvedValue({
          hash: 'abcdef1234567890abcdef1234567890abcdef12',
          subject: 'fix: resolve race condition',
        }),
      };

      const res = await gitCommitTool.execute(
        { message: 'fix: resolve race condition' },
        { workspaceRoot: tmpDir, sessionId: 's1', workspaceId: 'ws-1', gitManager: mockGit },
      );

      expect(res.success).toBe(true);
      expect(mockGit.stageAll).toHaveBeenCalledWith('ws-1');
      expect(mockGit.commit).toHaveBeenCalledWith('ws-1', 'fix: resolve race condition');
      expect(res.output).toContain('Staged files: all modified/untracked');
    });

    it('enforces mode persona scoping (blocked in architect/ask, allowed in code/test)', async () => {
      const askMode: ZeusModeConfig = {
        slug: 'ask',
        name: 'Ask',
        roleDefinition: 'Ask role',
        groups: ['read', 'interactive', 'memory'],
      };

      const res = await executeNativeTool({
        id: 'tc-commit-ask',
        name: 'git_commit',
        input: { message: 'feat: try to commit in ask mode' },
        context: { workspaceRoot: tmpDir, sessionId: 's1', activeMode: askMode },
      });

      expect(res.success).toBe(false);
      expect(res.error).toContain('disabled in "Ask" mode');
    });
  });

  describe('Provider Tool Schema Formatters', () => {
    it('formats tools for OpenAI, Anthropic, and Gemini', () => {
      const openAi = toOpenAiTools();
      expect(openAi.length).toBe(15);
      expect(openAi[0].type).toBe('function');
      expect(openAi.some((t) => t.function.name === 'memory_save')).toBe(true);
      expect(openAi.some((t) => t.function.name === 'list_directory_tree')).toBe(true);
      expect(openAi.some((t) => t.function.name === 'view_code_symbols')).toBe(true);
      expect(openAi.some((t) => t.function.name === 'ask_followup_question')).toBe(true);
      expect(openAi.some((t) => t.function.name === 'attempt_completion')).toBe(true);
      expect(openAi.some((t) => t.function.name === 'git_checkpoint')).toBe(true);
      expect(openAi.some((t) => t.function.name === 'git_commit')).toBe(true);

      const anthropic = toAnthropicTools();
      expect(anthropic.length).toBe(15);
      expect(anthropic.some((t) => t.name === 'memory_save')).toBe(true);
      expect(anthropic.some((t) => t.name === 'ask_followup_question')).toBe(true);
      expect(anthropic.some((t) => t.name === 'attempt_completion')).toBe(true);
      expect(anthropic.some((t) => t.name === 'git_checkpoint')).toBe(true);
      expect(anthropic.some((t) => t.name === 'git_commit')).toBe(true);

      const gemini = toGeminiTools();
      expect(gemini.length).toBe(1);
      expect(gemini[0].functionDeclarations.length).toBe(15);
      expect(gemini[0].functionDeclarations.some((t) => t.name === 'memory_save')).toBe(true);
      expect(gemini[0].functionDeclarations.some((t) => t.name === 'ask_followup_question')).toBe(true);
      expect(gemini[0].functionDeclarations.some((t) => t.name === 'attempt_completion')).toBe(true);
      expect(gemini[0].functionDeclarations.some((t) => t.name === 'git_checkpoint')).toBe(true);
      expect(gemini[0].functionDeclarations.some((t) => t.name === 'git_commit')).toBe(true);
    });

    it('scopes tools per mode persona in OpenAI, Anthropic, and Gemini formatters', () => {
      // In architect mode: read, interactive, memory only (no write_file, edit_file, run_command, git_checkpoint, git_commit)
      const openAiArchitect = toOpenAiTools('architect');
      expect(openAiArchitect.some((t) => t.function.name === 'read_file')).toBe(true);
      expect(openAiArchitect.some((t) => t.function.name === 'list_directory_tree')).toBe(true);
      expect(openAiArchitect.some((t) => t.function.name === 'memory_save')).toBe(true);
      expect(openAiArchitect.some((t) => t.function.name === 'ask_followup_question')).toBe(true);
      expect(openAiArchitect.some((t) => t.function.name === 'attempt_completion')).toBe(true);
      expect(openAiArchitect.some((t) => t.function.name === 'write_file')).toBe(false);
      expect(openAiArchitect.some((t) => t.function.name === 'edit_file')).toBe(false);
      expect(openAiArchitect.some((t) => t.function.name === 'run_command')).toBe(false);
      expect(openAiArchitect.some((t) => t.function.name === 'git_checkpoint')).toBe(false);
      expect(openAiArchitect.some((t) => t.function.name === 'git_commit')).toBe(false);

      // In ask mode: read, interactive, memory only
      const anthropicAsk = toAnthropicTools('ask');
      expect(anthropicAsk.some((t) => t.name === 'search_codebase')).toBe(true);
      expect(anthropicAsk.some((t) => t.name === 'view_code_symbols')).toBe(true);
      expect(anthropicAsk.some((t) => t.name === 'write_file')).toBe(false);
      expect(anthropicAsk.some((t) => t.name === 'run_command')).toBe(false);
      expect(anthropicAsk.some((t) => t.name === 'git_checkpoint')).toBe(false);
      expect(anthropicAsk.some((t) => t.name === 'git_commit')).toBe(false);

      // In code mode: all 15 tools present
      const geminiCode = toGeminiTools('code');
      expect(geminiCode[0].functionDeclarations.length).toBe(15);
      expect(geminiCode[0].functionDeclarations.some((t) => t.name === 'git_checkpoint')).toBe(true);
      expect(geminiCode[0].functionDeclarations.some((t) => t.name === 'git_commit')).toBe(true);

      // Custom mode with only 'read' group
      const customReadOnlyMode: ZeusModeConfig = {
        slug: 'read-only',
        name: 'Read Only',
        roleDefinition: 'Read only access',
        groups: ['read'],
      };
      const readOnlyTools = getNativeToolsForMode(customReadOnlyMode);
      expect(readOnlyTools.length).toBe(5); // read_file, search_codebase, list_directory_tree, view_code_symbols, fetch_web_content
      expect(readOnlyTools.every((t) => t.group === 'read')).toBe(true);
    });
  });
});
