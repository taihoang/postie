import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SEAMLESS_RATIOS, canvasSpec, docSize } from '@/core/canvas';
import { DEFAULT_SEAMLESS_SLIDES } from '@/core/doc';
import { COLLAGE_PRESETS, SEAMLESS_PRESETS, cellsFor, findTemplate, groupByCount } from '@/core/templates';
import type { CanvasSpec, Mode, Template } from '@/core/types';
import { openDraft, startCollage } from '@/services/session';
import { useDrafts } from '@/state/draftsStore';
import { useSettings } from '@/state/settingsStore';
import { CanvasSizeChips } from '@/ui/CanvasSizeChips';
import { Icon } from '@/ui/Icon';
import { TemplateThumb } from '@/ui/TemplateThumb';
import { Segmented } from '@/ui/controls';
import { prompt, toast } from '@/ui/overlays';
import { MAX_CONTENT_WIDTH, radius, space, useTheme } from '@/ui/theme';

const THUMB_H = 92;

/** First screen: the template picker. No sign-up, onboarding or paywall (A-1). */
export default function StartScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const mode = useSettings((s) => s.startMode);
  const collageCanvas = useSettings((s) => s.collageCanvas);
  const seamlessCanvas = useSettings((s) => s.seamlessCanvas);
  const custom = useSettings((s) => s.customTemplates);
  const recentIds = useSettings((s) => s.recentTemplateIds);
  const draftCount = useDrafts((s) => s.drafts.length);

  useResumeOnLaunch();

  const canvas: CanvasSpec =
    mode === 'collage' ? collageCanvas : SEAMLESS_RATIOS.includes(seamlessCanvas.id) ? seamlessCanvas : canvasSpec('4:5');
  const size = docSize({ canvas, slides: 1 });
  const aspect = size.width / size.height;

  const recent = useMemo(
    () => recentIds.map((id) => findTemplate(id, custom)).filter((x): x is Template => !!x && x.mode === 'collage'),
    [recentIds, custom],
  );
  const groups = useMemo(() => groupByCount(COLLAGE_PRESETS), []);
  const seamlessGroups = useMemo(() => {
    const bySlides = new Map<number, Template[]>();
    for (const tmpl of SEAMLESS_PRESETS) bySlides.set(tmpl.slides ?? 2, [...(bySlides.get(tmpl.slides ?? 2) ?? []), tmpl]);
    return [...bySlides.entries()].sort((a, b) => a[0] - b[0]);
  }, []);

  const thumb = (tmpl: Template, key: string, onLongPress?: () => void) => (
    <TemplateThumb
      key={key}
      cells={cellsFor(tmpl, canvas)}
      aspect={aspect}
      height={THUMB_H}
      label={tmpl.name}
      onPress={() => startCollage('collage', tmpl)}
      onLongPress={onLongPress}
      accessibilityLabel={`${tmpl.name}, ${tmpl.cells.length} photos`}
    />
  );

  return (
    <View style={[styles.screen, { backgroundColor: t.bg, paddingTop: insets.top }]}>
      <View style={styles.column}>
        <View style={styles.header}>
          <Text style={[styles.brand, { color: t.text }]} accessibilityRole="header">
            Postie
          </Text>
          {draftCount > 0 && (
            <Pressable
              onPress={() => router.push('/collages')}
              accessibilityRole="button"
              accessibilityLabel="My collages"
              style={({ pressed }) => [styles.headerButton, { backgroundColor: t.surface, opacity: pressed ? 0.6 : 1 }]}
            >
              <Icon name="collages" size={17} color={t.text} />
              <Text style={[styles.headerButtonText, { color: t.text }]}>My collages</Text>
            </Pressable>
          )}
        </View>
        <View style={styles.segment}>
          <Segmented<Mode>
            value={mode}
            onChange={(m) => useSettings.getState().setStartMode(m)}
            options={[
              { value: 'collage', label: 'Collage' },
              { value: 'seamless', label: 'Seamless carousel' },
            ]}
          />
        </View>
        <CanvasSizeChips
          value={canvas}
          only={mode === 'seamless' ? SEAMLESS_RATIOS : undefined}
          allowCustom={mode === 'collage'}
          onChange={(c) => useSettings.getState().setCanvas(mode, c)}
        />
      </View>

      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + space.xl }]}>
        <View style={styles.column}>
          {mode === 'collage' ? (
            <>
              <Section title="My templates">
                <NewTemplateTile height={THUMB_H} />
                {custom.map((tmpl) => thumb(tmpl, `c-${tmpl.id}`, () => manageTemplate(tmpl)))}
              </Section>
              {recent.length > 0 && <Section title="Recently used">{recent.map((tmpl) => thumb(tmpl, `r-${tmpl.id}`))}</Section>}
              {groups.map((g) => (
                <Section key={g.count} title={`${g.count} photos`}>
                  {g.templates.map((tmpl) => thumb(tmpl, tmpl.id))}
                </Section>
              ))}
            </>
          ) : (
            <>
              <Text style={[styles.intro, { color: t.textDim }]}>
                Design on one wide canvas. Postie cuts it into slides that swipe on Instagram like a single image.
              </Text>
              <Section title="Start blank">
                {[2, 3, 4, 5].map((n) => (
                  <TemplateThumb
                    key={n}
                    cells={[]}
                    slides={n}
                    aspect={aspect * n}
                    height={THUMB_H * 0.62}
                    label={`${n} slides`}
                    onPress={() => startCollage('seamless', undefined, n)}
                    accessibilityLabel={`Blank carousel, ${n} slides`}
                  />
                ))}
              </Section>
              {seamlessGroups.map(([slides, list]) => (
                <Section key={slides} title={`${slides} slides`}>
                  {list.map((tmpl) => (
                    <TemplateThumb
                      key={tmpl.id}
                      cells={tmpl.cells}
                      slides={slides}
                      aspect={aspect * slides}
                      height={THUMB_H * 0.62}
                      label={tmpl.name}
                      onPress={() => startCollage('seamless', tmpl)}
                      accessibilityLabel={`${tmpl.name}, ${slides} slides, ${tmpl.cells.length} photos`}
                    />
                  ))}
                </Section>
              ))}
              <Text style={[styles.intro, { color: t.textDim }]}>
                Up to 20 slides. You can change the slide count later; default is {DEFAULT_SEAMLESS_SLIDES}.
              </Text>
            </>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

/** A-8: reopen the last unfinished collage after the settings have loaded. */
function useResumeOnLaunch() {
  const done = useRef(false);
  useEffect(() => {
    const tryResume = () => {
      if (done.current) return;
      done.current = true;
      const id = useSettings.getState().resumeDraftId;
      if (id && useDrafts.getState().drafts.some((d) => d.id === id)) openDraft(id);
    };
    const ready = () => useSettings.persist.hasHydrated() && useDrafts.persist.hasHydrated();
    if (ready()) {
      tryResume();
      return;
    }
    const unsubs = [
      useSettings.persist.onFinishHydration(() => ready() && tryResume()),
      useDrafts.persist.onFinishHydration(() => ready() && tryResume()),
    ];
    return () => unsubs.forEach((u) => u());
  }, []);
}

/** T-8: rename, duplicate and delete saved templates. */
function manageTemplate(tmpl: Template) {
  const s = useSettings.getState();
  const rename = async () => {
    const name = await prompt({ title: 'Rename template', initial: tmpl.name });
    if (name) s.renameTemplate(tmpl.id, name);
  };
  const edit = () => router.push({ pathname: '/builder', params: { editId: tmpl.id } });
  const duplicate = () => {
    s.duplicateTemplate(tmpl.id);
    toast('Template duplicated');
  };
  const remove = () =>
    Alert.alert(`Delete “${tmpl.name}”?`, undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => s.deleteTemplate(tmpl.id) },
    ]);
  const actions = [
    { label: 'Edit layout', run: edit },
    { label: 'Rename', run: rename },
    { label: 'Duplicate', run: duplicate },
    { label: 'Delete', run: remove },
  ];
  if (Platform.OS === 'ios') {
    ActionSheetIOS.showActionSheetWithOptions(
      { title: tmpl.name, options: [...actions.map((a) => a.label), 'Cancel'], destructiveButtonIndex: 3, cancelButtonIndex: 4 },
      (i) => actions[i]?.run(),
    );
  } else {
    Alert.alert(tmpl.name, undefined, [...actions.map((a) => ({ text: a.label, onPress: a.run })), { text: 'Cancel', style: 'cancel' }]);
  }
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: t.text }]} accessibilityRole="header">
        {title}
      </Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        {children}
      </ScrollView>
    </View>
  );
}

function NewTemplateTile({ height }: { height: number }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={() => router.push('/builder')}
      accessibilityRole="button"
      accessibilityLabel="Build a custom template"
      style={styles.newTile}
    >
      <View style={[styles.newBox, { height, width: height * 0.8, borderColor: t.border, backgroundColor: t.surface }]}>
        <Icon name="plus" size={26} color={t.text} />
      </View>
      <Text style={[styles.newLabel, { color: t.text }]}>New</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  column: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.md,
  },
  brand: { fontSize: 34, fontWeight: '800', letterSpacing: -0.5 },
  headerButton: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill },
  headerButtonText: { fontSize: 15, fontWeight: '600' },
  segment: { paddingHorizontal: space.lg, marginBottom: space.md },
  scroll: { paddingTop: space.md },
  section: { marginBottom: space.lg },
  sectionTitle: { fontSize: 17, fontWeight: '700', paddingHorizontal: space.lg, marginBottom: space.sm },
  row: { gap: space.md, paddingHorizontal: space.lg, alignItems: 'flex-start' },
  intro: { fontSize: 15, lineHeight: 21, paddingHorizontal: space.lg, marginBottom: space.lg },
  newTile: { alignItems: 'center' },
  newBox: { borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  newLabel: { fontSize: 12, marginTop: 5, fontWeight: '600' },
});
