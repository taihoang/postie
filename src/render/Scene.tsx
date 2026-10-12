import { Group, Image, Line, Rect, vec, type SkImage } from '@shopify/react-native-skia';
import React from 'react';

import { docSize, layoutParams, unitFor } from '@/core/canvas';
import { frameBox, frameRadius, imageTransform, type LayoutParams } from '@/core/geometry';
import type { CollageDoc, Frame, PhotoAsset, PRect } from '@/core/types';

import { BackgroundLayer } from './Background';

export type ImageMap = Record<string, SkImage | null | undefined>;

export const PLACEHOLDER_FILL = '#E6E6EB';
export const PLACEHOLDER_INK = '#9E9EA6';

/** "+" mark shown in empty frames (P-10). */
export function PlusMark({ box, unit }: { box: PRect; unit: number }) {
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const arm = Math.min(28 * unit, box.width / 5, box.height / 5);
  const stroke = Math.max(2, 5 * unit);
  return (
    <Group>
      <Line p1={vec(cx - arm, cy)} p2={vec(cx + arm, cy)} color={PLACEHOLDER_INK} strokeWidth={stroke} strokeCap="round" />
      <Line p1={vec(cx, cy - arm)} p2={vec(cx, cy + arm)} color={PLACEHOLDER_INK} strokeWidth={stroke} strokeCap="round" />
    </Group>
  );
}

type FrameProps = {
  frame: Frame;
  L: LayoutParams;
  unit: number;
  photo?: PhotoAsset;
  image?: SkImage | null;
  placeholder: boolean;
};

/** One frame with its photo, clipped to the rounded frame box. */
export function StaticFrame({ frame, L, unit, photo, image, placeholder }: FrameProps) {
  const box = frameBox(frame.rect, L, !!frame.free);
  const r = frameRadius(box, L.radius);
  const clip = { rect: box, rx: r, ry: r };
  if (photo && image) {
    return (
      <Group clip={clip}>
        <Group transform={imageTransform(box, photo.width, photo.height, frame.crop)}>
          <Image image={image} x={0} y={0} width={photo.width} height={photo.height} fit="fill" />
        </Group>
      </Group>
    );
  }
  if (!placeholder) return null;
  return (
    <Group clip={clip}>
      <Rect rect={box} color={PLACEHOLDER_FILL} />
      <PlusMark box={box} unit={unit} />
    </Group>
  );
}

type SceneProps = {
  doc: CollageDoc;
  images: ImageMap;
  /** Grey "+" frames for previews; exports leave empty frames blank. */
  placeholders?: boolean;
};

/** The whole collage in canvas px, with no editor overlays. Used for export and previews. */
export function Scene({ doc, images, placeholders = false }: SceneProps) {
  const { width, height } = docSize(doc);
  const unit = unitFor(doc.canvas);
  const L = layoutParams(doc);
  return (
    <Group>
      <BackgroundLayer background={doc.style.background} width={width} height={height} unit={unit} images={images} />
      {doc.frames.map((f) => (
        <StaticFrame
          key={f.id}
          frame={f}
          L={L}
          unit={unit}
          photo={f.photoId ? doc.photos[f.photoId] : undefined}
          image={f.photoId ? images[f.photoId] : undefined}
          placeholder={placeholders}
        />
      ))}
    </Group>
  );
}
