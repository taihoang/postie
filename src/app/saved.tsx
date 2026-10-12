import { router, useLocalSearchParams } from 'expo-router';
import React from 'react';
import { Image, Linking, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AdSlot } from '@/ads/AdSlot';
import { useEditor } from '@/state/editorStore';
import { useSettings } from '@/state/settingsStore';
import { Button } from '@/ui/controls';
import { Icon } from '@/ui/Icon';
import { toast } from '@/ui/overlays';
import { MAX_CONTENT_WIDTH, radius, space, useTheme } from '@/ui/theme';

/**
 * Shown only after the collage is already saved or shared. The one launch ad
 * placement lives at the bottom of this screen (AD-4); it never blocks a task.
 */
export default function SavedScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  // Keep the preview modest on small phones so the buttons stay on screen.
  const previewMax = Math.max(120, Math.min(240, screenH * 0.28));
  const { action, count, preview, aspect } = useLocalSearchParams<{ action?: string; count?: string; preview?: string; aspect?: string }>();
  const n = Number(count ?? '1');
  const ratio = Math.max(0.3, Math.min(3, Number(aspect ?? '1') || 1));
  const shared = action === 'shared';

  const title = shared ? 'Shared' : n > 1 ? `${n} slides saved` : 'Saved to Photos';
  const detail = shared
    ? 'Your collage went to the share sheet.'
    : n > 1
      ? 'They are in Photos in slide order. In Instagram, start a new post and select them in order.'
      : 'Find it in Photos, or open Instagram to post it.';

  const openInstagram = async () => {
    // E-9: just launches the Instagram app; nothing is uploaded by Postie.
    try {
      await Linking.openURL('instagram://app');
    } catch {
      toast('Instagram isn’t installed');
    }
  };

  const newCollage = () => {
    useSettings.getState().setResumeDraft(null);
    useEditor.getState().close();
    router.dismissAll();
  };

  return (
    <ScrollView
      style={{ backgroundColor: t.bg }}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space.xl, paddingBottom: insets.bottom + space.lg }]}
    >
      <View style={styles.column}>
        <View style={[styles.badge, { backgroundColor: t.accent }]}>
          <Icon name="check" size={26} color={t.onAccent} />
        </View>
        <Text style={[styles.title, { color: t.text }]} accessibilityRole="header">
          {title}
        </Text>
        <Text style={[styles.detail, { color: t.textDim }]}>{detail}</Text>

        {preview ? (
          <View style={[styles.previewWrap, { borderColor: t.border }]}>
            <Image
              source={{ uri: preview }}
              style={{ width: ratio >= 1 ? previewMax : previewMax * ratio, height: ratio >= 1 ? previewMax / ratio : previewMax }}
              resizeMode="contain"
              accessibilityLabel={n > 1 ? 'First slide' : 'Your collage'}
            />
          </View>
        ) : null}

        <View style={styles.actions}>
          <Button title="Open Instagram" icon="open" onPress={openInstagram} />
          <Button title="Keep editing" kind="secondary" onPress={() => router.back()} />
          <Button title="New collage" kind="plain" onPress={newCollage} />
        </View>
      </View>

      {/* After the buttons: never covers them, and a late load only adds space below (AD-9). */}
      <View style={styles.adArea}>
        <AdSlot placement="saved" />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1 },
  column: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', alignItems: 'center', paddingHorizontal: space.xl },
  badge: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: space.md },
  title: { fontSize: 26, fontWeight: '800', textAlign: 'center' },
  detail: { fontSize: 15, lineHeight: 21, textAlign: 'center', marginTop: space.sm, maxWidth: 340 },
  previewWrap: {
    marginTop: space.xl,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
  actions: { alignSelf: 'stretch', gap: space.md, marginTop: space.xl },
  adArea: { marginTop: space.xl, alignItems: 'center' },
});
