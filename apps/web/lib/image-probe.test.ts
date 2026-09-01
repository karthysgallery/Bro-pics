import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
});
