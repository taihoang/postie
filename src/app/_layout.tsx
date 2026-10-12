import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { refreshRemoteConfig } from '@/ads/remoteConfig';
import { cleanupOrphanPhotos } from '@/services/drafts';
import { ColorPickerHost } from '@/ui/ColorPicker';
import { PromptHost, ToastHost } from '@/ui/overlays';
import { useTheme } from '@/ui/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const t = useTheme();

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
    // AD-1: the only network call, anonymous and non-blocking.
    refreshRemoteConfig();
    // Housekeeping after launch, off the critical path (N-1).
    const timer = setTimeout(() => cleanupOrphanPhotos().catch(() => {}), 4000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <GestureHandlerRootView style={styles.flex}>
      <SafeAreaProvider>
        <StatusBar style="auto" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: t.bg },
          }}
        >
          <Stack.Screen name="index" />
          {/* Edge swipes belong to the canvas, not to "back". */}
          <Stack.Screen name="editor" options={{ gestureEnabled: false }} />
          {/* Not a native modal: the name prompt (an RN Modal) must be able to present over it. */}
          <Stack.Screen name="builder" options={{ animation: 'slide_from_bottom', gestureEnabled: false }} />
          <Stack.Screen name="preview" options={{ presentation: 'modal' }} />
          <Stack.Screen name="saved" options={{ gestureEnabled: false }} />
          <Stack.Screen name="collages" />
        </Stack>
        <ToastHost />
        <PromptHost />
        <ColorPickerHost />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
});
