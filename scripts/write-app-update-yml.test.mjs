/**
 * Tests for the packaged-feed writer (`scripts/write-app-update-yml.mjs`) —
 * Spec 14 / ADR-0008 feed repoint. The generated `app-update.yml` is the
 * single source of truth baked into every packaged build, so its values ARE
 * the updater's destination: these tests pin them to the ZEUS repository and
 * prove the inherited Limboo feed cannot silently return.
 *
 * Hermetic: no network, no clock, no git invocation.
 */
import { mkdtempSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { resourcesDirFor, writeAppUpdateYml } from './write-app-update-yml.mjs';

describe('writeAppUpdateYml (packaged feed file)', () => {
  const dirs = [];

  afterEach(() => {
    while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
  });

  function tempAppDir() {
    const dir = mkdtempSync(join(tmpdir(), 'zeus-feed-'));
    // The writer assumes the packaged resources dir exists (Forge creates it in
    // the real flow); recreate that assumption hermetically.
    mkdirSync(join(dir, 'resources'), { recursive: true });
    dirs.push(dir);
    return dir;
  }

  function readFeed(appDir) {
    return readFileSync(join(appDir, 'resources', 'app-update.yml'), 'utf8');
  }

  it('points the feed at the ZEUS repository (mohmaedeslam00116/ZEUS)', () => {
    const appDir = tempAppDir();
    writeAppUpdateYml(appDir, 'win32');
    const yml = readFeed(appDir);
    expect(yml).toContain('owner: mohmaedeslam00116');
    expect(yml).toContain('repo: ZEUS');
    expect(yml).toContain('provider: github');
  });

  it('uses the ZEUS updater cache dir name', () => {
    const appDir = tempAppDir();
    writeAppUpdateYml(appDir, 'win32');
    expect(readFeed(appDir)).toContain('updaterCacheDirName: zeus-updater');
  });

  it('carries no inherited Limboo feed values', () => {
    const appDir = tempAppDir();
    writeAppUpdateYml(appDir, 'win32');
    expect(readFeed(appDir)).not.toMatch(/limboo/i);
  });

  it('writes the feed inside resources/ on win32 and linux', () => {
    const winDir = tempAppDir();
    expect(resourcesDirFor(winDir, 'win32')).toBe(join(winDir, 'resources'));
    const linuxDir = tempAppDir();
    expect(resourcesDirFor(linuxDir, 'linux')).toBe(join(linuxDir, 'resources'));
  });

  it('writes the feed inside the .app bundle Resources on darwin', () => {
    const macDir = tempAppDir();
    mkdirSync(join(macDir, 'Zeus.app', 'Contents', 'Resources'), { recursive: true });
    expect(resourcesDirFor(macDir, 'darwin')).toBe(
      join(macDir, 'Zeus.app', 'Contents', 'Resources'),
    );
    writeAppUpdateYml(macDir, 'darwin');
    expect(
      readFileSync(join(macDir, 'Zeus.app', 'Contents', 'Resources', 'app-update.yml'), 'utf8'),
    ).toContain('repo: ZEUS');
  });
});
