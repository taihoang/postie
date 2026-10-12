import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useSettings } from '@/state/settingsStore';

import { adUnitId, type Placement } from './config';
import { useRemoteConfig } from './remoteConfig';
import { ensureAdsReady, loadSdk } from './sdk';

/**
 * The single entry point for ads (AD-3). Renders nothing and takes no space
 * when ads are off, the placement is off, the SDK is not ready or the ad
 * fails to load (AD-9). While loading it is invisible and takes no space, so
 * a successful load never shifts content that the user is looking at.
 */
export function AdSlot({ placement }: { placement: Placement }) {
  const config = useRemoteConfig((s) => s.config);
  const fetched = useRemoteConfig((s) => s.status === 'ok');
  const exportCount = useSettings((s) => s.exportCount);
  const [ready, setReady] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const frequencyOk = placement !== 'saved' || exportCount % Math.max(1, config.savedEveryNthExport) === 0;
  const enabled = fetched && config.adsEnabled && config.placements[placement] && frequencyOk;

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    ensureAdsReady().then((ok) => alive && setReady(ok));
    return () => {
      alive = false;
    };
  }, [enabled]);

  if (!enabled || !ready || failed) return null;

  const { BannerAd, BannerAdSize, TestIds } = loadSdk();
  return (
    <View style={loaded ? styles.shown : styles.loading} pointerEvents={loaded ? 'auto' : 'none'}>
      <BannerAd
        unitId={adUnitId(placement, TestIds.BANNER)}
        size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER}
        // AD-6: non-personalized only, so no App Tracking Transparency prompt.
        requestOptions={{ requestNonPersonalizedAdsOnly: true }}
        onAdLoaded={() => setLoaded(true)}
        onAdFailedToLoad={() => setFailed(true)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  loading: { position: 'absolute', opacity: 0, left: 0, right: 0, bottom: 0 },
  shown: { alignItems: 'center' },
});
