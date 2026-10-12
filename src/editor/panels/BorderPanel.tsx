import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { STYLE_LIMITS, setStyle } from '@/core/doc';
import type { Style } from '@/core/types';
import { haptic } from '@/services/haptics';
import { useEditor } from '@/state/editorStore';
import { useSettings } from '@/state/settingsStore';
import { SliderRow } from '@/ui/controls';
import { Icon } from '@/ui/Icon';
import { prompt, toast } from '@/ui/overlays';
import { radius, space, useTheme } from '@/ui/theme';

/** Thickness, outer margin and roundness sliders with live preview (B-2 – B-5), plus saved styles (B-11). */
export function BorderPanel() {
  const t = useTheme();
  const doc = useEditor((s) => s.doc);
  const { checkpoint, live, commit, endCheckpoint } = useEditor.getState();
  const savedStyles = useSettings((s) => s.savedStyles);
  if (!doc) return null;
  const { style } = doc;

  const slide = (patch: (v: number) => Partial<Style>) => ({
    onStart: checkpoint,
    onChange: (v: number) => live((d) => setStyle(d, patch(v))),
    onEnd: endCheckpoint,
  });

  const toggleLink = () => {
    haptic('select');
    commit((d) => setStyle(d, { marginLinked: !d.style.marginLinked }));
  };

  const saveCurrent = async () => {
    const name = await prompt({ title: 'Save style', message: 'Border and background, for reuse.', initial: 'My style' });
    if (!name) return;
    useSettings.getState().saveStyle(name, style);
    toast('Style saved');
  };

  const apply = (saved: Style) => {
    haptic('select');
    commit((d) => {
      // A blurred-photo background needs that photo; keep the current background otherwise.
      const bg = saved.background.kind === 'photo' && !d.photos[saved.background.photoId] ? d.style.background : saved.background;
      return setStyle(d, { ...saved, background: bg });
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <SliderRow label="Thickness" value={style.gap} {...STYLE_LIMITS.gap} {...slide((gap) => ({ gap }))} />
      <SliderRow
        label="Outer margin"
        value={style.margin}
        {...STYLE_LIMITS.margin}
        {...slide((margin) => ({ margin, marginLinked: false }))}
        right={
          <Pressable
            onPress={toggleLink}
            accessibilityRole="switch"
            accessibilityLabel="Keep outer margin equal to thickness"
            accessibilityState={{ checked: style.marginLinked }}
            hitSlop={8}
            style={[styles.link, { backgroundColor: style.marginLinked ? t.accent : t.surface2 }]}
          >
            <Icon name="link" size={14} color={style.marginLinked ? t.onAccent : t.textDim} />
            <Text style={[styles.linkText, { color: style.marginLinked ? t.onAccent : t.textDim }]}>Linked</Text>
          </Pressable>
        }
      />
      <SliderRow label="Roundness" value={style.radius} {...STYLE_LIMITS.radius} {...slide((r) => ({ radius: r }))} />

      <View style={styles.stylesRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Pressable
            onPress={saveCurrent}
            accessibilityRole="button"
            style={[styles.styleChip, { borderColor: t.border, backgroundColor: t.surface }]}
          >
            <Icon name="plus" size={14} color={t.text} />
            <Text style={[styles.styleChipText, { color: t.text }]}>Save style</Text>
          </Pressable>
          {savedStyles.map((s) => (
            <Pressable
              key={s.id}
              onPress={() => apply(s.style)}
              onLongPress={() => {
                useSettings.getState().deleteStyle(s.id);
                toast(`Deleted “${s.name}”`);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Apply style ${s.name}`}
              accessibilityHint="Long press to delete"
              style={[styles.styleChip, { borderColor: t.border, backgroundColor: t.surface }]}
            >
              <View style={[styles.dot, { backgroundColor: swatchOf(s.style) }]} />
              <Text style={[styles.styleChipText, { color: t.text }]} numberOfLines={1}>
                {s.name}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>
    </ScrollView>
  );
}

function swatchOf(style: Style): string {
  const bg = style.background;
  if (bg.kind === 'solid' || bg.kind === 'texture') return bg.color;
  if (bg.kind === 'gradient') return bg.from;
  return '#BBBBBB';
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.lg, gap: space.xs },
  link: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  linkText: { fontSize: 12, fontWeight: '600' },
  stylesRow: { marginTop: space.sm },
  chips: { gap: space.sm },
  styleChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    maxWidth: 160,
  },
  styleChipText: { fontSize: 13, fontWeight: '600' },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.2)' },
});
