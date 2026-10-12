import { Platform } from 'react-native';

/**
 * Remote app-settings file (AD-1). A plain static JSON file is enough, e.g. on
 * GitHub Pages or S3. Replace with your own URL before release; see
 * config/app-settings.json for the format. The request carries no user data.
 */
export const REMOTE_CONFIG_URL = 'https://example.com/postie/app-settings.json';

export const FETCH_TIMEOUT_MS = 5000;

export type Placement = 'saved' | 'collages';

export type AdsRemoteConfig = {
  adsEnabled: boolean;
  /** Each placement has its own switch (AD-4). */
  placements: Record<Placement, boolean>;
  /** Show the "Saved" banner on every Nth export (AD-8). */
  savedEveryNthExport: number;
};

/** Ads are off unless the remote file explicitly turns them on. */
export const DEFAULT_ADS_CONFIG: AdsRemoteConfig = {
  adsEnabled: false,
  placements: { saved: true, collages: false },
  savedEveryNthExport: 3,
};

/**
 * AdMob ad unit ids. In development Google's test units are used so no real
 * impressions are recorded. Replace the production ids before enabling ads.
 */
const PRODUCTION_UNITS: Record<Placement, { ios: string; android: string }> = {
  saved: { ios: 'ca-app-pub-0000000000000000/0000000000', android: 'ca-app-pub-0000000000000000/0000000000' },
  collages: { ios: 'ca-app-pub-0000000000000000/0000000000', android: 'ca-app-pub-0000000000000000/0000000000' },
};

export function adUnitId(placement: Placement, testBannerId: string): string {
  if (__DEV__) return testBannerId;
  const ids = PRODUCTION_UNITS[placement];
  return Platform.OS === 'ios' ? ids.ios : ids.android;
}

/** Validate untrusted JSON from the network; anything malformed means "ads off". */
export function parseAdsConfig(raw: unknown): AdsRemoteConfig | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.adsEnabled !== 'boolean') return null;
  const placements = (r.placements ?? {}) as Record<string, unknown>;
  const nth = Number(r.savedEveryNthExport);
  return {
    adsEnabled: r.adsEnabled,
    placements: {
      saved: placements.saved === true,
      collages: placements.collages === true,
    },
    savedEveryNthExport: Number.isFinite(nth) && nth >= 1 ? Math.min(100, Math.round(nth)) : DEFAULT_ADS_CONFIG.savedEveryNthExport,
  };
}
