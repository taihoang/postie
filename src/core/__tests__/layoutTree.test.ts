import {
  dividers,
  leaf,
  mergeCandidates,
  mergeLeaves,
  ratioRange,
  rectsToTree,
  removeLeaf,
  setRatio,
  snapDivider,
  split,
  splitLeaf,
  treeToRects,
} from '../layoutTree';
import { COLLAGE_PRESETS } from '../templates';

describe('layout trees', () => {
  it('every collage preset can be opened in the builder (guillotine)', () => {
    for (const t of COLLAGE_PRESETS) {
      const tree = rectsToTree(t.cells);
      expect(tree).not.toBeNull();
      const back = treeToRects(tree!).map((c) => c.rect);
      expect(back).toHaveLength(t.cells.length);
      for (const cell of t.cells) {
        expect(back.some((r) => Math.abs(r.x - cell.x) < 1e-4 && Math.abs(r.w - cell.w) < 1e-4 && Math.abs(r.y - cell.y) < 1e-4)).toBe(true);
      }
    }
  });

  it('rejects a pinwheel, which cannot be made by splitting', () => {
    const pinwheel = [
      { x: 0, y: 0, w: 2 / 3, h: 1 / 3 },
      { x: 2 / 3, y: 0, w: 1 / 3, h: 2 / 3 },
      { x: 1 / 3, y: 2 / 3, w: 2 / 3, h: 1 / 3 },
      { x: 0, y: 1 / 3, w: 1 / 3, h: 2 / 3 },
      { x: 1 / 3, y: 1 / 3, w: 1 / 3, h: 1 / 3 },
    ];
    expect(rectsToTree(pinwheel)).toBeNull();
  });

  it('splits a cell in half and deletes it again, letting the neighbor expand (T-4, T-6)', () => {
    const start = leaf('a');
    const { tree, newId } = splitLeaf(start, 'a', 'row');
    expect(treeToRects(tree).map((c) => c.rect)).toEqual([
      { x: 0, y: 0, w: 0.5, h: 1 },
      { x: 0.5, y: 0, w: 0.5, h: 1 },
    ]);
    const back = removeLeaf(tree, newId);
    expect(treeToRects(back)).toEqual([{ id: 'a', rect: { x: 0, y: 0, w: 1, h: 1 } }]);
  });

  it('merges adjacent cells whose union is a rectangle', () => {
    const tree = split('row', 0.5, split('col', 0.5, leaf('a'), leaf('b')), split('col', 0.5, leaf('c'), leaf('d')));
    expect(mergeCandidates(tree, 'a').sort()).toEqual(['b', 'c']);
    const merged = mergeLeaves(tree, 'a', 'c');
    expect(merged).not.toBeNull();
    const cells = treeToRects(merged!);
    expect(cells).toHaveLength(3);
    expect(cells.find((c) => c.id === 'a')?.rect).toEqual({ x: 0, y: 0, w: 1, h: 0.5 });
  });

  it('limits divider movement so no cell gets too thin', () => {
    const tree = split('row', 0.5, leaf('a'), split('row', 0.5, leaf('b'), leaf('c')));
    const d = dividers(tree)[0];
    const range = ratioRange(tree, d.nodeId, d.bounds);
    expect(range.min).toBeCloseTo(0.06);
    expect(range.max).toBeCloseTo(0.88);
    const moved = setRatio(tree, d.nodeId, 0.7);
    expect(treeToRects(moved)[0].rect.w).toBeCloseTo(0.7);
  });

  it('snaps dividers to thirds and halves (T-5)', () => {
    expect(snapDivider(0.34, { x: 0, y: 0, w: 1, h: 1 }, 'row')).toEqual({ pos: 1 / 3, snapped: true });
    expect(snapDivider(0.41, { x: 0, y: 0, w: 1, h: 1 }, 'row').snapped).toBe(false);
    // Halves of a sub-cell spanning 0.5–1.0 → 0.75.
    expect(snapDivider(0.76, { x: 0.5, y: 0, w: 0.5, h: 1 }, 'row').pos).toBeCloseTo(0.75);
  });
});
