import { describe, it, expect } from 'vitest';
import { DEFAULT_PREVIEW_SCENES, layoutFrameInScene } from './preview-scenes';

const wall = DEFAULT_PREVIEW_SCENES.find((s) => s.id === 'wall')!;
const table = DEFAULT_PREVIEW_SCENES.find((s) => s.id === 'table')!;

describe('DEFAULT_PREVIEW_SCENES', () => {
  it('offers living room, bedroom, wall and table as real photographs', () => {
    expect(DEFAULT_PREVIEW_SCENES.map((s) => s.id)).toEqual(['living-room', 'bedroom', 'wall', 'table']);
    for (const scene of DEFAULT_PREVIEW_SCENES) {
      expect(scene.backdrop.type).toBe('photo');
      if (scene.backdrop.type === 'photo') {
        expect(scene.backdrop.src).toMatch(/^\/scenes\/[a-z-]+\.jpg$/);
        expect(scene.backdrop.credit).toMatch(/Unsplash/);
      }
      expect(scene.stageWidthIn).toBeGreaterThan(0);
      // The frame's anchor point lies inside the photo.
      expect(scene.frame.x).toBeGreaterThan(0);
      expect(scene.frame.x).toBeLessThan(1);
      expect(scene.frame.y).toBeGreaterThan(0);
      expect(scene.frame.y).toBeLessThan(1);
    }
  });

  it('stands the frame on the table and hangs it on the walls', () => {
    expect(table.frame.anchor).toBe('bottom');
    expect(wall.frame.anchor).toBe('center');
  });
});

describe('layoutFrameInScene', () => {
  it('draws a bigger frame bigger and a smaller one smaller, in proportion', () => {
    const small = layoutFrameInScene(wall, 5 / 7, { widthIn: 5, heightIn: 7 });
    const large = layoutFrameInScene(wall, 24 / 36, { widthIn: 24, heightIn: 36 });
    expect(large.width).toBeGreaterThan(small.width);
    expect(large.height).toBeGreaterThan(small.height);
  });

  it('keeps the frame inside the scene maximum and keeps its aspect ratio', () => {
    const huge = layoutFrameInScene(table, 2 / 3, { widthIn: 40, heightIn: 60 });
    expect(Math.max(huge.width, huge.height)).toBeLessThanOrEqual(table.frame.maxFraction + 1e-9);
    expect(huge.width / huge.height).toBeCloseTo(2 / 3, 6);
  });

  it('without dimensions fills the scene maximum using the image aspect', () => {
    const landscape = layoutFrameInScene(wall, 3 / 2);
    expect(landscape.width).toBeCloseTo(wall.frame.maxFraction, 6);
    expect(landscape.width / landscape.height).toBeCloseTo(3 / 2, 6);
    const portrait = layoutFrameInScene(wall, 2 / 3);
    expect(portrait.height).toBeCloseTo(wall.frame.maxFraction, 6);
  });

  it('never makes a tiny frame illegibly small', () => {
    const tiny = layoutFrameInScene(wall, 1, { widthIn: 2, heightIn: 2 });
    expect(Math.max(tiny.width, tiny.height)).toBeGreaterThanOrEqual((wall.minFraction ?? 0.15) - 1e-9);
  });

  it('orients the dimensions to match the picture', () => {
    const r = layoutFrameInScene(wall, 3 / 2, { widthIn: 12, heightIn: 18 });
    expect(r.width).toBeGreaterThan(r.height);
  });

  it('tolerates a bad aspect value', () => {
    const r = layoutFrameInScene(wall, 0);
    expect(Number.isFinite(r.width) && Number.isFinite(r.height)).toBe(true);
  });
});
