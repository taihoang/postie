import { Skia, type SkImage } from '@shopify/react-native-skia';
import { useEffect, useMemo, useState } from 'react';

import type { PhotoAsset } from '@/core/types';
import { photoUri } from '@/services/files';

import type { ImageMap } from './Scene';

/** Decoded editor previews, least-recently-used first. */
const cache = new Map<string, SkImage>();
const inflight = new Map<string, Promise<SkImage | null>>();
const MAX_CACHED = 48;

function remember(uri: string, image: SkImage) {
  cache.delete(uri);
  cache.set(uri, image);
  while (cache.size > MAX_CACHED) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export function peekImage(uri: string): SkImage | undefined {
  return cache.get(uri);
}

export async function loadImage(uri: string): Promise<SkImage | null> {
  const hit = cache.get(uri);
  if (hit) {
    remember(uri, hit);
    return hit;
  }
  let pending = inflight.get(uri);
  if (!pending) {
    pending = Skia.Data.fromURI(uri)
      .then((data) => {
        const image = Skia.Image.MakeImageFromEncoded(data);
        if (image) remember(uri, image);
        return image;
      })
      .catch(() => null)
      .finally(() => inflight.delete(uri));
    inflight.set(uri, pending);
  }
  return pending;
}

/** Preview images for every photo in a document; cached ones resolve synchronously. */
export function usePreviewImages(photos: Record<string, PhotoAsset>): ImageMap {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let alive = true;
    for (const p of Object.values(photos)) {
      const uri = photoUri(p.preview);
      if (!cache.has(uri)) {
        loadImage(uri).then((img) => {
          if (alive && img) setVersion((v) => v + 1);
        });
      }
    }
    return () => {
      alive = false;
    };
  }, [photos]);

  return useMemo(() => {
    const map: ImageMap = {};
    for (const p of Object.values(photos)) map[p.id] = cache.get(photoUri(p.preview)) ?? null;
    return map;
    // `version` re-reads the cache after a load finishes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos, version]);
}

/** Await all previews (used to render thumbnails off-screen). */
export async function loadPreviewImages(photos: Record<string, PhotoAsset>): Promise<ImageMap> {
  const entries = await Promise.all(
    Object.values(photos).map(async (p) => [p.id, await loadImage(photoUri(p.preview))] as const),
  );
  return Object.fromEntries(entries);
}
