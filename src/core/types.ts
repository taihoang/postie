/**
 * Core data model. Everything here is plain JSON so it can be persisted,
 * diffed for undo/redo and shared with Reanimated worklets.
 */

/** Rectangle expressed as fractions (0–1) of the canvas or panorama. */
export type FRect = { x: number; y: number; w: number; h: number };

/** Pixel rectangle in canvas coordinates. */
export type PRect = { x: number; y: number; width: number; height: number };

export type Mode = 'collage' | 'seamless';

export type CanvasSizeId = '4:5' | '3:4' | '1:1' | '9:16' | '1.91:1' | 'custom';

/** A canvas (or, in seamless mode, one slide) in Instagram pixels. */
export type CanvasSpec = { id: CanvasSizeId; width: number; height: number };

/**
 * Guillotine layout tree used by the custom template builder.
 * `row` places children side by side (vertical divider),
 * `col` stacks them (horizontal divider). `ratio` is the share of `a`.
 */
export type LayoutNode =
  | { type: 'leaf'; id: string }
  | { type: 'split'; id: string; dir: 'row' | 'col'; ratio: number; a: LayoutNode; b: LayoutNode };

export type Template = {
  id: string;
  name: string;
  mode: Mode;
  /** Cell rectangles as fractions of the canvas (T-10). */
  cells: FRect[];
  /** Optional alternative for landscape canvases (e.g. 2 × 3 becomes 3 × 2). */
  landscapeCells?: FRect[];
  /** Seamless templates are designed for a fixed slide count. */
  slides?: number;
  /** Present on templates made in the builder so they can be edited again. */
  tree?: LayoutNode;
  builtIn?: boolean;
  createdAt?: number;
};

export type Rotation = 0 | 90 | 180 | 270;

/**
 * Non-destructive photo transform (P-13).
 * `fx`/`fy` is the point of the displayed (rotated, flipped) photo that sits at
 * the frame center, as fractions of the displayed photo. `scale` is relative to
 * "cover" fit (1 = cover, max 5).
 */
export type Crop = { scale: number; fx: number; fy: number; rotation: Rotation; flip: boolean };

export type Frame = {
  id: string;
  rect: FRect;
  photoId: string | null;
  crop: Crop;
  /** Seamless free-placement frame: positioned exactly, no gap inset. */
  free?: boolean;
};

export type PhotoAsset = {
  id: string;
  /**
   * Full-resolution original, as a file name inside the app's photo folder.
   * Names are relative because iOS moves the app container on updates.
   */
  file: string;
  /** Downsampled, orientation-baked copy used while editing (N-4). */
  preview: string;
  /** Pixel size of the original, after orientation. */
  width: number;
  height: number;
};

export type TextureId = 'paper' | 'linen' | 'dots' | 'grid' | 'terrazzo' | 'film';

export type Background =
  | { kind: 'solid'; color: string }
  | { kind: 'gradient'; from: string; to: string; angle: number }
  | { kind: 'texture'; texture: TextureId; color: string }
  | { kind: 'photo'; photoId: string };

/** Values in pixels at 1080 px width; scaled for other sizes (B-2). */
export type Style = {
  gap: number;
  margin: number;
  marginLinked: boolean;
  radius: number;
  background: Background;
};

export type SavedStyle = { id: string; name: string; style: Style; createdAt: number };

export type CollageDoc = {
  id: string;
  mode: Mode;
  /** Collage: the canvas. Seamless: one slide. */
  canvas: CanvasSpec;
  /** 1 for collages, 2–20 for seamless carousels. */
  slides: number;
  templateId: string | null;
  frames: Frame[];
  photos: Record<string, PhotoAsset>;
  /** Photos that are not placed in any frame (T-3). */
  tray: string[];
  style: Style;
  createdAt: number;
  updatedAt: number;
  exportedAt?: number;
};

export type ExportQuality = 'instagram' | 'high';
export type ExportFormat = 'jpeg' | 'png';
