import React from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { emptyFrameCount, placeFromTray } from '@/core/doc';
import { photoUri } from '@/services/files';
import { haptic } from '@/services/haptics';
import { useEditor } from '@/state/editorStore';
import { Button } from '@/ui/controls';
import { radius, space, useTheme } from '@/ui/theme';

/** Add more photos, and place photos waiting in the tray (T-3). */
export function PhotosPanel({ onAdd, busy }: { onAdd: () => void; busy: boolean }) {
  const t = useTheme();
  const doc = useEditor((s) => s.doc);
  const selected = useEditor((s) => s.selectedFrameId);
  if (!doc) return null;
  const empty = emptyFrameCount(doc);

  const place = (photoId: string) => {
    haptic('light');
    useEditor.getState().commit((d) => placeFromTray(d, photoId, selected ?? undefined));
  };

  const hint = doc.tray.length
    ? selected
      ? 'Tap a photo to put it in the selected frame.'
      : empty
        ? 'Tap a photo to fill the next empty frame.'
        : 'Select a frame, then tap a photo to swap it in.'
    : 'Tip: long-press a photo on the canvas and drag it onto another frame to swap.';

  return (
    <View style={styles.wrap}>
      <View style={styles.header}>
        <Button
          title={empty ? `Add photos (${empty} empty)` : 'Add photos'}
          icon="photos"
          kind="secondary"
          onPress={onAdd}
          disabled={busy}
          style={styles.add}
        />
      </View>
      {doc.tray.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tray}>
          {doc.tray.map((id) => {
            const p = doc.photos[id];
            if (!p) return null;
            return (
              <Pressable
                key={id}
                onPress={() => place(id)}
                accessibilityRole="button"
                accessibilityLabel="Place this photo"
                style={({ pressed }) => [styles.thumbWrap, { opacity: pressed ? 0.6 : 1, borderColor: t.border }]}
              >
                <Image source={{ uri: photoUri(p.preview) }} style={styles.thumb} />
              </Pressable>
            );
          })}
        </ScrollView>
      )}
      <Text style={[styles.hint, { color: t.textDim }]}>{hint}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: space.md },
  header: { paddingHorizontal: space.lg },
  add: { minHeight: 44 },
  tray: { gap: space.sm, paddingHorizontal: space.lg, paddingTop: space.md },
  thumbWrap: { borderRadius: radius.sm, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  thumb: { width: 56, height: 56 },
  hint: { fontSize: 13, paddingHorizontal: space.lg, marginTop: space.md },
});
