import { Directory, File, Paths } from 'expo-file-system';

/** Everything lives in the app sandbox; nothing is uploaded (A-2). */
export function photosDir(): Directory {
  return new Directory(Paths.document, 'photos');
}

export function draftsDir(): Directory {
  return new Directory(Paths.document, 'drafts');
}

export function exportsDir(): Directory {
  return new Directory(Paths.cache, 'exports');
}

export function ensureDir(dir: Directory): Directory {
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

export function photoFile(name: string): File {
  return new File(photosDir(), name);
}

export function photoUri(name: string): string {
  return photoFile(name).uri;
}

export function safeDelete(file: File | Directory): void {
  try {
    if (file.exists) file.delete();
  } catch {
    // Already gone or locked by the OS; nothing useful to do.
  }
}
