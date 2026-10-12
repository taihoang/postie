import { create } from 'zustand';

import type { CollageDoc } from '@/core/types';

/** P-11: undo / redo for the last 20 edits. */
export const HISTORY_LIMIT = 20;

type Updater = (doc: CollageDoc) => CollageDoc;

type EditorState = {
  doc: CollageDoc | null;
  past: CollageDoc[];
  future: CollageDoc[];
  /** Base saved by `checkpoint()`; pushed to history on the first live change. */
  pendingBase: CollageDoc | null;
  selectedFrameId: string | null;

  load: (doc: CollageDoc) => void;
  close: () => void;
  /** One undoable edit. */
  commit: (fn: Updater) => void;
  /** Mark the start of a continuous edit (slider drag, import batch). */
  checkpoint: () => void;
  /** Update without a new history entry; the checkpoint covers it. */
  live: (fn: Updater) => void;
  /** End a continuous edit; an unused checkpoint is discarded. */
  endCheckpoint: () => void;
  /** Record a finished export without touching history or a pending checkpoint. */
  markExported: () => void;
  undo: () => void;
  redo: () => void;
  select: (frameId: string | null) => void;
};

function pushPast(past: CollageDoc[], doc: CollageDoc): CollageDoc[] {
  const next = [...past, doc];
  return next.length > HISTORY_LIMIT ? next.slice(next.length - HISTORY_LIMIT) : next;
}

function keepSelection(doc: CollageDoc, id: string | null): string | null {
  return id && doc.frames.some((f) => f.id === id) ? id : null;
}

export const useEditor = create<EditorState>()((set, get) => ({
  doc: null,
  past: [],
  future: [],
  pendingBase: null,
  selectedFrameId: null,

  load: (doc) => set({ doc, past: [], future: [], pendingBase: null, selectedFrameId: null }),
  close: () => set({ doc: null, past: [], future: [], pendingBase: null, selectedFrameId: null }),

  commit: (fn) => {
    const { doc, past } = get();
    if (!doc) return;
    const next = fn(doc);
    if (next === doc) return;
    set({
      doc: next,
      past: pushPast(past, doc),
      future: [],
      pendingBase: null,
      selectedFrameId: keepSelection(next, get().selectedFrameId),
    });
  },

  checkpoint: () => set({ pendingBase: get().doc }),

  live: (fn) => {
    const { doc, pendingBase, past, future } = get();
    if (!doc) return;
    const next = fn(doc);
    if (next === doc) return;
    if (pendingBase) {
      set({ doc: next, past: pushPast(past, pendingBase), future: [], pendingBase: null });
    } else {
      set({ doc: next, future });
    }
  },

  endCheckpoint: () => set({ pendingBase: null }),

  markExported: () => {
    const { doc } = get();
    // +1 ms keeps exportedAt strictly after updatedAt.
    if (doc) set({ doc: { ...doc, exportedAt: Math.max(Date.now(), doc.updatedAt + 1) } });
  },

  undo: () => {
    const { doc, past, future, selectedFrameId } = get();
    if (!doc || !past.length) return;
    const prev = past[past.length - 1];
    set({
      doc: prev,
      past: past.slice(0, -1),
      future: [doc, ...future],
      pendingBase: null,
      selectedFrameId: keepSelection(prev, selectedFrameId),
    });
  },

  redo: () => {
    const { doc, past, future, selectedFrameId } = get();
    if (!doc || !future.length) return;
    const next = future[0];
    set({
      doc: next,
      past: pushPast(past, doc),
      future: future.slice(1),
      pendingBase: null,
      selectedFrameId: keepSelection(next, selectedFrameId),
    });
  },

  select: (selectedFrameId) => set({ selectedFrameId }),
}));
