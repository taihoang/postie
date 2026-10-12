/**
 * Guillotine layout trees for the custom template builder (T-4 – T-6).
 * Templates are stored as flat cell rectangles (T-10); a tree is derived from
 * them on demand, edited, then flattened again.
 */
import { uid } from './id';
import type { FRect, LayoutNode } from './types';

const EPS = 1e-4;
/** Smallest cell edge, as a fraction of the canvas. */
export const MIN_CELL = 0.06;

export const FULL: FRect = { x: 0, y: 0, w: 1, h: 1 };

export function leaf(id = uid('c')): LayoutNode {
  return { type: 'leaf', id };
}

export function split(dir: 'row' | 'col', ratio: number, a: LayoutNode, b: LayoutNode): LayoutNode {
  return { type: 'split', id: uid('s'), dir, ratio, a, b };
}

function childRects(r: FRect, node: Extract<LayoutNode, { type: 'split' }>): [FRect, FRect] {
  if (node.dir === 'row') {
    const wa = r.w * node.ratio;
    return [
      { x: r.x, y: r.y, w: wa, h: r.h },
      { x: r.x + wa, y: r.y, w: r.w - wa, h: r.h },
    ];
  }
  const ha = r.h * node.ratio;
  return [
    { x: r.x, y: r.y, w: r.w, h: ha },
    { x: r.x, y: r.y + ha, w: r.w, h: r.h - ha },
  ];
}

export type LeafRect = { id: string; rect: FRect };

/** Flatten to cells in reading order (depth first, `a` before `b`). */
export function treeToRects(node: LayoutNode, r: FRect = FULL): LeafRect[] {
  if (node.type === 'leaf') return [{ id: node.id, rect: r }];
  const [ra, rb] = childRects(r, node);
  return [...treeToRects(node.a, ra), ...treeToRects(node.b, rb)];
}

/**
 * Rebuild a tree from cells by finding full-length cuts. Returns null when the
 * cells cannot be produced by repeated splits (non-guillotine layouts).
 * `ids` optionally names each cell's leaf.
 */
export function rectsToTree(cells: FRect[], ids?: string[]): LayoutNode | null {
  const items = cells.map((rect, i) => ({ rect, id: ids?.[i] ?? uid('c') }));
  return build(items, boundsOf(cells));
}

function boundsOf(cells: FRect[]): FRect {
  const x0 = Math.min(...cells.map((c) => c.x));
  const y0 = Math.min(...cells.map((c) => c.y));
  const x1 = Math.max(...cells.map((c) => c.x + c.w));
  const y1 = Math.max(...cells.map((c) => c.y + c.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

function build(items: { rect: FRect; id: string }[], b: FRect): LayoutNode | null {
  if (items.length === 1) return leaf(items[0].id);
  for (const dir of ['row', 'col'] as const) {
    const cuts = new Set<number>();
    for (const { rect } of items) {
      const edge = dir === 'row' ? rect.x + rect.w : rect.y + rect.h;
      const lo = dir === 'row' ? b.x : b.y;
      const hi = dir === 'row' ? b.x + b.w : b.y + b.h;
      if (edge > lo + EPS && edge < hi - EPS) cuts.add(Number(edge.toFixed(6)));
    }
    for (const cut of [...cuts].sort((p, q) => p - q)) {
      const before = items.filter(({ rect }) => (dir === 'row' ? rect.x + rect.w : rect.y + rect.h) <= cut + EPS);
      const after = items.filter(({ rect }) => (dir === 'row' ? rect.x : rect.y) >= cut - EPS);
      if (before.length + after.length !== items.length || !before.length || !after.length) continue;
      const ratio = dir === 'row' ? (cut - b.x) / b.w : (cut - b.y) / b.h;
      const [ba, bb] =
        dir === 'row'
          ? [
              { x: b.x, y: b.y, w: cut - b.x, h: b.h },
              { x: cut, y: b.y, w: b.x + b.w - cut, h: b.h },
            ]
          : [
              { x: b.x, y: b.y, w: b.w, h: cut - b.y },
              { x: b.x, y: cut, w: b.w, h: b.y + b.h - cut },
            ];
      const a = build(before, ba);
      const c = build(after, bb);
      if (a && c) return split(dir, ratio, a, c);
    }
  }
  return null;
}

function mapTree(node: LayoutNode, fn: (n: LayoutNode) => LayoutNode | undefined): LayoutNode {
  const replaced = fn(node);
  if (replaced) return replaced;
  if (node.type === 'leaf') return node;
  return { ...node, a: mapTree(node.a, fn), b: mapTree(node.b, fn) };
}

/** Split a cell in two equal halves. `row` = side by side, `col` = stacked. */
export function splitLeaf(tree: LayoutNode, leafId: string, dir: 'row' | 'col'): { tree: LayoutNode; newId: string } {
  const newId = uid('c');
  const next = mapTree(tree, (n) =>
    n.type === 'leaf' && n.id === leafId ? split(dir, 0.5, leaf(leafId), leaf(newId)) : undefined,
  );
  return { tree: next, newId };
}

/** Delete a cell; its sibling expands to fill the space (T-6). */
export function removeLeaf(tree: LayoutNode, leafId: string): LayoutNode {
  if (tree.type === 'leaf') return tree;
  return mapTree(tree, (n) => {
    if (n.type !== 'split') return undefined;
    if (n.a.type === 'leaf' && n.a.id === leafId) return n.b;
    if (n.b.type === 'leaf' && n.b.id === leafId) return n.a;
    return undefined;
  });
}

/** Neighbors whose union with the cell is a rectangle. */
export function mergeCandidates(tree: LayoutNode, leafId: string): string[] {
  const cells = treeToRects(tree);
  const me = cells.find((c) => c.id === leafId);
  if (!me) return [];
  return cells.filter((c) => c.id !== leafId && unionIfRect(me.rect, c.rect)).map((c) => c.id);
}

/** Merge two adjacent cells (T-6). Returns null if the result is not a valid layout. */
export function mergeLeaves(tree: LayoutNode, keepId: string, otherId: string): LayoutNode | null {
  const cells = treeToRects(tree);
  const a = cells.find((c) => c.id === keepId);
  const b = cells.find((c) => c.id === otherId);
  if (!a || !b) return null;
  const union = unionIfRect(a.rect, b.rect);
  if (!union) return null;
  const rest = cells.filter((c) => c.id !== keepId && c.id !== otherId);
  const nextCells = [...rest.map((c) => c.rect), union];
  const nextIds = [...rest.map((c) => c.id), keepId];
  return rectsToTree(nextCells, nextIds);
}

function near(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-3;
}

function unionIfRect(a: FRect, b: FRect): FRect | null {
  // Side by side with identical vertical extent.
  if (near(a.y, b.y) && near(a.h, b.h) && (near(a.x + a.w, b.x) || near(b.x + b.w, a.x))) {
    const x = Math.min(a.x, b.x);
    return { x, y: a.y, w: a.w + b.w, h: a.h };
  }
  // Stacked with identical horizontal extent.
  if (near(a.x, b.x) && near(a.w, b.w) && (near(a.y + a.h, b.y) || near(b.y + b.h, a.y))) {
    const y = Math.min(a.y, b.y);
    return { x: a.x, y, w: a.w, h: a.h + b.h };
  }
  return null;
}

export type Divider = {
  nodeId: string;
  dir: 'row' | 'col';
  /** Divider position (x for `row`, y for `col`) as a canvas fraction. */
  pos: number;
  /** The split node's rectangle. */
  bounds: FRect;
};

export function dividers(node: LayoutNode, r: FRect = FULL): Divider[] {
  if (node.type === 'leaf') return [];
  const [ra, rb] = childRects(r, node);
  const pos = node.dir === 'row' ? r.x + r.w * node.ratio : r.y + r.h * node.ratio;
  return [{ nodeId: node.id, dir: node.dir, pos, bounds: r }, ...dividers(node.a, ra), ...dividers(node.b, rb)];
}

/** Minimum extent of a subtree along an axis so no cell gets thinner than MIN_CELL. */
function minExtent(node: LayoutNode, axis: 'row' | 'col'): number {
  if (node.type === 'leaf') return MIN_CELL;
  if (node.dir === axis) return minExtent(node.a, axis) + minExtent(node.b, axis);
  return Math.max(minExtent(node.a, axis), minExtent(node.b, axis));
}

function findSplit(node: LayoutNode, id: string): Extract<LayoutNode, { type: 'split' }> | null {
  if (node.type === 'leaf') return null;
  if (node.id === id) return node;
  return findSplit(node.a, id) ?? findSplit(node.b, id);
}

/** Allowed ratio range for a split, given its rectangle. */
export function ratioRange(tree: LayoutNode, nodeId: string, bounds: FRect): { min: number; max: number } {
  const n = findSplit(tree, nodeId);
  if (!n) return { min: 0.5, max: 0.5 };
  const extent = n.dir === 'row' ? bounds.w : bounds.h;
  const min = minExtent(n.a, n.dir) / extent;
  const max = 1 - minExtent(n.b, n.dir) / extent;
  return min > max ? { min: 0.5, max: 0.5 } : { min, max };
}

export function setRatio(tree: LayoutNode, nodeId: string, ratio: number): LayoutNode {
  return mapTree(tree, (n) => (n.type === 'split' && n.id === nodeId ? { ...n, ratio } : undefined));
}

const SNAP_FRACTIONS = [1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4];

/**
 * Snap a divider (T-5) to thirds, halves and quarters of its own cell or of
 * the whole canvas, whichever is closest within `threshold` (canvas fraction).
 */
export function snapDivider(
  pos: number,
  bounds: FRect,
  dir: 'row' | 'col',
  threshold = 0.015,
): { pos: number; snapped: boolean } {
  const start = dir === 'row' ? bounds.x : bounds.y;
  const extent = dir === 'row' ? bounds.w : bounds.h;
  const candidates = [...SNAP_FRACTIONS.map((f) => start + f * extent), ...SNAP_FRACTIONS];
  let best = pos;
  let bestD = threshold;
  let snapped = false;
  for (const c of candidates) {
    const d = Math.abs(c - pos);
    if (d <= bestD && c > start && c < start + extent) {
      best = c;
      bestD = d;
      snapped = true;
    }
  }
  return { pos: best, snapped };
}
