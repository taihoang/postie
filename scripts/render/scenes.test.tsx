/**
 * Visual check: renders sample collages with the real Scene code through
 * CanvasKit and writes PNGs to $RENDER_OUT (default ./render-out).
 * Run with `npm run render:check`, then look at the images.
 */
import fs from 'fs';
import path from 'path';

import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/commonjs/web/LoadSkiaWeb';
import { Circle, Group, Rect, Skia, type SkImage } from '@shopify/react-native-skia';
import { drawOffscreen, makeOffscreenSurface } from '@shopify/react-native-skia/lib/commonjs/headless';
import React from 'react';

import { canvasSpec } from '@/core/canvas';
import { applyTemplate, createDoc, placePhotos, setStyle, updateFrame } from '@/core/doc';
import { flipCrop, rotateCrop } from '@/core/geometry';
import { COLLAGE_PRESETS, SEAMLESS_PRESETS } from '@/core/templates';
import type { CollageDoc, PhotoAsset, TextureId } from '@/core/types';
import { sliceJobs, wholeJob, type RenderJob } from '@/render/exportScene';
import { textureEffect } from '@/render/textures';

const OUT = process.env.RENDER_OUT ?? path.join(__dirname, '../../render-out');

async function render(job: RenderJob): Promise<SkImage> {
  const surface = makeOffscreenSurface(job.width, job.height);
  return drawOffscreen(surface, job.element);
}

function save(name: string, image: SkImage) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(image.encodeToBytes()));
}

/**
 * A synthetic "photo" with an asymmetric marker so rotation and flips are
 * visible: red square top-left, blue bar along the bottom, a "head" right of center.
 */
async function fakePhoto(w: number, h: number, sky: string): Promise<SkImage> {
  const surface = makeOffscreenSurface(w, h);
  return drawOffscreen(
    surface,
    <Group>
      <Rect x={0} y={0} width={w} height={h} color={sky} />
      <Rect x={0} y={h * 0.65} width={w} height={h * 0.35} color="#6B8E5A" />
      <Rect x={w * 0.04} y={h * 0.05} width={w * 0.14} height={w * 0.14} color="#E53935" />
      <Rect x={0} y={h * 0.92} width={w} height={h * 0.08} color="#1E40AF" />
      <Circle cx={w * 0.62} cy={h * 0.42} r={Math.min(w, h) * 0.12} color="#F2C29B" />
      <Rect x={w * 0.62 - w * 0.08} y={h * 0.54} width={w * 0.16} height={h * 0.3} color="#37474F" />
    </Group>,
  );
}

const photo = (id: string, w: number, h: number): PhotoAsset => ({ id, file: `${id}.jpg`, preview: `${id}.jpg`, width: w, height: h });

describe('render check', () => {
  let images: Record<string, SkImage>;
  const photos = [photo('a', 1200, 900), photo('b', 900, 1200), photo('c', 1200, 900), photo('d', 1000, 1000), photo('e', 1600, 900)];

  beforeAll(async () => {
    await LoadSkiaWeb();
    images = {
      a: await fakePhoto(1200, 900, '#90CAF9'),
      b: await fakePhoto(900, 1200, '#FFCC80'),
      c: await fakePhoto(1200, 900, '#CE93D8'),
      d: await fakePhoto(1000, 1000, '#80CBC4'),
      e: await fakePhoto(1600, 900, '#FFAB91'),
    };
  });

  it('compiles the texture shader', () => {
    expect(Skia.RuntimeEffect.Make).toBeDefined();
    expect(textureEffect()).not.toBeNull();
  });

  it('renders a default 4:5 grid', async () => {
    const tmpl = COLLAGE_PRESETS.find((t) => t.id === 'grid-4')!;
    const doc = placePhotos(createDoc({ mode: 'collage', canvas: canvasSpec('4:5'), template: tmpl }), photos.slice(0, 4));
    const img = await render(wholeJob(doc, images, 1));
    expect(img.width()).toBe(1080);
    expect(img.height()).toBe(1350);
    save('01-grid4-default', img);
  });

  it('renders rotation, flip, zoom, rounded corners and a gradient', async () => {
    const tmpl = COLLAGE_PRESETS.find((t) => t.id === 'feature-3')!;
    let doc = placePhotos(createDoc({ mode: 'collage', canvas: canvasSpec('3:4'), template: tmpl }), photos.slice(0, 4));
    const [f0, f1, f2, f3] = doc.frames;
    doc = updateFrame(doc, f1.id, { crop: rotateCrop(f1.crop) });
    doc = updateFrame(doc, f2.id, { crop: flipCrop(f2.crop) });
    doc = updateFrame(doc, f3.id, { crop: { ...f3.crop, scale: 2.5, fx: 0.62, fy: 0.42 } });
    doc = updateFrame(doc, f0.id, { crop: { ...f0.crop, fx: 0.9 } });
    doc = setStyle(doc, { gap: 24, radius: 30, background: { kind: 'gradient', from: '#FFD3A5', to: '#FD6585', angle: 135 } });
    save('02-feature3-styled', await render(wholeJob(doc, images, 1)));
    // Same collage at 2× must keep the composition.
    const hi = await render(wholeJob(doc, images, 2));
    expect(hi.width()).toBe(2160);
    save('03-feature3-highres', hi);
  });

  it('renders every texture on light and dark colors', async () => {
    jest.setTimeout(240000);
    const tmpl = COLLAGE_PRESETS.find((t) => t.id === 'split-v')!;
    const textures: TextureId[] = ['paper', 'linen', 'dots', 'grid', 'terrazzo', 'film'];
    for (const texture of textures) {
      for (const color of ['#F7F4EE', '#2F2F33']) {
        let doc = placePhotos(createDoc({ mode: 'collage', canvas: canvasSpec('1:1'), template: tmpl }), photos.slice(0, 1));
        doc = setStyle(doc, { gap: 60, margin: 80, marginLinked: false, background: { kind: 'texture', texture, color } });
        // Half size: CanvasKit shades on the CPU here, unlike the GPU on a phone.
        save(`04-texture-${texture}-${color.slice(1)}`, await render(wholeJob(doc, images, 0.5)));
      }
    }
  });

  it('slices a seamless carousel at exact slide boundaries', async () => {
    const tmpl = SEAMLESS_PRESETS.find((t) => t.id === 'seam-3-hero')!;
    let doc = placePhotos(createDoc({ mode: 'seamless', canvas: canvasSpec('3:4'), template: tmpl }), photos);
    doc = setStyle(doc, { background: { kind: 'gradient', from: '#A1C4FD', to: '#C2E9FB', angle: 0 } });
    const whole = await render(wholeJob(doc, images, 1));
    expect(whole.width()).toBe(3240);
    save('05-seamless-panorama', whole);
    const slices = sliceJobs(doc, images, 1);
    expect(slices).toHaveLength(3);
    for (let i = 0; i < slices.length; i++) {
      const img = await render(slices[i]);
      expect(img.width()).toBe(1080);
      save(`06-seamless-slide-${i + 1}`, img);
      // Pixel continuity: the slice's first column equals the panorama column at the seam.
      const fromSlice = img.readPixels(0, 700, { width: 1, height: 1, alphaType: 3, colorType: 4 }) as Uint8Array;
      const fromWhole = whole.readPixels(i * 1080, 700, { width: 1, height: 1, alphaType: 3, colorType: 4 }) as Uint8Array;
      expect(Array.from(fromSlice)).toEqual(Array.from(fromWhole));
    }
  });

  it('renders a blurred photo background and empty placeholders', async () => {
    const tmpl = COLLAGE_PRESETS.find((t) => t.id === 'mosaic-5')!;
    let doc: CollageDoc = placePhotos(createDoc({ mode: 'collage', canvas: canvasSpec('9:16'), template: tmpl }), photos.slice(0, 3));
    doc = setStyle(doc, { gap: 30, radius: 18, background: { kind: 'photo', photoId: 'e' } });
    doc = { ...doc, photos: { ...doc.photos, e: photos[4] } };
    save('07-mosaic-photo-bg', await render(wholeJob(doc, images, 1, true)));
  });

  it('flips grid-6 to 3 × 2 on landscape', async () => {
    const tmpl = COLLAGE_PRESETS.find((t) => t.id === 'grid-6')!;
    let doc = placePhotos(createDoc({ mode: 'collage', canvas: canvasSpec('1.91:1'), template: tmpl }), photos);
    doc = applyTemplate(doc, tmpl);
    const img = await render(wholeJob(doc, images, 1, true));
    expect(img.height()).toBe(566);
    save('08-grid6-landscape', img);
  });
});
