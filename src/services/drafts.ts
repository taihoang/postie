import { File } from 'expo-file-system';

import { docSize } from '@/core/canvas';
import { referencedPhotoIds } from '@/core/doc';
import { uid } from '@/core/id';
import type { CollageDoc } from '@/core/types';
import { useDrafts, type DraftMeta } from '@/state/draftsStore';
import { useEditor } from '@/state/editorStore';

import { draftsDir, ensureDir, photosDir, safeDelete } from './files';

const DAY = 24 * 60 * 60 * 1000;

function docFile(id: string): File {
  return new File(draftsDir(), `${id}.json`);
}

export function thumbFile(name: string): File {
  return new File(draftsDir(), name);
}

/** Drop photo records nothing points at, so the JSON stays small. */
function pruned(doc: CollageDoc): CollageDoc {
  const used = referencedPhotoIds(doc);
  const photos: CollageDoc['photos'] = {};
  for (const id of used) if (doc.photos[id]) photos[id] = doc.photos[id];
  return { ...doc, photos };
}

function metaFor(doc: CollageDoc, prev?: DraftMeta): DraftMeta {
  const size = docSize(doc);
  return {
    id: doc.id,
    mode: doc.mode,
    canvasId: doc.canvas.id,
    canvasWidth: doc.canvas.width,
    canvasHeight: doc.canvas.height,
    aspect: size.width / size.height,
    slides: doc.slides,
    photoCount: doc.frames.filter((f) => f.photoId).length,
    updatedAt: doc.updatedAt,
    thumb: prev?.thumb ?? null,
    thumbVersion: prev?.thumbVersion ?? 0,
  };
}

/** A-8: drafts autosave locally. Only collages with at least one photo are kept. */
export function saveDraft(doc: CollageDoc): void {
  if (!Object.keys(doc.photos).length) return;
  ensureDir(draftsDir());
  docFile(doc.id).write(JSON.stringify(pruned(doc)));
  const prev = useDrafts.getState().drafts.find((d) => d.id === doc.id);
  useDrafts.getState().upsert(metaFor(doc, prev));
}

export function saveDraftThumb(docId: string, bytes: Uint8Array): void {
  const prev = useDrafts.getState().drafts.find((d) => d.id === docId);
  if (!prev) return;
  ensureDir(draftsDir());
  const name = `${docId}.thumb.jpg`;
  thumbFile(name).write(bytes);
  useDrafts.getState().upsert({ ...prev, thumb: name, thumbVersion: prev.thumbVersion + 1 });
}

export async function loadDraft(id: string): Promise<CollageDoc | null> {
  const f = docFile(id);
  if (!f.exists) return null;
  try {
    return JSON.parse(await f.text()) as CollageDoc;
  } catch {
    return null;
  }
}

export async function duplicateDraft(id: string): Promise<CollageDoc | null> {
  const doc = await loadDraft(id);
  if (!doc) return null;
  const now = Date.now();
  const copy: CollageDoc = { ...doc, id: uid('d'), createdAt: now, updatedAt: now, exportedAt: undefined };
  saveDraft(copy);
  const src = useDrafts.getState().drafts.find((d) => d.id === id);
  if (src?.thumb) {
    const name = `${copy.id}.thumb.jpg`;
    thumbFile(src.thumb).copySync(thumbFile(name));
    const meta = useDrafts.getState().drafts.find((d) => d.id === copy.id);
    if (meta) useDrafts.getState().upsert({ ...meta, thumb: name });
  }
  return copy;
}

export async function deleteDraft(id: string): Promise<void> {
  const meta = useDrafts.getState().drafts.find((d) => d.id === id);
  safeDelete(docFile(id));
  if (meta?.thumb) safeDelete(thumbFile(meta.thumb));
  useDrafts.getState().remove(id);
  // A small minimum age protects photos being imported right now.
  await cleanupOrphanPhotos(10 * 60 * 1000);
}

/**
 * Delete photo files that no saved collage uses. Files younger than
 * `minAgeMs` are kept because an unsaved editor session may still use them.
 */
export async function cleanupOrphanPhotos(minAgeMs = DAY): Promise<void> {
  // Until the drafts index has loaded, every photo would look unused.
  if (!useDrafts.persist.hasHydrated()) return;
  const dir = photosDir();
  if (!dir.exists) return;
  const used = new Set<string>();
  // The open editor session, including undo history, may use unsaved photos.
  const { doc: open, past, future } = useEditor.getState();
  for (const d of open ? [open, ...past, ...future] : []) {
    for (const p of Object.values(d.photos)) {
      used.add(p.file);
      used.add(p.preview);
    }
  }
  for (const meta of useDrafts.getState().drafts) {
    const doc = await loadDraft(meta.id);
    if (!doc) continue;
    for (const p of Object.values(doc.photos)) {
      used.add(p.file);
      used.add(p.preview);
    }
  }
  const now = Date.now();
  for (const entry of dir.list()) {
    if (!(entry instanceof File) || used.has(entry.name)) continue;
    const modified = entry.modificationTime ?? 0;
    if (now - modified >= minAgeMs) safeDelete(entry);
  }
}
