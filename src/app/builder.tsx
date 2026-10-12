import { router, useLocalSearchParams } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { applyTemplate } from '@/core/doc';
import {
  dividers,
  leaf,
  mergeCandidates,
  mergeLeaves,
  ratioRange,
  rectsToTree,
  removeLeaf,
  setRatio,
  snapDivider,
  splitLeaf,
  treeToRects,
  type Divider,
} from '@/core/layoutTree';
import { COLLAGE_PRESETS, cellsFor, templateFromTree } from '@/core/templates';
import type { LayoutNode } from '@/core/types';
import { haptic } from '@/services/haptics';
import { startCollage } from '@/services/session';
import { useEditor } from '@/state/editorStore';
import { useSettings } from '@/state/settingsStore';
import { IconButton } from '@/ui/controls';
import { prompt, toast } from '@/ui/overlays';
import { TemplateThumb } from '@/ui/TemplateThumb';
import { MAX_CONTENT_WIDTH, radius, space, useTheme } from '@/ui/theme';

const GAP = 4;
const HANDLE = 30;

/**
 * Custom template builder (T-4 – T-6): start blank or from a preset, split
 * cells, drag dividers (snapping to thirds, halves and quarters, T-5), merge
 * or delete cells, then save for reuse (T-7).
 */
export default function BuilderScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { editId, target } = useLocalSearchParams<{ editId?: string; target?: string }>();
  const custom = useSettings((s) => s.customTemplates);
  const editing = editId ? custom.find((x) => x.id === editId) : undefined;
  const editorDoc = useEditor((s) => s.doc);
  const canvas = target === 'editor' && editorDoc ? editorDoc.canvas : useSettings.getState().collageCanvas;

  const [tree, setTree] = useState<LayoutNode>(() => editing?.tree ?? (editing ? rectsToTree(editing.cells) : null) ?? leaf());
  const [history, setHistory] = useState<LayoutNode[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [box, setBox] = useState({ w: 0, h: 0 });

  const cells = useMemo(() => treeToRects(tree), [tree]);
  const divs = useMemo(() => dividers(tree), [tree]);
  const candidates = useMemo(() => (selected && merging ? mergeCandidates(tree, selected) : []), [tree, selected, merging]);

  const change = (next: LayoutNode) => {
    setHistory((h) => [...h.slice(-19), tree]);
    setTree(next);
  };

  const onArea = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    const aspect = canvas.width / canvas.height;
    const w = Math.min(width, height * aspect);
    setBox({ w, h: w / aspect });
  };

  const tapCell = (id: string) => {
    if (merging && selected && candidates.includes(id)) {
      const next = mergeLeaves(tree, selected, id);
      if (next) {
        haptic('light');
        change(next);
      } else toast("Those cells can't be merged");
      setMerging(false);
      return;
    }
    haptic('select');
    setMerging(false);
    setSelected(id === selected ? null : id);
  };

  const splitSelected = (dir: 'row' | 'col') => {
    if (!selected) return;
    haptic('light');
    change(splitLeaf(tree, selected, dir).tree);
  };

  const deleteSelected = () => {
    if (!selected || cells.length <= 1) return;
    haptic('light');
    change(removeLeaf(tree, selected));
    setSelected(null);
  };

  const startMerge = () => {
    if (!selected) return;
    const options = mergeCandidates(tree, selected);
    if (!options.length) {
      toast('No neighbor lines up with this cell');
      return;
    }
    if (options.length === 1) {
      const next = mergeLeaves(tree, selected, options[0]);
      if (next) change(next);
      return;
    }
    setMerging(true);
    toast('Tap a highlighted cell to merge');
  };

  const loadPreset = (cellsFromPreset: ReturnType<typeof cellsFor>) => {
    const next = rectsToTree(cellsFromPreset);
    if (!next) return;
    haptic('select');
    change(next);
    setSelected(null);
  };

  const save = async () => {
    const name = await prompt({ title: editing ? 'Save template' : 'Name your template', initial: editing?.name ?? 'My layout' });
    if (!name) return;
    const tmpl = templateFromTree(name, tree, editing?.id);
    useSettings.getState().saveTemplate(tmpl);
    haptic('success');
    if (target === 'editor' && useEditor.getState().doc) {
      useEditor.getState().commit((d) => applyTemplate(d, tmpl));
      router.back();
      return;
    }
    router.back();
    if (!editing) {
      Alert.alert('Template saved', 'It’s in “My templates”. Start a collage with it now?', [
        { text: 'Later', style: 'cancel' },
        { text: 'Start', onPress: () => startCollage('collage', tmpl) },
      ]);
    } else toast('Template saved');
  };

  return (
    <GestureHandlerRootView style={[styles.screen, { backgroundColor: t.bg, paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <View style={styles.column}>
        <View style={styles.header}>
          <IconButton icon="close" label="Cancel" onPress={() => router.back()} />
          <Text style={[styles.title, { color: t.text }]}>{editing ? 'Edit template' : 'New template'}</Text>
          <Pressable onPress={save} accessibilityRole="button" accessibilityLabel="Save template" style={styles.saveButton}>
            <Text style={[styles.saveText, { color: t.accent }]}>Save</Text>
          </Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presets}>
          <TemplateThumb
            cells={[{ x: 0, y: 0, w: 1, h: 1 }]}
            aspect={canvas.width / canvas.height}
            height={50}
            label="Blank"
            onPress={() => {
              change(leaf());
              setSelected(null);
            }}
            accessibilityLabel="Start blank"
          />
          {COLLAGE_PRESETS.map((p) => (
            <TemplateThumb
              key={p.id}
              cells={cellsFor(p, canvas)}
              aspect={canvas.width / canvas.height}
              height={50}
              onPress={() => loadPreset(cellsFor(p, canvas))}
              accessibilityLabel={`Start from ${p.name}, ${p.cells.length} photos`}
            />
          ))}
        </ScrollView>
      </View>

      <View style={[styles.area, { backgroundColor: t.backdrop }]} onLayout={onArea}>
        {box.w > 0 && (
          <View style={[styles.canvas, { width: box.w, height: box.h }]}>
            {cells.map((c) => {
              const isSel = c.id === selected;
              const isCandidate = candidates.includes(c.id);
              return (
                <Pressable
                  key={c.id}
                  onPress={() => tapCell(c.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Cell ${Math.round(c.rect.w * 100)} by ${Math.round(c.rect.h * 100)} percent`}
                  accessibilityState={{ selected: isSel }}
                  style={[
                    styles.cell,
                    {
                      left: c.rect.x * box.w + GAP / 2,
                      top: c.rect.y * box.h + GAP / 2,
                      width: c.rect.w * box.w - GAP,
                      height: c.rect.h * box.h - GAP,
                      backgroundColor: isSel ? t.accent : isCandidate ? '#F7C9BF' : '#D8D8DE',
                      borderColor: isCandidate ? t.accent : 'transparent',
                    },
                  ]}
                />
              );
            })}
            {divs.map((d) => (
              <DividerHandle key={d.nodeId} divider={d} tree={tree} box={box} onChange={setTree} onStart={() => setHistory((h) => [...h.slice(-19), tree])} />
            ))}
          </View>
        )}
      </View>

      <View style={styles.column}>
        <Text style={[styles.hint, { color: t.textDim }]}>
          {selected ? 'Split, merge or delete the selected cell. Drag the lines to resize.' : 'Tap a cell to select it. Drag the lines to resize.'}
        </Text>
        <View style={[styles.toolbar, { borderTopColor: t.border }]}>
          <IconButton icon="undo" label="Undo" showLabel disabled={!history.length} onPress={() => {
            const prev = history[history.length - 1];
            if (!prev) return;
            setHistory((h) => h.slice(0, -1));
            setTree(prev);
            setSelected(null);
          }} />
          <IconButton icon="splitRow" label="Side by side" showLabel disabled={!selected} onPress={() => splitSelected('row')} />
          <IconButton icon="splitCol" label="Stacked" showLabel disabled={!selected} onPress={() => splitSelected('col')} />
          <IconButton icon="merge" label="Merge" showLabel disabled={!selected} active={merging} onPress={startMerge} />
          <IconButton icon="trash" label="Delete" showLabel disabled={!selected || cells.length <= 1} onPress={deleteSelected} />
        </View>
      </View>
    </GestureHandlerRootView>
  );
}

function DividerHandle({
  divider,
  tree,
  box,
  onChange,
  onStart,
}: {
  divider: Divider;
  tree: LayoutNode;
  box: { w: number; h: number };
  onChange: (t: LayoutNode) => void;
  onStart: () => void;
}) {
  const t = useTheme();
  // Drag state outside React state; read and written only in gesture callbacks.
  const start = useSharedValue(0);
  const wasSnapped = useSharedValue(false);
  const vertical = divider.dir === 'row';
  const { bounds } = divider;

  const gesture = Gesture.Pan()
    .runOnJS(true)
    .minDistance(1)
    .onBegin(() => {
      start.set(divider.pos);
      wasSnapped.set(false);
    })
    .onStart(onStart)
    .onUpdate((e) => {
      const delta = vertical ? e.translationX / box.w : e.translationY / box.h;
      const snapped = snapDivider(start.get() + delta, bounds, divider.dir);
      if (snapped.snapped && !wasSnapped.get()) haptic('select');
      wasSnapped.set(snapped.snapped);
      const bStart = vertical ? bounds.x : bounds.y;
      const extent = vertical ? bounds.w : bounds.h;
      const range = ratioRange(tree, divider.nodeId, bounds);
      const ratio = Math.min(range.max, Math.max(range.min, (snapped.pos - bStart) / extent));
      onChange(setRatio(tree, divider.nodeId, ratio));
    });

  const style = vertical
    ? { left: divider.pos * box.w - HANDLE / 2, top: bounds.y * box.h, width: HANDLE, height: bounds.h * box.h }
    : { top: divider.pos * box.h - HANDLE / 2, left: bounds.x * box.w, height: HANDLE, width: bounds.w * box.w };

  return (
    <GestureDetector gesture={gesture}>
      <View style={[styles.handle, style]} accessibilityLabel={vertical ? 'Vertical divider' : 'Horizontal divider'}>
        <View style={[vertical ? styles.gripV : styles.gripH, { backgroundColor: t.text }]} />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  column: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space.sm },
  title: { fontSize: 17, fontWeight: '700' },
  saveButton: { paddingHorizontal: space.md, paddingVertical: space.sm },
  saveText: { fontSize: 17, fontWeight: '700' },
  presets: { gap: space.sm, paddingHorizontal: space.lg, paddingVertical: space.sm },
  area: { flex: 1, margin: 0, padding: space.xl, alignItems: 'center', justifyContent: 'center' },
  canvas: { backgroundColor: '#FFFFFF', borderRadius: 2 },
  cell: { position: 'absolute', borderRadius: radius.sm - 4, borderWidth: 2 },
  handle: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  gripV: { width: 5, height: 36, borderRadius: 3, opacity: 0.75 },
  gripH: { height: 5, width: 36, borderRadius: 3, opacity: 0.75 },
  hint: { fontSize: 13, textAlign: 'center', paddingHorizontal: space.lg, paddingVertical: space.sm },
  toolbar: { flexDirection: 'row', justifyContent: 'space-around', borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: space.sm },
});
