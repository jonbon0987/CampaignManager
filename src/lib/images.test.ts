import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const upload = vi.hoisted(() => vi.fn());
vi.mock('./db', () => ({ EntityImages: { upload } }));

import { shrinkImage, uploadImage } from './images';

const picture = (type: string, bytes = 10) => new File([new Uint8Array(bytes)], 'pic', { type });

describe('shrinkImage', () => {
  let drawn: number[] = [];

  beforeEach(() => {
    drawn = [];
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 4096, height: 1024, close: vi.fn() })));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
      () => ({ drawImage: (_b: unknown, _x: number, _y: number, w: number, h: number) => { drawn = [w, h]; } }) as never,
    );
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (cb: BlobCallback) {
      cb(new Blob([new Uint8Array(4)], { type: 'image/webp' }));
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('scales the long side down to the limit and re-encodes as WebP', async () => {
    const out = await shrinkImage(picture('image/png', 100));
    expect(drawn).toEqual([2048, 512]);
    expect(out.type).toBe('image/webp');
  });

  it('keeps a GIF as it is, so animation survives', async () => {
    const gif = picture('image/gif', 100);
    expect(await shrinkImage(gif)).toBe(gif);
    expect(createImageBitmap).not.toHaveBeenCalled();
  });

  it('keeps a small picture that already fits as it is', async () => {
    vi.mocked(createImageBitmap).mockResolvedValue({ width: 800, height: 600, close: vi.fn() } as never);
    const png = picture('image/png');
    expect(await shrinkImage(png)).toBe(png);
    expect(drawn).toEqual([]);
  });

  it('keeps the original when re-encoding would not make it smaller', async () => {
    const tiny = picture('image/png', 2);
    expect(await shrinkImage(tiny)).toBe(tiny);
  });

  it('keeps the original when the browser cannot decode it', async () => {
    vi.mocked(createImageBitmap).mockRejectedValue(new Error('bad image'));
    const png = picture('image/png', 100);
    expect(await shrinkImage(png)).toBe(png);
  });

  it('keeps the original where the browser has no createImageBitmap', async () => {
    vi.stubGlobal('createImageBitmap', undefined);
    const png = picture('image/png', 100);
    expect(await shrinkImage(png)).toBe(png);
  });
});

describe('uploadImage', () => {
  beforeEach(() => { upload.mockReset().mockResolvedValue('u1/abc.png'); vi.stubGlobal('createImageBitmap', undefined); });
  afterEach(() => vi.unstubAllGlobals());

  it('uploads an image and returns its path', async () => {
    await expect(uploadImage(picture('image/png'))).resolves.toBe('u1/abc.png');
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('refuses a file that is not a kind of image the bucket keeps', async () => {
    await expect(uploadImage(picture('application/pdf'))).rejects.toThrow(/PNG, JPEG, WebP or GIF/);
    await expect(uploadImage(picture('image/svg+xml'))).rejects.toThrow();
    expect(upload).not.toHaveBeenCalled();
  });
});
