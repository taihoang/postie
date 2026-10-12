import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { uid } from '@/core/id';
import type { PhotoAsset } from '@/core/types';

import { ensureDir, photoFile, photosDir } from './files';

/** Long side of editor previews; keeps memory low with many photos (N-4). */
export const PREVIEW_MAX = 1600;
export const MAX_PICK = 8;

/**
 * System photo picker (PHPicker on iOS). It needs no photo-library permission
 * (A-3). Returns assets in the order the user tapped them (P-1).
 */
export async function pickPhotos(limit: number): Promise<ImagePicker.ImagePickerAsset[]> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: limit > 1,
    selectionLimit: Math.max(1, Math.min(MAX_PICK, limit)),
    orderedSelection: true,
    // HEIC → JPEG so every decoder in the pipeline can read it.
    preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    quality: 1,
    exif: false,
  });
  if (result.canceled) return [];
  return result.assets.filter((a) => a.type !== 'video');
}

/**
 * Copy a picked photo into the sandbox and make an orientation-baked preview.
 * The original is kept untouched (P-13); only the preview is re-encoded.
 */
export async function importPhoto(asset: ImagePicker.ImagePickerAsset): Promise<PhotoAsset> {
  ensureDir(photosDir());
  const id = uid('p');
  const ext = (asset.fileName?.split('.').pop() || 'jpg').toLowerCase().replace('jpeg', 'jpg');
  const original = photoFile(`${id}.${ext}`);
  new File(asset.uri).copySync(original);

  const context = ImageManipulator.manipulate(asset.uri);
  const long = Math.max(asset.width, asset.height);
  if (long > PREVIEW_MAX) {
    context.resize(asset.width >= asset.height ? { width: PREVIEW_MAX } : { height: PREVIEW_MAX });
  }
  const ref = await context.renderAsync();
  const saved = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  const preview = photoFile(`${id}_p.jpg`);
  new File(saved.uri).moveSync(preview);
  ref.release();
  context.release();

  // The preview is decoded upright; trust its orientation over picker metadata.
  let width = asset.width;
  let height = asset.height;
  const previewLandscape = saved.width >= saved.height;
  if (width !== height && width >= height !== previewLandscape) [width, height] = [height, width];

  return { id, file: original.name, preview: preview.name, width, height };
}

/** Import one at a time: decoding several 48 MP photos at once can exhaust memory. */
export async function importPhotos(
  assets: ImagePicker.ImagePickerAsset[],
  onPhoto: (photo: PhotoAsset, index: number) => void,
): Promise<PhotoAsset[]> {
  const out: PhotoAsset[] = [];
  for (let i = 0; i < assets.length; i++) {
    try {
      const photo = await importPhoto(assets[i]);
      out.push(photo);
      onPhoto(photo, i);
    } catch (e) {
      console.warn('Photo import failed', e);
    }
  }
  return out;
}
