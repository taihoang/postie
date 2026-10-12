import type { LayoutParams } from './geometry';
import type { CanvasSizeId, CanvasSpec, CollageDoc } from './types';

export type CanvasPreset = CanvasSpec & {
  name: string;
  ratioLabel: string;
  /** Short placement hint shown on the chip (C-2). */
  where: string;
};

/** Ordered as shown in the UI; 4:5 is the default (most used feed size). */
export const CANVAS_PRESETS: CanvasPreset[] = [
  { id: '4:5', name: 'Portrait', ratioLabel: '4:5', where: 'Feed', width: 1080, height: 1350 },
  { id: '3:4', name: 'Grid Portrait', ratioLabel: '3:4', where: 'Feed + Grid', width: 1080, height: 1440 },
  { id: '1:1', name: 'Square', ratioLabel: '1:1', where: 'Feed', width: 1080, height: 1080 },
  { id: '9:16', name: 'Story / Reel', ratioLabel: '9:16', where: 'Story', width: 1080, height: 1920 },
  { id: '1.91:1', name: 'Landscape', ratioLabel: '1.91:1', where: 'Feed', width: 1080, height: 566 },
];

export const DEFAULT_CANVAS: CanvasSpec = { id: '4:5', width: 1080, height: 1350 };

/** Slide ratios offered in seamless mode (S-2). */
export const SEAMLESS_RATIOS: CanvasSizeId[] = ['4:5', '3:4', '1:1'];

export const MIN_SLIDES = 2;
export const MAX_SLIDES = 20;

/** Instagram exports are 1080 px wide; high-res doubles that (E-1). */
export const BASE_WIDTH = 1080;

/** Story safe zones: top and bottom bands, in px at 1080 width (C-3). */
export const STORY_SAFE_ZONE = 250;

export function canvasSpec(id: CanvasSizeId, custom?: { width: number; height: number }): CanvasSpec {
  if (id === 'custom') {
    const width = clampInt(custom?.width ?? 1080, 200, 4096);
    const height = clampInt(custom?.height ?? 1080, 200, 4096);
    return { id, width, height };
  }
  const preset = CANVAS_PRESETS.find((p) => p.id === id) ?? CANVAS_PRESETS[0];
  return { id: preset.id, width: preset.width, height: preset.height };
}

export function presetFor(id: CanvasSizeId): CanvasPreset | undefined {
  return CANVAS_PRESETS.find((p) => p.id === id);
}

/** Pixels per "1080-base" unit. Gap, margin and radius values use this unit. */
export function unitFor(canvas: CanvasSpec): number {
  return canvas.width / BASE_WIDTH;
}

/** Full drawing surface in canvas pixels (seamless = all slides side by side). */
export function docSize(doc: Pick<CollageDoc, 'canvas' | 'slides'>): { width: number; height: number } {
  return { width: doc.canvas.width * doc.slides, height: doc.canvas.height };
}

export function isLandscape(canvas: CanvasSpec): boolean {
  return canvas.width > canvas.height;
}

function clampInt(v: number, min: number, max: number): number {
  if (!Number.isFinite(v)) return min;
  return Math.round(Math.min(max, Math.max(min, v)));
}

/** Canvas-pixel layout for a document (gap, margin and radius scaled from 1080-base px). */
export function layoutParams(doc: Pick<CollageDoc, 'canvas' | 'slides' | 'style'>): LayoutParams {
  const unit = unitFor(doc.canvas);
  const { width, height } = docSize(doc);
  return {
    W: width,
    H: height,
    gap: doc.style.gap * unit,
    margin: doc.style.margin * unit,
    radius: doc.style.radius * unit,
  };
}
