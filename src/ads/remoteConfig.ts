import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

import { DEFAULT_ADS_CONFIG, FETCH_TIMEOUT_MS, REMOTE_CONFIG_URL, parseAdsConfig, type AdsRemoteConfig } from './config';

const CACHE_KEY = 'postie.remoteConfig.v1';

type Status = 'idle' | 'loading' | 'ok' | 'failed';

type RemoteConfigState = { config: AdsRemoteConfig; status: Status };

export const useRemoteConfig = create<RemoteConfigState>()(() => ({
  config: DEFAULT_ADS_CONFIG,
  status: 'idle',
}));

/**
 * The app's only network request (AD-1): an anonymous GET of a small static
 * file. No identifiers, cookies or query parameters are sent. The last good
 * value is cached, but only a successful fetch in this launch (status 'ok')
 * can turn ads on; if the request fails, ads stay off for the session.
 */
export async function refreshRemoteConfig(url = REMOTE_CONFIG_URL): Promise<void> {
  if (useRemoteConfig.getState().status === 'loading') return;
  useRemoteConfig.setState({ status: 'loading' });

  try {
    const cached = await AsyncStorage.getItem(CACHE_KEY);
    const parsed = cached ? parseAdsConfig(JSON.parse(cached)) : null;
    if (parsed) useRemoteConfig.setState({ config: parsed });
  } catch {
    // A corrupt cache just means defaults.
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const config = parseAdsConfig(await res.json());
    if (!config) throw new Error('Malformed config');
    useRemoteConfig.setState({ config, status: 'ok' });
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(config));
  } catch {
    useRemoteConfig.setState({ config: { ...useRemoteConfig.getState().config, adsEnabled: false }, status: 'failed' });
  } finally {
    clearTimeout(timer);
  }
}
