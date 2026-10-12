/**
 * Pure operations on a CollageDoc. Each returns a new document so the store
 * can keep previous versions for undo/redo.
 */
import { MAX_SLIDES, MIN_SLIDES } from './canvas';
import { DEFAULT_CROP } from './geometry';
import { uid } from './id';
import { cellsFor } from './templates';
import type { CanvasSpec, CollageDoc, Crop, FRect, Frame, Mode, PhotoAsset, Style, Template } from './types';

export const DEFAULT_STYLE: Style = {
  gap: 12,
  margin: 12,
  marginLinked: true,
  radius: 0,
  background: { kind: 'solid', color: '#FFFFFF' },
};

export const STYLE_LIMITS = {
  gap: { min: 0, max: 60 },
  margin: { min: 0, max: 80 },
  radius: { min: 0, max: 60 },
};

export const DEFAULT_SEAMLESS_SLIDES = 3;

function touch(doc: CollageDoc): CollageDoc {
  return { ...doc, updatedAt: Date.now() };
}

export function framesFromCells(cells: FRect[]): Frame[] {
  return cells.map((rect) => ({ id: uid('f'), rect, photoId: null, crop: DEFAULT_CROP }));
}

export function createDoc(opts: {
  mode: Mode;
  canvas: CanvasSpec;
  template?: Template;
  slides?: number;
  style?: Style;
}): CollageDoc {
  const now = Date.now();
  const slides =
    opts.mode === 'seamless' ? clampSlides(opts.template?.slides ?? opts.slides ?? DEFAULT_SEAMLESS_SLIDES) : 1;
  return {
    id: uid('d'),
    mode: opts.mode,
    canvas: opts.canvas,
    slides,
    templateId: opts.template?.id ?? null,
    frames: opts.template ? framesFromCells(cellsFor(opts.template, opts.canvas)) : [],
    photos: {},
    tray: [],
    style: opts.style ?? DEFAULT_STYLE,
    createdAt: now,
    updatedAt: now,
  };
}

export function clampSlides(n: number): number {
  return Math.round(Math.min(MAX_SLIDES, Math.max(MIN_SLIDES, n)));
}

/** Photos in the order they appear: placed frames first, then the tray. */
export function photoQueue(doc: CollageDoc): { photoId: string; crop: Crop }[] {
  const placed = doc.frames
    .filter((f) => f.photoId)
    .map((f) => ({ photoId: f.photoId as string, crop: f.crop }));
  return [...placed, ...doc.tray.map((photoId) => ({ photoId, crop: DEFAULT_CROP }))];
}

/**
 * Switch template mid-edit (T-3): placed photos carry over in order and keep
 * their crop; photos that no longer fit go to the tray.
 */
export function applyTemplate(doc: CollageDoc, template: Template): CollageDoc {
  const queue = photoQueue(doc);
  const slides = doc.mode === 'seamless' ? clampSlides(template.slides ?? doc.slides) : 1;
  const frames = framesFromCells(cellsFor(template, doc.canvas)).map((f, i) =>
    queue[i] ? { ...f, photoId: queue[i].photoId, crop: queue[i].crop } : f,
  );
  const tray = queue.slice(frames.length).map((q) => q.photoId);
  return touch({ ...doc, templateId: template.id, frames, tray, slides });
}

/** Change canvas size (C-1). Fractions keep proportions; grids may flip orientation. */
export function setCanvas(doc: CollageDoc, canvas: CanvasSpec, template?: Template): CollageDoc {
  let frames = doc.frames;
  if (template?.landscapeCells && template.cells.length === frames.length) {
    const cells = cellsFor(template, canvas);
    frames = frames.map((f, i) => ({ ...f, rect: cells[i] }));
  }
  return touch({ ...doc, canvas, frames });
}

/**
 * Change the slide count (S-2) while keeping every frame at the same pixel
 * position. Frames that end up entirely off the canvas release their photo
 * to the tray.
 */
export function setSlides(doc: CollageDoc, slides: number): CollageDoc {
  const next = clampSlides(slides);
  if (next === doc.slides) return doc;
  const k = doc.slides / next;
  const tray = [...doc.tray];
  const frames: Frame[] = [];
  for (const f of doc.frames) {
    const rect = { ...f.rect, x: f.rect.x * k, w: f.rect.w * k };
    if (rect.x >= 1 - 1e-4) {
      if (f.photoId) tray.push(f.photoId);
      continue;
    }
    frames.push({ ...f, rect });
  }
  return touch({ ...doc, slides: next, frames, tray });
}

/** Add imported photos to the document and fill empty frames in pick order (P-1). */
export function placePhotos(doc: CollageDoc, photos: PhotoAsset[], targetFrameId?: string): CollageDoc {
  if (!photos.length) return doc;
  const allPhotos = { ...doc.photos };
  for (const p of photos) allPhotos[p.id] = p;
  let frames = [...doc.frames];
  const tray = [...doc.tray];
  const queue = photos.map((p) => p.id);

  if (targetFrameId) {
    // Replace (P-7): the first photo goes into the chosen frame.
    const idx = frames.findIndex((f) => f.id === targetFrameId);
    const first = queue.shift();
    if (idx >= 0 && first) {
      const displaced = frames[idx].photoId;
      if (displaced) tray.push(displaced);
      frames[idx] = { ...frames[idx], photoId: first, crop: { ...DEFAULT_CROP } };
    }
  }

  if (doc.mode === 'seamless' && frames.length === 0 && queue.length) {
    frames = autoSeamlessFrames(doc.slides, queue.length);
  }

  frames = frames.map((f) => {
    if (f.photoId || !queue.length) return f;
    return { ...f, photoId: queue.shift() as string, crop: { ...DEFAULT_CROP } };
  });
  tray.push(...queue);
  return touch({ ...doc, photos: allPhotos, frames, tray });
}

/** Give a blank seamless canvas one frame per slide (up to `count`) before photos arrive. */
export function ensureSeamlessFrames(doc: CollageDoc, count: number): CollageDoc {
  if (doc.mode !== 'seamless' || doc.frames.length > 0 || count <= 0) return doc;
  return touch({ ...doc, frames: autoSeamlessFrames(doc.slides, count) });
}

/** One centered free frame per slide, for a blank seamless canvas. */
function autoSeamlessFrames(slides: number, count: number): Frame[] {
  const n = Math.min(slides, count);
  return Array.from({ length: n }, (_, i) => ({
    id: uid('f'),
    rect: { x: (i + 0.1) / slides, y: 0.1, w: 0.8 / slides, h: 0.8 },
    photoId: null,
    crop: { ...DEFAULT_CROP },
    free: true,
  }));
}

/** Long-press drag onto another frame swaps the two photos (P-8). */
export function swapPhotos(doc: CollageDoc, aId: string, bId: string): CollageDoc {
  if (aId === bId) return doc;
  const a = doc.frames.find((f) => f.id === aId);
  const b = doc.frames.find((f) => f.id === bId);
  if (!a || !b) return doc;
  const frames = doc.frames.map((f) => {
    if (f.id === aId) return { ...f, photoId: b.photoId, crop: b.photoId ? b.crop : DEFAULT_CROP };
    if (f.id === bId) return { ...f, photoId: a.photoId, crop: a.photoId ? a.crop : DEFAULT_CROP };
    return f;
  });
  return touch({ ...doc, frames });
}

/** Remove (P-9): the photo leaves the frame and waits in the tray. */
export function removePhoto(doc: CollageDoc, frameId: string): CollageDoc {
  const f = doc.frames.find((x) => x.id === frameId);
  if (!f?.photoId) return doc;
  const frames = doc.frames.map((x) => (x.id === frameId ? { ...x, photoId: null, crop: DEFAULT_CROP } : x));
  return touch({ ...doc, frames, tray: [f.photoId, ...doc.tray] });
}

/** Put a tray photo into a frame (or the first empty one); a displaced photo goes to the tray. */
export function placeFromTray(doc: CollageDoc, photoId: string, frameId?: string): CollageDoc {
  const target = frameId ? doc.frames.find((f) => f.id === frameId) : doc.frames.find((f) => !f.photoId);
  if (!target) return doc;
  const tray = doc.tray.filter((id) => id !== photoId);
  if (target.photoId) tray.unshift(target.photoId);
  const frames = doc.frames.map((f) => (f.id === target.id ? { ...f, photoId, crop: DEFAULT_CROP } : f));
  return touch({ ...doc, frames, tray });
}

export function updateFrame(doc: CollageDoc, frameId: string, patch: Partial<Pick<Frame, 'rect' | 'crop'>>): CollageDoc {
  return touch({ ...doc, frames: doc.frames.map((f) => (f.id === frameId ? { ...f, ...patch } : f)) });
}

/** Seamless free-placement frame (S-6), centered on a slide. */
export function addFreeFrame(doc: CollageDoc, slideIndex: number): { doc: CollageDoc; frameId: string } {
  const i = Math.max(0, Math.min(doc.slides - 1, slideIndex));
  const frame: Frame = {
    id: uid('f'),
    rect: { x: (i + 0.2) / doc.slides, y: 0.25, w: 0.6 / doc.slides, h: 0.5 },
    photoId: null,
    crop: { ...DEFAULT_CROP },
    free: true,
  };
  return { doc: touch({ ...doc, frames: [...doc.frames, frame] }), frameId: frame.id };
}

export function deleteFrame(doc: CollageDoc, frameId: string): CollageDoc {
  const f = doc.frames.find((x) => x.id === frameId);
  if (!f) return doc;
  const tray = f.photoId ? [f.photoId, ...doc.tray] : doc.tray;
  return touch({ ...doc, frames: doc.frames.filter((x) => x.id !== frameId), tray });
}

/** Layer order (S-7): later frames draw on top. */
export function moveLayer(doc: CollageDoc, frameId: string, dir: 1 | -1): CollageDoc {
  const i = doc.frames.findIndex((f) => f.id === frameId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= doc.frames.length) return doc;
  const frames = [...doc.frames];
  [frames[i], frames[j]] = [frames[j], frames[i]];
  return touch({ ...doc, frames });
}

export function setStyle(doc: CollageDoc, patch: Partial<Style>): CollageDoc {
  const style = { ...doc.style, ...patch };
  if (style.marginLinked) style.margin = Math.min(STYLE_LIMITS.margin.max, style.gap);
  return touch({ ...doc, style });
}

export function emptyFrameCount(doc: CollageDoc): number {
  return doc.frames.filter((f) => !f.photoId).length;
}

/** Photos referenced by frames, the tray or the background. */
export function referencedPhotoIds(doc: CollageDoc): Set<string> {
  const ids = new Set<string>(doc.tray);
  for (const f of doc.frames) if (f.photoId) ids.add(f.photoId);
  if (doc.style.background.kind === 'photo') ids.add(doc.style.background.photoId);
  return ids;
}
