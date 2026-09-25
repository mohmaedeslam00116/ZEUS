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
import { executeNativeTool } from './executor';
import { toOpenAiTools, toAnthropicTools, toGeminiTools } from './registry';
import * as transport from '../transport';
import type { ProviderRunBridge } from '../../providerBridge';


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

  describe('Provider Tool Schema Formatters', () => {
    it('formats tools for OpenAI, Anthropic, and Gemini', () => {
      const openAi = toOpenAiTools();
      expect(openAi.length).toBe(6);
      expect(openAi[0].type).toBe('function');
      expect(openAi[0].function.name).toBe('read_file');

      const anthropic = toAnthropicTools();
      expect(anthropic.length).toBe(6);
      expect(anthropic[0].name).toBe('read_file');
      expect(anthropic[0].input_schema).toBeDefined();

      const gemini = toGeminiTools();
      expect(gemini.length).toBe(1);
      expect(gemini[0].functionDeclarations.length).toBe(6);
      expect(gemini[0].functionDeclarations[0].name).toBe('read_file');
    });
  });
});
