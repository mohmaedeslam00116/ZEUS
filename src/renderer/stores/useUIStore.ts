/**
 * UI store — transient interface state that isn't persisted: command palette
 * visibility, the active modal (e.g. Settings), and toast notifications.
 */
import { create } from 'zustand';

/** Monotonic toast identity: `Date.now()` collides for toasts created in the
 * same millisecond, and React then reuses the keyed card — the auto-dismiss
 * timer of the first toast kills its twin early (audit: toast-ID collision).
 */
let toastSeq = 0;

export type ModalId = 'settings' | null;

export interface Toast {
  id: string;
  title: string;
  description?: string;
  tone: 'info' | 'success' | 'warning' | 'danger';
}

interface UIState {
  paletteOpen: boolean;
  searchOpen: boolean;
  activeModal: ModalId;
  toasts: Toast[];

  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;

  openSearch: () => void;
  closeSearch: () => void;
  toggleSearch: () => void;

  openModal: (id: Exclude<ModalId, null>) => void;
  closeModal: () => void;

  addToast: (toast: Omit<Toast, 'id'>) => void;
  dismissToast: (id: string) => void;
}

export const useUIStore = create<UIState>((set) => ({
  paletteOpen: false,
  searchOpen: false,
  activeModal: null,
  toasts: [],

  // The command palette and Global Search are mutually exclusive overlays.
  openPalette: () => set({ paletteOpen: true, searchOpen: false }),
  closePalette: () => set({ paletteOpen: false }),
  togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen, searchOpen: false })),

  openSearch: () => set({ searchOpen: true, paletteOpen: false }),
  closeSearch: () => set({ searchOpen: false }),
  toggleSearch: () => set((s) => ({ searchOpen: !s.searchOpen, paletteOpen: false })),

  openModal: (id) => set({ activeModal: id }),
  closeModal: () => set({ activeModal: null }),

  addToast: (toast) =>
    set((s) => ({
      toasts: [...s.toasts, { ...toast, id: `t_${Date.now()}_${++toastSeq}` }],
    })),
  dismissToast: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
