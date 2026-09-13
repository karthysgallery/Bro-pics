import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { probeAndStripImage } from './image-probe';

const fixturesDir = join(__dirname, '..', '__fixtures__');

describe('probeAndStripImage', () => {
  it('probes the real dimensions of a print-quality JPEG', async () => {
    const buffer = readFileSync(join(fixturesDir, 'small-photo.jpg'));
    const result = await probeAndStripImage(buffer);
    expect(result.widthPx).toBe(2400);
    expect(result.heightPx).toBe(3600);
    expect(result.mime).toBe('image/jpeg');
  });

  it('probes the real dimensions of a low-resolution JPEG', async () => {
    const buffer = readFileSync(join(fixturesDir, 'tiny-photo.jpg'));
    const result = await probeAndStripImage(buffer);
    expect(result.widthPx).toBe(300);
    expect(result.heightPx).toBe(450);
  });

  it('returns a stripped buffer that is still a valid, decodable image', async () => {
    const buffer = readFileSync(join(fixturesDir, 'small-photo.jpg'));
    const result = await probeAndStripImage(buffer);
    // Re-probing the stripped output must succeed and report the same dimensions —
    // proves the strip step didn't corrupt the image.
    const reprobe = await probeAndStripImage(result.strippedBuffer);
    expect(reprobe.widthPx).toBe(2400);
    expect(reprobe.heightPx).toBe(3600);
  });

  it('auto-rotates a photo with EXIF Orientation 6 (90° CW) and reports the ROTATED dimensions', async () => {
    // Orientation 6 means the stored pixels are rotated 90° CCW relative to
    // how the photo should display — a 400(w) x 300(h) stored buffer with
    // Orientation 6 should display (and probe) as 300(w) x 400(h).
    const storedBuffer = await sharp({
      create: { width: 400, height: 300, channels: 3, background: { r: 200, g: 50, b: 50 } },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    // Sanity-check the fixture itself actually carries the orientation tag
    // and stored (pre-rotation) dimensions we expect, before asserting on
    // probeAndStripImage's behaviour.
    const storedMetadata = await sharp(storedBuffer).metadata();
    expect(storedMetadata.orientation).toBe(6);
    expect(storedMetadata.width).toBe(400);
    expect(storedMetadata.height).toBe(300);

    const result = await probeAndStripImage(storedBuffer);

    // Width/height must be read from the ROTATED output, not the stored
    // (pre-rotation) input metadata — 90° rotation swaps them.
    expect(result.widthPx).toBe(300);
    expect(result.heightPx).toBe(400);

    // No orientation tag should survive on the re-encoded output — sharp
    // normalizes to 1 ("no rotation needed") after baking the rotation into
    // the pixels, rather than always omitting the tag outright.
    const outputMetadata = await sharp(result.strippedBuffer).metadata();
    expect(outputMetadata.orientation ?? 1).toBe(1);
    expect(outputMetadata.width).toBe(300);
    expect(outputMetadata.height).toBe(400);
  });
});
