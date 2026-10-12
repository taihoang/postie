import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { deleteFrame, moveLayer, removePhoto, updateFrame } from '@/core/doc';
import { flipCrop, rotateCrop } from '@/core/geometry';
import type { Frame } from '@/core/types';
import { haptic } from '@/services/haptics';
import { useEditor } from '@/state/editorStore';
import { IconButton } from '@/ui/controls';
import { space, useTheme } from '@/ui/theme';

/** Toolbar for the selected frame: Replace, Rotate, Flip, Remove (P-7, P-9); layer order for free frames (S-7). */
export function FrameToolbar({ frame, onPickForFrame }: { frame: Frame; onPickForFrame: (frameId: string) => void }) {
  const t = useTheme();
  const { commit, select } = useEditor.getState();
  const id = frame.id;
  const act = (fn: Parameters<typeof commit>[0]) => {
    haptic('light');
    commit(fn);
  };

  return (
    <View style={[styles.bar, { backgroundColor: t.surface, borderColor: t.border }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        <IconButton icon="replace" label={frame.photoId ? 'Replace' : 'Add photo'} showLabel onPress={() => onPickForFrame(id)} />
        {frame.photoId && (
          <>
            <IconButton icon="rotate" label="Rotate" showLabel onPress={() => act((d) => updateFrame(d, id, { crop: rotateCrop(frame.crop) }))} />
            <IconButton icon="flip" label="Flip" showLabel onPress={() => act((d) => updateFrame(d, id, { crop: flipCrop(frame.crop) }))} />
            <IconButton icon="remove" label="Remove" showLabel onPress={() => act((d) => removePhoto(d, id))} />
          </>
        )}
        {frame.free && (
          <>
            <IconButton icon="forward" label="Forward" showLabel onPress={() => act((d) => moveLayer(d, id, 1))} />
            <IconButton icon="backward" label="Back" showLabel onPress={() => act((d) => moveLayer(d, id, -1))} />
            <IconButton
              icon="trash"
              label="Delete"
              showLabel
              onPress={() => {
                act((d) => deleteFrame(d, id));
                select(null);
              }}
            />
          </>
        )}
        <IconButton icon="check" label="Done" showLabel onPress={() => select(null)} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { marginHorizontal: space.md, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, marginBottom: space.sm },
  row: { paddingHorizontal: space.sm, paddingVertical: 6, gap: space.sm, flexGrow: 1, justifyContent: 'space-around' },
});
