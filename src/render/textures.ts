import { Skia, type SkRuntimeEffect } from '@shopify/react-native-skia';

import type { TextureId } from '@/core/types';

/**
 * Minimalist backgrounds (B-8), drawn procedurally so every texture is
 * original and resolution independent. Coordinates are divided by `unit`
 * (canvas px per 1080-base px), so a high-res export looks identical.
 */
export const TEXTURE_SKSL = `
uniform float unit;
uniform float4 base;
uniform float kind;

float hash(float2 p) {
  p = fract(p * float2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float vnoise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  float2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + float2(1.0, 0.0));
  float c = hash(i + float2(0.0, 1.0));
  float d = hash(i + float2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(float2 p) {
  float v = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 4; i++) {
    v += amp * vnoise(p);
    p *= 2.0;
    amp *= 0.5;
  }
  return v;
}

half4 main(float2 pos) {
  float2 p = pos / unit;
  float3 col = base.rgb;
  float lum = dot(col, float3(0.299, 0.587, 0.114));
  // Marks darken light colors and lighten dark ones so they stay visible.
  float dir = lum < 0.35 ? -1.0 : 1.0;
  float shade = 0.0;

  if (kind < 0.5) {
    // Paper grain: soft fibers plus fine tooth.
    shade = (fbm(p * 0.02) - 0.5) * 0.10 + (vnoise(p * 0.9) - 0.5) * 0.06;
  } else if (kind < 1.5) {
    // Linen: irregular warp and weft threads.
    float wx = sin(p.x * 1.9 + vnoise(p * 0.15) * 3.0);
    float wy = sin(p.y * 1.9 + vnoise(p.yx * 0.15) * 3.0);
    shade = (wx + wy) * 0.018
      + (vnoise(p * float2(0.08, 1.2)) - 0.5) * 0.05
      + (vnoise(p * float2(1.2, 0.08)) - 0.5) * 0.05;
  } else if (kind < 2.5) {
    // Soft dots on a 36 px grid.
    float2 cell = fract(p / 36.0) - 0.5;
    float d = length(cell) * 36.0;
    shade = -0.10 * (1.0 - smoothstep(3.0, 5.0, d));
  } else if (kind < 3.5) {
    // Thin grid, 40 px squares.
    float2 g = abs(fract(p / 40.0 + 0.5) - 0.5) * 40.0;
    float line = 1.0 - smoothstep(0.4, 1.4, min(g.x, g.y));
    shade = -0.09 * line;
  } else if (kind < 4.5) {
    // Terrazzo: scattered irregular chips in three muted tones.
    float2 cellId = floor(p / 70.0);
    float chip = 0.0;
    float3 chipCol = col;
    for (int j = -1; j <= 1; j++) {
      for (int i = -1; i <= 1; i++) {
        float2 id = cellId + float2(float(i), float(j));
        float2 c = (id + float2(hash(id), hash(id + 7.1))) * 70.0;
        float r = 6.0 + hash(id + 3.3) * 14.0;
        float d = length(p - c) + (vnoise(p * 0.12 + id) - 0.5) * 8.0;
        if (d < r) {
          float h = hash(id + 11.7);
          chipCol = h < 0.33 ? float3(0.86, 0.55, 0.47) : (h < 0.66 ? float3(0.55, 0.62, 0.55) : float3(0.35, 0.35, 0.38));
          chip = 1.0;
        }
      }
    }
    col = mix(col, mix(col, chipCol, 0.55), chip);
    shade = (vnoise(p * 0.8) - 0.5) * 0.03;
  } else {
    // Film grain.
    shade = (vnoise(p * 1.4) - 0.5) * 0.16;
  }

  col = clamp(col + shade * dir, 0.0, 1.0);
  return half4(half3(col), 1.0);
}
`;

export const TEXTURE_KIND: Record<TextureId, number> = {
  paper: 0,
  linen: 1,
  dots: 2,
  grid: 3,
  terrazzo: 4,
  film: 5,
};

let effect: SkRuntimeEffect | null | undefined;

export function textureEffect(): SkRuntimeEffect | null {
  if (effect === undefined) {
    effect = Skia.RuntimeEffect.Make(TEXTURE_SKSL);
    if (!effect) console.warn('Texture shader failed to compile');
  }
  return effect;
}
