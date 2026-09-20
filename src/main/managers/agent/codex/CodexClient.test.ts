import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcess } from 'node:child_process';
import { CodexClient } from './CodexClient';
import { resolveSpawnTarget } from '../resolveSpawnTarget';
import { JsonRpcStreamParser, serializeJsonRpc } from '../acp/jsonRpc';
import type {
  CodexApprovalRequestParams,
  CodexApprovalResult,
  CodexInitializeResult,
  JsonRpcMessage,
} from './types';

function createMockChildProcess(): {
  child: ChildProcess;
  stdin: PassThrough;
  stdout: PassThrough;
  stderr: PassThrough;
  events: EventEmitter;
  receivedFrames: JsonRpcMessage[];
} {
  const events = new EventEmitter();
  const stdin = new PassThrough();
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  const receivedFrames: JsonRpcMessage[] = [];

  const parser = new JsonRpcStreamParser((msg) => {
    receivedFrames.push(msg);
  });

  stdin.setEncoding('utf8');
  stdin.on('data', (chunk: string | Buffer) => {
    parser.feed(chunk);
  });

  const child = Object.assign(events, {
    pid: 98765,
    stdin,
    stdout,
    stderr,
    exitCode: null,
    signalCode: null,
    kill: vi.fn(),
  }) as unknown as ChildProcess;

  return { child, stdin, stdout, stderr, events, receivedFrames };
}

describe('CodexClient Stdio JSON-RPC Protocol & Tool Gating (#59)', () => {
  let mockProcess: ReturnType<typeof createMockChildProcess>;
  let spawnFnSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockProcess = createMockChildProcess();
    spawnFnSpy = vi.fn().mockImplementation(() => mockProcess.child);
  });

  it('performs initialization handshake on start() (initialize -> initialized)', async () => {
    const client = new CodexClient({
      cwd: process.platform === 'win32' ? 'C:\\test\\workspace' : '/test/workspace',
      spawnFn: spawnFnSpy,
    });

    const startPromise = client.start();

    // Verify spawn options (SEC-08 argv-only without shell)
    const expectedTarget = resolveSpawnTarget('codex', ['app-server']);
    expect(spawnFnSpy).toHaveBeenCalledWith(
      expectedTarget.command,
      expectedTarget.args,
      expect.objectContaining({
        shell: false,
        windowsHide: true,
      }),
    );

    // Wait for client to send initialize request
    await vi.waitFor(() => {
      expect(mockProcess.receivedFrames.length).toBeGreaterThan(0);
    });

    const initReq = mockProcess.receivedFrames[0] as { id: string; method: string };
    expect(initReq.method).toBe('initialize');

    // Simulate server response
    const initResponse: CodexInitializeResult = {
      serverInfo: { name: 'codex-app-server', version: '1.0.0' },
      capabilities: { tools: { approval: true } },
    };

    mockProcess.stdout.write(
      serializeJsonRpc({
        jsonrpc: '2.0',
        id: initReq.id,
        result: initResponse,
      }),
    );

    const result = await startPromise;
    expect(result).toEqual(initResponse);

    // Verify client sent initialized notification
    await vi.waitFor(() => {
      expect(mockProcess.receivedFrames.length).toBe(2);
    });
    const initializedNotif = mockProcess.receivedFrames[1] as { method: string };
    expect(initializedNotif.method).toBe('initialized');

    client.dispose();
  });

  it('enforces absolute path for process cwd and thread cwd (SEC-11)', async () => {
    const relativeClient = new CodexClient({
      cwd: 'relative/path/not/allowed',
    });

    await expect(relativeClient.start()).rejects.toThrow(
      /working directory must be an absolute path/,
    );
  });

  it('starts thread with thread/start request and returns threadId', async () => {
    const client = new CodexClient({
      cwd: process.platform === 'win32' ? 'C:\\test\\workspace' : '/test/workspace',
      spawnFn: spawnFnSpy,
    });

    const startPromise = client.start();
    await vi.waitFor(() => expect(mockProcess.receivedFrames.length).toBe(1));
    mockProcess.stdout.write(
      serializeJsonRpc({
        jsonrpc: '2.0',
        id: (mockProcess.receivedFrames[0] as { id: string }).id,
        result: { serverInfo: { name: 'codex' } },
      }),
    );
    await startPromise;

    const threadCwd = process.platform === 'win32' ? 'C:\\test\\repo' : '/test/repo';
    const threadPromise = client.startThread({
      cwd: threadCwd,
      instructions: 'Always use TypeScript',
    });

    await vi.waitFor(() => expect(mockProcess.receivedFrames.length).toBe(3));
    const threadReq = mockProcess.receivedFrames[2] as {
      id: string;
      method: string;
      params: unknown;
    };
    expect(threadReq.method).toBe('thread/start');
    expect(threadReq.params).toEqual({
      cwd: threadCwd,
      instructions: 'Always use TypeScript',
    });

    mockProcess.stdout.write(
      serializeJsonRpc({
        jsonrpc: '2.0',
        id: threadReq.id,
        result: { threadId: 'th_abc123' },
      }),
    );

    const threadId = await threadPromise;
    expect(threadId).toBe('th_abc123');

    client.dispose();
  });

  it('synchronously pauses on approval/request and submits approval decision (SEC-19)', async () => {
    let capturedParams: CodexApprovalRequestParams | undefined;
    const approvalHandler = vi.fn().mockImplementation(async (params: CodexApprovalRequestParams) => {
      capturedParams = params;
      return { approved: true } satisfies CodexApprovalResult;
    });

    const client = new CodexClient({
      cwd: process.platform === 'win32' ? 'C:\\test\\workspace' : '/test/workspace',
      onRequestApproval: approvalHandler,
      spawnFn: spawnFnSpy,
    });

    const startPromise = client.start();
    await vi.waitFor(() => expect(mockProcess.receivedFrames.length).toBe(1));
    mockProcess.stdout.write(
      serializeJsonRpc({
        jsonrpc: '2.0',
        id: (mockProcess.receivedFrames[0] as { id: string }).id,
        result: {},
      }),
    );
    await startPromise;

    // Simulate server-initiated approval request
    mockProcess.stdout.write(
      serializeJsonRpc({
        jsonrpc: '2.0',
        id: 'req_appr_1',
        method: 'approval/request',
        params: {
          approvalId: 'appr-77',
          callId: 'call-99',
          toolName: 'Bash',
          command: 'rm -rf node_modules',
        },
      }),
    );

    await vi.waitFor(() => {
      expect(approvalHandler).toHaveBeenCalledTimes(1);
    });

    expect(capturedParams).toEqual({
      approvalId: 'appr-77',
      callId: 'call-99',
      toolName: 'Bash',
      command: 'rm -rf node_modules',
      input: { command: 'rm -rf node_modules' },
      reason: undefined,
    });

    // Check client response sent back to server
    await vi.waitFor(() => expect(mockProcess.receivedFrames.length).toBe(3));
    const response = mockProcess.receivedFrames[2] as {
      id: string;
      result: CodexApprovalResult;
    };
    expect(response.id).toBe('req_appr_1');
    expect(response.result).toEqual({ approved: true });

    client.dispose();
  });

  it('fails closed on approval denial or handler error (SEC-19)', async () => {
    const failingHandler = vi.fn().mockRejectedValue(new Error('Permission check error'));

    const client = new CodexClient({
      cwd: process.platform === 'win32' ? 'C:\\test\\workspace' : '/test/workspace',
      onRequestApproval: failingHandler,
      spawnFn: spawnFnSpy,
    });

    const startPromise = client.start();
    await vi.waitFor(() => expect(mockProcess.receivedFrames.length).toBe(1));
    mockProcess.stdout.write(
      serializeJsonRpc({
        jsonrpc: '2.0',
        id: (mockProcess.receivedFrames[0] as { id: string }).id,
        result: {},
      }),
    );
    await startPromise;

    // Simulate server-initiated approval request
    mockProcess.stdout.write(
      serializeJsonRpc({
        jsonrpc: '2.0',
        id: 'req_appr_err',
        method: 'approval/request',
        params: {
          callId: 'call-100',
          toolName: 'Bash',
          command: 'dangerous_cmd',
        },
      }),
    );

    await vi.waitFor(() => expect(mockProcess.receivedFrames.length).toBe(3));
    const response = mockProcess.receivedFrames[2] as {
      id: string;
      result: CodexApprovalResult;
    };
    expect(response.id).toBe('req_appr_err');
    expect(response.result.approved).toBe(false);
    expect(response.result.reason).toContain('Permission check error');

    client.dispose();
  });

  it('handles abort signal during turn by sending turn/cancel and cleaning process tree', async () => {
    const client = new CodexClient({
      cwd: process.platform === 'win32' ? 'C:\\test\\workspace' : '/test/workspace',
      spawnFn: spawnFnSpy,
    });

    const startPromise = client.start();
    await vi.waitFor(() => expect(mockProcess.receivedFrames.length).toBe(1));
    mockProcess.stdout.write(
      serializeJsonRpc({
        jsonrpc: '2.0',
        id: (mockProcess.receivedFrames[0] as { id: string }).id,
        result: {},
      }),
    );
    await startPromise;

    const abort = new AbortController();
    const turnPromise = client.runTurn(
      { threadId: 'th_123', prompt: 'Long running task' },
      abort.signal,
    );

    // Abort the turn
    abort.abort();

    await vi.waitFor(() => {
      // Must have sent turn/cancel notification
      const cancelNotif = mockProcess.receivedFrames.find(
        (f) => 'method' in f && f.method === 'turn/cancel',
      );
      expect(cancelNotif).toBeDefined();
    });

    client.dispose();
    await expect(turnPromise).rejects.toThrow();
  });

  it('rejects pending requests and terminates process on dispose()', async () => {
    const client = new CodexClient({
      cwd: process.platform === 'win32' ? 'C:\\test\\workspace' : '/test/workspace',
      spawnFn: spawnFnSpy,
    });

    const startPromise = client.start();
    await vi.waitFor(() => expect(mockProcess.receivedFrames.length).toBe(1));
    mockProcess.stdout.write(
      serializeJsonRpc({
        jsonrpc: '2.0',
        id: (mockProcess.receivedFrames[0] as { id: string }).id,
        result: {},
      }),
    );
    await startPromise;

    const pendingPromise = client.sendRequest('some/long/request');
    client.dispose();

    await expect(pendingPromise).rejects.toThrow(/CodexClient has been disposed/);
  });

  it('bridges Windows .cmd and .bat shims via ComSpec preserving SEC-08 argv-only', async () => {
    let capturedCmd = '';
    let capturedArgs: readonly string[] = [];

    const client = new CodexClient({
      binaryPath: 'C:\\Users\\Dell\\AppData\\Roaming\\npm\\codex.cmd',
      cwd: 'C:\\test\\workspace',
      env: { ComSpec: 'C:\\Windows\\system32\\cmd.exe' },
      spawnFn: (cmd, args) => {
        capturedCmd = cmd;
        capturedArgs = args as string[];
        return mockProcess.child;
      },
    });

    const startPromise = client.start();
    if (process.platform === 'win32') {
      expect(capturedCmd).toBe('C:\\Windows\\system32\\cmd.exe');
      expect(capturedArgs).toEqual([
        '/d',
        '/s',
        '/c',
        'C:\\Users\\Dell\\AppData\\Roaming\\npm\\codex.cmd',
        'app-server',
      ]);
    } else {
      expect(capturedCmd).toBe('C:\\Users\\Dell\\AppData\\Roaming\\npm\\codex.cmd');
      expect(capturedArgs).toEqual(['app-server']);
    }

    client.dispose();
    await expect(startPromise).rejects.toThrow();
  });
});
