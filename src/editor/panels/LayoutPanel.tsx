import { router } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { docSize } from '@/core/canvas';
import { addFreeFrame, applyTemplate } from '@/core/doc';
import { builtInTemplates, cellsFor } from '@/core/templates';
import type { Template } from '@/core/types';
import { haptic } from '@/services/haptics';
import { useEditor } from '@/state/editorStore';
import { useSettings } from '@/state/settingsStore';
import { Icon } from '@/ui/Icon';
import { TemplateThumb } from '@/ui/TemplateThumb';
import { radius, space, useTheme } from '@/ui/theme';

import type { CanvasApi } from '../EditorCanvas';

const THUMB_H = 64;

/** Switch templates mid-edit (T-3), open the builder (T-4) or add free frames (S-6). */
export function LayoutPanel({ canvasApi }: { canvasApi: React.RefObject<CanvasApi | null> }) {
  const t = useTheme();
  const doc = useEditor((s) => s.doc);
  const custom = useSettings((s) => s.customTemplates);
  if (!doc) return null;
  const seamless = doc.mode === 'seamless';
  const templates: Template[] = seamless ? builtInTemplates('seamless') : [...custom, ...builtInTemplates('collage')];
  const size = docSize(doc);
  const slideAspect = doc.canvas.width / doc.canvas.height;

  const choose = (tmpl: Template) => {
    if (tmpl.id === doc.templateId) return;
    haptic('select');
    useEditor.getState().commit((d) => applyTemplate(d, tmpl));
    useSettings.getState().markTemplateUsed(tmpl.id);
  };

  const addFrame = () => {
    haptic('light');
    const slide = canvasApi.current?.currentSlide() ?? 0;
    let newId = '';
    useEditor.getState().commit((d) => {
      const r = addFreeFrame(d, slide);
      newId = r.frameId;
      return r.doc;
    });
    useEditor.getState().select(newId);
  };

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
      {seamless ? (
        <ActionTile label="Add frame" icon="frame" onPress={addFrame} />
      ) : (
        <ActionTile label="Build" icon="splitRow" onPress={() => router.push({ pathname: '/builder', params: { target: 'editor' } })} />
      )}
      {templates.map((tmpl) => {
        const aspect = seamless ? slideAspect * (tmpl.slides ?? doc.slides) : size.width / size.height;
        return (
          <View key={tmpl.id} style={styles.item}>
            <TemplateThumb
              cells={cellsFor(tmpl, doc.canvas)}
              aspect={Math.min(aspect, 3.2)}
              height={seamless ? THUMB_H * 0.7 : THUMB_H}
              slides={seamless ? tmpl.slides : 1}
              selected={tmpl.id === doc.templateId}
              label={seamless ? `${tmpl.name} · ${tmpl.slides}` : tmpl.name}
              onPress={() => choose(tmpl)}
              accessibilityLabel={`${tmpl.name}, ${tmpl.cells.length} photos${seamless ? `, ${tmpl.slides} slides` : ''}`}
            />
          </View>
        );
      })}
      {!templates.length && <Text style={{ color: t.textDim }}>No templates</Text>}
    </ScrollView>
  );
}

function ActionTile({ label, icon, onPress }: { label: string; icon: 'frame' | 'splitRow'; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={styles.item}>
      <View style={[styles.action, { borderColor: t.border, backgroundColor: t.surface }]}>
        <Icon name={icon} size={24} color={t.text} />
      </View>
      <Text style={[styles.actionLabel, { color: t.text }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { gap: space.md, paddingHorizontal: space.lg, paddingTop: space.md, alignItems: 'flex-start' },
  item: { alignItems: 'center' },
  action: {
    width: THUMB_H * 0.8,
    height: THUMB_H,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: { fontSize: 12, marginTop: 5, fontWeight: '600' },
});
