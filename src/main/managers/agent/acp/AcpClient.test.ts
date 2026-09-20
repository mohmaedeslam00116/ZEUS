/**
 * Unit tests for Unified Stdio JSON-RPC ACP Client with Synchronous Tool Permission Gating (#57).
 *
 * Verifies:
 * - Line-delimited JSON-RPC framing and fragmented chunk handling.
 * - Initialization handshake and capability advertising.
 * - Session creation, prompt dispatch, and cancellation.
 * - SEC-19 synchronous tool permission interception (blocking until resolution,
 *   approved vs denied payloads, zero execution bypass).
 * - Process error handling and reliable process tree termination via killTree.
 */
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcess } from 'node:child_process';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as killTreeModule from '../killTree';
import { AcpClient } from './AcpClient';
import {
  JsonRpcStreamParser,
  isJsonRpcNotification,
  isJsonRpcRequest,
  isJsonRpcResponse,
  serializeJsonRpc,
} from './jsonRpc';
import type {
  AcpInitializeResult,
  AcpPermissionRequestParams,
  AcpPermissionResult,
  AcpSessionCancelParams,
  JsonRpcMessage,
  JsonRpcNotification,
  JsonRpcRequest,
} from './types';

/**
 * Creates a controllable mock child process with readable/writable stdio streams.
 */
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
    pid: 12345,
    stdin,
    stdout,
    stderr,
    exitCode: null,
    signalCode: null,
    kill: vi.fn(),
  }) as unknown as ChildProcess;

  return { child, stdin, stdout, stderr, events, receivedFrames };
}

describe('JSON-RPC 2.0 Framing & Parsing (#57)', () => {
  it('parses complete single and multi-line frames', () => {
    const received: JsonRpcMessage[] = [];
    const parser = new JsonRpcStreamParser((msg) => received.push(msg));

    parser.feed('{"jsonrpc":"2.0","method":"test1","params":{}}\n');
    parser.feed('{"jsonrpc":"2.0","method":"test2","params":{"a":1}}\r\n');

    expect(received).toHaveLength(2);
    expect(received[0]).toEqual({ jsonrpc: '2.0', method: 'test1', params: {} });
    expect(received[1]).toEqual({ jsonrpc: '2.0', method: 'test2', params: { a: 1 } });
  });

  it('reassembles fragmented chunks cleanly', () => {
    const received: JsonRpcMessage[] = [];
    const parser = new JsonRpcStreamParser((msg) => received.push(msg));

    parser.feed('{"jsonrpc":"2.0",');
    parser.feed('"id":1,');
    parser.feed('"method":"initialize"}\n');

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ jsonrpc: '2.0', id: 1, method: 'initialize' });
  });

  it('handles multiple messages delivered in a single chunk', () => {
    const received: JsonRpcMessage[] = [];
    const parser = new JsonRpcStreamParser((msg) => received.push(msg));

    const chunk = [
      '{"jsonrpc":"2.0","id":1,"result":"first"}',
      '{"jsonrpc":"2.0","id":2,"result":"second"}',
      '',
    ].join('\n');

    parser.feed(chunk);

    expect(received).toHaveLength(2);
    expect(received[0]).toEqual({ jsonrpc: '2.0', id: 1, result: 'first' });
    expect(received[1]).toEqual({ jsonrpc: '2.0', id: 2, result: 'second' });
  });

  it('catches and reports invalid JSON without crashing stream listener', () => {
    const received: JsonRpcMessage[] = [];
    const errors: string[] = [];
    const parser = new JsonRpcStreamParser(
      (msg) => received.push(msg),
      (err) => errors.push(err.message),
    );

    parser.feed('{bad-json\n');
    parser.feed('{"jsonrpc":"2.0","method":"ok"}\n');

    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('JSON');
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ jsonrpc: '2.0', method: 'ok' });
  });

  it('type-guards identify requests, notifications, and responses accurately', () => {
    const req = { jsonrpc: '2.0', id: 1, method: 'ping' } as const;
    const notif = { jsonrpc: '2.0', method: 'update' } as const;
    const res = { jsonrpc: '2.0', id: 1, result: { ok: true } } as const;

    expect(isJsonRpcRequest(req)).toBe(true);
    expect(isJsonRpcRequest(notif)).toBe(false);

    expect(isJsonRpcNotification(notif)).toBe(true);
    expect(isJsonRpcNotification(req)).toBe(false);

    expect(isJsonRpcResponse(res)).toBe(true);
    expect(isJsonRpcResponse(req)).toBe(false);
  });
});

describe('AcpClient Protocol Handshake & Lifecycle (#57)', () => {
  let mockEnv: ReturnType<typeof createMockChildProcess>;
  let killTreeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockEnv = createMockChildProcess();
    killTreeSpy = vi.spyOn(killTreeModule, 'killTree').mockImplementation(() => undefined);
  });

  afterEach(() => {
    killTreeSpy.mockRestore();
  });

  it('initiates handshake and exchanges capabilities with the agent', async () => {
    const client = new AcpClient({
      executablePath: 'cline',
      args: ['--acp'],
      cwd: '/fake/workspace',
      onRequestPermission: vi.fn(),
      spawnFn: () => mockEnv.child,
    });

    const startPromise = client.start();

    // Verify initialize request was written to child's stdin
    await vi.waitFor(() => {
      expect(mockEnv.receivedFrames.length).toBeGreaterThanOrEqual(1);
    });

    const initReq = mockEnv.receivedFrames[0] as JsonRpcRequest;
    expect(initReq.method).toBe('initialize');
    expect(initReq.params).toEqual({
      protocolVersion: 1,
      clientInfo: { name: 'zeus', version: '0.2.0' },
      clientCapabilities: {
        fs: {
          readTextFile: false,
          writeTextFile: false,
        },
        terminal: false,
      },
      capabilities: {
        tools: { requestPermission: true },
        streaming: true,
      },
    });

    // Simulate Agent responding to initialize
    const initResponse: AcpInitializeResult = {
      protocolVersion: 1,
      agentInfo: { name: 'cline', version: '1.0.0' },
      capabilities: { streaming: true },
    };

    mockEnv.stdout.write(
      serializeJsonRpc({
        jsonrpc: '2.0',
        id: initReq.id,
        result: initResponse,
      }),
    );

    const result = await startPromise;
    expect(result).toEqual(initResponse);

    // Verify initialized notification was sent
    await vi.waitFor(() => {
      const initializedNotif = mockEnv.receivedFrames.find(
        (f) => 'method' in f && f.method === 'notifications/initialized',
      );
      expect(initializedNotif).toBeDefined();
    });

    client.dispose();
  });

  it('creates sessions and dispatches prompts to the agent', async () => {
    const client = new AcpClient({
      executablePath: 'opencode',
      args: ['acp'],
      cwd: '/fake/workspace',
      onRequestPermission: vi.fn(),
      spawnFn: () => mockEnv.child,
    });

    const startPromise = client.start();
    await vi.waitFor(() => expect(mockEnv.receivedFrames.length).toBe(1));
    mockEnv.stdout.write(
      serializeJsonRpc({
        jsonrpc: '2.0',
        id: (mockEnv.receivedFrames[0] as JsonRpcRequest).id,
        result: { protocolVersion: 1 },
      }),
    );
    await startPromise;

    // 1. Test createSession
    const sessionPromise = client.createSession('/my/repo', 'Arabic guidance instructions');
    await vi.waitFor(() => {
      const req = mockEnv.receivedFrames.find(
        (f) => 'method' in f && f.method === 'session/new',
      ) as JsonRpcRequest | undefined;
      expect(req).toBeDefined();
      if (req) {
        expect(req.params).toEqual({
          cwd: '/my/repo',
          mcpServers: [],
          instructions: 'Arabic guidance instructions',
        });
        mockEnv.stdout.write(
          serializeJsonRpc({
            jsonrpc: '2.0',
            id: req.id,
            result: { sessionId: 'sess-abc-123' },
          }),
        );
      }
    });

    const sessionId = await sessionPromise;
    expect(sessionId).toBe('sess-abc-123');

    // 2. Test prompt
    const promptPromise = client.prompt(sessionId, 'Refactor this function');
    await vi.waitFor(() => {
      const req = mockEnv.receivedFrames.find(
        (f) => 'method' in f && f.method === 'session/prompt',
      ) as JsonRpcRequest | undefined;
      expect(req).toBeDefined();
      if (req) {
        expect(req.params).toEqual({
          sessionId: 'sess-abc-123',
          prompt: [{ type: 'text', text: 'Refactor this function' }],
        });
        mockEnv.stdout.write(
          serializeJsonRpc({
            jsonrpc: '2.0',
            id: req.id,
            result: { stopReason: 'endTurn' },
          }),
        );
      }
    });

    const promptResult = await promptPromise;
    expect(promptResult).toEqual({ stopReason: 'endTurn' });

    // 3. Test createSession with AcpSessionNewParams object
    const sessionObjPromise = client.createSession({
      cwd: '/my/other-repo',
      instructions: 'Custom instructions',
      env: { CUSTOM_VAR: '1' },
    });
    await vi.waitFor(() => {
      const req = mockEnv.receivedFrames.filter(
        (f) => 'method' in f && f.method === 'session/new',
      )[1] as JsonRpcRequest | undefined;
      expect(req).toBeDefined();
      if (req) {
        expect(req.params).toEqual({
          cwd: '/my/other-repo',
          mcpServers: [],
          instructions: 'Custom instructions',
          env: { CUSTOM_VAR: '1' },
        });
        mockEnv.stdout.write(
          serializeJsonRpc({
            jsonrpc: '2.0',
            id: req.id,
            result: { sessionId: 'sess-def-456' },
          }),
        );
      }
    });

    const secondSessionId = await sessionObjPromise;
    expect(secondSessionId).toBe('sess-def-456');

    client.dispose();
  });

  it('rejects start() if cwd is a relative path (SEC-11)', async () => {
    const client = new AcpClient({
      executablePath: 'cline',
      args: ['--acp'],
      cwd: 'relative/path/not/absolute',
      onRequestPermission: vi.fn(),
      spawnFn: () => mockEnv.child,
    });

    await expect(client.start()).rejects.toThrow(
      'Working directory must be an absolute path: "relative/path/not/absolute"',
    );
  });

  it('rejects createSession() if session cwd is a relative path (SEC-11)', async () => {
    const client = new AcpClient({
      executablePath: 'cline',
      args: ['--acp'],
      cwd: '/fake/workspace',
      onRequestPermission: vi.fn(),
      spawnFn: () => mockEnv.child,
    });

    const startPromise = client.start();
    await vi.waitFor(() => expect(mockEnv.receivedFrames.length).toBe(1));
    mockEnv.stdout.write(
      serializeJsonRpc({
        jsonrpc: '2.0',
        id: (mockEnv.receivedFrames[0] as JsonRpcRequest).id,
        result: { protocolVersion: 1 },
      }),
    );
    await startPromise;

    await expect(client.createSession('not/an/absolute/path')).rejects.toThrow(
      'Session working directory must be an absolute path: "not/an/absolute/path"',
    );

    client.dispose();
  });
});

describe('SEC-19 Synchronous Tool Permission Gating (#57)', () => {
  let mockEnv: ReturnType<typeof createMockChildProcess>;

  beforeEach(() => {
    mockEnv = createMockChildProcess();
    vi.spyOn(killTreeModule, 'killTree').mockImplementation(() => undefined);
  });

  it('pauses child execution until permission gate approves request', async () => {
    let resolveGate!: (res: AcpPermissionResult) => void;
    const gatePromise = new Promise<AcpPermissionResult>((resolve) => {
      resolveGate = resolve;
    });

    const onRequestPermission = vi.fn().mockReturnValue(gatePromise);

    const client = new AcpClient({
      executablePath: 'cline',
      args: ['--acp'],
      cwd: '/fake/workspace',
      onRequestPermission,
      spawnFn: () => mockEnv.child,
    });

    const startPromise = client.start();
    await vi.waitFor(() => expect(mockEnv.receivedFrames.length).toBe(1));
    mockEnv.stdout.write(
      serializeJsonRpc({
        jsonrpc: '2.0',
        id: (mockEnv.receivedFrames[0] as JsonRpcRequest).id,
        result: { protocolVersion: 1 },
      }),
    );
    await startPromise;

    // Agent attempts to run a tool: sends session/request_permission
    const toolParams: AcpPermissionRequestParams = {
      sessionId: 'sess-1',
      toolCallId: 'call-99',
      toolName: 'Bash',
      input: { command: 'rm -rf dist' },
    };

    mockEnv.stdout.write(
      serializeJsonRpc({
        jsonrpc: '2.0',
        id: 777,
        method: 'session/request_permission',
        params: toolParams,
      }),
    );

    // Verify onRequestPermission was invoked with exact params
    await vi.waitFor(() => {
      expect(onRequestPermission).toHaveBeenCalledWith(toolParams, undefined);
    });

    // Verify that BEFORE resolveGate is called, NO response with id 777 was written to stdin!
    const immediateResponse = mockEnv.receivedFrames.find(
      (f) => 'id' in f && f.id === 777,
    );
    expect(immediateResponse).toBeUndefined();

    // Now user clicks "Approve" in ZEUS UI:
    resolveGate({ approved: true });

    // Verify client immediately sends { approved: true } back to child
    await vi.waitFor(() => {
      const response = mockEnv.receivedFrames.find(
        (f) => 'id' in f && f.id === 777,
      );
      expect(response).toBeDefined();
      expect(response).toEqual({
        jsonrpc: '2.0',
        id: 777,
        result: {
          approved: true,
          reason: undefined,
          updatedInput: undefined,
        },
      });
    });

    client.dispose();
  });

  it('pauses child execution until permission gate denies request with reason', async () => {
    let resolveGate!: (res: AcpPermissionResult) => void;
    const gatePromise = new Promise<AcpPermissionResult>((resolve) => {
      resolveGate = resolve;
    });

    const onRequestPermission = vi.fn().mockReturnValue(gatePromise);

    const client = new AcpClient({
      executablePath: 'cline',
      args: ['--acp'],
      cwd: '/fake/workspace',
      onRequestPermission,
      spawnFn: () => mockEnv.child,
    });

    const startPromise = client.start();
    await vi.waitFor(() => expect(mockEnv.receivedFrames.length).toBe(1));
    mockEnv.stdout.write(
      serializeJsonRpc({
        jsonrpc: '2.0',
        id: (mockEnv.receivedFrames[0] as JsonRpcRequest).id,
        result: { protocolVersion: 1 },
      }),
    );
    await startPromise;

    // Agent attempts to run a tool: sends session/request_permission
    mockEnv.stdout.write(
      serializeJsonRpc({
        jsonrpc: '2.0',
        id: 888,
        method: 'session/request_permission',
        params: {
          sessionId: 'sess-1',
          toolName: 'WriteFile',
          input: { path: '/etc/passwd' },
        },
      }),
    );

    await vi.waitFor(() => {
      expect(onRequestPermission).toHaveBeenCalledTimes(1);
    });

    // User or security policy denies tool call
    resolveGate({
      approved: false,
      reason: 'Protected system file: access denied by ZEUS sandbox policy (SEC-14)',
    });

    await vi.waitFor(() => {
      const response = mockEnv.receivedFrames.find(
        (f) => 'id' in f && f.id === 888,
      );
      expect(response).toBeDefined();
      expect(response).toEqual({
        jsonrpc: '2.0',
        id: 888,
        result: {
          approved: false,
          reason: 'Protected system file: access denied by ZEUS sandbox policy (SEC-14)',
          updatedInput: undefined,
        },
      });
    });

    client.dispose();
  });

  it('denies by default if permission handler throws an exception', async () => {
    const onRequestPermission = vi.fn().mockRejectedValue(new Error('Permission check internal failure'));

    const client = new AcpClient({
      executablePath: 'cline',
      args: ['--acp'],
      cwd: '/fake/workspace',
      onRequestPermission,
      spawnFn: () => mockEnv.child,
    });

    const startPromise = client.start();
    await vi.waitFor(() => expect(mockEnv.receivedFrames.length).toBe(1));
    mockEnv.stdout.write(
      serializeJsonRpc({
        jsonrpc: '2.0',
        id: (mockEnv.receivedFrames[0] as JsonRpcRequest).id,
        result: { protocolVersion: 1 },
      }),
    );
    await startPromise;

    mockEnv.stdout.write(
      serializeJsonRpc({
        jsonrpc: '2.0',
        id: 999,
        method: 'session/request_permission',
        params: {
          sessionId: 'sess-1',
          toolName: 'Bash',
          input: { command: 'test' },
        },
      }),
    );

    await vi.waitFor(() => {
      const response = mockEnv.receivedFrames.find(
        (f) => 'id' in f && f.id === 999,
      );
      expect(response).toBeDefined();
      expect(response).toEqual({
        jsonrpc: '2.0',
        id: 999,
        result: {
          approved: false,
          reason: 'Permission check internal failure',
        },
      });
    });

    client.dispose();
  });

  it('falls back to default reason if permission denial does not provide a reason', async () => {
    const onRequestPermission = vi.fn().mockResolvedValue({ approved: false });

    const client = new AcpClient({
      executablePath: 'cline',
      args: ['--acp'],
      cwd: '/fake/workspace',
      onRequestPermission,
      spawnFn: () => mockEnv.child,
    });

    const startPromise = client.start();
    await vi.waitFor(() => expect(mockEnv.receivedFrames.length).toBe(1));
    mockEnv.stdout.write(
      serializeJsonRpc({
        jsonrpc: '2.0',
        id: (mockEnv.receivedFrames[0] as JsonRpcRequest).id,
        result: { protocolVersion: 1 },
      }),
    );
    await startPromise;

    mockEnv.stdout.write(
      serializeJsonRpc({
        jsonrpc: '2.0',
        id: 555,
        method: 'session/request_permission',
        params: {
          sessionId: 'sess-1',
          toolName: 'Bash',
          input: { command: 'echo hi' },
        },
      }),
    );

    await vi.waitFor(() => {
      const response = mockEnv.receivedFrames.find(
        (f) => 'id' in f && f.id === 555,
      );
      expect(response).toBeDefined();
      expect(response).toEqual({
        jsonrpc: '2.0',
        id: 555,
        result: {
          approved: false,
          reason: 'Permission denied by user or security policy',
          updatedInput: undefined,
        },
      });
    });

    client.dispose();
  });
});

describe('Cancellation & Teardown (#57)', () => {
  let mockEnv: ReturnType<typeof createMockChildProcess>;
  let killTreeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockEnv = createMockChildProcess();
    killTreeSpy = vi.spyOn(killTreeModule, 'killTree').mockImplementation(() => undefined);
  });

  afterEach(() => {
    killTreeSpy.mockRestore();
  });

  it('sends session/cancel notification and triggers abort on AbortSignal', async () => {
    const client = new AcpClient({
      executablePath: 'cline',
      args: ['--acp'],
      cwd: '/fake/workspace',
      onRequestPermission: vi.fn(),
      spawnFn: () => mockEnv.child,
    });

    const startPromise = client.start();
    await vi.waitFor(() => expect(mockEnv.receivedFrames.length).toBe(1));
    mockEnv.stdout.write(
      serializeJsonRpc({
        jsonrpc: '2.0',
        id: (mockEnv.receivedFrames[0] as JsonRpcRequest).id,
        result: { protocolVersion: 1 },
      }),
    );
    await startPromise;

    const controller = new AbortController();
    const promptPromise = client.prompt('sess-1', 'Infinite prompt loop', controller.signal);

    // Abort midway through turn
    controller.abort();

    await vi.waitFor(() => {
      const cancelNotif = mockEnv.receivedFrames.find(
        (f) => 'method' in f && f.method === 'session/cancel',
      );
      expect(cancelNotif).toBeDefined();
      expect(
        (cancelNotif as JsonRpcNotification<AcpSessionCancelParams>).params,
      ).toEqual({ sessionId: 'sess-1' });
    });

    // Simulate Agent completing turn with cancelled
    const promptReq = mockEnv.receivedFrames.find(
      (f) => 'method' in f && f.method === 'session/prompt',
    ) as JsonRpcRequest;
    mockEnv.stdout.write(
      serializeJsonRpc({
        jsonrpc: '2.0',
        id: promptReq.id,
        result: { stopReason: 'cancelled' },
      }),
    );

    const res = await promptPromise;
    expect(res.stopReason).toBe('cancelled');
    expect(killTreeSpy).toHaveBeenCalledWith(mockEnv.child, 1000);

    client.dispose();
  });

  it('invokes killTree on child error to prevent zombie processes', async () => {
    const client = new AcpClient({
      executablePath: 'cline',
      args: ['--acp'],
      cwd: '/fake/workspace',
      onRequestPermission: vi.fn(),
      spawnFn: () => mockEnv.child,
    });

    const startPromise = client.start();
    await vi.waitFor(() => expect(mockEnv.receivedFrames.length).toBe(1));

    // Child emits an error event
    mockEnv.events.emit('error', new Error('Spawn failure'));

    await expect(startPromise).rejects.toThrow('ACP child process error: Spawn failure');
    expect(killTreeSpy).toHaveBeenCalledWith(mockEnv.child, 1000);
  });

  it('invokes killTree on child process upon dispose()', async () => {
    const client = new AcpClient({
      executablePath: 'cline',
      args: ['--acp'],
      cwd: '/fake/workspace',
      onRequestPermission: vi.fn(),
      spawnFn: () => mockEnv.child,
    });

    const startPromise = client.start();
    await vi.waitFor(() => expect(mockEnv.receivedFrames.length).toBe(1));
    mockEnv.stdout.write(
      serializeJsonRpc({
        jsonrpc: '2.0',
        id: (mockEnv.receivedFrames[0] as JsonRpcRequest).id,
        result: { protocolVersion: 1 },
      }),
    );
    await startPromise;

    client.dispose();

    expect(killTreeSpy).toHaveBeenCalledWith(mockEnv.child, 1000);
  });

  it('captures stderr and rejects pending requests on premature process exit', async () => {
    const client = new AcpClient({
      executablePath: 'cline',
      args: ['--acp'],
      cwd: '/fake/workspace',
      onRequestPermission: vi.fn(),
      spawnFn: () => mockEnv.child,
    });

    const startPromise = client.start();
    await vi.waitFor(() => expect(mockEnv.receivedFrames.length).toBe(1));

    // Child crashes: writes stderr and closes
    mockEnv.stderr.write('Fatal: missing authentication token\n');
    mockEnv.events.emit('close', 1, null);

    await expect(startPromise).rejects.toThrow(
      'ACP process exited prematurely (code 1, signal none): Fatal: missing authentication token',
    );
  });

  it('bridges Windows .cmd and .bat shims via ComSpec preserving SEC-08 argv-only', async () => {
    let capturedCmd = '';
    let capturedArgs: readonly string[] = [];

    const client = new AcpClient({
      executablePath: 'C:\\Users\\Dell\\AppData\\Roaming\\npm\\cline.cmd',
      args: ['--acp'],
      cwd: 'C:\\fake\\workspace',
      env: { ComSpec: 'C:\\Windows\\system32\\cmd.exe' },
      onRequestPermission: vi.fn(),
      spawnFn: (cmd, args) => {
        capturedCmd = cmd;
        capturedArgs = args;
        return mockEnv.child;
      },
    });

    const startPromise = client.start();
    if (process.platform === 'win32') {
      expect(capturedCmd).toBe('C:\\Windows\\system32\\cmd.exe');
      expect(capturedArgs).toEqual([
        '/d',
        '/s',
        '/c',
        'C:\\Users\\Dell\\AppData\\Roaming\\npm\\cline.cmd',
        '--acp',
      ]);
    } else {
      expect(capturedCmd).toBe('C:\\Users\\Dell\\AppData\\Roaming\\npm\\cline.cmd');
      expect(capturedArgs).toEqual(['--acp']);
    }

    client.dispose();
    await expect(startPromise).rejects.toThrow();
  });
});
