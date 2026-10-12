import { router } from 'expo-router';
import React from 'react';
import { ActionSheetIOS, Alert, FlatList, Image, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AdSlot } from '@/ads/AdSlot';
import { canvasLabel } from '@/ui/CanvasSizeChips';
import { presetFor } from '@/core/canvas';
import { deleteDraft, duplicateDraft, thumbFile } from '@/services/drafts';
import { openDraft } from '@/services/session';
import { useDrafts, type DraftMeta } from '@/state/draftsStore';
import { IconButton } from '@/ui/controls';
import { Icon } from '@/ui/Icon';
import { toast } from '@/ui/overlays';
import { MAX_CONTENT_WIDTH, radius, space, useTheme } from '@/ui/theme';

/** A-9: saved drafts with thumbnails, duplicate and delete. */
export default function CollagesScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const drafts = useDrafts((s) => s.drafts);

  const manage = (d: DraftMeta) => {
    const duplicate = async () => {
      const copy = await duplicateDraft(d.id);
      if (copy) toast('Duplicated');
    };
    const remove = () =>
      Alert.alert('Delete this collage?', 'Photos stay in your library; only Postie’s copy is removed.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteDraft(d.id) },
      ]);
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['Open', 'Duplicate', 'Delete', 'Cancel'], destructiveButtonIndex: 2, cancelButtonIndex: 3 },
        (i) => [() => openDraft(d.id), duplicate, remove][i]?.(),
      );
    } else {
      Alert.alert('Collage', undefined, [
        { text: 'Open', onPress: () => openDraft(d.id) },
        { text: 'Duplicate', onPress: duplicate },
        { text: 'Delete', onPress: remove, style: 'destructive' },
        { text: 'Cancel', style: 'cancel' },
      ]);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: t.bg, paddingTop: insets.top }]}>
      <View style={[styles.column, styles.header]}>
        <IconButton icon="back" label="Back" onPress={() => router.back()} />
        <Text style={[styles.title, { color: t.text }]} accessibilityRole="header">
          My collages
        </Text>
        <View style={styles.headerSpacer} />
      </View>
      <FlatList
        data={drafts}
        keyExtractor={(d) => d.id}
        numColumns={2}
        style={styles.column}
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + space.xl }]}
        columnWrapperStyle={styles.gridRow}
        ListEmptyComponent={<Text style={[styles.empty, { color: t.textDim }]}>Collages you make are saved here automatically.</Text>}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => openDraft(item.id)}
            onLongPress={() => manage(item)}
            accessibilityRole="button"
            accessibilityLabel={`${item.mode === 'seamless' ? `Carousel, ${item.slides} slides` : 'Collage'}, ${item.photoCount} photos, edited ${new Date(item.updatedAt).toLocaleDateString()}`}
            accessibilityHint="Long press for more options"
            style={({ pressed }) => [styles.card, { backgroundColor: t.surface, opacity: pressed ? 0.7 : 1 }]}
          >
            <View style={styles.thumbBox}>
              {item.thumb ? (
                <Image
                  source={{ uri: `${thumbFile(item.thumb).uri}?v=${item.thumbVersion}` }}
                  style={[styles.thumb, { aspectRatio: Math.max(0.5, Math.min(item.aspect, 2.5)) }]}
                  resizeMode="contain"
                />
              ) : (
                <Icon name="photos" size={28} color={t.textDim} />
              )}
            </View>
            <View style={styles.meta}>
              <Text style={[styles.metaTitle, { color: t.text }]} numberOfLines={1}>
                {item.mode === 'seamless' ? `${item.slides}-slide carousel` : `${presetFor(item.canvasId)?.name ?? 'Collage'}`}
              </Text>
              <Text style={[styles.metaSub, { color: t.textDim }]} numberOfLines={1}>
                {canvasLabel({ id: item.canvasId, width: item.canvasWidth ?? 0, height: item.canvasHeight ?? 0 })} ·{' '}
                {new Date(item.updatedAt).toLocaleDateString()}
              </Text>
            </View>
            <IconButton icon="more" label="More options" onPress={() => manage(item)} style={styles.more} size={18} />
          </Pressable>
        )}
        ListFooterComponent={
          // Second placement (AD-4), off until separately enabled.
          <View style={styles.footer}>
            <AdSlot placement="collages" />
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  column: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.sm },
  title: { fontSize: 20, fontWeight: '700', flex: 1, textAlign: 'center' },
  headerSpacer: { width: 40 },
  list: { padding: space.lg, gap: space.md },
  gridRow: { gap: space.md },
  card: { flex: 1, borderRadius: radius.md, overflow: 'hidden' },
  thumbBox: { height: 150, alignItems: 'center', justifyContent: 'center', padding: space.sm },
  thumb: { maxWidth: '100%', maxHeight: '100%', height: '100%' },
  meta: { paddingHorizontal: space.md, paddingBottom: space.md, paddingRight: 36 },
  metaTitle: { fontSize: 14, fontWeight: '600' },
  metaSub: { fontSize: 12, marginTop: 2 },
  more: { position: 'absolute', right: 2, bottom: 6 },
  empty: { textAlign: 'center', marginTop: space.xl, fontSize: 15 },
  footer: { marginTop: space.lg, alignItems: 'center' },
});
