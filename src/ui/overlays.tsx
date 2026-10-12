import React, { useEffect, useState } from 'react';
import { Animated, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { create } from 'zustand';

import { radius, space, useTheme } from './theme';

// ---------- Toast ----------

type ToastState = { message: string | null; key: number; show: (message: string) => void };

export const useToast = create<ToastState>()((set, get) => ({
  message: null,
  key: 0,
  show: (message) => set({ message, key: get().key + 1 }),
}));

export function toast(message: string): void {
  useToast.getState().show(message);
}

export function ToastHost() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { message, key } = useToast();
  const [opacity] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!message) return;
    opacity.setValue(0);
    Animated.sequence([
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
      Animated.delay(1800),
      Animated.timing(opacity, { toValue: 0, duration: 240, useNativeDriver: true }),
    ]).start();
  }, [key, message, opacity]);

  if (!message) return null;
  return (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={[styles.toast, { top: insets.top + 8, opacity, backgroundColor: t.text }]}
    >
      <Text style={[styles.toastText, { color: t.bg }]}>{message}</Text>
    </Animated.View>
  );
}

// ---------- Prompt (cross-platform text input dialog) ----------

type PromptRequest = {
  title: string;
  message?: string;
  initial?: string;
  confirmLabel?: string;
  placeholder?: string;
  keyboard?: 'default' | 'number-pad';
  resolve: (value: string | null) => void;
};

const usePromptStore = create<{ request: PromptRequest | null; set: (r: PromptRequest | null) => void }>()((set) => ({
  request: null,
  set: (request) => set({ request }),
}));

export function prompt(opts: Omit<PromptRequest, 'resolve'>): Promise<string | null> {
  return new Promise((resolve) => usePromptStore.getState().set({ ...opts, resolve }));
}

export function PromptHost() {
  const { request, set } = usePromptStore();
  const [count, setCount] = useState(0);
  const [current, setCurrent] = useState<PromptRequest | null>(null);
  // Remount the dialog for each request so its text starts from `initial`.
  if (request !== current) {
    setCurrent(request);
    if (request) setCount(count + 1);
  }
  return (
    <PromptDialog
      key={count}
      request={request}
      close={(result) => {
        request?.resolve(result);
        set(null);
      }}
    />
  );
}

function PromptDialog({ request, close }: { request: PromptRequest | null; close: (v: string | null) => void }) {
  const t = useTheme();
  const [value, setValue] = useState(request?.initial ?? '');

  return (
    <Modal visible={!!request} transparent animationType="fade" onRequestClose={() => close(null)}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[styles.backdrop, { backgroundColor: t.overlay }]}>
        <View style={[styles.dialog, { backgroundColor: t.bg }]}>
          <Text style={[styles.dialogTitle, { color: t.text }]}>{request?.title}</Text>
          {request?.message ? <Text style={[styles.dialogMessage, { color: t.textDim }]}>{request.message}</Text> : null}
          <TextInput
            value={value}
            onChangeText={setValue}
            autoFocus
            placeholder={request?.placeholder}
            placeholderTextColor={t.textDim}
            keyboardType={request?.keyboard ?? 'default'}
            selectTextOnFocus
            returnKeyType="done"
            onSubmitEditing={() => close(value.trim() || null)}
            style={[styles.input, { color: t.text, borderColor: t.border, backgroundColor: t.surface }]}
          />
          <View style={styles.dialogButtons}>
            <Pressable accessibilityRole="button" onPress={() => close(null)} style={styles.dialogButton}>
              <Text style={[styles.dialogButtonText, { color: t.textDim }]}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => close(value.trim() || null)}
              style={styles.dialogButton}
              disabled={!value.trim()}
            >
              <Text style={[styles.dialogButtonText, { color: value.trim() ? t.accent : t.textDim, fontWeight: '700' }]}>
                {request?.confirmLabel ?? 'Save'}
              </Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    paddingHorizontal: space.lg,
    paddingVertical: 10,
    borderRadius: radius.pill,
    zIndex: 1000,
  },
  toastText: { fontSize: 15, fontWeight: '600' },
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
  dialog: { width: '100%', maxWidth: 360, borderRadius: radius.lg, padding: space.lg },
  dialogTitle: { fontSize: 17, fontWeight: '700', marginBottom: space.xs },
  dialogMessage: { fontSize: 14, marginBottom: space.sm },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: 10,
    fontSize: 16,
    marginTop: space.sm,
  },
  dialogButtons: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: space.md, gap: space.sm },
  dialogButton: { paddingHorizontal: space.md, paddingVertical: space.sm },
  dialogButtonText: { fontSize: 16 },
});
