import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { FRect } from '@/core/types';

import { radius, useTheme } from './theme';

type Props = {
  cells: FRect[];
  /** Width / height of the whole drawing. */
  aspect: number;
  height: number;
  label?: string;
  selected?: boolean;
  slides?: number;
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityLabel: string;
};

/** Live template preview drawn with plain views (T-1); cheap enough for long lists. */
export function TemplateThumb({ cells, aspect, height, label, selected, slides = 1, onPress, onLongPress, accessibilityLabel }: Props) {
  const t = useTheme();
  const width = height * aspect;
  const gap = Math.max(1.5, height * 0.018);
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.wrap, { opacity: pressed ? 0.6 : 1 }]}
    >
      <View
        style={[
          styles.card,
          {
            width,
            height,
            backgroundColor: '#FFFFFF',
            borderColor: selected ? t.accent : t.border,
            borderWidth: selected ? 2.5 : StyleSheet.hairlineWidth,
          },
        ]}
      >
        {cells.map((c, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: c.x * (width - gap) + gap,
              top: c.y * (height - gap) + gap,
              width: Math.max(1, c.w * (width - gap) - gap),
              height: Math.max(1, c.h * (height - gap) - gap),
              backgroundColor: '#D5D5DC',
              borderRadius: 1.5,
            }}
          />
        ))}
        {slides > 1 &&
          Array.from({ length: slides - 1 }, (_, i) => (
            <View key={`s${i}`} style={[styles.seam, { left: ((i + 1) / slides) * width - 0.5 }]} />
          ))}
      </View>
      {label ? (
        <Text style={[styles.label, { color: selected ? t.accent : t.textDim }]} numberOfLines={1}>
          {label}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  card: { borderRadius: radius.sm - 2, overflow: 'hidden' },
  seam: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: 'rgba(60,60,67,0.45)' },
  label: { fontSize: 12, marginTop: 5, fontWeight: '500', maxWidth: 110 },
});
