import { z } from 'zod';
import { clampTransform, type PhotoTransform, type Rotation } from './geometry';

/**
 * The customer's personalization — the SINGLE source of truth. Every preview
 * (editor, flat/table/wall mockups) and the final print are derived from this
 * one object; nothing keeps its own copy of "what the customer chose".
 *
 * It holds REFERENCES, never pixels: photos are asset ids (plus an optional
 * resolved url), so it is small enough for a cart line and an order snapshot.
 * Data URLs / base64 are rejected on purpose.
 */
export const STATE_SCHEMA_VERSION = 1;

const noInlineData = (value: string) => !/^data:/i.test(value.trim());

export const SlotPhotoSchema = z.object({
  assetId: z.string().min(1),
  /** Resolved, possibly expiring link — a cache, never the identity. Must not be an inline data URL. */
  url: z.string().min(1).refine(noInlineData, 'inline (data:) images are not allowed in personalization state').optional(),
  /** Natural size of the ORIGINAL upload, needed to turn the transform into a crop. */
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  transform: z.object({ scale: z.number().positive(), offsetX: z.number(), offsetY: z.number() }),
  rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).default(0),
  /** The customer explicitly accepted a low-resolution warning for this photo. */
  confirmedLowDpi: z.boolean().default(false),
});
export type SlotPhoto = z.infer<typeof SlotPhotoSchema>;

export const TextValueSchema = z.object({
  value: z.string(),
  fontFamily: z.string().optional(),
  color: z.string().optional(),
});
export type TextValue = z.infer<typeof TextValueSchema>;

/** A calendar's chosen day, as YYYY-MM-DD (a calendar date, no time zone). */
export const CalendarValueSchema = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
export type CalendarValue = z.infer<typeof CalendarValueSchema>;

export const PersonalizationStateSchema = z.object({
  schemaVersion: z.number().int().positive().default(STATE_SCHEMA_VERSION),
  templateId: z.string().min(1),
  templateVersion: z.number().int().positive(),
  /** Keyed by PhotoSlot.id. A missing key = empty slot. */
  slots: z.record(z.string(), SlotPhotoSchema).default({}),
  /** Keyed by TextSlot.id. */
  texts: z.record(z.string(), TextValueSchema).default({}),
  /** Keyed by CalendarSlot.id. Absent until a template with a calendar is used. */
  dates: z.record(z.string(), CalendarValueSchema).optional(),
});
export type PersonalizationState = z.infer<typeof PersonalizationStateSchema>;

export function createEmptyState(templateId: string, templateVersion: number): PersonalizationState {
  return { schemaVersion: STATE_SCHEMA_VERSION, templateId, templateVersion, slots: {}, texts: {} };
}

// --- Pure updaters. Each returns a NEW state; the input is never mutated, so
// React/memoisation and "did the preview change?" comparisons stay trivial. ---

export interface PhotoInput {
  assetId: string;
  url?: string;
  width: number;
  height: number;
}

/** Put a photo in a slot with the automatic cover-fit (centred, unzoomed, unrotated). */
export function setSlotPhoto(state: PersonalizationState, slotId: string, photo: PhotoInput): PersonalizationState {
  return {
    ...state,
    slots: {
      ...state.slots,
      [slotId]: {
        assetId: photo.assetId,
        ...(photo.url && { url: photo.url }),
        width: photo.width,
        height: photo.height,
        transform: { scale: 1, offsetX: 0, offsetY: 0 },
        rotation: 0,
        confirmedLowDpi: false,
      },
    },
  };
}

/** Pan/zoom a slot's photo, clamped so it always keeps covering the slot. No-op for an empty slot. */
export function setSlotTransform(state: PersonalizationState, slotId: string, transform: PhotoTransform, slotAspect: number): PersonalizationState {
  const photo = state.slots[slotId];
  if (!photo) return state;
  const rot = photo.rotation;
  const w = rot === 90 || rot === 270 ? photo.height : photo.width;
  const h = rot === 90 || rot === 270 ? photo.width : photo.height;
  return { ...state, slots: { ...state.slots, [slotId]: { ...photo, transform: clampTransform(transform, w, h, slotAspect) } } };
}

/** Rotate a slot's photo by 90° steps; the pan/zoom is reset because it was relative to the old orientation. */
export function setSlotRotation(state: PersonalizationState, slotId: string, rotation: Rotation): PersonalizationState {
  const photo = state.slots[slotId];
  if (!photo) return state;
  return {
    ...state,
    slots: { ...state.slots, [slotId]: { ...photo, rotation, transform: { scale: 1, offsetX: 0, offsetY: 0 } } },
  };
}

export function resetSlotTransform(state: PersonalizationState, slotId: string): PersonalizationState {
  const photo = state.slots[slotId];
  if (!photo) return state;
  return { ...state, slots: { ...state.slots, [slotId]: { ...photo, transform: { scale: 1, offsetX: 0, offsetY: 0 } } } };
}

export function confirmLowDpi(state: PersonalizationState, slotId: string, confirmed: boolean): PersonalizationState {
  const photo = state.slots[slotId];
  if (!photo) return state;
  return { ...state, slots: { ...state.slots, [slotId]: { ...photo, confirmedLowDpi: confirmed } } };
}

export function clearSlot(state: PersonalizationState, slotId: string): PersonalizationState {
  if (!(slotId in state.slots)) return state;
  const { [slotId]: _removed, ...rest } = state.slots;
  return { ...state, slots: rest };
}

export function setText(state: PersonalizationState, slotId: string, text: TextValue): PersonalizationState {
  return { ...state, texts: { ...state.texts, [slotId]: text } };
}

export function setCalendarDate(state: PersonalizationState, slotId: string, date: string | null): PersonalizationState {
  const { [slotId]: _old, ...rest } = state.dates ?? {};
  return { ...state, dates: date ? { ...rest, [slotId]: { date } } : rest };
}

// --- Serialization -----------------------------------------------------------

/** Plain-JSON form for carts/orders/localStorage. Validates, so nothing malformed is ever persisted. */
export function serializeState(state: PersonalizationState): string {
  return JSON.stringify(PersonalizationStateSchema.parse(state));
}

export type DeserializeResult = { ok: true; state: PersonalizationState } | { ok: false; error: string };

/** Never throws: a corrupt/old/hand-edited blob becomes a clear error the UI can recover from. */
export function deserializeState(raw: unknown): DeserializeResult {
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return { ok: false, error: 'Saved personalization is not valid JSON.' };
    }
  }
  const parsed = PersonalizationStateSchema.safeParse(value);
  if (!parsed.success) {
    return { ok: false, error: `Saved personalization is invalid: ${parsed.error.issues[0]?.path.join('.')} ${parsed.error.issues[0]?.message}` };
  }
  return { ok: true, state: parsed.data };
}

/**
 * Stable fingerprint of everything that affects what is RENDERED. Two states with
 * the same fingerprint produce identical previews, so it doubles as a cache key
 * for mockup renders and as the "did anything change?" check for debouncing.
 * Signed-URL query strings are ignored (they rotate without the picture changing).
 */
export function stateFingerprint(state: PersonalizationState): string {
  const slotIds = Object.keys(state.slots).sort();
  const textIds = Object.keys(state.texts).sort();
  const norm = {
    t: [state.templateId, state.templateVersion],
    s: slotIds.map((id) => {
      const p = state.slots[id];
      return [id, p.assetId, round(p.transform.scale), round(p.transform.offsetX), round(p.transform.offsetY), p.rotation];
    }),
    x: textIds.map((id) => [id, state.texts[id].value, state.texts[id].fontFamily ?? '', state.texts[id].color ?? '']),
    // Only when present, so states without calendars keep their existing fingerprints.
    ...(state.dates && Object.keys(state.dates).length > 0 && { d: Object.keys(state.dates).sort().map((id) => [id, state.dates![id].date]) }),
  };
  return fnv1a(JSON.stringify(norm));
}

function round(n: number): number {
  return Math.round(n * 10_000) / 10_000;
}

/** Small, dependency-free, deterministic 32-bit hash (FNV-1a), hex encoded. Not for security. */
function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
