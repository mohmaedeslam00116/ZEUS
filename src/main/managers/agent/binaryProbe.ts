/**
 * Cross-platform CLI binary detection probes for headless agent providers.
 *
 * Verifies availability of `cline`, `opencode`, and `codex` on host PATH
 * across Windows, macOS, and Linux, providing actionable installation commands
 * and graceful error messaging when an executable is missing.
 */
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  PROVIDER_BINARIES,
  PROVIDER_INSTALL_GUIDANCE,
  type BinaryProbeResult,
  type HeadlessAgentProvider,
} from './types';

export interface BinaryProbeOptions {
  /** Optional custom environment variables (defaults to process.env). */
  env?: NodeJS.ProcessEnv;
  /** Optional custom platform override ('win32' | 'linux' | 'darwin'). */
  platform?: NodeJS.Platform;
  /** Force re-probe, bypassing in-memory memoization. */
  force?: boolean;
  /** Custom file existence check (for hermetic unit tests). */
  fsExists?: (filePath: string) => boolean;
  /** Custom command execution function (for hermetic unit tests). */
  execFileFn?: (
    cmd: string,
    args: string[],
    options: { timeout?: number },
  ) => Promise<{ ok: boolean; stdout: string; stderr: string }>;
  /** Timeout in milliseconds for version checks (default: 3000ms). */
  timeoutMs?: number;
}

const memoizedResults = new Map<string, BinaryProbeResult>();

/** Reset memoized probe results (testing only). */
export function clearBinaryProbeCache(): void {
  memoizedResults.clear();
}

const MAX_BUFFER = 64 * 1024; // 64 KiB per XP-01
const DEFAULT_TIMEOUT_MS = 3000;

/**
 * Default runner for CLI version/where queries.
 * On Windows, `.cmd` and `.bat` shims are bridged via `%ComSpec% /d /s /c`
 * with static-literal arguments per SEC-09.
 */
function defaultExec(
  cmd: string,
  args: string[],
  options: { timeout?: number },
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const isWindows = process.platform === 'win32';
    const isShim =
      isWindows &&
      (cmd.toLowerCase().endsWith('.cmd') || cmd.toLowerCase().endsWith('.bat'));
    const execTarget = isShim ? (process.env.ComSpec || 'cmd.exe') : cmd;
    const execArgs = isShim ? ['/d', '/s', '/c', cmd, ...args] : args;

    execFile(
      execTarget,
      execArgs,
      {
        timeout: options.timeout ?? DEFAULT_TIMEOUT_MS,
        maxBuffer: MAX_BUFFER,
        windowsHide: true,
      },
      (err, stdout, stderr) => {
        resolve({
          ok: !err,
          stdout: typeof stdout === 'string' ? stdout.trim() : '',
          stderr: typeof stderr === 'string' ? stderr.trim() : '',
        });
      },
    );
  });
}

/**
 * Probe host PATH and standard binary locations to locate an agent executable.
 */
export async function probeBinary(
  providerOrBinary: HeadlessAgentProvider | string,
  options: BinaryProbeOptions = {},
): Promise<BinaryProbeResult> {
  const binaryName =
    PROVIDER_BINARIES[providerOrBinary as HeadlessAgentProvider] ?? providerOrBinary;
  const isHeadless = (providerOrBinary in PROVIDER_INSTALL_GUIDANCE) as boolean;
  const installGuide = isHeadless
    ? PROVIDER_INSTALL_GUIDANCE[providerOrBinary as HeadlessAgentProvider]
    : `Please install "${binaryName}" and ensure it is available on your PATH.`;

  const memoized = memoizedResults.get(binaryName);
  if (!options.force && memoized) {
    return memoized;
  }

  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const pathOps = platform === 'win32' ? path.win32 : path.posix;
  const fsExists = options.fsExists ?? fs.existsSync;
  const execFn = options.execFileFn ?? defaultExec;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  // 1. Gather PATH search directories (absolute directories only per SEC-10)
  const pathEnv = env.PATH || env.Path || '';
  const delimiter = platform === 'win32' ? ';' : ':';
  const dirs = pathEnv
    .split(delimiter)
    .filter((d) => Boolean(d) && pathOps.isAbsolute(d));

  // Add standard user and system binary directories for GUI apps
  if (platform === 'win32') {
    const localAppData = env.LOCALAPPDATA || '';
    const programFiles = env.ProgramFiles || 'C:\\Program Files';
    const programFilesX86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const userProfile = env.USERPROFILE || os.homedir();

    const winCommonPaths = [
      pathOps.join(userProfile, 'AppData', 'Roaming', 'npm'),
      pathOps.join(localAppData, 'Programs', '@opencode-aidesktop'),
      pathOps.join(localAppData, 'Programs', 'OpenCode'),
      pathOps.join(programFiles, 'OpenCode'),
      pathOps.join(programFilesX86, 'OpenCode'),
      'D:\\Program Files\\OpenCode',
      'D:\\Program Files (x86)\\OpenCode',
    ];
    for (const p of winCommonPaths) {
      if (p && !dirs.includes(p)) {
        try {
          if (fsExists(p)) {
            dirs.push(p);
          }
        } catch {
          // Skip unreadable path
        }
      }
    }
  } else {
    const home = env.HOME || os.homedir();
    const commonPaths = [
      pathOps.join(home, '.local', 'bin'),
      '/usr/local/bin',
      '/opt/homebrew/bin',
      '/usr/bin',
    ];
    for (const p of commonPaths) {
      if (!dirs.includes(p)) dirs.push(p);
    }
  }

  // Windows extensions vs POSIX
  const extensions = platform === 'win32' ? ['.exe', '.cmd', '.bat', ''] : [''];

  const candidateNames =
    providerOrBinary === 'opencode'
      ? ['opencode', 'opencode-cli']
      : [binaryName];

  // 2. Direct filesystem scan in PATH and standard directories
  let foundPath: string | undefined;
  for (const name of candidateNames) {
    for (const dir of dirs) {
      for (const ext of extensions) {
        const candidate = pathOps.join(dir, `${name}${ext}`);
        try {
          if (fsExists(candidate)) {
            foundPath = candidate;
            break;
          }
        } catch {
          // Skip unreadable path
        }
      }
      if (foundPath) break;
    }
    if (foundPath) break;
  }

  // 3. System lookup fallback (`where.exe` on Windows, `which` on POSIX)
  if (!foundPath) {
    for (const name of candidateNames) {
      try {
        const lookupCmd = platform === 'win32' ? 'where.exe' : 'which';
        const result = await execFn(lookupCmd, [name], { timeout: timeoutMs });
        if (result.ok && result.stdout) {
          const firstHit = result.stdout.split(/\r?\n/)[0]?.trim();
          if (firstHit && pathOps.isAbsolute(firstHit) && fsExists(firstHit)) {
            foundPath = firstHit;
            break;
          }
        }
      } catch {
        // Lookup failed or timed out
      }
    }
  }

  if (!foundPath) {
    // Fail-open for re-probe: do not permanently memoize absent binaries so
    // a subsequent run can detect an executable installed while ZEUS is running.
    return {
      available: false,
      binaryName,
      installGuide,
      error: `Executable "${binaryName}" was not found on PATH.`,
    };
  }

  // 4. Test execution and capture version if possible
  let version: string | undefined;
  try {
    const verResult = await execFn(foundPath, ['--version'], { timeout: timeoutMs });
    if (verResult.ok && verResult.stdout) {
      version = verResult.stdout.split(/\r?\n/)[0]?.trim();
    }
  } catch {
    // Binary exists but --version failed; still available
  }

  const result: BinaryProbeResult = {
    available: true,
    binaryName,
    path: foundPath,
    version,
    installGuide,
  };
  memoizedResults.set(binaryName, result);
  return result;
}

/**
 * Convenience boolean probe to check if an agent binary is available.
 */
export async function isBinaryAvailable(
  providerOrBinary: HeadlessAgentProvider | string,
  options?: BinaryProbeOptions,
): Promise<boolean> {
  const res = await probeBinary(providerOrBinary, options);
  return res.available;
}
