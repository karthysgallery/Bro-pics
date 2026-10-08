import { z } from 'zod';

/**
 * PersonalizationTemplate v2 — the DATA that describes a personalizable design.
 * Pure data, no behaviour: the browser editor, the mockup renderer and the
 * 300-DPI print renderer all read this same document, so coordinates are never
 * maintained twice.
 *
 * All geometry is a FRACTION (0-1) of the template canvas, so it is resolution
 * independent: the same slot is 400px in the editor and 3600px in the print file
 * without anything being recomputed by hand. (Same convention as the existing
 * FrameTemplate.printableRects, which this schema is a superset of — see
 * adapter.ts for the lossless FrameTemplate -> v2 conversion.)
 */

export const fraction = z.number().min(0).max(1);

export const TEMPLATE_TYPES = [
  'single_photo',
  'multi_photo',
  'collage',
  'hero_collage',
  'calendar',
  'text_plus_photo',
  'wedding_collage',
  'birthday_collage',
] as const;
export const TemplateTypeSchema = z.enum(TEMPLATE_TYPES);
export type TemplateType = z.infer<typeof TemplateTypeSchema>;

/** Draft -> review -> published -> archived. Only `published` is ever shown to customers. */
export const TEMPLATE_STATUSES = ['draft', 'review', 'published', 'archived'] as const;
export const TemplateStatusSchema = z.enum(TEMPLATE_STATUSES);
export type TemplateStatus = z.infer<typeof TemplateStatusSchema>;

/** A reference to a stored asset. `assetId` is the stable identity; `url` is an optional resolved/cached link. */
export const AssetRefSchema = z.object({
  assetId: z.string().min(1),
  url: z.string().min(1).optional(),
});
export type AssetRef = z.infer<typeof AssetRefSchema>;

export const PointSchema = z.object({ x: fraction, y: fraction });
export type Point = z.infer<typeof PointSchema>;

/** How a photo slot is shaped. 'mask' uses an alpha PNG; 'polygon' points are fractions of the SLOT's own box. */
export const SLOT_SHAPES = ['rect', 'rounded', 'ellipse', 'polygon', 'mask'] as const;

export const PhotoSlotSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    required: z.boolean().default(true),
    x: fraction,
    y: fraction,
    width: fraction,
    height: fraction,
    /** Free rotation of the slot itself (tilted polaroids etc.), degrees clockwise around its centre. */
    rotationDeg: z.number().min(-180).max(180).default(0),
    shape: z.enum(SLOT_SHAPES).default('rect'),
    /** For 'rounded': corner radius as a fraction of the slot's shorter side (0-0.5). */
    cornerRadius: z.number().min(0).max(0.5).optional(),
    /** For 'polygon': >= 3 points, as fractions of the slot's own bounding box. */
    polygon: z.array(PointSchema).min(3).optional(),
    /** For 'mask': the alpha mask asset (authored at the slot's own aspect ratio). */
    mask: AssetRefSchema.optional(),
    /** Only 'cover' today (photo always fills the slot); the field exists so 'contain' can be added without a schema break. */
    fit: z.enum(['cover']).default('cover'),
    /** Optional physical size, for DPI warnings when it differs from canvas*fraction. */
    widthMm: z.number().positive().optional(),
    heightMm: z.number().positive().optional(),
    /** This slot's own quality requirement at its printed size: warn below recommendedDpi, block below minDpi (defaults 150 / 300). */
    minDpi: z.number().int().min(72).max(600).optional(),
    recommendedDpi: z.number().int().min(100).max(1200).optional(),
    /** Customer-facing hint, e.g. "Bride", "Main photo". */
    hint: z.string().optional(),
  })
  .refine((slot) => slot.width > 0 && slot.height > 0, { message: 'slot width/height must be > 0' });
export type PhotoSlot = z.infer<typeof PhotoSlotSchema>;

export const TextSlotSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  required: z.boolean().default(false),
  x: fraction,
  y: fraction,
  width: fraction,
  height: fraction,
  maxLength: z.number().int().positive().default(40),
  align: z.enum(['left', 'center', 'right']).default('center'),
  defaultValue: z.string().default(''),
  defaultFontFamily: z.string().optional(),
  defaultColor: z.string().optional(),
  allowedFonts: z.array(z.string()).optional(),
  allowedColors: z.array(z.string()).optional(),
  minFontSizePx: z.number().positive().optional(),
  maxFontSizePx: z.number().positive().optional(),
});
export type TextSlot = z.infer<typeof TextSlotSchema>;

/**
 * A printed month calendar. The customer picks a date; the calendar shows that
 * date's month (title, weekday row, the days) with the chosen day marked, e.g.
 * a red heart behind "24". Layout is computed by calendarLayout() (calendar.ts),
 * which the browser preview and the print renderer both draw from.
 */
export const CALENDAR_MARKS = ['heart', 'circle'] as const;
export const CalendarSlotSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    required: z.boolean().default(true),
    x: fraction,
    y: fraction,
    width: fraction,
    height: fraction,
    /** First column of the week. */
    weekStart: z.enum(['sunday', 'monday']).default('sunday'),
    /** Font keys from FONT_MAP: the month title (a script face suits it) and the weekday/day numbers. */
    titleFont: z.string().default('great-vibes'),
    bodyFont: z.string().default('josefin'),
    /** Colour of the title, rule, weekday names and day numbers. */
    color: z.string().default('#ffffff'),
    /** The marked day: shape, its colour, and the colour of the number drawn over it. */
    mark: z.enum(CALENDAR_MARKS).default('heart'),
    markColor: z.string().default('#e0242c'),
    markTextColor: z.string().default('#ffffff'),
    /** Day numbers as "05" rather than "5". */
    leadingZero: z.boolean().default(true),
    /** A thin line under the month title. */
    showRule: z.boolean().default(true),
    /** Shown until the customer picks a date, as YYYY-MM-DD. */
    defaultDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  })
  .refine((slot) => slot.width > 0 && slot.height > 0, { message: 'slot width/height must be > 0' });
export type CalendarSlot = z.infer<typeof CalendarSlotSchema>;

/**
 * Fixed artwork (background, decoration, frame border, foreground effects).
 * `printed: true` means the layer is part of what is PRINTED (a border drawn on
 * the paper); `printed: false` means it is preview-only (a physical wooden frame
 * that is not on the print file). Keeping these apart is what lets the same
 * template drive both a realistic mockup and a clean print.
 */
export const FixedLayerSchema = z.object({
  kind: z.literal('fixed'),
  id: z.string().min(1),
  role: z.enum(['background', 'decoration', 'frame', 'foreground']),
  asset: AssetRefSchema,
  x: fraction.default(0),
  y: fraction.default(0),
  width: fraction.default(1),
  height: fraction.default(1),
  printed: z.boolean().default(true),
});
export type FixedLayer = z.infer<typeof FixedLayerSchema>;

/** Solid colour background, as an alternative to an image background layer. */
export const BackgroundSchema = z.object({ type: z.literal('color'), color: z.string().min(1) });

export const SlotLayerSchema = z.object({ kind: z.literal('photoSlot'), slotId: z.string().min(1) });
export const TextLayerSchema = z.object({ kind: z.literal('text'), slotId: z.string().min(1) });
export const CalendarLayerSchema = z.object({ kind: z.literal('calendar'), slotId: z.string().min(1) });

/** One entry of the paint stack, BOTTOM first. */
export const LayerSchema = z.discriminatedUnion('kind', [FixedLayerSchema, SlotLayerSchema, TextLayerSchema, CalendarLayerSchema]);
export type Layer = z.infer<typeof LayerSchema>;

export const CanvasSchema = z.object({
  /** Output size in pixels at `dpi` — i.e. the print resolution (width/dpi inches). */
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  dpi: z.number().int().positive().default(300),
  /** Print-safe inset as a fraction of the shorter side: artwork closer to the edge may be trimmed. */
  safeInset: z.number().min(0).max(0.25).default(0),
  bleedMm: z.number().nonnegative().default(0),
});
export type TemplateCanvas = z.infer<typeof CanvasSchema>;

export const PersonalizationTemplateSchema = z.object({
  /** Stable across versions, e.g. "forever-and-always". */
  id: z.string().min(1),
  /** Immutable once published. An order pins (id, version) forever. */
  version: z.number().int().positive(),
  status: TemplateStatusSchema.default('draft'),
  type: TemplateTypeSchema,
  name: z.string().min(1),
  canvas: CanvasSchema,
  background: BackgroundSchema.optional(),
  photoSlots: z.array(PhotoSlotSchema),
  textSlots: z.array(TextSlotSchema).default([]),
  /** Month calendars with a customer-chosen date. Absent on templates made before calendars existed. */
  calendarSlots: z.array(CalendarSlotSchema).optional(),
  /** Paint order, bottom -> top. Every slot must appear exactly once; see validate-template.ts. */
  layers: z.array(LayerSchema),
  /** Free-form tags (occasion, style) for the admin catalogue. Not used by rendering. */
  tags: z.array(z.string()).default([]),
  createdAt: z.string().optional(),
  publishedAt: z.string().optional(),
});
export type PersonalizationTemplate = z.infer<typeof PersonalizationTemplateSchema>;
