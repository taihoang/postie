import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { emptyFrameCount, ensureSeamlessFrames, placePhotos } from '@/core/doc';
import type { CollageDoc } from '@/core/types';
import { loadPreviewImages } from '@/render/imageCache';
import { saveDraft, saveDraftThumb } from '@/services/drafts';
import { renderThumbnail } from '@/services/exporter';
import { MAX_PICK, importPhotos, pickPhotos } from '@/services/photos';
import { useEditor } from '@/state/editorStore';
import { useSettings } from '@/state/settingsStore';

type Progress = { done: number; total: number };

/** Pick, then import one by one; each photo lands in the next empty frame as soon as it is ready. */
async function pickAndImport(targetFrameId: string | undefined, onProgress: (p: Progress) => void): Promise<void> {
  const doc = useEditor.getState().doc;
  if (!doc) return;
  const empty = emptyFrameCount(doc);
  const limit = targetFrameId ? 1 : empty > 0 ? Math.min(MAX_PICK, empty) : MAX_PICK;
  const assets = await pickPhotos(limit);
  if (!assets.length) return;

  const total = assets.length;
  onProgress({ done: 0, total });
  const editor = useEditor.getState();
  editor.checkpoint();
  if (!targetFrameId) editor.live((d) => ensureSeamlessFrames(d, total));
  let target = targetFrameId;
  await importPhotos(assets, (photo, i) => {
    useEditor.getState().live((d) => placePhotos(d, [photo], target));
    target = undefined;
    onProgress({ done: i + 1, total });
  });
}

/** P-1: the whole batch is a single undo step, and only one picker or import runs at a time. */
export function usePhotoImport() {
  const [progress, setProgress] = useState<Progress | null>(null);
  // A second import could overwrite frames the first one is still filling.
  const busy = useRef(false);

  const addPhotos = useCallback(async (targetFrameId?: string) => {
    if (!useEditor.getState().doc || busy.current) return;
    busy.current = true;
    try {
      await pickAndImport(targetFrameId, setProgress);
    } finally {
      busy.current = false;
      useEditor.getState().endCheckpoint();
      setProgress(null);
    }
  }, []);

  return { addPhotos, importing: progress };
}

/** A-8: save the draft shortly after every change, and immediately when the app goes to the background. */
export function useAutosave(doc: CollageDoc | null) {
  const latest = useRef(doc);
  useEffect(() => {
    latest.current = doc;
  }, [doc]);

  useEffect(() => {
    if (!doc) return;
    const t = setTimeout(() => {
      saveDraft(doc);
      // Reopen on launch only while there are edits since the last export.
      const unfinished = !doc.exportedAt || doc.updatedAt > doc.exportedAt;
      useSettings.getState().setResumeDraft(unfinished ? doc.id : null);
    }, 600);
    return () => clearTimeout(t);
  }, [doc]);

  useEffect(() => {
    if (!doc || !Object.keys(doc.photos).length) return;
    const t = setTimeout(async () => {
      try {
        const images = await loadPreviewImages(doc.photos);
        const bytes = await renderThumbnail(doc, images);
        if (bytes) saveDraftThumb(doc.id, bytes);
      } catch (e) {
        console.warn('Thumbnail failed', e);
      }
    }, 2000);
    return () => clearTimeout(t);
  }, [doc]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' && latest.current) saveDraft(latest.current);
    });
    return () => {
      sub.remove();
      if (latest.current) saveDraft(latest.current);
    };
  }, []);
}
