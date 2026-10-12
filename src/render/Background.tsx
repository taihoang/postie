import { Blur, Group, Image, LinearGradient, Rect, Shader, vec, type SkImage } from '@shopify/react-native-skia';
import React from 'react';

import { gradientPoints, hexToRgb } from '@/core/backgrounds';
import type { Background } from '@/core/types';

import { TEXTURE_KIND, textureEffect } from './textures';

type Props = {
  background: Background;
  width: number;
  height: number;
  /** Canvas px per 1080-base px. */
  unit: number;
  images: Record<string, SkImage | null | undefined>;
};

/**
 * The space behind the frames: solid color, gradient, texture or a blurred
 * photo (B-6 – B-9). Drawn once across the whole canvas so seamless
 * carousels flow from slide to slide (S-10).
 */
export function BackgroundLayer({ background, width, height, unit, images }: Props) {
  switch (background.kind) {
    case 'solid':
      return <Rect x={0} y={0} width={width} height={height} color={background.color} />;

    case 'gradient': {
      const { start, end } = gradientPoints(width, height, background.angle);
      return (
        <Rect x={0} y={0} width={width} height={height}>
          <LinearGradient start={vec(start.x, start.y)} end={vec(end.x, end.y)} colors={[background.from, background.to]} />
        </Rect>
      );
    }

    case 'texture': {
      const effect = textureEffect();
      if (!effect) return <Rect x={0} y={0} width={width} height={height} color={background.color} />;
      const { r, g, b } = hexToRgb(background.color);
      return (
        <Rect x={0} y={0} width={width} height={height}>
          <Shader
            source={effect}
            uniforms={{ unit, base: [r / 255, g / 255, b / 255, 1], kind: TEXTURE_KIND[background.texture] }}
          />
        </Rect>
      );
    }

    case 'photo': {
      const image = images[background.photoId];
      if (!image) return <Rect x={0} y={0} width={width} height={height} color="#FFFFFF" />;
      return (
        <Group clip={{ x: 0, y: 0, width, height }}>
          <Image image={image} x={0} y={0} width={width} height={height} fit="cover">
            <Blur blur={36 * unit} mode="clamp" />
          </Image>
          <Rect x={0} y={0} width={width} height={height} color="rgba(255,255,255,0.10)" />
        </Group>
      );
    }
  }
}
