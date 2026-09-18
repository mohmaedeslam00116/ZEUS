/**
 * GitHub CLI store — the renderer-side mirror of the main-process GhManager.
 *
 * Everything here is OPTIONAL by design: when `gh` is missing or logged out the
 * store settles into that state and the GitHub sub-tab renders guidance. No
 * other surface waits on it, and nothing here can fail the Git panel.
 *
 * Degrades to empty, read-only state in a plain browser preview (no preload).
 */
import { create } from 'zustand';
import type { GhIssue, GhPullRequest, GhState } from '@shared/types';
import { useWorkspaceStore } from './useWorkspaceStore';

export type GhListState = 'open' | 'closed' | 'merged' | 'all';

interface GhStoreState {
  state: GhState | null;
  pullRequests: GhPullRequest[];
  issues: GhIssue[];
  loading: boolean;
  hydrated: boolean;
  /**
   * Contributor avatars as `data:` URIs, keyed by the commit email or gh login
   * that produced them. A missing key means "render initials" — which is also
   * what an off setting, a non-GitHub address, or no network all produce, and
   * the renderer deliberately cannot tell those apart.
   */
  avatars: Record<string, string>;
  /**
   * Whether the user dismissed the "install the GitHub CLI" banner. Session-
   * local on purpose: persisting it would mean a settings key for a feature
   * that is meant to need no configuration at all.
   */
  bannerDismissed: boolean;

  hydrate: () => void;
  /** Re-classify the CLI; `force` bypasses the main-side TTL cache. */
  refresh: (force?: boolean) => Promise<void>;
  loadPullRequests: (opts?: { state?: GhListState; limit?: number }) => Promise<void>;
  loadIssues: (opts?: { state?: 'open' | 'closed' | 'all'; limit?: number }) => Promise<void>;
  /**
   * Resolve a batch of avatars and merge them into the map. ONE call per list
   * render, never one per row — 100 invokes would make the history list janky
   * for decoration.
   */
  loadAvatars: (input: { emails?: string[]; logins?: string[] }) => Promise<void>;
  dismissBanner: () => void;
}

function api() {
  return window.zeus?.gh;
}

function activeWs(): string | null {
  return useWorkspaceStore.getState().activeId;
}

/** Stale-async guards: in-flight gh calls must not commit across a workspace
 * switch or a newer superseding call (audit: stale-async clobber). */
let refreshGen = 0;
let listGen = 0;

export const useGhStore = create<GhStoreState>((set, get) => ({
  state: null,
  pullRequests: [],
  issues: [],
  loading: false,
  hydrated: false,
  avatars: {},
  bannerDismissed: false,

  hydrate: () => {
    if (get().hydrated) return;
    set({ hydrated: true });
    const gh = api();
    if (!gh) return;

    gh.onChanged(() => void get().refresh());
    window.zeus?.workspace.onChanged(() => {
      // A different repo means different PRs, issues, and possibly a different
      // remote — drop everything rather than show the previous workspace's.
      set({ pullRequests: [], issues: [] });
      void get().refresh();
    });
    void get().refresh();
  },

  refresh: async (force = false) => {
    const gen = ++refreshGen;
    const gh = api();
    if (!gh) return;
    // Best-effort throughout: `gh` is optional, so a failure is a state, not an
    // error the user needs a toast about.
    try {
      const state = await gh.state(activeWs(), force ? { force: true } : undefined);
      if (gen !== refreshGen) return; // superseded — never commit stale state
      set({ state });
    } catch {
      /* keep the previous classification */
    }
  },

  loadPullRequests: async (opts) => {
    const gen = ++listGen;
    const gh = api();
    const ws = activeWs();
    if (!gh || !ws) return;
    set({ loading: true });
    try {
      const pullRequests = await gh.pullRequests(ws, opts);
      if (gen !== listGen || activeWs() !== ws) return; // stale list
      set({ pullRequests });
    } catch {
      if (gen !== listGen) return;
      set({ pullRequests: [] });
    } finally {
      if (gen === listGen) set({ loading: false });
    }
  },

  loadIssues: async (opts) => {
    const gen = ++listGen;
    const gh = api();
    const ws = activeWs();
    if (!gh || !ws) return;
    set({ loading: true });
    try {
      const issues = await gh.issues(ws, opts);
      if (gen !== listGen || activeWs() !== ws) return; // stale list
      set({ issues });
    } catch {
      if (gen !== listGen) return;
      set({ issues: [] });
    } finally {
      if (gen === listGen) set({ loading: false });
    }
  },

  loadAvatars: async ({ emails = [], logins = [] }) => {
    const gh = api();
    if (!gh?.avatars) return;
    // Only ask for what is not already resolved — the main-side cache would
    // answer instantly anyway, but this keeps the payload small too.
    const known = get().avatars;
    const wantEmails = emails.filter((e) => e && !(e in known));
    const wantLogins = logins.filter((l) => l && !(l in known));
    if (wantEmails.length === 0 && wantLogins.length === 0) return;
    try {
      const resolved = await gh.avatars({ emails: wantEmails, logins: wantLogins }, activeWs());
      if (Object.keys(resolved).length === 0) return;
      set((s) => ({ avatars: { ...s.avatars, ...resolved } }));
    } catch {
      /* avatars are decoration — a failure must never surface anywhere */
    }
  },

  dismissBanner: () => set({ bannerDismissed: true }),
}));
