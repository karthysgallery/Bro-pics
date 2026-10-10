// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';
import sharp from 'sharp';

vi.mock('server-only', () => ({}));
const download = vi.hoisted(() => vi.fn());
vi.mock('firebase-admin/storage', () => ({ getStorage: () => ({ bucket: () => ({ file: () => ({ download }) }) }) }));
vi.mock('./firebase-admin', () => ({ getAdminApp: () => ({}) }));

import { clearImageCaches, readStorageImage, sizeStep } from './image-proxy';

describe('image proxy', () => {
  beforeEach(async () => {
    clearImageCaches();
    download.mockReset();
    download.mockResolvedValue([await sharp({ create: { width: 3000, height: 2000, channels: 3, background: { r: 200, g: 120, b: 30 } } }).jpeg().toBuffer()]);
  });

  it('rounds widths up to standard steps', () => {
    expect([sizeStep(100), sizeStep(900), sizeStep(1600), sizeStep(5000)]).toEqual([160, 1200, 1600, 2400]);
  });

  it('downloads a picture once for all its sizes and keeps each resize', async () => {
    const a = await readStorageImage('public/media/x.jpg', 900);
    const b = await readStorageImage('public/media/x.jpg', 1100); // same step: the cached copy
    await readStorageImage('public/media/x.jpg', 240);
    expect(b).toBe(a);
    expect(download).toHaveBeenCalledTimes(1);
    const meta = await sharp(a.body).metadata();
    expect([meta.width, meta.height, a.contentType]).toEqual([1200, 800, 'image/jpeg']);
  });

  it('shares one resize between requests arriving together', async () => {
    const [a, b] = await Promise.all([readStorageImage('public/media/y.jpg', 640), readStorageImage('public/media/y.jpg', 640)]);
    expect(a).toBe(b);
    expect(download).toHaveBeenCalledTimes(1);
  });
});
