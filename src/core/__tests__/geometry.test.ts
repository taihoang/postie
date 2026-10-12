import {
  DEFAULT_CROP,
  clampCamera,
  flipCrop,
  frameBox,
  gestureCrop,
  hitTestFrame,
  imageTransform,
  moveFreeRect,
  normalizeCrop,
  placeImage,
  resizeFreeRect,
  rotateCrop,
  type LayoutParams,
} from '../geometry';
import type { Crop } from '../types';

const L: LayoutParams = { W: 1080, H: 1350, gap: 12, margin: 12, radius: 0 };

describe('frameBox', () => {
  it('leaves exactly `gap` between neighbors and `margin` around the edge', () => {
    const left = frameBox({ x: 0, y: 0, w: 0.5, h: 1 }, L, false);
    const right = frameBox({ x: 0.5, y: 0, w: 0.5, h: 1 }, L, false);
    expect(left.x).toBe(12);
    expect(left.y).toBe(12);
    expect(right.x - (left.x + left.width)).toBeCloseTo(12);
    expect(1080 - (right.x + right.width)).toBeCloseTo(12);
    expect(1350 - (left.y + left.height)).toBeCloseTo(12);
  });

  it('places free frames exactly, without margin or gap', () => {
    expect(frameBox({ x: 0.25, y: 0.5, w: 0.5, h: 0.25 }, L, true)).toEqual({
      x: 270,
      y: 675,
      width: 540,
      height: 337.5,
    });
  });
});

describe('placeImage', () => {
  const box = { x: 0, y: 0, width: 500, height: 500 };

  it('covers the frame and centers the photo by default (P-2)', () => {
    const p = placeImage(box, 4000, 3000, DEFAULT_CROP);
    expect(p.dh).toBeCloseTo(500);
    expect(p.dw).toBeCloseTo(666.667, 2);
    expect(p.x).toBeCloseTo(-83.333, 2);
    expect(p.y).toBeCloseTo(0);
  });

  it('never leaves empty space, however far the focal point is pushed (P-3)', () => {
    const p = placeImage(box, 4000, 3000, { ...DEFAULT_CROP, fx: 5, fy: -3 });
    expect(p.x).toBeGreaterThanOrEqual(box.width - p.dw);
    expect(p.x).toBeLessThanOrEqual(0);
    expect(p.y).toBeLessThanOrEqual(0);
    expect(p.y + p.dh).toBeGreaterThanOrEqual(box.height);
  });

  it('swaps dimensions when rotated', () => {
    const p = placeImage(box, 4000, 3000, { ...DEFAULT_CROP, rotation: 90 });
    expect(p.dw).toBeCloseTo(500);
    expect(p.dh).toBeCloseTo(666.667, 2);
  });

  it('limits zoom to 1×–5× (P-4)', () => {
    expect(placeImage(box, 1000, 1000, { ...DEFAULT_CROP, scale: 9 }).cover).toBeCloseTo(2.5);
    expect(placeImage(box, 1000, 1000, { ...DEFAULT_CROP, scale: 0.2 }).cover).toBeCloseTo(0.5);
  });
});

describe('gestureCrop', () => {
  const box = { x: 100, y: 100, width: 400, height: 400 };

  it('keeps the photo point under the pinch midpoint fixed while zooming (P-4)', () => {
    const start: Crop = { ...DEFAULT_CROP };
    const anchor = { x: 200, y: 250 };
    const before = placeImage(box, 2000, 2000, start);
    const u = (anchor.x - box.x - before.x) / before.dw;
    const next = gestureCrop(box, 2000, 2000, start, anchor, anchor, 2);
    const after = placeImage(box, 2000, 2000, next);
    expect(next.scale).toBe(2);
    expect(box.x + after.x + u * after.dw).toBeCloseTo(anchor.x);
  });

  it('pans by the finger delta and clamps at the photo edge', () => {
    const zoomed: Crop = { ...DEFAULT_CROP, scale: 2 };
    const next = gestureCrop(box, 2000, 2000, zoomed, { x: 300, y: 300 }, { x: 350, y: 300 }, 1);
    // 2× zoom of a square photo in a 400 px box is 800 px wide, centered at x = -200.
    const p = placeImage(box, 2000, 2000, next);
    expect(p.x).toBeCloseTo(-200 + 50);
    const far = gestureCrop(box, 2000, 2000, zoomed, { x: 300, y: 300 }, { x: 3000, y: 300 }, 1);
    expect(placeImage(box, 2000, 2000, far).x).toBe(0);
  });
});

describe('crop helpers', () => {
  it('normalizes an out-of-range focal point to what is visible', () => {
    const box = { x: 0, y: 0, width: 100, height: 100 };
    const n = normalizeCrop(box, 200, 100, { ...DEFAULT_CROP, fx: 0 });
    expect(n.fx).toBeCloseTo(0.25);
    expect(n.fy).toBeCloseTo(0.5);
  });

  it('rotating four times returns to the start', () => {
    let c: Crop = { ...DEFAULT_CROP, fx: 0.3, fy: 0.7 };
    for (let i = 0; i < 4; i++) c = rotateCrop(c);
    expect(c.rotation).toBe(0);
    expect(c.fx).toBeCloseTo(0.3);
    expect(c.fy).toBeCloseTo(0.7);
  });

  it('rotation turns the other way in stored space when flipped, so it looks clockwise', () => {
    expect(rotateCrop({ ...DEFAULT_CROP, flip: true }).rotation).toBe(270);
  });

  it('flip mirrors the focal point', () => {
    expect(flipCrop({ ...DEFAULT_CROP, fx: 0.2 })).toMatchObject({ flip: true, fx: 0.8 });
  });

  it('maps the photo center to the frame center for a centered crop', () => {
    const box = { x: 10, y: 20, width: 300, height: 300 };
    const t = imageTransform(box, 600, 400, DEFAULT_CROP);
    expect(t[0]).toEqual({ translateX: 160 });
    expect(t[1]).toEqual({ translateY: 170 });
  });
});

describe('hitTestFrame', () => {
  it('returns the topmost frame and ignores the gap', () => {
    const frames = [
      { id: 'a', rect: { x: 0, y: 0, w: 0.5, h: 1 }, free: false },
      { id: 'b', rect: { x: 0.5, y: 0, w: 0.5, h: 1 }, free: false },
      { id: 'c', rect: { x: 0.4, y: 0.4, w: 0.2, h: 0.2 }, free: true },
    ];
    expect(hitTestFrame(frames, L, { x: 100, y: 100 })).toBe(0);
    expect(hitTestFrame(frames, L, { x: 900, y: 100 })).toBe(1);
    expect(hitTestFrame(frames, L, { x: 540, y: 675 })).toBe(2);
    expect(hitTestFrame(frames, L, { x: 540, y: 100 })).toBe(-1);
  });
});

describe('free frames', () => {
  const P: LayoutParams = { W: 3240, H: 1440, gap: 0, margin: 0, radius: 0 };

  it('snaps a frame edge to a seam (S-6)', () => {
    const r = moveFreeRect({ x: 0.1, y: 0.25, w: 0.2, h: 0.3 }, 750, 0, P, 3, 12);
    expect(r.snapped).toBe(true);
    // Left edge lands on the first seam at 1080 px (0.1 × 3240 + 750 = 1074 → 1080).
    expect(r.rect.x * 3240).toBeCloseTo(1080);
  });

  it('resizes from a corner and keeps a minimum size', () => {
    const r = resizeFreeRect({ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, 2, -5000, -5000, P, 80);
    expect(r.w * 3240).toBeCloseTo(80);
    expect(r.h * 1440).toBeCloseTo(80);
    expect(r.x).toBeCloseTo(0.1);
  });
});

describe('clampCamera', () => {
  it('centers a drawing narrower than the view', () => {
    const c = clampCamera({ s: 0.1, tx: -500, ty: 0 }, 400, 600, 2160, 1440, 8);
    expect(c.tx).toBeCloseTo((400 - 216) / 2);
  });

  it('keeps a wide panorama edge on screen', () => {
    const c = clampCamera({ s: 0.3, tx: 100, ty: 0 }, 400, 600, 6480, 1440, 8);
    expect(c.tx).toBe(8);
  });
});
