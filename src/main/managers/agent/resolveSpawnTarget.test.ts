import { describe, expect, it } from 'vitest';
import { resolveSpawnTarget } from './resolveSpawnTarget';

describe('resolveSpawnTarget', () => {
  describe('POSIX platform (linux / darwin)', () => {
    it('passes through bare commands and arguments unchanged on linux', () => {
      const result = resolveSpawnTarget('cline', ['--acp'], { platform: 'linux' });
      expect(result).toEqual({
        command: 'cline',
        args: ['--acp'],
      });
    });

    it('passes through absolute paths on darwin unchanged', () => {
      const result = resolveSpawnTarget('/usr/local/bin/opencode', ['acp', '--print-logs'], {
        platform: 'darwin',
      });
      expect(result).toEqual({
        command: '/usr/local/bin/opencode',
        args: ['acp', '--print-logs'],
      });
    });
  });

  describe('Windows platform (win32)', () => {
    it('bridges direct .cmd scripts via ComSpec /d /s /c', () => {
      const result = resolveSpawnTarget(
        'C:\\Users\\Dell\\AppData\\Roaming\\npm\\cline.cmd',
        ['--acp'],
        {
          platform: 'win32',
          env: { ComSpec: 'C:\\Windows\\system32\\cmd.exe' },
        },
      );
      expect(result).toEqual({
        command: 'C:\\Windows\\system32\\cmd.exe',
        args: ['/d', '/s', '/c', 'C:\\Users\\Dell\\AppData\\Roaming\\npm\\cline.cmd', '--acp'],
      });
    });

    it('bridges direct .bat scripts via ComSpec /d /s /c', () => {
      const result = resolveSpawnTarget('D:\\tools\\agent.bat', ['start', '--port', '8080'], {
        platform: 'win32',
        env: { COMSPEC: 'C:\\Windows\\cmd.exe' },
      });
      expect(result).toEqual({
        command: 'C:\\Windows\\cmd.exe',
        args: ['/d', '/s', '/c', 'D:\\tools\\agent.bat', 'start', '--port', '8080'],
      });
    });

    it('passes through direct .exe binaries without bridging', () => {
      const result = resolveSpawnTarget('C:\\Program Files\\OpenCode\\opencode.exe', ['acp'], {
        platform: 'win32',
      });
      expect(result).toEqual({
        command: 'C:\\Program Files\\OpenCode\\opencode.exe',
        args: ['acp'],
      });
    });

    it('resolves bare commands on PATH that map to .cmd shims', () => {
      const fakeFiles = new Set([
        'C:\\Users\\Dell\\AppData\\Roaming\\npm\\cline.cmd',
      ]);

      const result = resolveSpawnTarget('cline', ['--acp'], {
        platform: 'win32',
        env: {
          PATH: 'C:\\Windows\\system32;C:\\Users\\Dell\\AppData\\Roaming\\npm',
          ComSpec: 'cmd.exe',
        },
        fsExists: (p) => fakeFiles.has(p),
      });

      expect(result).toEqual({
        command: 'cmd.exe',
        args: ['/d', '/s', '/c', 'C:\\Users\\Dell\\AppData\\Roaming\\npm\\cline.cmd', '--acp'],
      });
    });

    it('resolves bare commands on PATH that map to native .exe binaries', () => {
      const fakeFiles = new Set([
        'C:\\Program Files\\Git\\cmd\\git.exe',
      ]);

      const result = resolveSpawnTarget('git', ['status'], {
        platform: 'win32',
        env: {
          PATH: 'C:\\Windows;C:\\Program Files\\Git\\cmd',
        },
        fsExists: (p) => fakeFiles.has(p),
      });

      expect(result).toEqual({
        command: 'C:\\Program Files\\Git\\cmd\\git.exe',
        args: ['status'],
      });
    });

    it('resolves absolute paths without extension that match .cmd on disk', () => {
      const fakeFiles = new Set([
        'C:\\nvm4w\\nodejs\\opencode.cmd',
      ]);

      const result = resolveSpawnTarget('C:\\nvm4w\\nodejs\\opencode', ['acp'], {
        platform: 'win32',
        env: { ComSpec: 'cmd.exe' },
        fsExists: (p) => fakeFiles.has(p),
      });

      expect(result).toEqual({
        command: 'cmd.exe',
        args: ['/d', '/s', '/c', 'C:\\nvm4w\\nodejs\\opencode.cmd', 'acp'],
      });
    });

    it('falls back to returning original command if not found on PATH', () => {
      const result = resolveSpawnTarget('nonexistent-agent', ['--help'], {
        platform: 'win32',
        env: { PATH: 'C:\\Windows\\system32' },
        fsExists: () => false,
      });

      expect(result).toEqual({
        command: 'nonexistent-agent',
        args: ['--help'],
      });
    });
  });
});
