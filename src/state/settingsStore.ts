import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { DEFAULT_CANVAS } from '@/core/canvas';
import { uid } from '@/core/id';
import type { CanvasSpec, ExportFormat, ExportQuality, Mode, SavedStyle, Style, Template } from '@/core/types';

const MAX_RECENT = 6;

type SettingsState = {
  /** C-4: last canvas used, per mode. */
  collageCanvas: CanvasSpec;
  seamlessCanvas: CanvasSpec;
  startMode: Mode;
  recentTemplateIds: string[];
  customTemplates: Template[];
  savedStyles: SavedStyle[];
  exportQuality: ExportQuality;
  exportFormat: ExportFormat;
  showSeams: boolean;
  showSafeZone: boolean;
  /** Local count of finished exports; used only for ad frequency, never sent anywhere. */
  exportCount: number;
  /** A-8: draft to reopen on launch, cleared when the user leaves the editor. */
  resumeDraftId: string | null;

  setCanvas: (mode: Mode, canvas: CanvasSpec) => void;
  setStartMode: (mode: Mode) => void;
  markTemplateUsed: (id: string) => void;
  saveTemplate: (t: Template) => void;
  renameTemplate: (id: string, name: string) => void;
  duplicateTemplate: (id: string) => void;
  deleteTemplate: (id: string) => void;
  saveStyle: (name: string, style: Style) => void;
  deleteStyle: (id: string) => void;
  setExportPrefs: (p: { quality?: ExportQuality; format?: ExportFormat }) => void;
  toggleSeams: () => void;
  toggleSafeZone: () => void;
  incrementExports: () => number;
  setResumeDraft: (id: string | null) => void;
};

export const useSettings = create<SettingsState>()(
  persist(
    (set, get) => ({
      collageCanvas: DEFAULT_CANVAS,
      seamlessCanvas: { id: '4:5', width: 1080, height: 1350 },
      startMode: 'collage',
      recentTemplateIds: [],
      customTemplates: [],
      savedStyles: [],
      exportQuality: 'instagram',
      exportFormat: 'jpeg',
      showSeams: true,
      showSafeZone: true,
      exportCount: 0,
      resumeDraftId: null,

      setCanvas: (mode, canvas) => set(mode === 'collage' ? { collageCanvas: canvas } : { seamlessCanvas: canvas }),
      setStartMode: (startMode) => set({ startMode }),
      markTemplateUsed: (id) =>
        set({ recentTemplateIds: [id, ...get().recentTemplateIds.filter((x) => x !== id)].slice(0, MAX_RECENT) }),
      saveTemplate: (t) => set({ customTemplates: [t, ...get().customTemplates.filter((x) => x.id !== t.id)] }),
      renameTemplate: (id, name) =>
        set({ customTemplates: get().customTemplates.map((t) => (t.id === id ? { ...t, name } : t)) }),
      duplicateTemplate: (id) => {
        const src = get().customTemplates.find((t) => t.id === id);
        if (!src) return;
        const copy: Template = { ...src, id: uid('t'), name: `${src.name} copy`, createdAt: Date.now() };
        set({ customTemplates: [copy, ...get().customTemplates] });
      },
      deleteTemplate: (id) =>
        set({
          customTemplates: get().customTemplates.filter((t) => t.id !== id),
          recentTemplateIds: get().recentTemplateIds.filter((x) => x !== id),
        }),
      saveStyle: (name, style) =>
        set({ savedStyles: [{ id: uid('st'), name, style, createdAt: Date.now() }, ...get().savedStyles] }),
      deleteStyle: (id) => set({ savedStyles: get().savedStyles.filter((s) => s.id !== id) }),
      setExportPrefs: ({ quality, format }) =>
        set({ exportQuality: quality ?? get().exportQuality, exportFormat: format ?? get().exportFormat }),
      toggleSeams: () => set({ showSeams: !get().showSeams }),
      toggleSafeZone: () => set({ showSafeZone: !get().showSafeZone }),
      incrementExports: () => {
        const exportCount = get().exportCount + 1;
        set({ exportCount });
        return exportCount;
      },
      setResumeDraft: (resumeDraftId) => set({ resumeDraftId }),
    }),
    {
      name: 'postie.settings.v1',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (s) => ({
        collageCanvas: s.collageCanvas,
        seamlessCanvas: s.seamlessCanvas,
        startMode: s.startMode,
        recentTemplateIds: s.recentTemplateIds,
        customTemplates: s.customTemplates,
        savedStyles: s.savedStyles,
        exportQuality: s.exportQuality,
        exportFormat: s.exportFormat,
        showSeams: s.showSeams,
        showSafeZone: s.showSafeZone,
        exportCount: s.exportCount,
        resumeDraftId: s.resumeDraftId,
      }),
    },
  ),
);
