import { router } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { MAX_SLIDES, MIN_SLIDES, SEAMLESS_RATIOS } from '@/core/canvas';
import { setCanvas, setSlides } from '@/core/doc';
import { haptic } from '@/services/haptics';
import { useEditor } from '@/state/editorStore';
import { useSettings } from '@/state/settingsStore';
import { CanvasSizeChips } from '@/ui/CanvasSizeChips';
import { IconButton } from '@/ui/controls';
import { radius, space, useTheme } from '@/ui/theme';

/** Slide ratio chips and slide-count stepper (S-2), seam toggle (S-3) and swipe preview (S-9). */
export function SeamlessBar() {
  const t = useTheme();
  const doc = useEditor((s) => s.doc);
  const showSeams = useSettings((s) => s.showSeams);
  if (!doc) return null;
  const { commit } = useEditor.getState();

  const step = (delta: number) => {
    const next = doc.slides + delta;
    if (next < MIN_SLIDES || next > MAX_SLIDES) return;
    haptic('select');
    commit((d) => setSlides(d, next));
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.chips}>
        <CanvasSizeChips
          value={doc.canvas}
          only={SEAMLESS_RATIOS}
          allowCustom={false}
          onChange={(c) => {
            commit((d) => setCanvas(d, c));
            useSettings.getState().setCanvas('seamless', c);
          }}
        />
      </View>
      <View style={styles.row}>
        <View style={[styles.stepper, { backgroundColor: t.surface, borderColor: t.border }]}>
          <Pressable
            onPress={() => step(-1)}
            disabled={doc.slides <= MIN_SLIDES}
            accessibilityRole="button"
            accessibilityLabel="Fewer slides"
            style={styles.stepButton}
          >
            <Text style={[styles.stepText, { color: doc.slides <= MIN_SLIDES ? t.textDim : t.text }]}>−</Text>
          </Pressable>
          <Text
            style={[styles.count, { color: t.text }]}
            accessibilityRole="adjustable"
            accessibilityLabel={`${doc.slides} slides`}
            accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
            onAccessibilityAction={(e) => step(e.nativeEvent.actionName === 'increment' ? 1 : -1)}
          >
            {doc.slides} slides
          </Text>
          <Pressable
            onPress={() => step(1)}
            disabled={doc.slides >= MAX_SLIDES}
            accessibilityRole="button"
            accessibilityLabel="More slides"
            style={styles.stepButton}
          >
            <Text style={[styles.stepText, { color: doc.slides >= MAX_SLIDES ? t.textDim : t.text }]}>+</Text>
          </Pressable>
        </View>
        <IconButton icon="seams" label={showSeams ? 'Hide seams' : 'Show seams'} active={showSeams} onPress={() => useSettings.getState().toggleSeams()} />
        <IconButton icon="preview" label="Swipe preview" onPress={() => router.push('/preview')} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.xs },
  chips: {},
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.lg, gap: space.sm },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    marginRight: 'auto',
  },
  stepButton: { paddingHorizontal: 14, paddingVertical: 4 },
  stepText: { fontSize: 22, fontWeight: '500' },
  count: { fontSize: 15, fontWeight: '600', minWidth: 72, textAlign: 'center', fontVariant: ['tabular-nums'] },
});
