import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { calendarLayout, createEmptyState, setCalendarDate, PersonalizationTemplateSchema } from '@bro-pics/shared';
import { renderTemplate } from './render-template';
import { buildCalendarSvg } from './render-calendar';

// The owner's reference: a black design, white "May 2024" calendar, the 24th in a red heart.
const template = PersonalizationTemplateSchema.parse({
  id: 'our-day',
  version: 1,
  type: 'calendar',
  name: 'Our day',
  canvas: { width: 1400, height: 840, dpi: 300 },
  background: { type: 'color', color: '#000000' },
  photoSlots: [],
  calendarSlots: [{ id: 'cal', label: 'Your special date', x: 0.05, y: 0.05, width: 0.9, height: 0.9 }],
  layers: [{ kind: 'calendar', slotId: 'cal' }],
});
const noAssets = { load: async () => Buffer.alloc(0) };

async function pixel(png: Buffer, x: number, y: number) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const i = (Math.round(y) * info.width + Math.round(x)) * 4;
  return [data[i], data[i + 1], data[i + 2]];
}

describe('print calendar', () => {
  it('prints the chosen month with the day inside a red heart, where the preview draws it', async () => {
    const state = setCalendarDate(createEmptyState('our-day', 1), 'cal', '2024-05-24');
    const png = await renderTemplate({ template, state, assets: noAssets });
    if (process.env.CALENDAR_PREVIEW_OUT) await sharp(png).toFile(process.env.CALENDAR_PREVIEW_OUT);

    const slot = template.calendarSlots![0];
    const items = calendarLayout(slot, { year: 2024, month: 5, day: 24 }, { x: 70, y: 42, width: 1260, height: 756 });
    const mark = items.find((i) => i.kind === 'mark');
    expect(mark).toBeDefined();
    const d24 = items.find((i) => i.kind === 'text' && i.text === '24');
    expect(d24 && d24.kind === 'text').toBe(true);
    if (!d24 || d24.kind !== 'text') return;
    // Red heart round the 24 (sampled beside the digits), white digits, black between cells.
    const red = await pixel(png, d24.x - d24.fontSize * 0.95, d24.y - d24.fontSize * 0.55);
    expect(red[0]).toBeGreaterThan(180);
    expect(red[1]).toBeLessThan(80);
    const between = await pixel(png, 700, 790);
    expect(between).toEqual([0, 0, 0]);
  });

  it('leaves out a calendar that has no date and no default', () => {
    expect(buildCalendarSvg(template.calendarSlots![0], { dates: {} }, 1400, 840)).toBeNull();
  });

  it('escapes the colours and uses the bundled fonts', () => {
    const svg = buildCalendarSvg({ ...template.calendarSlots![0], defaultDate: '2024-05-24' }, {}, 1400, 840)!.toString();
    expect(svg).toContain('GreatVibes-Regular.ttf');
    expect(svg).toContain('JosefinSans-Regular.ttf');
    expect(svg).toContain('>May 2024<');
    expect(svg).toContain('fill="#e0242c"');
  });
});
