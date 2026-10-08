import { describe, it, expect } from 'vitest';
import { calendarLayout, chosenCalendarDate, formatCalendarDate, parseCalendarDate, pathData, weekdayOf } from './calendar';
import { CalendarSlotSchema, PersonalizationTemplateSchema } from './template-schema';
import { validateTemplate } from './validate-template';
import { checkCompleteness } from './completeness';
import { createEmptyState, setCalendarDate, stateFingerprint } from './state';

const slot = CalendarSlotSchema.parse({ id: 'cal', label: 'Your special date', x: 0.1, y: 0.6, width: 0.8, height: 0.3 });
const box = { x: 0, y: 0, width: 700, height: 420 };

type TextItem = Extract<ReturnType<typeof calendarLayout>[number], { kind: 'text' }>;
const texts = (items: ReturnType<typeof calendarLayout>) => items.filter((i): i is TextItem => i.kind === 'text');

describe('calendar dates', () => {
  it('parses only real dates', () => {
    expect(parseCalendarDate('2024-05-24')).toEqual({ year: 2024, month: 5, day: 24 });
    expect(parseCalendarDate('2024-02-29')).not.toBeNull();
    expect(parseCalendarDate('2023-02-29')).toBeNull();
    expect(parseCalendarDate('2024-13-01')).toBeNull();
    expect(parseCalendarDate('24/05/2024')).toBeNull();
    expect(formatCalendarDate('2024-05-24')).toBe('24 May 2024');
  });

  it('knows the weekday regardless of time zone', () => {
    expect(weekdayOf(2024, 5, 1)).toBe(3); // Wednesday
    expect(weekdayOf(2024, 5, 24)).toBe(5); // Friday
  });
});

describe('calendarLayout', () => {
  it('draws May 2024 like the reference: Sunday first, 1 May on Wednesday, the 24th marked with a heart', () => {
    const items = calendarLayout(slot, { year: 2024, month: 5, day: 24 }, box);
    const t = texts(items);
    expect(t[0]).toMatchObject({ text: 'May 2024', font: 'title' });
    expect(t.slice(1, 8).map((i) => i.text)).toEqual(['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']);
    const days = t.slice(8);
    expect(days.map((i) => i.text)).toEqual(Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, '0')));
    const wed = t[4];
    expect(days[0].x).toBeCloseTo(wed.x); // 01 under WED
    const fri = t[6];
    const d24 = days[23];
    expect(d24.x).toBeCloseTo(fri.x); // 24 under FRI
    expect(d24.color).toBe('#ffffff');
    // Five weeks: the 31st is on the last row with the 26th.
    expect(days[30].y).toBeCloseTo(days[25].y);
    const marks = items.filter((i) => i.kind === 'mark');
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({ color: '#e0242c' });
    expect(items.some((i) => i.kind === 'rule')).toBe(true);
    // Everything stays inside the box.
    for (const i of t) {
      expect(i.x).toBeGreaterThan(0);
      expect(i.x).toBeLessThan(700);
      expect(i.y).toBeLessThanOrEqual(420);
    }
  });

  it('starts weeks on Monday, drops the leading zero and marks with a circle when the admin says so', () => {
    const monday = CalendarSlotSchema.parse({ ...slot, weekStart: 'monday', leadingZero: false, mark: 'circle', showRule: false });
    const items = calendarLayout(monday, { year: 2024, month: 5, day: 24 }, box);
    const t = texts(items);
    expect(t.slice(1, 8).map((i) => i.text)).toEqual(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']);
    expect(t[8].text).toBe('1');
    expect(t[8].x).toBeCloseTo(t[3].x); // 1 May under WED
    expect(items.some((i) => i.kind === 'rule')).toBe(false);
    const mark = items.find((i) => i.kind === 'mark');
    expect(mark && mark.kind === 'mark' && mark.segments.filter((s) => s.op === 'C')).toHaveLength(4);
  });

  it('uses six rows for a month that needs them, and can show a month without a marked day', () => {
    // March 2024 starts on a Friday and has 31 days: six weeks.
    const items = calendarLayout(slot, { year: 2024, month: 3, day: 1 }, box, { markDay: false });
    const days = texts(items).slice(8);
    expect(new Set(days.map((d) => Math.round(d.y))).size).toBe(6);
    expect(items.some((i) => i.kind === 'mark')).toBe(false);
  });

  it('writes the mark as SVG path data', () => {
    const mark = calendarLayout(slot, { year: 2024, month: 5, day: 24 }, box).find((i) => i.kind === 'mark');
    expect(mark && mark.kind === 'mark' && pathData(mark.segments)).toMatch(/^M[\d. ]+ C.* Z$/);
  });
});

describe('calendars in templates and state', () => {
  const template = PersonalizationTemplateSchema.parse({
    id: 'cal-tpl',
    version: 1,
    type: 'calendar',
    name: 'Our day',
    canvas: { width: 2400, height: 3000 },
    photoSlots: [],
    calendarSlots: [slot],
    layers: [{ kind: 'calendar', slotId: 'cal' }],
  });

  it('validates a calendar template, and catches a calendar missing from the layers or with a bad default', () => {
    expect(validateTemplate(template).valid).toBe(true);
    expect(validateTemplate({ ...template, layers: [] }).issues.map((i) => i.code)).toContain('slot_not_in_layers');
    expect(validateTemplate({ ...template, calendarSlots: [{ ...slot, defaultDate: '2023-02-30' }] }).issues.map((i) => i.code)).toContain('invalid_date');
  });

  it('needs a date before ordering, unless the admin set a default', () => {
    const empty = createEmptyState('cal-tpl', 1);
    expect(checkCompleteness(template, empty).blockers).toEqual(['Pick a date for “Your special date”.']);
    const picked = setCalendarDate(empty, 'cal', '2024-05-24');
    expect(checkCompleteness(template, picked).complete).toBe(true);
    expect(chosenCalendarDate(slot, picked)).toEqual({ year: 2024, month: 5, day: 24 });
    const withDefault = { ...template, calendarSlots: [{ ...slot, defaultDate: '2025-01-01' }] };
    expect(checkCompleteness(withDefault, empty).complete).toBe(true);
  });

  it('changes the fingerprint when the date changes, and leaves calendar-free states untouched', () => {
    const empty = createEmptyState('cal-tpl', 1);
    const a = setCalendarDate(empty, 'cal', '2024-05-24');
    const b = setCalendarDate(empty, 'cal', '2024-05-25');
    expect(stateFingerprint(a)).not.toBe(stateFingerprint(b));
    expect(stateFingerprint(setCalendarDate(a, 'cal', null))).toBe(stateFingerprint(empty));
  });
});
