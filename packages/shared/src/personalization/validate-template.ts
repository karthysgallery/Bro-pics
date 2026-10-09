import { parseCalendarDate } from './calendar';
import { PersonalizationTemplateSchema, type PersonalizationTemplate } from './template-schema';

export type IssueSeverity = 'error' | 'warning';

export interface TemplateIssue {
  severity: IssueSeverity;
  code: string;
  message: string;
  /** What the issue is about, e.g. a slot id — lets the admin builder highlight it. */
  ref?: string;
}

export interface TemplateValidation {
  /** True when there are no errors. Warnings never block publishing. */
  valid: boolean;
  issues: TemplateIssue[];
  /** The parsed template (defaults applied) when the shape itself was valid; null otherwise. */
  template: PersonalizationTemplate | null;
}

export interface ValidateOptions {
  /**
   * Returns whether an asset id exists (and is readable). When omitted, asset
   * existence is not checked — the shape-only check used by the live builder.
   * Publishing MUST pass this: a template that references a missing mask would
   * render a broken slot for customers.
   */
  assetExists?: (assetId: string) => boolean;
}

const EPS = 1e-6;

/**
 * Everything that must be true before a template can go live. Returns issues
 * rather than throwing so the admin builder can list them all at once.
 *
 * `error`s block publishing; `warning`s (tiny slots, slots outside the print-safe
 * area, overlapping slots) are surfaced but allowed — an intentional collage may
 * legitimately overlap.
 */
export function validateTemplate(input: unknown, options: ValidateOptions = {}): TemplateValidation {
  const issues: TemplateIssue[] = [];
  const parsed = PersonalizationTemplateSchema.safeParse(input);

  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push({
        severity: 'error',
        code: 'schema',
        message: `${issue.path.join('.') || 'template'}: ${issue.message}`,
        ref: issue.path[0] !== undefined ? String(issue.path[0]) : undefined,
      });
    }
    return { valid: false, issues, template: null };
  }

  const t = parsed.data;
  const error = (code: string, message: string, ref?: string) => issues.push({ severity: 'error', code, message, ref });
  const warn = (code: string, message: string, ref?: string) => issues.push({ severity: 'warning', code, message, ref });

  // --- slots exist and ids are unique across photo AND text slots ------------
  const calendars = t.calendarSlots ?? [];
  if (t.photoSlots.length === 0 && t.textSlots.length === 0 && calendars.length === 0) {
    // A ready-made frame is the one design with nothing to fill: its printed artwork is the whole print.
    if (t.type !== 'ready_made') error('no_slots', 'A template needs at least one photo, text or calendar slot.');
    else if (!t.layers.some((l) => l.kind === 'fixed' && l.printed)) error('no_artwork', 'A ready-made design needs its printed artwork.');
  }
  const seen = new Set<string>();
  for (const id of [...t.photoSlots.map((s) => s.id), ...t.textSlots.map((s) => s.id), ...calendars.map((s) => s.id)]) {
    if (seen.has(id)) error('duplicate_slot_id', `Slot id "${id}" is used more than once.`, id);
    seen.add(id);
  }

  // --- geometry stays inside the canvas -------------------------------------
  const inCanvas = (s: { id: string; x: number; y: number; width: number; height: number }, what: string) => {
    if (s.x + s.width > 1 + EPS || s.y + s.height > 1 + EPS) {
      error('out_of_canvas', `${what} "${s.id}" extends beyond the canvas.`, s.id);
    }
  };
  for (const s of t.photoSlots) inCanvas(s, 'Photo slot');
  for (const s of t.textSlots) inCanvas(s, 'Text slot');
  for (const s of calendars) inCanvas(s, 'Calendar');

  // --- shape-specific requirements ------------------------------------------
  for (const s of t.photoSlots) {
    if (s.shape === 'polygon' && (!s.polygon || s.polygon.length < 3)) {
      error('polygon_needs_points', `Slot "${s.id}" is a polygon but has fewer than 3 points.`, s.id);
    }
    if (s.shape === 'mask') {
      if (!s.mask) error('mask_missing', `Slot "${s.id}" uses a mask shape but no mask asset is set.`, s.id);
      else if (options.assetExists && !options.assetExists(s.mask.assetId)) {
        error('mask_asset_missing', `Mask asset "${s.mask.assetId}" for slot "${s.id}" does not exist.`, s.id);
      }
    }
  }

  // --- referenced assets exist (when we were told how to check) -------------
  if (options.assetExists) {
    for (const layer of t.layers) {
      if (layer.kind === 'fixed' && !options.assetExists(layer.asset.assetId)) {
        error('asset_missing', `Layer "${layer.id}" references missing asset "${layer.asset.assetId}".`, layer.id);
      }
    }
  }

  // --- layer stack is coherent ----------------------------------------------
  const photoIds = new Set(t.photoSlots.map((s) => s.id));
  const textIds = new Set(t.textSlots.map((s) => s.id));
  const layerIds = new Set<string>();
  const photoLayers = new Map<string, number>();
  const textLayers = new Map<string, number>();
  const calendarIds = new Set(calendars.map((s) => s.id));
  const calendarLayers = new Map<string, number>();
  for (const layer of t.layers) {
    if (layer.kind === 'fixed') {
      if (layerIds.has(layer.id)) error('duplicate_layer_id', `Layer id "${layer.id}" is used more than once.`, layer.id);
      layerIds.add(layer.id);
      if (layer.x + layer.width > 1 + EPS || layer.y + layer.height > 1 + EPS) {
        error('out_of_canvas', `Layer "${layer.id}" extends beyond the canvas.`, layer.id);
      }
    } else if (layer.kind === 'photoSlot') {
      if (!photoIds.has(layer.slotId)) error('layer_unknown_slot', `Layer references unknown photo slot "${layer.slotId}".`, layer.slotId);
      photoLayers.set(layer.slotId, (photoLayers.get(layer.slotId) ?? 0) + 1);
    } else if (layer.kind === 'calendar') {
      if (!calendarIds.has(layer.slotId)) error('layer_unknown_slot', `Layer references unknown calendar "${layer.slotId}".`, layer.slotId);
      calendarLayers.set(layer.slotId, (calendarLayers.get(layer.slotId) ?? 0) + 1);
    } else {
      if (!textIds.has(layer.slotId)) error('layer_unknown_slot', `Layer references unknown text slot "${layer.slotId}".`, layer.slotId);
      textLayers.set(layer.slotId, (textLayers.get(layer.slotId) ?? 0) + 1);
    }
  }
  for (const id of photoIds) {
    const n = photoLayers.get(id) ?? 0;
    if (n === 0) error('slot_not_in_layers', `Photo slot "${id}" is not in the layer stack, so it would never be drawn.`, id);
    if (n > 1) error('slot_in_layers_twice', `Photo slot "${id}" appears ${n} times in the layer stack.`, id);
  }
  for (const id of textIds) {
    const n = textLayers.get(id) ?? 0;
    if (n === 0) error('slot_not_in_layers', `Text slot "${id}" is not in the layer stack, so it would never be drawn.`, id);
    if (n > 1) error('slot_in_layers_twice', `Text slot "${id}" appears ${n} times in the layer stack.`, id);
  }
  for (const id of calendarIds) {
    const n = calendarLayers.get(id) ?? 0;
    if (n === 0) error('slot_not_in_layers', `Calendar "${id}" is not in the layer stack, so it would never be drawn.`, id);
    if (n > 1) error('slot_in_layers_twice', `Calendar "${id}" appears ${n} times in the layer stack.`, id);
  }
  for (const s of calendars) {
    if (s.defaultDate && !parseCalendarDate(s.defaultDate)) error('invalid_date', `Calendar "${s.id}" has an invalid default date "${s.defaultDate}".`, s.id);
  }

  // --- canvas / print quality sanity ----------------------------------------
  const widthIn = t.canvas.width / t.canvas.dpi;
  const heightIn = t.canvas.height / t.canvas.dpi;
  if (widthIn < 1 || heightIn < 1) warn('tiny_canvas', `Canvas is only ${widthIn.toFixed(1)}×${heightIn.toFixed(1)} in at ${t.canvas.dpi} DPI.`);
  if (t.canvas.dpi < 150) warn('low_dpi', `Canvas DPI ${t.canvas.dpi} is low for print (300 recommended).`);

  // --- warnings: slots that are probably mistakes ---------------------------
  for (const s of t.photoSlots) {
    const slotWIn = s.width * widthIn;
    const slotHIn = s.height * heightIn;
    if (slotWIn < 0.4 || slotHIn < 0.4) warn('tiny_slot', `Slot "${s.id}" is only ${slotWIn.toFixed(2)}×${slotHIn.toFixed(2)} in.`, s.id);
    const inset = t.canvas.safeInset;
    if (inset > 0 && (s.x < inset - EPS || s.y < inset - EPS || s.x + s.width > 1 - inset + EPS || s.y + s.height > 1 - inset + EPS)) {
      warn('outside_safe_area', `Slot "${s.id}" is outside the print-safe area and may be trimmed.`, s.id);
    }
  }
  for (let i = 0; i < t.photoSlots.length; i++) {
    for (let j = i + 1; j < t.photoSlots.length; j++) {
      const a = t.photoSlots[i];
      const b = t.photoSlots[j];
      // Overlap judged on bounding boxes (rotation ignored — this is a heads-up, not a proof).
      const ox = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const oy = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      if (ox > EPS && oy > EPS) {
        const overlap = ox * oy;
        const smaller = Math.min(a.width * a.height, b.width * b.height);
        if (overlap / smaller > 0.05) warn('overlapping_slots', `Slots "${a.id}" and "${b.id}" overlap.`, a.id);
      }
    }
  }

  return { valid: !issues.some((i) => i.severity === 'error'), issues, template: t };
}

/** Throws with a readable list if the template can't be published. For API routes. */
export function assertPublishable(input: unknown, options: ValidateOptions = {}): PersonalizationTemplate {
  const result = validateTemplate(input, options);
  if (!result.valid || !result.template) {
    const errors = result.issues.filter((i) => i.severity === 'error').map((i) => i.message);
    throw new Error(`Template cannot be published:\n- ${errors.join('\n- ')}`);
  }
  return result.template;
}
