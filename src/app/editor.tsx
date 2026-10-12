import { Redirect, router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { setCanvas, swapPhotos, updateFrame } from '@/core/doc';
import { resetCrop } from '@/core/geometry';
import { findTemplate } from '@/core/templates';
import type { Crop, FRect, PhotoAsset } from '@/core/types';
import { AccessibleFrames } from '@/editor/AccessibleFrames';
import { EditorCanvas, type CanvasApi } from '@/editor/EditorCanvas';
import { ExportSheet } from '@/editor/ExportSheet';
import { FrameToolbar } from '@/editor/FrameToolbar';
import { BackgroundPanel } from '@/editor/panels/BackgroundPanel';
import { BorderPanel } from '@/editor/panels/BorderPanel';
import { LayoutPanel } from '@/editor/panels/LayoutPanel';
import { PhotosPanel } from '@/editor/panels/PhotosPanel';
import { SeamlessBar } from '@/editor/SeamlessBar';
import { useAutosave, usePhotoImport } from '@/editor/useEditorHooks';
import { usePreviewImages } from '@/render/imageCache';
import { saveDraft } from '@/services/drafts';
import { haptic } from '@/services/haptics';
import { useEditor } from '@/state/editorStore';
import { useSettings } from '@/state/settingsStore';
import { CanvasSizeChips } from '@/ui/CanvasSizeChips';
import { Icon, type IconName } from '@/ui/Icon';
import { IconButton } from '@/ui/controls';
import { MAX_CONTENT_WIDTH, radius, space, useTheme } from '@/ui/theme';

type Tab = 'layout' | 'photos' | 'border' | 'background';

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'layout', label: 'Layout', icon: 'layout' },
  { id: 'photos', label: 'Photos', icon: 'photos' },
  { id: 'border', label: 'Border', icon: 'border' },
  { id: 'background', label: 'Background', icon: 'background' },
];

const PANEL_HEIGHT = 178;
const NO_PHOTOS: Record<string, PhotoAsset> = {};

export default function EditorScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { pick } = useLocalSearchParams<{ pick?: string }>();
  const doc = useEditor((s) => s.doc);
  const selectedId = useEditor((s) => s.selectedFrameId);
  const canUndo = useEditor((s) => s.past.length > 0);
  const canRedo = useEditor((s) => s.future.length > 0);
  const showSeams = useSettings((s) => s.showSeams);
  const showSafeZone = useSettings((s) => s.showSafeZone);
  const customTemplates = useSettings((s) => s.customTemplates);
  const [tab, setTab] = useState<Tab>('layout');
  const [exportOpen, setExportOpen] = useState(false);
  const canvasApi = useRef<CanvasApi | null>(null);
  const images = usePreviewImages(doc?.photos ?? NO_PHOTOS);
  const { addPhotos, importing } = usePhotoImport();
  useAutosave(doc);

  // A new collage asks for photos straight away (P-1).
  const askedForPhotos = useRef(false);
  useEffect(() => {
    if (pick !== '1' || askedForPhotos.current || !doc) return;
    askedForPhotos.current = true;
    const timer = setTimeout(() => addPhotos(), 300);
    return () => clearTimeout(timer);
  }, [pick, doc, addPhotos]);

  const onTapFrame = useCallback(
    (id: string | null, empty: boolean) => {
      const { select } = useEditor.getState();
      if (!id) {
        select(null);
        return;
      }
      haptic('select');
      select(id);
      if (empty) addPhotos(id);
    },
    [addPhotos],
  );

  const onDoubleTapFrame = useCallback((id: string) => {
    haptic('light');
    useEditor.getState().commit((d) => {
      const f = d.frames.find((x) => x.id === id);
      return f ? updateFrame(d, id, { crop: resetCrop(f.crop) }) : d;
    });
  }, []);

  const onCommitCrop = useCallback((id: string, crop: Crop) => {
    useEditor.getState().commit((d) => updateFrame(d, id, { crop }));
  }, []);

  const onCommitRect = useCallback((id: string, rect: FRect) => {
    useEditor.getState().commit((d) => updateFrame(d, id, { rect }));
  }, []);

  const onSwap = useCallback((a: string, b: string) => {
    haptic('success');
    useEditor.getState().commit((d) => swapPhotos(d, a, b));
  }, []);

  if (!doc) return <Redirect href="/" />;

  const seamless = doc.mode === 'seamless';
  const selectedFrame = doc.frames.find((f) => f.id === selectedId);

  const leave = () => {
    saveDraft(doc);
    useSettings.getState().setResumeDraft(null);
    useEditor.getState().close();
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  return (
    <View style={[styles.screen, { backgroundColor: t.bg, paddingTop: insets.top }]}>
      <View style={styles.column}>
        <View style={styles.topBar}>
          <IconButton icon="back" label="Back to templates" onPress={leave} />
          <IconButton icon="undo" label="Undo" onPress={() => useEditor.getState().undo()} disabled={!canUndo} />
          <IconButton icon="redo" label="Redo" onPress={() => useEditor.getState().redo()} disabled={!canRedo} />
          <View style={styles.spacer} />
          {!seamless && doc.canvas.id === '9:16' && (
            <IconButton
              icon="safeZone"
              label={showSafeZone ? 'Hide story safe zones' : 'Show story safe zones'}
              active={showSafeZone}
              onPress={() => useSettings.getState().toggleSafeZone()}
            />
          )}
          <Pressable
            onPress={() => {
              useEditor.getState().select(null);
              setExportOpen(true);
            }}
            accessibilityRole="button"
            accessibilityLabel="Export"
            style={({ pressed }) => [styles.exportButton, { backgroundColor: t.accent, opacity: pressed ? 0.8 : 1 }]}
          >
            <Icon name="share" size={16} color={t.onAccent} />
            <Text style={[styles.exportText, { color: t.onAccent }]}>Export</Text>
          </Pressable>
        </View>

        {seamless ? (
          <SeamlessBar />
        ) : (
          <CanvasSizeChips
            value={doc.canvas}
            onChange={(c) => {
              const tmpl = findTemplate(doc.templateId, customTemplates);
              useEditor.getState().commit((d) => setCanvas(d, c, tmpl));
              useSettings.getState().setCanvas('collage', c);
            }}
          />
        )}
      </View>

      <View style={[styles.canvasArea, { backgroundColor: t.backdrop }]}>
        <EditorCanvas
          doc={doc}
          images={images}
          selectedFrameId={selectedId}
          showSeams={showSeams}
          showSafeZone={showSafeZone}
          apiRef={canvasApi}
          onTapFrame={onTapFrame}
          onDoubleTapFrame={onDoubleTapFrame}
          onCommitCrop={onCommitCrop}
          onCommitRect={onCommitRect}
          onSwap={onSwap}
        />
        <AccessibleFrames doc={doc} selectedId={selectedId} onSelect={onTapFrame} />
        {importing && (
          <View style={[styles.pill, { backgroundColor: t.text }]} pointerEvents="none" accessibilityLiveRegion="polite">
            <Text style={[styles.pillText, { color: t.bg }]}>
              Adding photos {importing.done}/{importing.total}
            </Text>
          </View>
        )}
      </View>

      <View style={[styles.column, styles.bottom]}>
        <View style={styles.toolbarSlot}>
          {selectedFrame && <FrameToolbar frame={selectedFrame} onPickForFrame={(id) => addPhotos(id)} />}
        </View>
        <View style={[styles.panel, { borderTopColor: t.border }]}>
          {tab === 'layout' && <LayoutPanel canvasApi={canvasApi} />}
          {tab === 'photos' && <PhotosPanel onAdd={() => addPhotos()} busy={!!importing} />}
          {tab === 'border' && <BorderPanel />}
          {tab === 'background' && <BackgroundPanel />}
        </View>
        <View style={[styles.tabBar, { paddingBottom: Math.max(insets.bottom, space.sm), borderTopColor: t.border }]} accessibilityRole="tablist">
          {TABS.map((item) => {
            const active = item.id === tab;
            return (
              <Pressable
                key={item.id}
                onPress={() => {
                  if (!active) haptic('select');
                  setTab(item.id);
                }}
                accessibilityRole="tab"
                accessibilityLabel={item.label}
                accessibilityState={{ selected: active }}
                style={styles.tab}
              >
                <Icon name={item.icon} size={22} color={active ? t.accent : t.textDim} />
                <Text style={[styles.tabLabel, { color: active ? t.accent : t.textDim }]}>{item.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <ExportSheet visible={exportOpen} onClose={() => setExportOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  column: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.sm, paddingBottom: space.xs, gap: 2 },
  spacer: { flex: 1 },
  exportButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radius.pill,
    marginLeft: space.sm,
    marginRight: space.xs,
  },
  exportText: { fontSize: 16, fontWeight: '700' },
  canvasArea: { flex: 1, marginTop: space.sm },
  pill: {
    position: 'absolute',
    alignSelf: 'center',
    top: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  pillText: { fontSize: 14, fontWeight: '600' },
  bottom: { position: 'relative' },
  toolbarSlot: { position: 'absolute', left: 0, right: 0, bottom: '100%', paddingTop: space.sm },
  panel: { height: PANEL_HEIGHT, borderTopWidth: StyleSheet.hairlineWidth },
  tabBar: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6 },
  tab: { flex: 1, alignItems: 'center', gap: 2, minHeight: 44, justifyContent: 'center' },
  tabLabel: { fontSize: 11, fontWeight: '600' },
});
