/**
 * Pure geometry shared by the editor (on the UI thread, as worklets) and the
 * exporter (on the JS thread). Keeping one implementation guarantees the export
 * matches what the user saw.
 */
import type { Crop, FRect, PRect } from './types';

export const MAX_ZOOM = 5;
const EPS = 1e-4;

/** Canvas-pixel layout parameters for one document. */
export type LayoutParams = {
  /** Full drawing width (all slides) and height, in canvas px. */
  W: number;
  H: number;
  gap: number;
  margin: number;
  radius: number;
};

export type Point = { x: number; y: number };

export type Placement = { x: number; y: number; dw: number; dh: number; cover: number };

export type Camera = { s: number; tx: number; ty: number };

/** Skia-compatible transform list. */
export type Transform2D = (
  | { translateX: number }
  | { translateY: number }
  | { scale: number }
  | { scaleX: number }
  | { rotate: number }
)[];

export function clamp(v: number, min: number, max: number): number {
  'worklet';
  if (min > max) return (min + max) / 2;
  return Math.min(max, Math.max(min, v));
}

/**
 * Visible box of a frame in canvas px. Template frames sit inside the outer
 * margin and give up half the gap on every edge shared with a neighbor, which
 * yields exactly `gap` px between frames and `margin` px around the collage.
 */
export function frameBox(rect: FRect, L: LayoutParams, free: boolean): PRect {
  'worklet';
  if (free) {
    return { x: rect.x * L.W, y: rect.y * L.H, width: rect.w * L.W, height: rect.h * L.H };
  }
  const cw = L.W - 2 * L.margin;
  const ch = L.H - 2 * L.margin;
  let x0 = L.margin + rect.x * cw;
  let y0 = L.margin + rect.y * ch;
  let x1 = L.margin + (rect.x + rect.w) * cw;
  let y1 = L.margin + (rect.y + rect.h) * ch;
  const g = L.gap / 2;
  if (rect.x > EPS) x0 += g;
  if (rect.y > EPS) y0 += g;
  if (rect.x + rect.w < 1 - EPS) x1 -= g;
  if (rect.y + rect.h < 1 - EPS) y1 -= g;
  return { x: x0, y: y0, width: Math.max(1, x1 - x0), height: Math.max(1, y1 - y0) };
}

export function frameRadius(box: PRect, radius: number): number {
  'worklet';
  return Math.max(0, Math.min(radius, box.width / 2, box.height / 2));
}

/** Size of the photo as displayed (after rotation), in photo pixels. */
function rotatedSize(iw: number, ih: number, rotation: number): { rw: number; rh: number } {
  'worklet';
  const swap = rotation % 180 !== 0;
  return { rw: swap ? ih : iw, rh: swap ? iw : ih };
}

/**
 * Where the photo sits inside its frame box: "cover" fit times `crop.scale`,
 * positioned so (fx, fy) is at the center, then clamped so the photo always
 * covers the frame (P-2, P-3). x/y are relative to the box origin.
 */
export function placeImage(box: PRect, iw: number, ih: number, crop: Crop): Placement {
  'worklet';
  const { rw, rh } = rotatedSize(iw, ih, crop.rotation);
  const cover = Math.max(box.width / rw, box.height / rh) * clamp(crop.scale, 1, MAX_ZOOM);
  const dw = rw * cover;
  const dh = rh * cover;
  const x = clamp(box.width / 2 - crop.fx * dw, box.width - dw, 0);
  const y = clamp(box.height / 2 - crop.fy * dh, box.height - dh, 0);
  return { x, y, dw, dh, cover };
}

/** Same crop with its focal point clamped to what is actually visible. */
export function normalizeCrop(box: PRect, iw: number, ih: number, crop: Crop): Crop {
  'worklet';
  const p = placeImage(box, iw, ih, crop);
  return {
    scale: clamp(crop.scale, 1, MAX_ZOOM),
    fx: (box.width / 2 - p.x) / p.dw,
    fy: (box.height / 2 - p.y) / p.dh,
    rotation: crop.rotation,
    flip: crop.flip,
  };
}

/**
 * Transform that maps photo pixel space (0..iw, 0..ih) onto the canvas,
 * including rotation and a screen-space horizontal flip.
 */
export function imageTransform(box: PRect, iw: number, ih: number, crop: Crop): Transform2D {
  'worklet';
  const p = placeImage(box, iw, ih, crop);
  return [
    { translateX: box.x + p.x + p.dw / 2 },
    { translateY: box.y + p.y + p.dh / 2 },
    { scaleX: crop.flip ? -1 : 1 },
    { rotate: (crop.rotation * Math.PI) / 180 },
    { scale: p.cover },
    { translateX: -iw / 2 },
    { translateY: -ih / 2 },
  ];
}

/**
 * Pan + pinch: the photo point that was under `anchor` when the gesture began
 * follows `point`, while the zoom is multiplied by `scaleFactor` (P-3, P-4).
 * All points are in canvas px.
 */
export function gestureCrop(
  box: PRect,
  iw: number,
  ih: number,
  start: Crop,
  anchor: Point,
  point: Point,
  scaleFactor: number,
): Crop {
  'worklet';
  const p0 = placeImage(box, iw, ih, start);
  const u = (anchor.x - box.x - p0.x) / p0.dw;
  const v = (anchor.y - box.y - p0.y) / p0.dh;
  const scale = clamp(start.scale * scaleFactor, 1, MAX_ZOOM);
  const { rw, rh } = rotatedSize(iw, ih, start.rotation);
  const cover = Math.max(box.width / rw, box.height / rh) * scale;
  const dw = rw * cover;
  const dh = rh * cover;
  const x = clamp(point.x - box.x - u * dw, box.width - dw, 0);
  const y = clamp(point.y - box.y - v * dh, box.height - dh, 0);
  return {
    scale,
    fx: (box.width / 2 - x) / dw,
    fy: (box.height / 2 - y) / dh,
    rotation: start.rotation,
    flip: start.flip,
  };
}

export const DEFAULT_CROP: Crop = { scale: 1, fx: 0.5, fy: 0.5, rotation: 0, flip: false };

/** Double-tap reset (P-6): back to cover fit, centered; orientation kept. */
export function resetCrop(crop: Crop): Crop {
  return { ...DEFAULT_CROP, rotation: crop.rotation, flip: crop.flip };
}

/** Rotate the visible photo 90° clockwise, keeping the same content centered. */
export function rotateCrop(crop: Crop): Crop {
  const rotation = ((crop.rotation + (crop.flip ? 270 : 90)) % 360) as Crop['rotation'];
  return { ...crop, rotation, fx: 1 - crop.fy, fy: crop.fx };
}

/** Mirror the visible photo horizontally. */
export function flipCrop(crop: Crop): Crop {
  return { ...crop, flip: !crop.flip, fx: 1 - crop.fx };
}

export function pointInRect(p: Point, r: PRect): boolean {
  'worklet';
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

export type HitFrame = { id: string; rect: FRect; free: boolean };

/** Topmost frame under a canvas point (later frames are drawn on top). */
export function hitTestFrame(frames: HitFrame[], L: LayoutParams, p: Point): number {
  'worklet';
  for (let i = frames.length - 1; i >= 0; i--) {
    const f = frames[i];
    if (pointInRect(p, frameBox(f.rect, L, f.free))) return i;
  }
  return -1;
}

/** View point → canvas point. */
export function toCanvas(cam: Camera, x: number, y: number): Point {
  'worklet';
  return { x: (x - cam.tx) / cam.s, y: (y - cam.ty) / cam.s };
}

/** Camera that fits a W×H drawing inside a view with padding, centered. */
export function fitCamera(viewW: number, viewH: number, W: number, H: number, pad: number): Camera {
  'worklet';
  const s = Math.max(0.01, Math.min((viewW - 2 * pad) / W, (viewH - 2 * pad) / H));
  return { s, tx: (viewW - W * s) / 2, ty: (viewH - H * s) / 2 };
}

/** Seamless zoom limits: from "whole panorama visible" up to "one slide fills the height". */
export function seamlessZoomRange(
  viewW: number,
  viewH: number,
  slideW: number,
  H: number,
  slides: number,
  pad: number,
): { min: number; max: number } {
  'worklet';
  const max = Math.max(0.01, Math.min((viewH - 2 * pad) / H, (viewW - 2 * pad) / slideW));
  const min = Math.min(max, (viewW - 2 * pad) / (slideW * slides));
  return { min, max };
}

/** Keep the panorama on screen: centered when narrower than the view, else edge-clamped. */
export function clampCamera(cam: Camera, viewW: number, viewH: number, W: number, H: number, pad: number): Camera {
  'worklet';
  const cw = W * cam.s;
  const ch = H * cam.s;
  const tx = cw + 2 * pad <= viewW ? (viewW - cw) / 2 : clamp(cam.tx, viewW - cw - pad, pad);
  const ty = ch + 2 * pad <= viewH ? (viewH - ch) / 2 : clamp(cam.ty, viewH - ch - pad, pad);
  return { s: cam.s, tx, ty };
}

/** Snap a value to the nearest candidate within `threshold`, or return it unchanged. */
export function snapValue(v: number, candidates: number[], threshold: number): { value: number; snapped: boolean } {
  'worklet';
  let best = v;
  let bestD = threshold;
  let snapped = false;
  for (let i = 0; i < candidates.length; i++) {
    const d = Math.abs(candidates[i] - v);
    if (d <= bestD) {
      bestD = d;
      best = candidates[i];
      snapped = true;
    }
  }
  return { value: best, snapped };
}

/**
 * Move a free frame (fractions of the full drawing) by a canvas-px delta,
 * snapping its edges and center to seams and slide centers (S-6).
 */
export function moveFreeRect(
  start: FRect,
  dx: number,
  dy: number,
  L: LayoutParams,
  slides: number,
  snapPx: number,
): { rect: FRect; snapped: boolean } {
  'worklet';
  const slideW = L.W / slides;
  const xs: number[] = [];
  for (let i = 0; i <= slides; i++) xs.push(i * slideW);
  for (let i = 0; i < slides; i++) xs.push(i * slideW + slideW / 2);
  const ys = [0, L.H / 2, L.H];
  const w = start.w * L.W;
  const h = start.h * L.H;
  let x = start.x * L.W + dx;
  let y = start.y * L.H + dy;
  let snapped = false;
  // Try left edge, center and right edge; keep the closest snap.
  const opts = [
    { off: 0, r: snapValue(x, xs, snapPx) },
    { off: w / 2, r: snapValue(x + w / 2, xs, snapPx) },
    { off: w, r: snapValue(x + w, xs, snapPx) },
  ];
  let bestX = Infinity;
  for (const o of opts) {
    if (o.r.snapped) {
      const d = Math.abs(o.r.value - (x + o.off));
      if (d < bestX) {
        bestX = d;
        x = o.r.value - o.off;
        snapped = true;
      }
    }
  }
  const optsY = [
    { off: 0, r: snapValue(y, ys, snapPx) },
    { off: h / 2, r: snapValue(y + h / 2, ys, snapPx) },
    { off: h, r: snapValue(y + h, ys, snapPx) },
  ];
  let bestY = Infinity;
  for (const o of optsY) {
    if (o.r.snapped) {
      const d = Math.abs(o.r.value - (y + o.off));
      if (d < bestY) {
        bestY = d;
        y = o.r.value - o.off;
        snapped = true;
      }
    }
  }
  x = clamp(x, -w * 0.9, L.W - w * 0.1);
  y = clamp(y, -h * 0.9, L.H - h * 0.1);
  return { rect: { x: x / L.W, y: y / L.H, w: start.w, h: start.h }, snapped };
}

export type Corner = 0 | 1 | 2 | 3; // top-left, top-right, bottom-right, bottom-left

/** Resize a free frame by dragging one corner; the opposite corner stays put. */
export function resizeFreeRect(start: FRect, corner: Corner, dx: number, dy: number, L: LayoutParams, minPx: number): FRect {
  'worklet';
  let x0 = start.x * L.W;
  let y0 = start.y * L.H;
  let x1 = (start.x + start.w) * L.W;
  let y1 = (start.y + start.h) * L.H;
  if (corner === 0 || corner === 3) x0 = Math.min(x0 + dx, x1 - minPx);
  else x1 = Math.max(x1 + dx, x0 + minPx);
  if (corner === 0 || corner === 1) y0 = Math.min(y0 + dy, y1 - minPx);
  else y1 = Math.max(y1 + dy, y0 + minPx);
  return { x: x0 / L.W, y: y0 / L.H, w: (x1 - x0) / L.W, h: (y1 - y0) / L.H };
}

export function cornerPoint(box: PRect, corner: Corner): Point {
  'worklet';
  return {
    x: corner === 0 || corner === 3 ? box.x : box.x + box.width,
    y: corner === 0 || corner === 1 ? box.y : box.y + box.height,
  };
}

/** Source pixels a photo needs at export so it is never upscaled from a thumbnail (E-2). */
export function neededPhotoPixels(box: PRect, iw: number, ih: number, crop: Crop, exportScale: number): number {
  const p = placeImage(box, iw, ih, crop);
  // Longest side of the original at the drawn scale.
  return Math.ceil(Math.max(iw, ih) * p.cover * exportScale);
}
