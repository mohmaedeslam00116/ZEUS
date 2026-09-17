/**
 * Tests for `main/managers/SessionManager.ts` — the session persistence layer,
 * focused on the #14 product decision: plain workspace sessions are the
 * DEFAULT, and `worktree_path = null` is a legitimate persisted state.
 *
 * Unlike the other pure-module suites, this one exercises the REAL SQLite
 * layer: `better-sqlite3` loads under plain Node, and the only
 * Electron-dependent piece — `app.getPath('userData')` in `db/database.ts` —
 * is mocked hermetically to a per-worker temp directory. The electron mock
 * MUST be registered before the storage modules are imported.
 *
 * Coverage map (ticket #14):
 *   1. a new session is plain by default (worktree_path = null in the API
 *      object AND as a real SQL NULL in the row)
 *   2. an explicitly attached worktree persists its path/branch/status
 *   3. clearing the worktree returns the session to the plain (null) state
 *   4. plain and worktree-backed sessions coexist in one listing
 */
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

/** Hermetic Electron: the db singleton resolves zeus.db under a temp dir. */
const TMP_USER_DATA = mkdtempSync(join(tmpdir(), 'zeus-session-sm-'));
vi.mock('electron', (): Record<string, unknown> => ({
  app: { getPath: (): string => TMP_USER_DATA },
  // WorkspaceManager/SessionManager broadcast to renderer windows; the
  // hermetic harness has none, so the broadcast set is simply empty.
  BrowserWindow: { getAllWindows: (): unknown[] => [] },
}));

import { closeDb, getDb } from '../db/database';
import { SessionManager } from './SessionManager';
import { WorkspaceManager } from './WorkspaceManager';
import type { Session } from '@shared/types';

let workspaces: WorkspaceManager;
let sessions: SessionManager;
let workspaceId: string;

beforeAll(() => {
  workspaces = new WorkspaceManager();
  sessions = new SessionManager();
  // Workspaces must exist on disk: registration validates the directory.
  const dir = join(TMP_USER_DATA, 'demo-workspace');
  mkdirSync(dir, { recursive: true });
  workspaceId = workspaces.create(dir).id;
});

afterAll(() => {
  closeDb();
});

describe('SessionManager — plain workspace sessions are the default (#14)', () => {
  it('creates a plain session: worktreePath = null, branch = null, status none', () => {
    const s = sessions.create(workspaceId);
    expect(s.worktreePath).toBeNull();
    expect(s.worktreeBranch).toBeNull();
    expect(s.worktreeStatus).toBe('none');
  });

  it('persists the plain state as a real SQL NULL (not an empty string)', () => {
    const s = sessions.create(workspaceId);
    const row = getDb()
      .prepare('SELECT worktree_path, worktree_branch FROM sessions WHERE id = ?')
      .get(s.id) as { worktree_path: string | null; worktree_branch: string | null };
    expect(row.worktree_path).toBeNull();
    expect(row.worktree_branch).toBeNull();
  });

  it('round-trips a plain session through the row mapping untouched', () => {
    const created = sessions.create(workspaceId);
    const loaded = sessions.get(created.id) as Session;
    expect(loaded).not.toBeNull();
    expect(loaded.worktreePath).toBeNull();
    expect(loaded.worktreeBranch).toBeNull();
    expect(loaded.worktreeStatus).toBe('none');
  });
});

describe('SessionManager — explicit worktree opt-in still works (#14 preservation)', () => {
  it('persists an attached worktree path/branch/status', () => {
    const s = sessions.create(workspaceId);
    const wtPath = join(TMP_USER_DATA, 'wt-under-test');
    sessions.setWorktree(s.id, {
      worktreePath: wtPath,
      worktreeBranch: 'zeus/wt-under-test',
      worktreeStatus: 'ready',
      baseRef: 'main',
    });
    const loaded = sessions.get(s.id) as Session;
    expect(loaded.worktreePath).toBe(wtPath);
    expect(loaded.worktreeBranch).toBe('zeus/wt-under-test');
    expect(loaded.worktreeStatus).toBe('ready');
    expect(loaded.baseRef).toBe('main');
  });

  it('clearing the worktree returns the session to the plain null state', () => {
    const s = sessions.create(workspaceId);
    sessions.setWorktree(s.id, {
      worktreePath: join(TMP_USER_DATA, 'wt-to-clear'),
      worktreeBranch: 'zeus/wt-to-clear',
      worktreeStatus: 'ready',
    });
    expect(sessions.get(s.id)?.worktreePath).not.toBeNull();

    sessions.setWorktree(s.id, {
      worktreePath: null,
      worktreeBranch: null,
      worktreeStatus: 'none',
      baseRef: null,
    });
    const loaded = sessions.get(s.id) as Session;
    expect(loaded.worktreePath).toBeNull();
    expect(loaded.worktreeBranch).toBeNull();
    expect(loaded.worktreeStatus).toBe('none');
  });

  it('plain and worktree-backed sessions coexist in one workspace listing', () => {
    const plain = sessions.create(workspaceId);
    const backed = sessions.create(workspaceId);
    sessions.setWorktree(backed.id, {
      worktreePath: join(TMP_USER_DATA, 'wt-coexist'),
      worktreeBranch: 'zeus/wt-coexist',
      worktreeStatus: 'ready',
    });
    const listed = sessions.list(workspaceId);
    const plainRow = listed.find((s) => s.id === plain.id);
    const backedRow = listed.find((s) => s.id === backed.id);
    expect(plainRow?.worktreePath).toBeNull();
    expect(backedRow?.worktreePath).toBe(join(TMP_USER_DATA, 'wt-coexist'));
  });
});
