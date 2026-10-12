import { Canvas, Circle, LinearGradient, Rect, vec } from '@shopify/react-native-skia';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { create } from 'zustand';

import { hexToHsv, hsvToHex, normalizeHex } from '@/core/backgrounds';

import { radius, space, useTheme } from './theme';

type Request = { title: string; initial: string; resolve: (hex: string | null) => void };

const useStore = create<{ request: Request | null; set: (r: Request | null) => void }>()((set) => ({
  request: null,
  set: (request) => set({ request }),
}));

/** Full color picker with hex entry (B-6). Resolves to a #RRGGBB string or null. */
export function pickColor(initial: string, title = 'Custom color'): Promise<string | null> {
  return new Promise((resolve) => useStore.getState().set({ title, initial, resolve }));
}

const SV_W = 280;
const SV_H = 200;
const HUE_H = 26;

const HUE_STOPS = ['#FF0000', '#FFFF00', '#00FF00', '#00FFFF', '#0000FF', '#FF00FF', '#FF0000'];

export function ColorPickerHost() {
  const { request, set } = useStore();
  const [count, setCount] = useState(0);
  const [current, setCurrent] = useState<Request | null>(null);
  // Remount for each request so the picker starts from its initial color.
  if (request !== current) {
    setCurrent(request);
    if (request) setCount(count + 1);
  }
  return (
    <ColorPickerDialog
      key={count}
      request={request}
      close={(value) => {
        request?.resolve(value);
        set(null);
      }}
    />
  );
}

function ColorPickerDialog({ request, close }: { request: Request | null; close: (hex: string | null) => void }) {
  const t = useTheme();
  const initial = normalizeHex(request?.initial ?? '') ?? '#FFFFFF';
  const [hsv, setHsv] = useState(() => hexToHsv(initial));
  const [hexText, setHexText] = useState(initial);

  const hex = hsvToHex(hsv.h, hsv.s, hsv.v);
  const hueColor = hsvToHex(hsv.h, 1, 1);

  const updateSV = (x: number, y: number) => {
    const s = Math.min(1, Math.max(0, x / SV_W));
    const v = 1 - Math.min(1, Math.max(0, y / SV_H));
    setHsv((p) => ({ ...p, s, v }));
    setHexText(hsvToHex(hsv.h, s, v));
  };
  const updateHue = (x: number) => {
    const h = Math.min(359.9, Math.max(0, (x / SV_W) * 360));
    setHsv((p) => ({ ...p, h }));
    setHexText(hsvToHex(h, hsv.s, hsv.v));
  };

  const svGesture = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onBegin((e) => updateSV(e.x, e.y))
    .onUpdate((e) => updateSV(e.x, e.y));
  const hueGesture = Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onBegin((e) => updateHue(e.x))
    .onUpdate((e) => updateHue(e.x));

  const onHex = (text: string) => {
    setHexText(text);
    const n = normalizeHex(text);
    if (n) setHsv(hexToHsv(n));
  };

  return (
    <Modal visible={!!request} transparent animationType="fade" onRequestClose={() => close(null)}>
      {/* Modals render outside the root gesture view, so they need their own. */}
      <GestureHandlerRootView style={styles.flex}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.backdrop, { backgroundColor: t.overlay }]}>
          <View style={[styles.dialog, { backgroundColor: t.bg }]}>
            <Text style={[styles.title, { color: t.text }]}>{request?.title}</Text>
            <GestureDetector gesture={svGesture}>
              <Canvas style={styles.sv} accessibilityLabel="Saturation and brightness">
                <Rect x={0} y={0} width={SV_W} height={SV_H}>
                  <LinearGradient start={vec(0, 0)} end={vec(SV_W, 0)} colors={['#FFFFFF', hueColor]} />
                </Rect>
                <Rect x={0} y={0} width={SV_W} height={SV_H}>
                  <LinearGradient start={vec(0, 0)} end={vec(0, SV_H)} colors={['rgba(0,0,0,0)', '#000000']} />
                </Rect>
                <Circle cx={hsv.s * SV_W} cy={(1 - hsv.v) * SV_H} r={10} color="#FFFFFF" style="stroke" strokeWidth={3} />
                <Circle cx={hsv.s * SV_W} cy={(1 - hsv.v) * SV_H} r={11.5} color="rgba(0,0,0,0.35)" style="stroke" strokeWidth={1} />
              </Canvas>
            </GestureDetector>
            <GestureDetector gesture={hueGesture}>
              <Canvas style={styles.hue} accessibilityLabel="Hue">
                <Rect x={0} y={0} width={SV_W} height={HUE_H}>
                  <LinearGradient start={vec(0, 0)} end={vec(SV_W, 0)} colors={HUE_STOPS} />
                </Rect>
                <Rect x={(hsv.h / 360) * SV_W - 3} y={0} width={6} height={HUE_H} color="#FFFFFF" style="stroke" strokeWidth={2.5} />
              </Canvas>
            </GestureDetector>
            <View style={styles.row}>
              <View style={[styles.preview, { backgroundColor: hex, borderColor: t.border }]} />
              <TextInput
                value={hexText}
                onChangeText={onHex}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={7}
                accessibilityLabel="Hex color"
                style={[styles.hexInput, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
              />
            </View>
            <View style={styles.buttons}>
              <Pressable accessibilityRole="button" onPress={() => close(null)} style={styles.button}>
                <Text style={[styles.buttonText, { color: t.textDim }]}>Cancel</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => close(hex)} style={styles.button}>
                <Text style={[styles.buttonText, { color: t.accent, fontWeight: '700' }]}>Done</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  dialog: { borderRadius: radius.lg, padding: space.lg, width: SV_W + space.lg * 2 },
  title: { fontSize: 17, fontWeight: '700', marginBottom: space.md },
  sv: { width: SV_W, height: SV_H, borderRadius: radius.sm, overflow: 'hidden' },
  hue: { width: SV_W, height: HUE_H, marginTop: space.md, borderRadius: radius.sm, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', marginTop: space.md, gap: space.md },
  preview: { width: 44, height: 44, borderRadius: radius.sm, borderWidth: StyleSheet.hairlineWidth },
  hexInput: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    fontSize: 16,
    fontVariant: ['tabular-nums'],
  },
  buttons: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: space.md, gap: space.sm },
  button: { paddingHorizontal: space.md, paddingVertical: space.sm },
  buttonText: { fontSize: 16 },
});
