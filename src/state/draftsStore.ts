import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { CanvasSizeId, Mode } from '@/core/types';

export type DraftMeta = {
  id: string;
  mode: Mode;
  canvasId: CanvasSizeId;
  canvasWidth?: number;
  canvasHeight?: number;
  /** Aspect of the whole drawing (width / height), for list thumbnails. */
  aspect: number;
  slides: number;
  photoCount: number;
  updatedAt: number;
  /** Thumbnail file name in the drafts folder, with a version to bust image caches. */
  thumb: string | null;
  thumbVersion: number;
};

type DraftsState = {
  drafts: DraftMeta[];
  upsert: (meta: DraftMeta) => void;
  remove: (id: string) => void;
};

/** Index of saved collages; the documents themselves are JSON files (see services/drafts). */
export const useDrafts = create<DraftsState>()(
  persist(
    (set, get) => ({
      drafts: [],
      upsert: (meta) =>
        set({ drafts: [meta, ...get().drafts.filter((d) => d.id !== meta.id)].sort((a, b) => b.updatedAt - a.updatedAt) }),
      remove: (id) => set({ drafts: get().drafts.filter((d) => d.id !== id) }),
    }),
    { name: 'postie.drafts.v1', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
