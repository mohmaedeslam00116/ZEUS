import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'node:path';
import os from 'node:os';
import { assertInsideWorkspace, isCrownJewel } from './pathGuard';

vi.mock('../../../sandbox/policy', () => ({
  crownJewelPaths: () => [
    path.resolve(os.tmpdir(), 'userData/secrets'),
    path.resolve(os.tmpdir(), 'userData/zeus.db'),
    path.resolve(os.tmpdir(), 'userData/settings.json'),
    path.resolve(os.tmpdir(), 'userData/window-state.json'),
  ],
}));

describe('pathGuard (Layer 1 Security)', () => {
  const workspaceRoot = path.resolve(os.tmpdir(), 'test-workspace');

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows safe relative paths inside workspace', () => {
    const res = assertInsideWorkspace(workspaceRoot, 'src/index.ts');
    expect(res).toBe(path.resolve(workspaceRoot, 'src/index.ts'));
  });

  it('allows safe subfolder paths', () => {
    const res = assertInsideWorkspace(workspaceRoot, 'nested/deep/file.txt');
    expect(res).toBe(path.resolve(workspaceRoot, 'nested/deep/file.txt'));
  });

  it('rejects empty or whitespace-only paths', () => {
    expect(() => assertInsideWorkspace(workspaceRoot, '')).toThrow('Path cannot be empty');
    expect(() => assertInsideWorkspace(workspaceRoot, '   ')).toThrow('Path cannot be empty');
  });

  it('rejects paths with null bytes', () => {
    expect(() => assertInsideWorkspace(workspaceRoot, 'file.txt\0evil')).toThrow(
      'Path contains invalid null byte',
    );
  });

  it('rejects paths exceeding 4096 characters', () => {
    const longPath = 'a'.repeat(4097);
    expect(() => assertInsideWorkspace(workspaceRoot, longPath)).toThrow(
      'Path exceeds maximum length of 4096 characters',
    );
  });

  it('rejects parent directory traversal escaping root (../)', () => {
    expect(() => assertInsideWorkspace(workspaceRoot, '../outside.txt')).toThrow(
      'Access denied: path escapes workspace boundaries',
    );
    expect(() => assertInsideWorkspace(workspaceRoot, 'src/../../outside.txt')).toThrow(
      'Access denied: path escapes workspace boundaries',
    );
  });

  it('rejects absolute paths outside workspace', () => {
    const outside = path.resolve(os.tmpdir(), 'completely-different-dir/file.txt');
    expect(() => assertInsideWorkspace(workspaceRoot, outside)).toThrow(
      'Access denied: path escapes workspace boundaries',
    );
  });

  it('rejects paths targeting crown jewels (SEC-14)', () => {
    const secretPath = path.resolve(os.tmpdir(), 'userData/secrets/key.bin');
    expect(isCrownJewel(secretPath)).toBe(true);

    const dbPath = path.resolve(os.tmpdir(), 'userData/zeus.db');
    expect(isCrownJewel(dbPath)).toBe(true);

    const fakeWs = path.resolve(os.tmpdir(), 'userData');
    expect(() => assertInsideWorkspace(fakeWs, 'secrets/token.json')).toThrow(
      'Access denied: path targets protected system crown jewels',
    );
  });
});
