// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { isLikelyHeic } from './heic-convert';

function ftypBuffer(brand: string, extraBytes = 0): Buffer {
  const buf = Buffer.alloc(12 + extraBytes);
  buf.write('ftyp', 4, 'ascii');
  buf.write(brand.padEnd(4, ' ').slice(0, 4), 8, 'ascii');
  return buf;
}

describe('isLikelyHeic', () => {
  it('recognizes the standard HEIC brand', () => {
    expect(isLikelyHeic(ftypBuffer('heic'))).toBe(true);
  });

  it('recognizes an iPhone burst-photo HEIC brand (heix)', () => {
    expect(isLikelyHeic(ftypBuffer('heix'))).toBe(true);
  });

  it('recognizes an HEVC-container brand (hevc)', () => {
    expect(isLikelyHeic(ftypBuffer('hevc'))).toBe(true);
  });

  it('rejects an AVIF brand — that path is already handled natively by sharp', () => {
    expect(isLikelyHeic(ftypBuffer('avif'))).toBe(false);
  });

  it('rejects a JPEG (no ftyp box at all)', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
    expect(isLikelyHeic(jpeg)).toBe(false);
  });

  it('rejects a PNG', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
    expect(isLikelyHeic(png)).toBe(false);
  });

  it('rejects a buffer too short to contain a ftyp box', () => {
    expect(isLikelyHeic(Buffer.from([0, 1, 2]))).toBe(false);
  });

  it('rejects an mp4-family brand not used for still images (isobmff, but video)', () => {
    // 'isom'/'mp42' etc are the same container family but never used for
    // HEIC stills — only the specific still-image brands should match.
    expect(isLikelyHeic(ftypBuffer('isom'))).toBe(false);
  });
});

describe('convertHeicToJpeg', () => {
  it('delegates to heic-convert with JPEG output and passes the buffer through', async () => {
    vi.resetModules();
    const mockConvert = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
    vi.doMock('heic-convert', () => ({ default: mockConvert }));

    const { convertHeicToJpeg } = await import('./heic-convert');
    const input = Buffer.from([9, 9, 9]);
    const result = await convertHeicToJpeg(input);

    expect(mockConvert).toHaveBeenCalledWith({ buffer: input, format: 'JPEG', quality: 0.92 });
    expect(result).toBeInstanceOf(Buffer);
    expect([...result]).toEqual([1, 2, 3]);

    vi.doUnmock('heic-convert');
  });
});
