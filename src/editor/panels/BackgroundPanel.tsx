import { Canvas, LinearGradient, Rect, Shader, vec } from '@shopify/react-native-skia';
import React, { useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { GRADIENTS, SWATCHES, TEXTURES, gradientPoints, hexToRgb } from '@/core/backgrounds';
import { setStyle } from '@/core/doc';
import type { Background, TextureId } from '@/core/types';
import { TEXTURE_KIND, textureEffect } from '@/render/textures';
import { photoUri } from '@/services/files';
import { haptic } from '@/services/haptics';
import { useEditor } from '@/state/editorStore';
import { pickColor } from '@/ui/ColorPicker';
import { Segmented, SliderRow } from '@/ui/controls';
import { Icon } from '@/ui/Icon';
import { radius, space, useTheme } from '@/ui/theme';

type Tab = 'color' | 'gradient' | 'texture' | 'photo';

const TILE = 52;

/** Solid colors, gradients, minimalist textures and blurred photos (B-6 – B-9). */
export function BackgroundPanel() {
  const t = useTheme();
  const doc = useEditor((s) => s.doc);
  const [tab, setTab] = useState<Tab>(() => {
    const kind = doc?.style.background.kind;
    return kind === 'gradient' || kind === 'texture' || kind === 'photo' ? kind : 'color';
  });
  if (!doc) return null;
  const bg = doc.style.background;
  const { commit, checkpoint, live, endCheckpoint } = useEditor.getState();

  const set = (background: Background) => {
    haptic('select');
    commit((d) => setStyle(d, { background }));
  };
  const baseColor = bg.kind === 'solid' || bg.kind === 'texture' ? bg.color : '#FFFFFF';
  const gradient = bg.kind === 'gradient' ? bg : null;

  const customColor = async () => {
    const hex = await pickColor(baseColor);
    if (hex) set(bg.kind === 'texture' ? { ...bg, color: hex } : { kind: 'solid', color: hex });
  };

  const editGradientColor = async (which: 'from' | 'to') => {
    if (!gradient) return;
    const hex = await pickColor(gradient[which], which === 'from' ? 'Start color' : 'End color');
    if (hex) set({ ...gradient, [which]: hex });
  };

  const photoIds = Array.from(new Set(doc.frames.map((f) => f.photoId).filter(Boolean) as string[]));

  return (
    <View style={styles.wrap}>
      <View style={styles.tabs}>
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'color', label: 'Color' },
            { value: 'gradient', label: 'Gradient' },
            { value: 'texture', label: 'Texture' },
            { value: 'photo', label: 'Photo' },
          ]}
        />
      </View>

      {tab === 'color' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          <Pressable
            onPress={customColor}
            accessibilityRole="button"
            accessibilityLabel="Custom color"
            style={[styles.swatch, styles.custom, { borderColor: t.border, backgroundColor: t.surface }]}
          >
            <Icon name="custom" size={20} color={t.text} />
          </Pressable>
          {SWATCHES.map((s) => {
            const selected = bg.kind === 'solid' && bg.color.toUpperCase() === s.color.toUpperCase();
            return (
              <Pressable
                key={s.color}
                onPress={() => set({ kind: 'solid', color: s.color })}
                accessibilityRole="button"
                accessibilityLabel={s.name}
                accessibilityState={{ selected }}
                style={[
                  styles.swatch,
                  { backgroundColor: s.color, borderColor: selected ? t.accent : t.border, borderWidth: selected ? 3 : 1 },
                ]}
              />
            );
          })}
        </ScrollView>
      )}

      {tab === 'gradient' && (
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
            {GRADIENTS.map((g) => {
              const selected = !!gradient && gradient.from === g.from && gradient.to === g.to;
              return (
                <Pressable
                  key={g.name}
                  onPress={() => set({ kind: 'gradient', from: g.from, to: g.to, angle: g.angle })}
                  accessibilityRole="button"
                  accessibilityLabel={`${g.name} gradient`}
                  accessibilityState={{ selected }}
                  style={[styles.tile, { borderColor: selected ? t.accent : t.border, borderWidth: selected ? 3 : 1 }]}
                >
                  <GradientSwatch from={g.from} to={g.to} angle={g.angle} />
                </Pressable>
              );
            })}
          </ScrollView>
          {gradient ? (
            <View style={styles.builder}>
              <Pressable
                onPress={() => editGradientColor('from')}
                accessibilityRole="button"
                accessibilityLabel="Start color"
                style={[styles.colorDot, { backgroundColor: gradient.from, borderColor: t.border }]}
              />
              <Pressable
                onPress={() => editGradientColor('to')}
                accessibilityRole="button"
                accessibilityLabel="End color"
                style={[styles.colorDot, { backgroundColor: gradient.to, borderColor: t.border }]}
              />
              <View style={styles.flex}>
                <SliderRow
                  label="Angle"
                  unit="°"
                  value={gradient.angle}
                  min={0}
                  max={360}
                  onStart={checkpoint}
                  onChange={(angle) => live((d) => setStyle(d, { background: { ...gradient, angle } }))}
                  onEnd={endCheckpoint}
                />
              </View>
            </View>
          ) : (
            <Text style={[styles.hint, { color: t.textDim }]}>Pick a gradient to customize its colors and angle.</Text>
          )}
        </View>
      )}

      {tab === 'texture' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {TEXTURES.map((tx) => {
            const selected = bg.kind === 'texture' && bg.texture === tx.id;
            return (
              <Pressable
                key={tx.id}
                onPress={() => set({ kind: 'texture', texture: tx.id, color: baseColor })}
                accessibilityRole="button"
                accessibilityLabel={tx.name}
                accessibilityState={{ selected }}
                style={styles.labeled}
              >
                <View style={[styles.tile, { borderColor: selected ? t.accent : t.border, borderWidth: selected ? 3 : 1 }]}>
                  <TextureSwatch texture={tx.id} color={baseColor} />
                </View>
                <Text style={[styles.tileLabel, { color: t.textDim }]} numberOfLines={1}>
                  {tx.name}
                </Text>
              </Pressable>
            );
          })}
          <Pressable onPress={customColor} accessibilityRole="button" accessibilityLabel="Texture color" style={styles.labeled}>
            <View style={[styles.tile, styles.custom, { borderColor: t.border, backgroundColor: baseColor }]}>
              <Icon name="custom" size={18} color="#555" />
            </View>
            <Text style={[styles.tileLabel, { color: t.textDim }]}>Color</Text>
          </Pressable>
        </ScrollView>
      )}

      {tab === 'photo' &&
        (photoIds.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
            {photoIds.map((id) => {
              const p = doc.photos[id];
              if (!p) return null;
              const selected = bg.kind === 'photo' && bg.photoId === id;
              return (
                <Pressable
                  key={id}
                  onPress={() => set({ kind: 'photo', photoId: id })}
                  accessibilityRole="button"
                  accessibilityLabel="Use this photo, blurred, as the background"
                  accessibilityState={{ selected }}
                  style={[styles.tile, { borderColor: selected ? t.accent : t.border, borderWidth: selected ? 3 : 1 }]}
                >
                  <Image source={{ uri: photoUri(p.preview) }} style={styles.photo} blurRadius={6} />
                </Pressable>
              );
            })}
          </ScrollView>
        ) : (
          <Text style={[styles.hint, { color: t.textDim }]}>Add photos to use one as a blurred background.</Text>
        ))}
    </View>
  );
}

function GradientSwatch({ from, to, angle }: { from: string; to: string; angle: number }) {
  const { start, end } = gradientPoints(TILE, TILE, angle);
  return (
    <Canvas style={styles.swatchCanvas}>
      <Rect x={0} y={0} width={TILE} height={TILE}>
        <LinearGradient start={vec(start.x, start.y)} end={vec(end.x, end.y)} colors={[from, to]} />
      </Rect>
    </Canvas>
  );
}

function TextureSwatch({ texture, color }: { texture: TextureId; color: string }) {
  const effect = textureEffect();
  const { r, g, b } = hexToRgb(color);
  if (!effect) return <View style={[styles.swatchCanvas, { backgroundColor: color }]} />;
  return (
    <Canvas style={styles.swatchCanvas}>
      <Rect x={0} y={0} width={TILE} height={TILE}>
        {/* Shown at roughly the scale it has on a phone-sized canvas preview. */}
        <Shader source={effect} uniforms={{ unit: 0.4, base: [r / 255, g / 255, b / 255, 1], kind: TEXTURE_KIND[texture] }} />
      </Rect>
    </Canvas>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: space.sm },
  flex: { flex: 1 },
  tabs: { paddingHorizontal: space.lg, marginBottom: space.md },
  row: { gap: space.sm, paddingHorizontal: space.lg, alignItems: 'flex-start' },
  swatch: { width: 40, height: 40, borderRadius: 20 },
  custom: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  tile: { width: TILE, height: TILE, borderRadius: radius.sm, overflow: 'hidden' },
  swatchCanvas: { width: TILE, height: TILE },
  labeled: { alignItems: 'center', width: TILE + 10 },
  tileLabel: { fontSize: 11, marginTop: 4 },
  photo: { width: '100%', height: '100%' },
  builder: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, marginTop: space.md },
  colorDot: { width: 34, height: 34, borderRadius: 17, borderWidth: 1 },
  hint: { paddingHorizontal: space.lg, fontSize: 14 },
});
