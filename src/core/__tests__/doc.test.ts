import { canvasSpec } from '../canvas';
import {
  applyTemplate,
  createDoc,
  deleteFrame,
  moveLayer,
  placeFromTray,
  placePhotos,
  removePhoto,
  setCanvas,
  setSlides,
  setStyle,
  swapPhotos,
} from '../doc';
import { COLLAGE_PRESETS, SEAMLESS_PRESETS } from '../templates';
import type { PhotoAsset } from '../types';

const photo = (id: string): PhotoAsset => ({ id, file: `${id}.jpg`, preview: `${id}_p.jpg`, width: 4000, height: 3000 });
const grid4 = COLLAGE_PRESETS.find((t) => t.id === 'grid-4')!;
const split = COLLAGE_PRESETS.find((t) => t.id === 'split-v')!;
const grid6 = COLLAGE_PRESETS.find((t) => t.id === 'grid-6')!;

describe('documents', () => {
  it('defaults to a 4:5 canvas with a white 12 px border', () => {
    const doc = createDoc({ mode: 'collage', canvas: canvasSpec('4:5'), template: grid4 });
    expect(doc.canvas).toEqual({ id: '4:5', width: 1080, height: 1350 });
    expect(doc.style.background).toEqual({ kind: 'solid', color: '#FFFFFF' });
    expect(doc.style.gap).toBe(12);
    expect(doc.frames).toHaveLength(4);
  });

  it('fills empty frames in pick order and sends extras to the tray (P-1)', () => {
    const doc = placePhotos(createDoc({ mode: 'collage', canvas: canvasSpec('4:5'), template: split }), [
      photo('a'),
      photo('b'),
      photo('c'),
    ]);
    expect(doc.frames.map((f) => f.photoId)).toEqual(['a', 'b']);
    expect(doc.tray).toEqual(['c']);
  });

  it('replaces the photo in a chosen frame (P-7)', () => {
    let doc = placePhotos(createDoc({ mode: 'collage', canvas: canvasSpec('4:5'), template: split }), [photo('a'), photo('b')]);
    doc = placePhotos(doc, [photo('z')], doc.frames[1].id);
    expect(doc.frames.map((f) => f.photoId)).toEqual(['a', 'z']);
    // The replaced photo is kept in the tray, never silently lost.
    expect(doc.tray).toEqual(['b']);
  });

  it('carries photos over when switching templates mid-edit (T-3)', () => {
    let doc = placePhotos(createDoc({ mode: 'collage', canvas: canvasSpec('4:5'), template: grid4 }), [
      photo('a'),
      photo('b'),
      photo('c'),
      photo('d'),
    ]);
    doc = applyTemplate(doc, split);
    expect(doc.frames.map((f) => f.photoId)).toEqual(['a', 'b']);
    expect(doc.tray).toEqual(['c', 'd']);
    doc = applyTemplate(doc, grid4);
    expect(doc.frames.map((f) => f.photoId)).toEqual(['a', 'b', 'c', 'd']);
    expect(doc.tray).toEqual([]);
  });

  it('swaps, removes and re-places photos (P-8, P-9)', () => {
    let doc = placePhotos(createDoc({ mode: 'collage', canvas: canvasSpec('4:5'), template: split }), [photo('a'), photo('b')]);
    const [f1, f2] = doc.frames;
    doc = swapPhotos(doc, f1.id, f2.id);
    expect(doc.frames.map((f) => f.photoId)).toEqual(['b', 'a']);
    doc = removePhoto(doc, f1.id);
    expect(doc.frames[0].photoId).toBeNull();
    expect(doc.tray).toEqual(['b']);
    doc = placeFromTray(doc, 'b');
    expect(doc.frames[0].photoId).toBe('b');
    expect(doc.tray).toEqual([]);
  });

  it('flips 2 × 3 grids to 3 × 2 on landscape canvases', () => {
    let doc = createDoc({ mode: 'collage', canvas: canvasSpec('4:5'), template: grid6 });
    expect(doc.frames[1].rect.x).toBeCloseTo(0.5);
    doc = setCanvas(doc, canvasSpec('1.91:1'), grid6);
    expect(doc.frames[1].rect.x).toBeCloseTo(1 / 3);
  });

  it('keeps frames at the same pixel position when the slide count changes (S-2)', () => {
    const tmpl = SEAMLESS_PRESETS.find((t) => t.slides === 3)!;
    let doc = createDoc({ mode: 'seamless', canvas: canvasSpec('3:4'), template: tmpl });
    expect(doc.slides).toBe(3);
    const firstPx = doc.frames[0].rect.w * 3 * 1080;
    doc = setSlides(doc, 6);
    expect(doc.frames[0].rect.w * 6 * 1080).toBeCloseTo(firstPx);
  });

  it('drops frames that fall off the end when slides are removed, keeping their photos', () => {
    const tmpl = SEAMLESS_PRESETS.find((t) => t.id === 'seam-3-hero')!;
    let doc = placePhotos(createDoc({ mode: 'seamless', canvas: canvasSpec('3:4'), template: tmpl }), [
      photo('a'),
      photo('b'),
      photo('c'),
      photo('d'),
    ]);
    doc = setSlides(doc, 2);
    expect(doc.frames).toHaveLength(1);
    expect(doc.tray).toEqual(['b', 'c', 'd']);
  });

  it('creates one frame per slide when photos land on a blank seamless canvas', () => {
    const doc = placePhotos(createDoc({ mode: 'seamless', canvas: canvasSpec('4:5'), slides: 3 }), [photo('a'), photo('b')]);
    expect(doc.frames).toHaveLength(2);
    expect(doc.frames.every((f) => f.free)).toBe(true);
  });

  it('reorders layers and deletes frames (S-7)', () => {
    let doc = createDoc({ mode: 'collage', canvas: canvasSpec('4:5'), template: split });
    const [a, b] = doc.frames;
    doc = moveLayer(doc, a.id, 1);
    expect(doc.frames.map((f) => f.id)).toEqual([b.id, a.id]);
    doc = deleteFrame(doc, a.id);
    expect(doc.frames).toHaveLength(1);
  });

  it('keeps the outer margin equal to the gap while linked (B-3)', () => {
    let doc = createDoc({ mode: 'collage', canvas: canvasSpec('4:5'), template: split });
    doc = setStyle(doc, { gap: 30 });
    expect(doc.style.margin).toBe(30);
    doc = setStyle(doc, { marginLinked: false, margin: 5 });
    doc = setStyle(doc, { gap: 40 });
    expect(doc.style.margin).toBe(5);
  });
});
