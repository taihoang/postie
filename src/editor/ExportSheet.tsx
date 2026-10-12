import { router } from 'expo-router';
import React, { useState } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { emptyFrameCount } from '@/core/doc';
import type { CollageDoc } from '@/core/types';
import { renderExport, saveToPhotos, shareFile, type ExportProgress, type ExportedFile } from '@/services/exporter';
import { haptic } from '@/services/haptics';
import { useEditor } from '@/state/editorStore';
import { useSettings } from '@/state/settingsStore';
import { Button, IconButton, Segmented } from '@/ui/controls';
import { radius, space, useTheme } from '@/ui/theme';

type Action = 'save' | 'share';

/** Export options and actions (E-1 – E-8). */
export function ExportSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const doc = useEditor((s) => s.doc);
  const quality = useSettings((s) => s.exportQuality);
  const format = useSettings((s) => s.exportFormat);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  // Shown inside the sheet: toasts would be hidden behind this modal.
  const [error, setError] = useState<string | null>(null);
  const busy = !!progress;
  if (!doc) return null;
  const seamless = doc.mode === 'seamless';
  const width = (quality === 'high' ? 2 : 1) * doc.canvas.width;

  const confirmEmpty = (d: CollageDoc) =>
    new Promise<boolean>((resolve) => {
      const n = emptyFrameCount(d);
      if (!n) return resolve(true);
      Alert.alert(
        n === 1 ? '1 frame is empty' : `${n} frames are empty`,
        'Empty frames export as background.',
        [
          { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Export anyway', onPress: () => resolve(true) },
        ],
      );
    });

  const finish = (action: 'saved' | 'shared', files: ExportedFile[]) => {
    // Mark finished without an undo step; A-8 only reopens unfinished collages.
    useEditor.getState().markExported();
    useSettings.getState().incrementExports();
    onClose();
    router.push({
      pathname: '/saved',
      params: { action, count: String(files.length), preview: files[0]?.uri ?? '', aspect: String(files[0] ? files[0].width / files[0].height : 1) },
    });
  };

  const run = async (action: Action, panorama = false) => {
    if (!(await confirmEmpty(doc))) return;
    setError(null);
    setProgress({ stage: 'photos', done: 0, total: 1 });
    let files: ExportedFile[] = [];
    try {
      files = await renderExport(doc, { quality, format, panorama, onProgress: setProgress });
    } catch (e) {
      console.warn(e);
      setProgress(null);
      setError('Export failed. Please try again.');
      return;
    }
    try {
      if (action === 'save') {
        const result = await saveToPhotos(files);
        setProgress(null);
        if (result === 'denied') {
          // A-5: Share still works; offer Settings gently.
          Alert.alert('Allow saving to Photos', 'Postie can only add images; it never reads your library.', [
            { text: 'Not now', style: 'cancel' },
            { text: 'Share instead', onPress: () => run('share', panorama || seamless) },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]);
          return;
        }
        haptic('success');
        finish('saved', files);
      } else {
        setProgress(null);
        // Dismissing the share sheet is not an export.
        if (await shareFile(files[0])) finish('shared', files);
      }
    } catch (e) {
      console.warn(e);
      setProgress(null);
      setError(action === 'save' ? 'Couldn’t save to Photos. Please try again.' : 'Couldn’t share. Please try again.');
    }
  };

  const stageText = progress
    ? progress.stage === 'photos'
      ? 'Preparing photos…'
      : progress.total > 1
        ? `Rendering slide ${Math.min(progress.done + 1, progress.total)} of ${progress.total}…`
        : 'Rendering…'
    : '';

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => !busy && onClose()}>
      <View style={[styles.sheet, { backgroundColor: t.bg, paddingBottom: insets.bottom + space.lg }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: t.text }]} accessibilityRole="header">
            {seamless ? `Export ${doc.slides} slides` : 'Export'}
          </Text>
          <IconButton icon="close" label="Close" onPress={onClose} disabled={busy} />
        </View>

        <Text style={[styles.label, { color: t.textDim }]}>Quality</Text>
        <Segmented
          value={quality}
          onChange={(q) => useSettings.getState().setExportPrefs({ quality: q })}
          options={[
            { value: 'instagram', label: 'Instagram' },
            { value: 'high', label: 'High-res' },
          ]}
        />
        <Text style={[styles.note, { color: t.textDim }]}>
          {quality === 'instagram'
            ? `${width} px wide. Instagram shows 1080 px, so this is all it needs.`
            : `${width} px wide, for prints and other platforms.`}
        </Text>

        <Text style={[styles.label, { color: t.textDim }]}>Format</Text>
        <Segmented
          value={format}
          onChange={(f) => useSettings.getState().setExportPrefs({ format: f })}
          options={[
            { value: 'jpeg', label: 'JPEG' },
            { value: 'png', label: 'PNG' },
          ]}
        />

        <View style={styles.actions}>
          <Button
            title={seamless ? `Save ${doc.slides} slides to Photos` : 'Save to Photos'}
            icon="save"
            onPress={() => run('save')}
            disabled={busy}
          />
          <Button
            title={seamless ? 'Share full panorama' : 'Share'}
            icon="share"
            kind="secondary"
            onPress={() => run('share', seamless)}
            disabled={busy}
          />
        </View>
        {seamless && (
          <Text style={[styles.note, { color: t.textDim }]}>
            Slides save in order. In Instagram, start a new post and select them 1 to {doc.slides}.
          </Text>
        )}

        {error && !busy && (
          <Text style={[styles.error, { color: t.danger }]} accessibilityLiveRegion="assertive">
            {error}
          </Text>
        )}

        {busy && (
          <View style={[styles.progress, { backgroundColor: t.surface }]} accessibilityLiveRegion="polite">
            <ActivityIndicator color={t.accent} />
            <Text style={[styles.progressText, { color: t.text }]}>{stageText}</Text>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, paddingHorizontal: space.lg, paddingTop: space.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.md },
  title: { fontSize: 22, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', marginTop: space.lg, marginBottom: space.sm },
  note: { fontSize: 13, marginTop: space.sm, lineHeight: 18 },
  actions: { gap: space.md, marginTop: space.xl },
  progress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    padding: space.lg,
    borderRadius: radius.md,
    marginTop: space.xl,
  },
  progressText: { fontSize: 15, fontWeight: '500' },
  error: { fontSize: 15, fontWeight: '600', marginTop: space.lg, textAlign: 'center' },
});
