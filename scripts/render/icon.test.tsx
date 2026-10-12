/**
 * Generates Postie's original app icon set (A-10) with Skia.
 * Run: GENERATE_ICONS=1 npm run render:check -- icon
 * Then flatten icon.png (App Store icons must be opaque, without alpha).
 */
import fs from 'fs';
import path from 'path';

import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/commonjs/web/LoadSkiaWeb';
import { Group, LinearGradient, Rect, RoundedRect, Shadow, vec, type SkImage } from '@shopify/react-native-skia';
import { drawOffscreen, makeOffscreenSurface } from '@shopify/react-native-skia/lib/commonjs/headless';
import React from 'react';

const ASSETS = path.join(__dirname, '../../assets');
const run = process.env.GENERATE_ICONS === '1' ? it : it.skip;

const CORAL_TOP = '#F46A4E';
const CORAL_BOTTOM = '#D23C25';

/** A white card holding a three-photo collage, tilted slightly like a postcard. */
function Card({ size, cx, cy, mono = false }: { size: number; cx: number; cy: number; mono?: boolean }) {
  const w = size;
  const h = size * 1.2;
  const x = cx - w / 2;
  const y = cy - h / 2;
  const pad = w * 0.075;
  const gap = w * 0.05;
  const inner = { x: x + pad, y: y + pad, w: w - 2 * pad, h: h - 2 * pad };
  const leftW = (inner.w - gap) * 0.58;
  const rightW = inner.w - gap - leftW;
  const halfH = (inner.h - gap) / 2;
  const r = w * 0.035;
  const photo = (color: string) => (mono ? '#000000' : color);
  return (
    <Group transform={[{ rotate: -0.07 }]} origin={vec(cx, cy)}>
      <RoundedRect x={x} y={y} width={w} height={h} r={w * 0.06} color="#FFFFFF">
        {!mono && <Shadow dx={0} dy={size * 0.03} blur={size * 0.06} color="rgba(80,10,0,0.35)" />}
      </RoundedRect>
      <RoundedRect x={inner.x} y={inner.y} width={leftW} height={inner.h} r={r}>
        <LinearGradient start={vec(inner.x, inner.y)} end={vec(inner.x, inner.y + inner.h)} colors={[photo('#8EC5FC'), photo('#4F8BE0')]} />
      </RoundedRect>
      <RoundedRect x={inner.x + leftW + gap} y={inner.y} width={rightW} height={halfH} r={r}>
        <LinearGradient start={vec(0, inner.y)} end={vec(0, inner.y + halfH)} colors={[photo('#FFD3A5'), photo('#F7A072')]} />
      </RoundedRect>
      <RoundedRect x={inner.x + leftW + gap} y={inner.y + halfH + gap} width={rightW} height={halfH} r={r}>
        <LinearGradient start={vec(0, inner.y + halfH)} end={vec(0, inner.y + inner.h)} colors={[photo('#C9E4B4'), photo('#7FB77E')]} />
      </RoundedRect>
    </Group>
  );
}

async function draw(size: number, el: React.ReactElement): Promise<SkImage> {
  return drawOffscreen(makeOffscreenSurface(size, size), el);
}

function save(name: string, img: SkImage) {
  fs.writeFileSync(path.join(ASSETS, name), Buffer.from(img.encodeToBytes()));
}

const Background = ({ size }: { size: number }) => (
  <Rect x={0} y={0} width={size} height={size}>
    <LinearGradient start={vec(0, 0)} end={vec(0, size)} colors={[CORAL_TOP, CORAL_BOTTOM]} />
  </Rect>
);

describe('icons', () => {
  beforeAll(async () => {
    await LoadSkiaWeb();
  });

  run('writes the icon set', async () => {
    const S = 1024;
    // iOS: opaque, full bleed; the system applies the rounded mask.
    save('icon.png', await draw(S, <Group><Background size={S} /><Card size={S * 0.5} cx={S / 2} cy={S / 2} /></Group>));
    // Splash: the card alone on a transparent canvas.
    save('splash-icon.png', await draw(S, <Card size={S * 0.62} cx={S / 2} cy={S / 2} />));
    // Android adaptive icon: content inside the central safe zone.
    save('android-icon-background.png', await draw(S, <Background size={S} />));
    save('android-icon-foreground.png', await draw(S, <Card size={S * 0.36} cx={S / 2} cy={S / 2} />));
    save('android-icon-monochrome.png', await draw(S, <Card size={S * 0.36} cx={S / 2} cy={S / 2} mono />));
    save('favicon.png', await draw(48, <Group><Background size={48} /><Card size={24} cx={24} cy={24} /></Group>));
  });
});
