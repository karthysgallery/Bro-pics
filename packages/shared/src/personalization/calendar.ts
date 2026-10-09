import type { CalendarSlot, PersonalizationTemplate } from './template-schema';
import type { PersonalizationState } from './state';

/**
 * Month-calendar layout for a CalendarSlot. Pure geometry: it returns what to
 * draw (text, a rule, the mark behind the chosen day) in pixels, and the
 * browser preview (canvas) and the print renderer (SVG) each draw exactly
 * these items, so the preview and the print match.
 */

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS_FROM_SUNDAY = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

export interface CalendarDate {
  year: number;
  /** 1-12 */
  month: number;
  /** 1-31 */
  day: number;
}

/** Parses YYYY-MM-DD; null when it is not a real calendar date. */
export function parseCalendarDate(value: string | undefined | null): CalendarDate | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value ?? '');
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
  return { year, month, day };
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 0 = Sunday … 6 = Saturday, computed in UTC so the answer never depends on the viewer's time zone. */
export function weekdayOf(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

/** "24 May 2024" — for order summaries and the customer's controls. */
export function formatCalendarDate(value: string): string {
  const d = parseCalendarDate(value);
  return d ? `${d.day} ${MONTH_NAMES[d.month - 1]} ${d.year}` : value;
}

export type CalendarPathSegment = { op: 'M'; x: number; y: number } | { op: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number } | { op: 'Z' };

export type CalendarItem =
  /** Centred text; `y` is the alphabetic baseline. */
  | { kind: 'text'; text: string; x: number; y: number; fontSize: number; font: 'title' | 'body'; color: string }
  | { kind: 'rule'; x: number; y: number; width: number; height: number; color: string }
  /** A rounded backdrop behind the whole calendar; drawn first. */
  | { kind: 'panel'; x: number; y: number; width: number; height: number; radius: number; color: string; opacity: number }
  | { kind: 'mark'; segments: CalendarPathSegment[]; color: string };

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A heart filling a square of side `size` centred on (cx, cy). */
function heart(cx: number, cy: number, size: number): CalendarPathSegment[] {
  const p = (x: number, y: number) => ({ x: cx + x * size, y: cy + y * size });
  const c = (x1: number, y1: number, x2: number, y2: number, x: number, y: number): CalendarPathSegment => {
    const a = p(x1, y1);
    const b = p(x2, y2);
    const e = p(x, y);
    return { op: 'C', x1: a.x, y1: a.y, x2: b.x, y2: b.y, x: e.x, y: e.y };
  };
  return [
    { op: 'M', ...p(0, 0.44) },
    c(-0.08, 0.35, -0.5, 0.1, -0.5, -0.16),
    c(-0.5, -0.36, -0.36, -0.47, -0.24, -0.47),
    c(-0.12, -0.47, -0.03, -0.4, 0, -0.3),
    c(0.03, -0.4, 0.12, -0.47, 0.24, -0.47),
    c(0.36, -0.47, 0.5, -0.36, 0.5, -0.16),
    c(0.5, 0.1, 0.08, 0.35, 0, 0.44),
    { op: 'Z' },
  ];
}

/** A circle of diameter `size`, as four cubic arcs. */
function circle(cx: number, cy: number, size: number): CalendarPathSegment[] {
  const r = size / 2;
  const k = 0.5523 * r;
  return [
    { op: 'M', x: cx, y: cy - r },
    { op: 'C', x1: cx + k, y1: cy - r, x2: cx + r, y2: cy - k, x: cx + r, y: cy },
    { op: 'C', x1: cx + r, y1: cy + k, x2: cx + k, y2: cy + r, x: cx, y: cy + r },
    { op: 'C', x1: cx - k, y1: cy + r, x2: cx - r, y2: cy + k, x: cx - r, y: cy },
    { op: 'C', x1: cx - r, y1: cy - k, x2: cx - k, y2: cy - r, x: cx, y: cy - r },
    { op: 'Z' },
  ];
}

export function pathData(segments: CalendarPathSegment[]): string {
  const n = (v: number) => Math.round(v * 100) / 100;
  return segments
    .map((s) => (s.op === 'M' ? `M${n(s.x)} ${n(s.y)}` : s.op === 'C' ? `C${n(s.x1)} ${n(s.y1)} ${n(s.x2)} ${n(s.y2)} ${n(s.x)} ${n(s.y)}` : 'Z'))
    .join(' ');
}

/** Baseline that visually centres capitals/digits on `cy` (cap height ≈ 0.7 em). */
const baselineFor = (cy: number, fontSize: number) => cy + fontSize * 0.35;

/**
 * Everything to draw for `slot` showing `date`'s month, inside `box` (pixels).
 * With `markDay: false` the month is drawn without a marked day (a preview
 * before the customer has picked one).
 */
export function calendarLayout(slot: CalendarSlot, date: CalendarDate, box: Box, options: { markDay?: boolean } = {}): CalendarItem[] {
  const items: CalendarItem[] = [];
  const color = slot.color;
  if (slot.panelColor) {
    items.push({ kind: 'panel', x: box.x, y: box.y, width: box.width, height: box.height, radius: 0.06 * Math.min(box.width, box.height), color: slot.panelColor, opacity: slot.panelOpacity });
  }
  // With a panel, the calendar sits inside it with a margin.
  const inset = slot.panelColor ? 0.05 * Math.min(box.width, box.height) : 0;
  const x = box.x + inset;
  const y = box.y + inset;
  const W = box.width - 2 * inset;
  const H = box.height - 2 * inset;

  // Title band (top 24%), rule, weekday row, then the weeks.
  const title = `${MONTH_NAMES[date.month - 1]} ${date.year}`;
  // Baseline high enough that a script face's long descenders (the y of "May") clear the rule.
  const titleSize = Math.min(0.17 * H, (0.9 * W) / (title.length * 0.5));
  items.push({ kind: 'text', text: title, x: x + W / 2, y: y + 0.155 * H, fontSize: titleSize, font: 'title', color });
  if (slot.showRule) items.push({ kind: 'rule', x: x + 0.02 * W, y: y + 0.25 * H, width: 0.96 * W, height: Math.max(1, 0.007 * H), color });

  const colW = W / 7;
  const startDay = slot.weekStart === 'monday' ? 1 : 0;
  const headerCy = y + 0.33 * H;
  const headerSize = Math.min(0.075 * H, colW * 0.3);
  for (let c = 0; c < 7; c++) {
    items.push({ kind: 'text', text: WEEKDAYS_FROM_SUNDAY[(c + startDay) % 7], x: x + colW * (c + 0.5), y: baselineFor(headerCy, headerSize), fontSize: headerSize, font: 'body', color });
  }

  const offset = (weekdayOf(date.year, date.month, 1) - startDay + 7) % 7;
  const days = daysInMonth(date.year, date.month);
  const weeks = Math.ceil((offset + days) / 7);
  const gridTop = y + 0.39 * H;
  const rowH = (y + H - gridTop) / weeks;
  const daySize = Math.min(rowH * 0.5, colW * 0.34, 0.09 * H);
  const markSize = Math.min(rowH * 1.05, colW * 0.95);
  for (let d = 1; d <= days; d++) {
    const cell = offset + d - 1;
    const cx = x + colW * ((cell % 7) + 0.5);
    const cy = gridTop + rowH * (Math.floor(cell / 7) + 0.5);
    const marked = options.markDay !== false && d === date.day;
    if (marked) items.push({ kind: 'mark', segments: slot.mark === 'circle' ? circle(cx, cy, markSize * 0.9) : heart(cx, cy, markSize), color: slot.markColor });
    const text = slot.leadingZero ? String(d).padStart(2, '0') : String(d);
    // Over a heart the number sits a little high, where the heart is widest.
    const textCy = marked && slot.mark === 'heart' ? cy - markSize * 0.06 : cy;
    items.push({ kind: 'text', text, x: cx, y: baselineFor(textCy, daySize), fontSize: daySize, font: 'body', color: marked ? slot.markTextColor : color });
  }
  return items;
}

/** The date a calendar shows: the customer's pick, else the slot's default. */
export function chosenCalendarDate(slot: CalendarSlot, state: Pick<PersonalizationState, 'dates'>): CalendarDate | null {
  return parseCalendarDate(state.dates?.[slot.id]?.date) ?? parseCalendarDate(slot.defaultDate);
}

export const calendarSlotsOf = (template: Pick<PersonalizationTemplate, 'calendarSlots'>): CalendarSlot[] => template.calendarSlots ?? [];
