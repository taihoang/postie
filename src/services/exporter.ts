import { ImageFormat, Skia, drawAsImage, type SkImage } from '@shopify/react-native-skia';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library';
import * as Sharing from 'expo-sharing';
import { Platform, Share } from 'react-native';

import { docSize, layoutParams } from '@/core/canvas';
import { frameBox, neededPhotoPixels } from '@/core/geometry';
import type { CollageDoc, ExportFormat, ExportQuality } from '@/core/types';
import { loadPreviewImages } from '@/render/imageCache';
import { sliceJobs, wholeJob, type RenderJob } from '@/render/exportScene';
import type { ImageMap } from '@/render/Scene';

import { ensureDir, exportsDir, photoUri, safeDelete } from './files';

/** Largest GPU texture on supported iPhones; bigger off-screen surfaces fail. */
export const MAX_SURFACE_PX = 16384;

/** E-4: keep files under Instagram-friendly sizes. */
const MAX_BYTES = 8 * 1024 * 1024;
const JPEG_QUALITY = 92;
const ALBUM_NAME = 'Postie';

export type ExportProgress = { stage: 'photos' | 'render'; done: number; total: number };

export type ExportOptions = {
  quality: ExportQuality;
  format: ExportFormat;
  /** Seamless only: one panorama image instead of slides (S-13). */
  panorama?: boolean;
  onProgress?: (p: ExportProgress) => void;
};

export function exportScale(quality: ExportQuality): number {
  return quality === 'high' ? 2 : 1;
}

/**
 * Decode each photo from its original file at exactly the resolution its
 * frame needs (E-2). Huge originals are downsampled from the original, never
 * upscaled from the editor preview, which also keeps memory in check.
 */
async function loadExportImages(doc: CollageDoc, scale: number, onProgress?: ExportOptions['onProgress']): Promise<ImageMap> {
  const L = layoutParams(doc);
  const needed = new Map<string, number>();
  for (const f of doc.frames) {
    if (!f.photoId) continue;
    const p = doc.photos[f.photoId];
    if (!p) continue;
    const box = frameBox(f.rect, L, !!f.free);
    const px = neededPhotoPixels(box, p.width, p.height, f.crop, scale);
    needed.set(p.id, Math.max(needed.get(p.id) ?? 0, px));
  }

  // The blurred background photo is soft anyway; its preview is plenty.
  const images: ImageMap = {};
  const bg = doc.style.background;
  if (bg.kind === 'photo' && doc.photos[bg.photoId]) {
    Object.assign(images, await loadPreviewImages({ [bg.photoId]: doc.photos[bg.photoId] }));
  }

  const ids = [...needed.keys()];
  for (let i = 0; i < ids.length; i++) {
    onProgress?.({ stage: 'photos', done: i, total: ids.length });
    const p = doc.photos[ids[i]];
    images[p.id] = await decodeOriginal(photoUri(p.file), p.width, p.height, needed.get(p.id) ?? 0);
  }
  onProgress?.({ stage: 'photos', done: ids.length, total: ids.length });
  return images;
}

async function decodeOriginal(uri: string, w: number, h: number, neededLongSide: number): Promise<SkImage | null> {
  const long = Math.max(w, h);
  const context = ImageManipulator.manipulate(uri);
  // Only shrink, and only when it saves real memory.
  if (neededLongSide > 0 && neededLongSide < long * 0.9) {
    const target = Math.max(1, Math.round(neededLongSide));
    context.resize(w >= h ? { width: target } : { height: target });
  }
  const ref = await context.renderAsync();
  // Re-encoding at 0.97 also bakes in the EXIF orientation for Skia.
  const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.97 });
  ref.release();
  context.release();
  try {
    const data = await Skia.Data.fromURI(saved.uri);
    return Skia.Image.MakeImageFromEncoded(data);
  } finally {
    safeDelete(new File(saved.uri));
  }
}

function encode(image: SkImage, format: ExportFormat): { bytes: Uint8Array; ext: string; mime: string } {
  if (format === 'png') {
    return { bytes: image.encodeToBytes(ImageFormat.PNG, 100), ext: 'png', mime: 'image/png' };
  }
  let quality = JPEG_QUALITY;
  let bytes = image.encodeToBytes(ImageFormat.JPEG, quality);
  while (bytes.length > MAX_BYTES && quality > 60) {
    quality -= 8;
    bytes = image.encodeToBytes(ImageFormat.JPEG, quality);
  }
  return { bytes, ext: 'jpg', mime: 'image/jpeg' };
}

export type ExportedFile = { uri: string; mime: string; width: number; height: number };

/** Render the collage (or each carousel slide) off-screen at full size (E-3). */
export async function renderExport(doc: CollageDoc, opts: ExportOptions): Promise<ExportedFile[]> {
  const size = docSize(doc);
  const whole = doc.mode !== 'seamless' || !!opts.panorama;
  // A long panorama is scaled down to fit one texture; slides never hit the limit.
  const scale = whole
    ? Math.min(exportScale(opts.quality), MAX_SURFACE_PX / size.width, MAX_SURFACE_PX / size.height)
    : exportScale(opts.quality);
  const images = await loadExportImages(doc, scale, opts.onProgress);
  const jobs: RenderJob[] = whole ? [wholeJob(doc, images, scale)] : sliceJobs(doc, images, scale);

  const dir = ensureDir(exportsDir());
  for (const old of dir.list()) safeDelete(old);
  const stamp = Date.now();
  const out: ExportedFile[] = [];
  for (let i = 0; i < jobs.length; i++) {
    opts.onProgress?.({ stage: 'render', done: i, total: jobs.length });
    const job = jobs[i];
    const image = await drawAsImage(job.element, { width: job.width, height: job.height });
    if (!image) throw new Error('Rendering failed');
    const { bytes, ext, mime } = encode(image, opts.format);
    const suffix = jobs.length > 1 ? `-${String(i + 1).padStart(2, '0')}` : '';
    const file = new File(dir, `postie-${stamp}${suffix}.${ext}`);
    file.write(bytes);
    out.push({ uri: file.uri, mime, width: job.width, height: job.height });
    // Let the progress indicator update between slides (E-8).
    await new Promise((r) => setTimeout(r, 0));
  }
  opts.onProgress?.({ stage: 'render', done: jobs.length, total: jobs.length });
  return out;
}

export type SaveResult = 'saved' | 'denied';

/**
 * Save to Photos (E-6, E-7). Asks for add-only access the first time (A-4,
 * A-5). Files are added one after another so carousel slides keep their
 * order (S-12). An album is only possible with full library access, which
 * Postie never asks for; it is used only if the user granted it elsewhere.
 */
export async function saveToPhotos(files: ExportedFile[]): Promise<SaveResult> {
  const perm = await MediaLibrary.requestPermissionsAsync(true);
  if (!perm.granted) return 'denied';
  const assets: MediaLibrary.Asset[] = [];
  for (const f of files) assets.push(await MediaLibrary.Asset.create(f.uri));

  try {
    const full = await MediaLibrary.getPermissionsAsync(false);
    if (full.granted && full.accessPrivileges === 'all') {
      const album = await MediaLibrary.Album.get(ALBUM_NAME);
      if (album) await album.add(assets);
      else await MediaLibrary.Album.create(ALBUM_NAME, assets);
    }
  } catch {
    // The album is a convenience; the photos are already saved.
  }
  return 'saved';
}

/**
 * iOS share sheet (E-5). Returns false if the user dismissed it without
 * sharing. One file per call, so carousels share the panorama or use Save.
 */
export async function shareFile(file: ExportedFile): Promise<boolean> {
  if (Platform.OS === 'ios') {
    // RN's Share reports dismissal; expo-sharing resolves the same either way.
    const result = await Share.share({ url: file.uri });
    return result.action === Share.sharedAction;
  }
  await Sharing.shareAsync(file.uri, { mimeType: file.mime, dialogTitle: 'Share collage' });
  return true;
}

/** Small JPEG of the whole drawing for the "My collages" list. */
export async function renderThumbnail(doc: CollageDoc, images: ImageMap, maxSide = 600): Promise<Uint8Array | null> {
  const { width, height } = docSize(doc);
  const scale = maxSide / Math.max(width, height);
  const job = wholeJob(doc, images, scale, true);
  const image = await drawAsImage(job.element, { width: job.width, height: job.height });
  return image ? image.encodeToBytes(ImageFormat.JPEG, 80) : null;
}
