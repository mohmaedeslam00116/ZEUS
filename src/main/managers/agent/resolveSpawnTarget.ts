/**
 * Cross-platform process spawn target resolver.
 *
 * Resolves binary executables and batch/cmd shims for process spawning:
 * - On Windows, npm global CLIs (e.g. `cline`, `opencode`, `codex`) are installed
 *   as `.cmd` / `.bat` shell shims rather than native `.exe` binaries.
 * - Spawning `.cmd` / `.bat` shims directly via Node's `child_process.spawn()` with
 *   `shell: false` fails with `ENOENT` because Win32 `CreateProcessW` only directly
 *   executes `.exe` binaries.
 * - Bridges `.cmd` and `.bat` shims via `%ComSpec% /d /s /c` with static-literal
 *   argv arrays preserving SEC-08 (no `shell: true` and no shell string concatenation).
 */
import fs from 'node:fs';
import path from 'node:path';

export interface ResolvedSpawnTarget {
  /** The command executable to pass to `spawn()`. */
  command: string;
  /** The argument array to pass to `spawn()`. */
  args: string[];
}

export interface ResolveSpawnTargetOptions {
  /** Platform override ('win32' | 'linux' | 'darwin'). Defaults to `process.platform`. */
  platform?: NodeJS.Platform;
  /** Environment variables override (for PATH and ComSpec lookup). Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** File existence check override (for hermetic unit testing). Defaults to `fs.existsSync`. */
  fsExists?: (filePath: string) => boolean;
}

const WINDOWS_SHIM_EXTENSIONS = ['.cmd', '.bat'];
const WINDOWS_SEARCH_EXTENSIONS = ['.exe', '.cmd', '.bat', ''];

/**
 * Resolves an executable path and argument list into a runnable spawn target.
 *
 * On Windows:
 * - If the target is or resolves to a `.cmd` or `.bat` script, bridges execution via
 *   `%ComSpec% /d /s /c <target>` using argv arrays per SEC-08.
 * - On non-Windows platforms, passes through the executable path and arguments unchanged.
 */
export function resolveSpawnTarget(
  command: string,
  args: readonly string[] = [],
  options: ResolveSpawnTargetOptions = {},
): ResolvedSpawnTarget {
  const platform = options.platform ?? process.platform;
  if (platform !== 'win32') {
    return { command, args: [...args] };
  }

  const env = options.env ?? process.env;
  const fsExists = options.fsExists ?? fs.existsSync;
  const comSpec = env.ComSpec || env.COMSPEC || 'cmd.exe';
  const pathOps = path.win32;

  const ext = pathOps.extname(command).toLowerCase();

  // 1. Direct check: command already has a .cmd or .bat extension
  if (WINDOWS_SHIM_EXTENSIONS.includes(ext)) {
    return {
      command: comSpec,
      args: ['/d', '/s', '/c', command, ...args],
    };
  }

  // 2. Direct check: command already has .exe extension
  if (ext === '.exe') {
    return {
      command,
      args: [...args],
    };
  }

  // 3. If command is an absolute path without extension, check for candidate extensions
  if (pathOps.isAbsolute(command)) {
    for (const testExt of WINDOWS_SEARCH_EXTENSIONS) {
      const candidate = `${command}${testExt}`;
      try {
        if (fsExists(candidate)) {
          if (WINDOWS_SHIM_EXTENSIONS.includes(testExt.toLowerCase())) {
            return {
              command: comSpec,
              args: ['/d', '/s', '/c', candidate, ...args],
            };
          }
          return { command: candidate, args: [...args] };
        }
      } catch {
        // Ignore fs check failure
      }
    }
    return { command, args: [...args] };
  }

  // 4. Bare command lookup on Windows PATH and standard directories
  const pathEnv = env.PATH || env.Path || '';
  const dirs = pathEnv
    .split(';')
    .filter((d) => Boolean(d) && pathOps.isAbsolute(d));

  const localAppData = env.LOCALAPPDATA || '';
  const programFiles = env.ProgramFiles || 'C:\\Program Files';
  const programFilesX86 = env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const userProfile = env.USERPROFILE || '';

  const winCommonPaths = [
    userProfile ? pathOps.join(userProfile, 'AppData', 'Roaming', 'npm') : null,
    localAppData ? pathOps.join(localAppData, 'Programs', '@opencode-aidesktop') : null,
    localAppData ? pathOps.join(localAppData, 'Programs', 'OpenCode') : null,
    pathOps.join(programFiles, 'OpenCode'),
    pathOps.join(programFilesX86, 'OpenCode'),
    'D:\\Program Files\\OpenCode',
    'D:\\Program Files (x86)\\OpenCode',
  ].filter((p): p is string => Boolean(p));

  for (const p of winCommonPaths) {
    if (!dirs.includes(p)) {
      try {
        if (fsExists(p)) {
          dirs.push(p);
        }
      } catch {
        // Ignore unreadable paths
      }
    }
  }

  const candidateCommands = command === 'opencode' ? ['opencode', 'opencode-cli'] : [command];

  for (const cmdName of candidateCommands) {
    for (const dir of dirs) {
      for (const testExt of WINDOWS_SEARCH_EXTENSIONS) {
        const candidate = pathOps.join(dir, `${cmdName}${testExt}`);
        try {
          if (fsExists(candidate)) {
            const foundExt = pathOps.extname(candidate).toLowerCase();
            if (WINDOWS_SHIM_EXTENSIONS.includes(foundExt)) {
              return {
                command: comSpec,
                args: ['/d', '/s', '/c', candidate, ...args],
              };
            }
            return { command: candidate, args: [...args] };
          }
        } catch {
          // Ignore unreadable paths
        }
      }
    }
  }

  // 5. Fallback: return command as-is
  return { command, args: [...args] };
}
