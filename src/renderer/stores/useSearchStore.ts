/**
 * Search store — the renderer-side mirror of the main-process SearchManager.
 * Holds the current query, grouped results (files/symbols/memories/git/…), recent
 * + saved searches, and the active filter. Subscribes to `search:changed` and the
 * index-progress stream, and follows active-workspace switches so results stay
 * live as the developer and agent work.
 *
 * Degrades to empty, read-only state in a plain browser preview (no preload).
 */
import { create } from 'zustand';
import type {
  SavedSearch,
  SearchFilter,
  SearchGroup,
  SearchHistoryEntry,
  SearchIndexProgress,
  SearchKind,
} from '@shared/types';
import { useWorkspaceStore } from './useWorkspaceStore';
import { useUIStore } from './useUIStore';

interface SearchState {
  query: string;
  kindFilter: SearchKind | null;
  groups: SearchGroup[];
  history: SearchHistoryEntry[];
  saved: SavedSearch[];
  progress: SearchIndexProgress | null;
  loading: boolean;
  hydrated: boolean;

  hydrate: () => void;
  refresh: () => Promise<void>;
  setQuery: (q: string) => void;
  setKindFilter: (kind: SearchKind | null) => void;
  run: (q: string) => Promise<void>;
  save: (name: string) => Promise<void>;
  removeSaved: (id: string) => Promise<void>;
  clearHistory: () => Promise<void>;
}

function api() {
  return window.zeus?.search;
}

function activeWs(): string | null {
  return useWorkspaceStore.getState().activeId;
}

/**
 * Monotonic generations for the two async paths that can outlive the state
 * they were started against: a workspace switch (or a newer query) during an
 * in-flight `refresh()`/`run()` must keep the stale response from committing
 * — otherwise the panel renders ANOTHER workspace's history/files under the
 * current one (audit: stale-async clobber).
 */
let refreshGen = 0;
let searchGen = 0;

export const useSearchStore = create<SearchState>((set, get) => ({
  query: '',
  kindFilter: null,
  groups: [],
  history: [],
  saved: [],
  progress: null,
  loading: false,
  hydrated: false,

  hydrate: () => {
    if (get().hydrated) return;
    set({ hydrated: true });
    const s = api();
    if (!s) return;

    s.onChanged(() => void get().refresh());
    s.onIndexProgress((progress) => {
      set({ progress: progress.phase === 'done' ? null : progress });
      if (progress.phase === 'done' && get().query.trim()) void get().run(get().query);
    });
    void get().refresh();
    window.zeus?.workspace.onChanged(() => {
      set({ query: '', groups: [], kindFilter: null });
      void get().refresh();
    });
  },

  refresh: async () => {
    const gen = ++refreshGen;
    const s = api();
    if (!s) return;
    const wsId = activeWs();
    const [history, saved] = await Promise.all([s.historyList(wsId), s.savedList(wsId)]);
    if (gen !== refreshGen) return; // superseded by a newer refresh/run
    set({ history, saved });
    if (get().query.trim()) await get().run(get().query);
  },

  setQuery: (q) => set({ query: q }),
  setKindFilter: (kind) => set({ kindFilter: kind }),

  run: async (q) => {
    const gen = ++searchGen;
    const s = api();
    if (!s) return;
    const query = q.trim();
    if (!query) {
      set({ groups: [] });
      return;
    }
    const kind = get().kindFilter;
    const filter: SearchFilter = kind ? { kinds: [kind] } : {};
    const wsAtStart = activeWs();
    set({ loading: true });
    try {
      const groups = await s.global(query, { workspaceId: wsAtStart, ...filter });
      // Stale-result guard: the workspace switched (or a newer run started)
      // while this search was in flight — committing its groups would show
      // the wrong workspace's files under the current one.
      if (gen !== searchGen || activeWs() !== wsAtStart) return;
      set({ groups });
    } finally {
      // Only the run that owns the current generation may clear the flag.
      if (gen === searchGen) set({ loading: false });
    }
  },

  save: async (name) => {
    const s = api();
    if (!s) return;
    const toast = useUIStore.getState().addToast;
    const kind = get().kindFilter;
    try {
      await s.savedCreate({
        workspaceId: activeWs(),
        name,
        query: get().query,
        filter: kind ? { kinds: [kind] } : {},
      });
      toast({ title: 'Search saved', tone: 'success' });
      await get().refresh();
    } catch (err) {
      toast({
        title: 'Could not save search',
        description: err instanceof Error ? err.message : String(err),
        tone: 'danger',
      });
    }
  },

  removeSaved: async (id) => {
    await api()?.savedDelete(id);
    await get().refresh();
  },

  clearHistory: async () => {
    await api()?.historyClear(activeWs());
    await get().refresh();
  },
}));
