import Slider from '@react-native-community/slider';
import React, { useRef } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { haptic } from '@/services/haptics';

import { Icon, type IconName } from './Icon';
import { radius, space, useTheme } from './theme';

export function IconButton({
  icon,
  label,
  onPress,
  disabled,
  active,
  size = 22,
  showLabel = false,
  style,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  active?: boolean;
  size?: number;
  showLabel?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const color = disabled ? t.textDim : active ? t.accent : t.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled, selected: active }}
      hitSlop={8}
      style={({ pressed }) => [styles.iconButton, { opacity: pressed ? 0.5 : disabled ? 0.4 : 1 }, style]}
    >
      <Icon name={icon} size={size} color={color} />
      {showLabel && (
        <Text style={[styles.iconLabel, { color }]} numberOfLines={1}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function Button({
  title,
  onPress,
  kind = 'primary',
  icon,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  kind?: 'primary' | 'secondary' | 'plain';
  icon?: IconName;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const bg = kind === 'primary' ? t.accent : kind === 'secondary' ? t.surface2 : 'transparent';
  const fg = kind === 'primary' ? t.onAccent : kind === 'secondary' ? t.text : t.accent;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled }}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.75 : 1 },
        style,
      ]}
    >
      {icon && <Icon name={icon} size={18} color={fg} />}
      <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
    </Pressable>
  );
}

export function Chip({
  label,
  sublabel,
  selected,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  sublabel?: string;
  selected: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? [label, sublabel].filter(Boolean).join(', ')}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        {
          backgroundColor: selected ? t.text : t.surface,
          borderColor: selected ? t.text : t.border,
          opacity: pressed ? 0.7 : 1,
        },
      ]}
    >
      <Text style={[styles.chipLabel, { color: selected ? t.bg : t.text }]}>{label}</Text>
      {sublabel ? <Text style={[styles.chipSub, { color: selected ? t.bg : t.textDim }]}>{sublabel}</Text> : null}
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const t = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: t.surface2 }]} accessibilityRole="tablist">
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => {
              if (!selected) haptic('select');
              onChange(o.value);
            }}
            style={[styles.segment, selected && { backgroundColor: t.bg }]}
          >
            <Text style={[styles.segmentText, { color: selected ? t.text : t.textDim }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Labeled slider with a numeric readout (B-5). Uses the native slider, which
 * VoiceOver can adjust with swipes (N-6).
 */
export function SliderRow({
  label,
  value,
  min,
  max,
  unit = 'px',
  onStart,
  onChange,
  onEnd,
  right,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onStart?: () => void;
  onChange: (v: number) => void;
  onEnd?: (v: number) => void;
  right?: React.ReactNode;
}) {
  const t = useTheme();
  const dragging = useRef(false);
  return (
    <View style={styles.sliderRow}>
      <View style={styles.sliderHeader}>
        <Text style={[styles.sliderLabel, { color: t.text }]}>{label}</Text>
        <View style={styles.sliderRight}>
          {right}
          <Text style={[styles.sliderValue, { color: t.textDim }]}>
            {Math.round(value)}
            {unit}
          </Text>
        </View>
      </View>
      <Slider
        accessibilityLabel={label}
        minimumValue={min}
        maximumValue={max}
        step={1}
        value={value}
        onSlidingStart={() => {
          dragging.current = true;
          onStart?.();
        }}
        onValueChange={(v) => {
          if (dragging.current) {
            onChange(v);
            return;
          }
          // VoiceOver swipes change the value without a drag: one step each.
          onStart?.();
          onChange(v);
          onEnd?.(v);
        }}
        onSlidingComplete={(v) => {
          dragging.current = false;
          onEnd?.(v);
        }}
        minimumTrackTintColor={t.accent}
        maximumTrackTintColor={t.surface2}
      />
    </View>
  );
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={styles.sectionTitleRow}>
      <Text style={[styles.sectionTitle, { color: t.text }]} accessibilityRole="header">
        {children}
      </Text>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  iconButton: { alignItems: 'center', justifyContent: 'center', minWidth: 40, minHeight: 40, paddingHorizontal: 4 },
  iconLabel: { fontSize: 11, marginTop: 3, fontWeight: '500' },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    minHeight: 50,
    paddingHorizontal: space.xl,
    borderRadius: radius.md,
  },
  buttonText: { fontSize: 17, fontWeight: '600' },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    minWidth: 58,
  },
  chipLabel: { fontSize: 14, fontWeight: '600' },
  chipSub: { fontSize: 10, fontWeight: '500', marginTop: 1 },
  segmented: { flexDirection: 'row', borderRadius: radius.sm + 2, padding: 2 },
  segment: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: radius.sm },
  segmentText: { fontSize: 14, fontWeight: '600' },
  sliderRow: { paddingVertical: 2 },
  sliderHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sliderRight: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  sliderLabel: { fontSize: 15, fontWeight: '500' },
  sliderValue: { fontSize: 14, fontVariant: ['tabular-nums'], minWidth: 44, textAlign: 'right' },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
  sectionTitle: { fontSize: 17, fontWeight: '700' },
});
