import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { CANVAS_PRESETS, canvasSpec, presetFor } from '@/core/canvas';
import type { CanvasSizeId, CanvasSpec } from '@/core/types';
import { haptic } from '@/services/haptics';

import { Chip } from './controls';
import { prompt, toast } from './overlays';
import { space } from './theme';

/**
 * Canvas size chips (C-1, C-2). Each shows its ratio and where it fits;
 * "Custom" asks for a width × height in pixels.
 */
export function CanvasSizeChips({
  value,
  onChange,
  only,
  allowCustom = true,
}: {
  value: CanvasSpec;
  onChange: (c: CanvasSpec) => void;
  only?: CanvasSizeId[];
  allowCustom?: boolean;
}) {
  const presets = only ? CANVAS_PRESETS.filter((p) => only.includes(p.id)) : CANVAS_PRESETS;

  const pickCustom = async () => {
    const input = await prompt({
      title: 'Custom size',
      message: 'Width × height in pixels, e.g. 1200 x 900',
      initial: value.id === 'custom' ? `${value.width} x ${value.height}` : '',
      placeholder: '1200 x 900',
      confirmLabel: 'Use size',
    });
    if (!input) return;
    const m = input.match(/(\d+)\s*[x×*,\s]\s*(\d+)/i);
    if (!m) {
      toast('Enter a size like 1200 x 900');
      return;
    }
    haptic('select');
    onChange(canvasSpec('custom', { width: Number(m[1]), height: Number(m[2]) }));
  };

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {presets.map((p) => (
        <Chip
          key={p.id}
          label={p.ratioLabel}
          sublabel={p.where}
          selected={value.id === p.id}
          accessibilityLabel={`${p.name}, ${p.ratioLabel}, ${p.width} by ${p.height}, ${p.where}`}
          onPress={() => {
            if (value.id !== p.id) haptic('select');
            onChange(canvasSpec(p.id));
          }}
        />
      ))}
      {allowCustom && (
        <Chip
          label={value.id === 'custom' ? `${value.width}×${value.height}` : 'Custom'}
          sublabel="W × H"
          selected={value.id === 'custom'}
          onPress={pickCustom}
        />
      )}
    </ScrollView>
  );
}

export function canvasLabel(c: CanvasSpec): string {
  return presetFor(c.id)?.ratioLabel ?? `${c.width}×${c.height}`;
}

const styles = StyleSheet.create({
  row: { gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.xs },
});
