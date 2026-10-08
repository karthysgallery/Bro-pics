import { CalendarSlotSchema, type CalendarSlot, type PersonalizationTemplate, type PhotoSlot, type TextSlot } from '@bro-pics/shared';

/**
 * Pure editing operations for the admin template builder. Each returns a NEW
 * template, so the builder can keep undo-free, predictable state and compare
 * against the saved version to know when there are unsaved changes.
 */

export type SlotPatch = Partial<Omit<PhotoSlot, 'id'>>;
export type TextPatch = Partial<Omit<TextSlot, 'id'>>;
export type CalendarPatch = Partial<Omit<CalendarSlot, 'id'>>;

const round4 = (n: number) => Math.round(n * 10_000) / 10_000;

/** Keeps a box inside the canvas: size first (at most the canvas), then position. */
export function clampBox<T extends { x: number; y: number; width: number; height: number }>(box: T, minSize = 0.01): T {
  const width = round4(Math.min(1, Math.max(minSize, box.width)));
  const height = round4(Math.min(1, Math.max(minSize, box.height)));
  const x = round4(Math.min(1 - width, Math.max(0, box.x)));
  const y = round4(Math.min(1 - height, Math.max(0, box.y)));
  return { ...box, x, y, width, height };
}

function nextId(existing: readonly string[], prefix: string): string {
  let n = existing.length + 1;
  const taken = new Set(existing);
  while (taken.has(`${prefix}${String(n).padStart(2, '0')}`)) n++;
  return `${prefix}${String(n).padStart(2, '0')}`;
}

function allSlotIds(t: PersonalizationTemplate): string[] {
  return [...t.photoSlots.map((s) => s.id), ...t.textSlots.map((s) => s.id), ...(t.calendarSlots ?? []).map((s) => s.id)];
}

export function updateCalendarSlot(t: PersonalizationTemplate, id: string, patch: CalendarPatch): PersonalizationTemplate {
  return { ...t, calendarSlots: (t.calendarSlots ?? []).map((s) => (s.id === id ? clampBox({ ...s, ...patch }) : s)) };
}

/**
 * A month calendar in the lower part of the design, painted on top of the
 * artwork and photos (like text). Sized roughly 7:4, the shape of a month.
 */
export function addCalendarSlot(t: PersonalizationTemplate): { template: PersonalizationTemplate; id: string } {
  const id = nextId(allSlotIds(t), 'calendar_');
  const aspect = t.canvas.width / t.canvas.height;
  const width = 0.6;
  const height = round4(Math.min(0.45, (width * aspect * 4) / 7));
  const calendars = t.calendarSlots ?? [];
  const slot = CalendarSlotSchema.parse({
    id,
    label: calendars.length === 0 ? 'Your special date' : `Date ${calendars.length + 1}`,
    x: 0.2,
    y: round4(Math.max(0, 0.95 - height)),
    width,
    height,
  });
  return { template: { ...t, calendarSlots: [...calendars, slot], layers: [...t.layers, { kind: 'calendar', slotId: id }] }, id };
}

export function updatePhotoSlot(t: PersonalizationTemplate, id: string, patch: SlotPatch): PersonalizationTemplate {
  return { ...t, photoSlots: t.photoSlots.map((s) => (s.id === id ? clampBox({ ...s, ...patch }) : s)) };
}

export function updateTextSlot(t: PersonalizationTemplate, id: string, patch: TextPatch): PersonalizationTemplate {
  return { ...t, textSlots: t.textSlots.map((s) => (s.id === id ? clampBox({ ...s, ...patch }) : s)) };
}

/** A new photo space in the middle of the design, drawn just above the other photos. */
export function addPhotoSlot(t: PersonalizationTemplate): { template: PersonalizationTemplate; id: string } {
  const id = nextId(allSlotIds(t), 'photo_');
  const aspect = t.canvas.width / t.canvas.height;
  const height = 0.3;
  const width = Math.min(0.6, height / aspect);
  const slot: PhotoSlot = {
    id,
    label: `Photo ${t.photoSlots.length + 1}`,
    required: true,
    x: round4(0.5 - width / 2),
    y: round4(0.5 - height / 2),
    width: round4(width),
    height,
    rotationDeg: 0,
    shape: 'rect',
    fit: 'cover',
  };
  const layers = [...t.layers];
  const lastPhoto = layers.map((l) => l.kind).lastIndexOf('photoSlot');
  // With the other photos; with none yet, under any artwork that sits on top and under the text.
  const firstAbove = layers.findIndex((l) => (l.kind === 'fixed' && l.role !== 'background') || l.kind === 'text' || l.kind === 'calendar');
  const at = lastPhoto >= 0 ? lastPhoto + 1 : firstAbove === -1 ? layers.length : firstAbove;
  layers.splice(at, 0, { kind: 'photoSlot', slotId: id });
  return { template: { ...t, photoSlots: [...t.photoSlots, slot], layers }, id };
}

/** A text line near the bottom of the design, painted on top of everything. */
export function addTextSlot(t: PersonalizationTemplate): { template: PersonalizationTemplate; id: string } {
  const id = nextId(allSlotIds(t), 'text_');
  const slot: TextSlot = {
    id,
    label: t.textSlots.length === 0 ? 'Names' : `Text ${t.textSlots.length + 1}`,
    required: false,
    x: 0.15,
    y: 0.86,
    width: 0.7,
    height: 0.08,
    maxLength: 40,
    align: 'center',
    defaultValue: '',
  };
  return { template: { ...t, textSlots: [...t.textSlots, slot], layers: [...t.layers, { kind: 'text', slotId: id }] }, id };
}

export function removeSlot(t: PersonalizationTemplate, id: string): PersonalizationTemplate {
  return {
    ...t,
    photoSlots: t.photoSlots.filter((s) => s.id !== id),
    textSlots: t.textSlots.filter((s) => s.id !== id),
    ...(t.calendarSlots && { calendarSlots: t.calendarSlots.filter((s) => s.id !== id) }),
    layers: t.layers.filter((l) => l.kind === 'fixed' || l.slotId !== id),
  };
}

export function duplicatePhotoSlot(t: PersonalizationTemplate, id: string): { template: PersonalizationTemplate; id: string } {
  const source = t.photoSlots.find((s) => s.id === id);
  if (!source) return { template: t, id };
  const added = addPhotoSlot(t);
  const copy = clampBox({ ...source, id: added.id, label: `${source.label} copy`, x: source.x + 0.03, y: source.y + 0.03 });
  return { template: { ...added.template, photoSlots: added.template.photoSlots.map((s) => (s.id === added.id ? copy : s)) }, id: added.id };
}

/**
 * Moves a photo space earlier/later in the fill order (the order customers'
 * photos go in when they add several at once). Default "Photo N" names follow.
 */
export function movePhotoSlot(t: PersonalizationTemplate, id: string, delta: number): PersonalizationTemplate {
  const from = t.photoSlots.findIndex((s) => s.id === id);
  const to = Math.min(t.photoSlots.length - 1, Math.max(0, from + delta));
  if (from < 0 || from === to) return t;
  const slots = [...t.photoSlots];
  const [moved] = slots.splice(from, 1);
  slots.splice(to, 0, moved);
  return { ...t, photoSlots: slots.map((s, i) => (/^Photo \d+$/.test(s.label) ? { ...s, label: `Photo ${i + 1}` } : s)) };
}

/** Whether the artwork (the collage design itself) is painted over the photos (a frame with windows) or under them. */
export function artworkAbovePhotos(t: PersonalizationTemplate): boolean {
  const art = t.layers.findIndex((l) => l.kind === 'fixed' && l.role !== 'background');
  const firstPhoto = t.layers.findIndex((l) => l.kind === 'photoSlot');
  return art >= 0 && firstPhoto >= 0 && art > firstPhoto;
}

/** Moves every fixed artwork layer above or below all photo spaces (text and calendars always stay on top). */
export function setArtworkAbovePhotos(t: PersonalizationTemplate, above: boolean): PersonalizationTemplate {
  const fixed = t.layers.filter((l) => l.kind === 'fixed').map((l) => (l.kind === 'fixed' ? { ...l, role: above ? ('frame' as const) : ('background' as const) } : l));
  const photos = t.layers.filter((l) => l.kind === 'photoSlot');
  const texts = t.layers.filter((l) => l.kind === 'text' || l.kind === 'calendar');
  return { ...t, layers: above ? [...photos, ...fixed, ...texts] : [...fixed, ...photos, ...texts] };
}

/** Print size in inches → canvas pixels at the template's DPI. */
export function setPrintSize(t: PersonalizationTemplate, widthIn: number, heightIn: number, dpi = t.canvas.dpi): PersonalizationTemplate {
  return { ...t, canvas: { ...t.canvas, width: Math.max(1, Math.round(widthIn * dpi)), height: Math.max(1, Math.round(heightIn * dpi)), dpi } };
}

/** URL-safe id from a name, with a short suffix so two designs named alike never collide. */
export function templateIdFromName(name: string, random = Math.random): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  const suffix = Math.floor(random() * 36 ** 4)
    .toString(36)
    .padStart(4, '0');
  return `${base || 'design'}-${suffix}`;
}

/** Notes from the automatic detection, shown once on the new template's review screen. */
export const DETECTION_NOTES_KEY = (id: string) => `kg:template-detection:${id}`;
