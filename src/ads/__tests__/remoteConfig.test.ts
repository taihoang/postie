import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_ADS_CONFIG, parseAdsConfig } from '../config';
import { refreshRemoteConfig, useRemoteConfig } from '../remoteConfig';
import { ensureAdsReady } from '../sdk';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const ON = { adsEnabled: true, placements: { saved: true, collages: false }, savedEveryNthExport: 2 };

function mockFetch(impl: () => Promise<unknown>) {
  globalThis.fetch = jest.fn(impl) as unknown as typeof fetch;
}

describe('remote ads config', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    useRemoteConfig.setState({ config: DEFAULT_ADS_CONFIG, status: 'idle' });
  });

  it('ads are off by default', () => {
    expect(useRemoteConfig.getState().config.adsEnabled).toBe(false);
  });

  it('rejects malformed config', () => {
    expect(parseAdsConfig(null)).toBeNull();
    expect(parseAdsConfig({ adsEnabled: 'yes' })).toBeNull();
    expect(parseAdsConfig({ adsEnabled: true, savedEveryNthExport: -4 })?.savedEveryNthExport).toBe(3);
  });

  it('turns ads on from the remote file and caches it', async () => {
    mockFetch(async () => ({ ok: true, json: async () => ON }));
    await refreshRemoteConfig('https://example.test/c.json');
    expect(useRemoteConfig.getState().config).toEqual(ON);
    expect(JSON.parse((await AsyncStorage.getItem('postie.remoteConfig.v1'))!)).toEqual(ON);
  });

  it('sends no credentials or identifying data', async () => {
    mockFetch(async () => ({ ok: true, json: async () => ON }));
    await refreshRemoteConfig('https://example.test/c.json');
    const [url, init] = (globalThis.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://example.test/c.json');
    expect(init.credentials).toBe('omit');
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
  });

  it('a cached "on" alone never starts the ad SDK', async () => {
    useRemoteConfig.setState({ config: ON, status: 'loading' });
    await expect(ensureAdsReady()).resolves.toBe(false);
    useRemoteConfig.setState({ config: ON, status: 'failed' });
    await expect(ensureAdsReady()).resolves.toBe(false);
  });

  it('keeps ads off when the fetch fails, even if the cache said on', async () => {
    await AsyncStorage.setItem('postie.remoteConfig.v1', JSON.stringify(ON));
    mockFetch(async () => {
      throw new Error('offline');
    });
    await refreshRemoteConfig('https://example.test/c.json');
    expect(useRemoteConfig.getState().config.adsEnabled).toBe(false);
    expect(useRemoteConfig.getState().status).toBe('failed');
  });
});
