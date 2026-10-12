/**
 * Lazy access to the Google Mobile Ads SDK (AD-2). The native SDK is in the
 * binary but is never initialized, and the JS module is never even loaded,
 * until the remote flag turns ads on.
 */
import type * as GMA from 'react-native-google-mobile-ads';

import { useRemoteConfig } from './remoteConfig';

let sdk: typeof GMA | null = null;
let ready: Promise<boolean> | null = null;

export function loadSdk(): typeof GMA {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  if (!sdk) sdk = require('react-native-google-mobile-ads') as typeof GMA;
  return sdk;
}

/**
 * Gather consent where the law requires it, then start the SDK. Google's
 * consent form (UMP) only appears in regions that need it, such as the
 * EEA and UK (AD-7), and only once ads are on.
 */
export function ensureAdsReady(): Promise<boolean> {
  const { status, config } = useRemoteConfig.getState();
  // Only this launch's successful fetch can turn ads on, never the cache alone.
  if (status !== 'ok' || !config.adsEnabled) return Promise.resolve(false);
  if (!ready) {
    ready = (async () => {
      try {
        const { AdsConsent, default: mobileAds } = loadSdk();
        const consent = await AdsConsent.gatherConsent();
        if (!consent.canRequestAds) return false;
        await mobileAds().initialize();
        return true;
      } catch (e) {
        console.warn('Ads unavailable', e);
        return false;
      }
    })();
  }
  return ready;
}
