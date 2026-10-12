import { isLandscape } from './canvas';
import { treeToRects } from './layoutTree';
import collagePresets from './presets/collage.json';
import seamlessPresets from './presets/seamless.json';
import type { CanvasSpec, FRect, LayoutNode, Mode, Template } from './types';
import { uid } from './id';

/** Built-in presets ship as JSON (T-10); adding one needs no code changes. */
export const COLLAGE_PRESETS: Template[] = (collagePresets as Template[]).map((t) => ({ ...t, builtIn: true }));
export const SEAMLESS_PRESETS: Template[] = (seamlessPresets as Template[]).map((t) => ({ ...t, builtIn: true }));

export function builtInTemplates(mode: Mode): Template[] {
  return mode === 'collage' ? COLLAGE_PRESETS : SEAMLESS_PRESETS;
}

export function findTemplate(id: string | null, custom: Template[]): Template | undefined {
  if (!id) return undefined;
  return [...COLLAGE_PRESETS, ...SEAMLESS_PRESETS, ...custom].find((t) => t.id === id);
}

/** Cells for a canvas; some grids flip orientation on landscape canvases. */
export function cellsFor(template: Template, canvas: CanvasSpec): FRect[] {
  if (template.landscapeCells && isLandscape(canvas)) return template.landscapeCells;
  return template.cells;
}

/** Group collage templates by photo count for the picker (T-1). */
export function groupByCount(templates: Template[]): { count: number; templates: Template[] }[] {
  const groups = new Map<number, Template[]>();
  for (const t of templates) {
    const n = t.cells.length;
    groups.set(n, [...(groups.get(n) ?? []), t]);
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([count, list]) => ({ count, templates: list }));
}

export function templateFromTree(name: string, tree: LayoutNode, id = uid('t')): Template {
  return {
    id,
    name,
    mode: 'collage',
    cells: treeToRects(tree).map((c) => roundRect(c.rect)),
    tree,
    createdAt: Date.now(),
  };
}

function roundRect(r: FRect): FRect {
  const q = (v: number) => Math.round(v * 1e6) / 1e6;
  return { x: q(r.x), y: q(r.y), w: q(r.w), h: q(r.h) };
}
