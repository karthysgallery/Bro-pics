import { describe, it, expect } from 'vitest';
import { DEFAULT_PREVIEW_SCENES, layoutFrameInScene } from './preview-scenes';

const scene = (id: string) => DEFAULT_PREVIEW_SCENES.find((s) => s.id === id)!;

describe('room pictures (showcase sizing)', () => {
  it('draws even the smallest size large enough to see the design', () => {
    for (const id of ['bedroom', 'living-room', 'table']) {
      const s = scene(id);
      const l = layoutFrameInScene(s, 2 / 3, { widthIn: 8, heightIn: 12 });
      // An 8x12 at true scale in a 100in-wide room would be ~0.12 of the width.
      expect(Math.max(l.width, l.height), id).toBeCloseTo(s.showcaseFraction!, 5);
      expect(Math.max(l.width, l.height), id).toBeGreaterThanOrEqual(0.25);
    }
  });

  it('still shows a larger size larger, up to the scene’s limit', () => {
    const s = scene('living-room');
    const small = layoutFrameInScene(s, 2 / 3, { widthIn: 8, heightIn: 12 });
    const medium = layoutFrameInScene(s, 2 / 3, { widthIn: 12, heightIn: 18 });
    const large = layoutFrameInScene(s, 2 / 3, { widthIn: 16, heightIn: 24 });
    expect(medium.height).toBeGreaterThan(small.height);
    expect(large.height).toBeGreaterThan(medium.height);
    expect(Math.max(large.width, large.height)).toBeLessThanOrEqual(s.frame.maxFraction + 1e-9);
  });

  it('keeps the frame inside the photo around its anchor', () => {
    for (const id of ['bedroom', 'living-room', 'table']) {
      const s = scene(id);
      const l = layoutFrameInScene(s, 2 / 3, { widthIn: 24, heightIn: 36 });
      const stageHeight = 3 / 4;
      const top = s.frame.anchor === 'bottom' ? s.frame.y * stageHeight - l.height : s.frame.y * stageHeight - l.height / 2;
      expect(top, id).toBeGreaterThan(0);
      expect(s.frame.x - l.width / 2, id).toBeGreaterThan(0);
    }
  });
});
