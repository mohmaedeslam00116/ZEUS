/**
 * Native tool: run_command
 * Executes shell commands within the workspace directory with streaming stdout/stderr and bounded output.
 */
import { spawn } from 'node:child_process';
import type { NativeTool, NativeToolExecutionContext, NativeToolResult } from './types';

const MAX_OUTPUT_BYTES = 64 * 1024; // 64 KiB output ceiling (XP-01)
const DEFAULT_TIMEOUT_MS = 60_000; // 60s default timeout

export const runCommandTool: NativeTool = {
  name: 'run_command',
  description:
    'Executes a shell command within the workspace directory. Streams stdout/stderr and returns the exit code and process output.',
  parameters: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'Shell command to execute.',
      },
      timeout_ms: {
        type: 'integer',
        description: 'Optional execution timeout in milliseconds (default: 60000).',
      },
    },
    required: ['command'],
  },

  async execute(
    input: Record<string, unknown>,
    context: NativeToolExecutionContext,
  ): Promise<NativeToolResult> {
    const rawCommand = String(input.command ?? '');
    if (!rawCommand.trim()) {
      return { success: false, output: 'Missing required parameter: "command"', error: 'Missing command' };
    }

    const timeoutMs =
      typeof input.timeout_ms === 'number' && Number.isFinite(input.timeout_ms) && input.timeout_ms > 0
        ? Math.floor(input.timeout_ms)
        : DEFAULT_TIMEOUT_MS;

    const [bin, args] =
      process.platform === 'win32'
        ? [process.env.COMSPEC || 'cmd.exe', ['/d', '/s', '/c', rawCommand]]
        : [process.env.SHELL || '/bin/sh', ['-c', rawCommand]];

    return new Promise<NativeToolResult>((resolve) => {
      let stdoutAccumulator = '';
      let stderrAccumulator = '';
      let stdoutTruncated = false;
      let stderrTruncated = false;
      let settled = false;

      let timer: NodeJS.Timeout | null = null;

      const proc = spawn(bin, args, {
        cwd: context.workspaceRoot,
        env: {
          ...process.env,
          ZEUS_NATIVE_AGENT: '1',
        },
        windowsHide: true,
        windowsVerbatimArguments: process.platform === 'win32',
      });


      const cleanup = () => {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }
      };

      const finish = (result: NativeToolResult) => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve(result);
      };

      if (context.abortSignal) {
        if (context.abortSignal.aborted) {
          try {
            proc.kill();
          } catch {
            // ignore
          }
          return finish({
            success: false,
            output: 'Command execution aborted by user',
            error: 'Aborted',
          });
        }
        context.abortSignal.addEventListener(
          'abort',
          () => {
            try {
              proc.kill();
            } catch {
              // ignore
            }
            finish({
              success: false,
              output: 'Command execution aborted by user',
              error: 'Aborted',
            });
          },
          { once: true },
        );
      }

      timer = setTimeout(() => {
        try {
          proc.kill();
        } catch {
          // ignore
        }
        finish({
          success: false,
          output: `Command timed out after ${timeoutMs}ms: ${rawCommand}`,
          error: 'Timed out',
        });
      }, timeoutMs);

      proc.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        context.onOutputChunk?.(text);

        if (stdoutAccumulator.length < MAX_OUTPUT_BYTES) {
          stdoutAccumulator += text;
          if (stdoutAccumulator.length > MAX_OUTPUT_BYTES) {
            stdoutAccumulator = stdoutAccumulator.slice(0, MAX_OUTPUT_BYTES);
            stdoutTruncated = true;
          }
        }
      });

      proc.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        context.onOutputChunk?.(text);

        if (stderrAccumulator.length < MAX_OUTPUT_BYTES) {
          stderrAccumulator += text;
          if (stderrAccumulator.length > MAX_OUTPUT_BYTES) {
            stderrAccumulator = stderrAccumulator.slice(0, MAX_OUTPUT_BYTES);
            stderrTruncated = true;
          }
        }
      });

      proc.on('error', (err) => {
        finish({
          success: false,
          output: `Failed to spawn process: ${err.message}`,
          error: err.message,
        });
      });

      proc.on('close', (code, signal) => {
        const exitCode = code ?? (signal ? 1 : 0);
        const parts: string[] = [`Command: ${rawCommand}`, `Exit code: ${exitCode}`];

        if (stdoutAccumulator.trim()) {
          parts.push(
            `\nStdout:\n${stdoutAccumulator}${stdoutTruncated ? '\n[Stdout truncated at 64 KB]' : ''}`,
          );
        }
        if (stderrAccumulator.trim()) {
          parts.push(
            `\nStderr:\n${stderrAccumulator}${stderrTruncated ? '\n[Stderr truncated at 64 KB]' : ''}`,
          );
        }
        if (!stdoutAccumulator.trim() && !stderrAccumulator.trim()) {
          parts.push('\n[No output emitted]');
        }

        finish({
          success: exitCode === 0,
          output: parts.join('\n'),
        });
      });
    });
  },
};
