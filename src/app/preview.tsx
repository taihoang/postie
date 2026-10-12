import { Canvas, Image as SkImageView, drawAsImage, type SkImage } from '@shopify/react-native-skia';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { sliceJobs } from '@/render/exportScene';
import { loadPreviewImages } from '@/render/imageCache';
import { useEditor } from '@/state/editorStore';
import { IconButton } from '@/ui/controls';
import { space, useTheme } from '@/ui/theme';

/** S-9: swipe through the slices exactly as Instagram will show them. */
export default function PreviewScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const doc = useEditor((s) => s.doc);
  const [slides, setSlides] = useState<SkImage[] | null>(null);
  const [page, setPage] = useState(0);

  const phoneW = Math.min(screenW - 48, 360);
  const slideH = doc ? (phoneW * doc.canvas.height) / doc.canvas.width : phoneW;

  useEffect(() => {
    if (!doc) return;
    let alive = true;
    (async () => {
      const images = await loadPreviewImages(doc.photos);
      // ~2× the on-screen width is sharp enough and quick to render.
      const scale = Math.min(1, (phoneW * 2) / doc.canvas.width);
      const out: SkImage[] = [];
      for (const job of sliceJobs(doc, images, scale, true)) {
        const img = await drawAsImage(job.element, { width: job.width, height: job.height });
        if (img) out.push(img);
      }
      if (alive) setSlides(out);
    })();
    return () => {
      alive = false;
    };
  }, [doc, phoneW]);

  if (!doc) return null;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setPage(Math.round(e.nativeEvent.contentOffset.x / phoneW));
  };

  return (
    <View style={[styles.screen, { backgroundColor: t.bg, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: t.text }]} accessibilityRole="header">
          Swipe preview
        </Text>
        <IconButton icon="close" label="Close preview" onPress={() => router.back()} />
      </View>

      <View style={styles.center}>
        <View style={[styles.phone, { width: phoneW + 20, borderColor: t.text }]}>
          <View style={styles.postHeader}>
            <View style={[styles.avatar, { backgroundColor: t.surface2 }]} />
            <View style={[styles.nameBar, { backgroundColor: t.surface2 }]} />
          </View>
          <View style={{ width: phoneW, height: slideH, backgroundColor: t.surface }}>
            {slides ? (
              <FlatList
                data={slides}
                horizontal
                pagingEnabled
                showsHorizontalScrollIndicator={false}
                keyExtractor={(_, i) => String(i)}
                onScroll={onScroll}
                scrollEventThrottle={16}
                renderItem={({ item, index }) => (
                  <Canvas style={{ width: phoneW, height: slideH }} accessibilityLabel={`Slide ${index + 1} of ${slides.length}`}>
                    <SkImageView image={item} x={0} y={0} width={phoneW} height={slideH} fit="fill" />
                  </Canvas>
                )}
              />
            ) : (
              <ActivityIndicator style={styles.loading} color={t.accent} />
            )}
          </View>
          <View style={styles.dots}>
            {Array.from({ length: doc.slides }, (_, i) => (
              <View key={i} style={[styles.dot, { backgroundColor: i === page ? t.accent : t.surface2 }]} />
            ))}
          </View>
        </View>
        <Text style={[styles.caption, { color: t.textDim }]}>
          {page + 1} / {doc.slides}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: space.lg },
  title: { fontSize: 20, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  phone: { borderWidth: 3, borderRadius: 34, paddingHorizontal: 7, paddingTop: 16, paddingBottom: 18, alignItems: 'center' },
  postHeader: { flexDirection: 'row', alignItems: 'center', alignSelf: 'stretch', gap: 8, paddingHorizontal: 6, paddingBottom: 10 },
  avatar: { width: 26, height: 26, borderRadius: 13 },
  nameBar: { width: 90, height: 10, borderRadius: 5 },
  loading: { flex: 1 },
  dots: { flexDirection: 'row', gap: 5, marginTop: 12, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 220 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  caption: { marginTop: space.md, fontSize: 14 },
});
