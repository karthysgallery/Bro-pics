import { calendarLayout, chosenCalendarDate, pathData, type CalendarSlot, type PersonalizationState } from '@bro-pics/shared';
import { escapeXml, resolveFontPath, resolvedFallbackFonts } from './render-text';

/**
 * One month calendar as a full-canvas SVG, drawn from the same calendarLayout()
 * items as the browser preview (apps/web/components/customizer/render-template.ts),
 * with the bundled fonts. null when the calendar has no date to show (the
 * completeness check stops an order without a required date).
 */
export function buildCalendarSvg(slot: CalendarSlot, state: Pick<PersonalizationState, 'dates'>, width: number, height: number): Buffer | null {
  const date = chosenCalendarDate(slot, state);
  if (!date) return null;
  const items = calendarLayout(slot, date, { x: slot.x * width, y: slot.y * height, width: slot.width * width, height: slot.height * height });

  const title = resolveFontPath(slot.titleFont);
  const body = resolveFontPath(slot.bodyFont);
  const fallbacks = resolvedFallbackFonts();
  const face = (family: string, path: string) => `@font-face { font-family: '${escapeXml(family)}'; src: url('file://${path.replace(/\\/g, '/')}'); }`;
  const fontFaces = [face(title.fontFamily, title.fontPath), face(body.fontFamily, body.fontPath), ...fallbacks.map((f) => face(f.label, f.fontPath))].join('\n');
  const stack = (primary: string) => [primary, ...fallbacks.map((f) => f.label), 'sans-serif'].map((n) => `'${escapeXml(n)}'`).join(', ');
  const n = (v: number) => Math.round(v * 100) / 100;

  const parts = items.map((item) => {
    if (item.kind === 'rule') return `<rect x="${n(item.x)}" y="${n(item.y)}" width="${n(item.width)}" height="${n(item.height)}" fill="${escapeXml(item.color)}"/>`;
    if (item.kind === 'mark') return `<path d="${pathData(item.segments)}" fill="${escapeXml(item.color)}"/>`;
    const family = item.font === 'title' ? title.fontFamily : body.fontFamily;
    return `<text x="${n(item.x)}" y="${n(item.y)}" font-family="${stack(family)}" font-size="${n(item.fontSize)}px" fill="${escapeXml(item.color)}" text-anchor="middle">${escapeXml(item.text)}</text>`;
  });
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><style>${fontFaces}</style>${parts.join('')}</svg>`);
}
