import { Group } from '@shopify/react-native-skia';
import React, { type ReactElement } from 'react';

import { docSize } from '@/core/canvas';
import type { CollageDoc } from '@/core/types';

import { Scene, type ImageMap } from './Scene';

export type RenderJob = { element: ReactElement; width: number; height: number };

/**
 * One job per output image. Seamless carousels are cut at exact slide
 * boundaries (1080 px, or 2160 px high-res) with no overlap or gap (S-11).
 */
export function sliceJobs(doc: CollageDoc, images: ImageMap, scale: number, placeholders = false): RenderJob[] {
  const { height } = docSize(doc);
  const slideW = doc.canvas.width;
  return Array.from({ length: doc.slides }, (_, i) => ({
    width: Math.round(slideW * scale),
    height: Math.round(height * scale),
    element: (
      <Group transform={[{ scale }, { translateX: -i * slideW }]}>
        <Group clip={{ x: i * slideW, y: 0, width: slideW, height }}>
          <Scene doc={doc} images={images} placeholders={placeholders} />
        </Group>
      </Group>
    ),
  }));
}

/** The whole drawing as one image (collage export, or full panorama, S-13). */
export function wholeJob(doc: CollageDoc, images: ImageMap, scale: number, placeholders = false): RenderJob {
  const { width, height } = docSize(doc);
  return {
    width: Math.round(width * scale),
    height: Math.round(height * scale),
    element: (
      <Group transform={[{ scale }]}>
        <Scene doc={doc} images={images} placeholders={placeholders} />
      </Group>
    ),
  };
}
