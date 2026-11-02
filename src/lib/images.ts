// Pictures the DM uploads: portraits, maps and handouts. Each is shrunk before
// it's uploaded, since a phone photo or a scanned map can be several megabytes
// and far larger than any screen. Long sides over `maxSide` are scaled down and
// re-encoded (WebP where the browser can, which keeps transparency). GIFs pass
// through untouched so animation survives, as does anything the browser can't
// decode here.

import { EntityImages } from './db';

export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif';

const KEEP_UNDER = 1_500_000; // bytes; a small enough image is uploaded as it is

export async function shrinkImage(file: Blob, maxSide = 2048): Promise<Blob> {
  if (file.type === 'image/gif') return file;
  if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < KEEP_UNDER) { bitmap.close(); return file; }
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.86));
    // A browser that can't write WebP falls back to PNG, which may be no smaller.
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

/** Shrinks and uploads a picture the DM picked, returning its path. */
export async function uploadImage(file: File): Promise<string> {
  if (!IMAGE_ACCEPT.split(',').includes(file.type)) throw new Error('That isn’t an image the app can keep. Use a PNG, JPEG, WebP or GIF.');
  return EntityImages.upload(await shrinkImage(file));
}
