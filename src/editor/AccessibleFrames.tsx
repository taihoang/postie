import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import type { CollageDoc } from '@/core/types';
import { radius, space, useTheme } from '@/ui/theme';

/**
 * N-6: the Skia canvas is pixels to VoiceOver, so while a screen reader is
 * running, frames are also offered as buttons. Selecting one shows the same
 * toolbar sighted users get (replace, rotate, flip, remove).
 */
export function AccessibleFrames({
  doc,
  selectedId,
  onSelect,
}: {
  doc: CollageDoc;
  selectedId: string | null;
  onSelect: (frameId: string, empty: boolean) => void;
}) {
  const t = useTheme();
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isScreenReaderEnabled().then((on) => alive && setEnabled(on));
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setEnabled);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);

  if (!enabled) return null;
  return (
    <ScrollView horizontal contentContainerStyle={styles.row} style={[styles.bar, { backgroundColor: t.bg }]}>
      {doc.frames.map((f, i) => {
        const selected = f.id === selectedId;
        const label = `Frame ${i + 1} of ${doc.frames.length}, ${f.photoId ? 'photo' : 'empty'}`;
        return (
          <Pressable
            key={f.id}
            onPress={() => onSelect(f.id, !f.photoId)}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint={f.photoId ? 'Selects the frame and shows photo tools' : 'Opens the photo picker for this frame'}
            accessibilityState={{ selected }}
            style={[styles.item, { borderColor: selected ? t.accent : t.border }]}
          >
            <Text style={{ color: t.text }}>{i + 1}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: { position: 'absolute', top: 0, left: 0, right: 0 },
  row: { gap: space.sm, padding: space.sm },
  item: { minWidth: 44, minHeight: 44, borderWidth: 2, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center' },
});
