import { z } from 'zod';

/**
 * Storefront themes (festivals and the everyday look). A theme is data: the
 * colour roles the whole site is styled with, plus light decorations. The
 * admin picks one to show now, or gives themes date ranges and the site
 * follows the calendar. Stored as settings/theme.
 */

/** A link that is a page on this site ("/…") or an http(s) address — never javascript: or data:. */
export function isSafeHref(value: string): boolean {
  const v = value.trim();
  return /^\/(?!\/)/.test(v) || /^https?:\/\//i.test(v);
}
export const SafeHrefSchema = z.string().trim().min(1).max(300).refine(isSafeHref, 'Use a page on this shop (starting with /) or an https:// address');

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a 6-digit hex colour like #FCA311');

/** The colour roles every storefront component is built from (see tailwind.config.ts). */
export const ThemeColorsSchema = z.object({
  /** The page background. */
  field: hex,
  /** Cards and raised surfaces. */
  paper: hex,
  /** Quiet bands, image tiles, the search box. */
  tint: hex,
  /** Borders. */
  line: hex,
  /** All text. */
  ink: hex,
  /** Main buttons (dark text sits on it). */
  gold: hex,
  /** Main buttons when pressed/hovered. */
  goldDeep: hex,
  /** Links, focus rings, strong accents. */
  accent: hex,
  accentDark: hex,
});
export type ThemeColors = z.infer<typeof ThemeColorsSchema>;

export const THEME_MOTIFS = ['none', 'diya', 'kolam', 'star', 'sparkle', 'sugarcane'] as const;
export const THEME_EFFECTS = ['none', 'sparkles', 'snow', 'petals', 'confetti'] as const;

export const ThemeDecorSchema = z.object({
  /** Pattern for the thin ornamental band under the header. */
  motif: z.enum(THEME_MOTIFS).default('none'),
  /** Gentle animation over the page (off for visitors who ask for reduced motion). */
  effect: z.enum(THEME_EFFECTS).default('none'),
  /** Festive message shown in the announcement bar while the theme is on. */
  bannerText: z.string().max(140).optional(),
  bannerLink: SafeHrefSchema.optional(),
});
export type ThemeDecor = z.infer<typeof ThemeDecorSchema>;

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-10-25');

export const ThemeScheduleSchema = z
  .object({ start: date, end: date })
  .refine((s) => s.start <= s.end, { message: 'The end date must be on or after the start date' });

export const StoreThemeSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  name: z.string().min(1).max(40),
  colors: ThemeColorsSchema,
  decor: ThemeDecorSchema,
  /** Dates (India time, inclusive) the theme turns itself on when following the schedule. */
  schedule: ThemeScheduleSchema.nullable().default(null),
});
export type StoreTheme = z.infer<typeof StoreThemeSchema>;

export const ThemeSettingsSchema = z
  .object({
    /** 'schedule': the calendar decides; 'manual': `activeThemeId` stays on until changed. */
    mode: z.enum(['schedule', 'manual']),
    activeThemeId: z.string().min(1),
    themes: z.array(StoreThemeSchema).min(1).max(24),
  })
  .strict()
  .refine((s) => s.themes.some((t) => t.id === 'default'), { message: 'The Default theme cannot be removed' })
  .refine((s) => s.themes.some((t) => t.id === s.activeThemeId), { message: 'The chosen theme does not exist' })
  .refine((s) => new Set(s.themes.map((t) => t.id)).size === s.themes.length, { message: 'Two themes have the same id' });
export type ThemeSettings = z.infer<typeof ThemeSettingsSchema>;

// --- Presets -------------------------------------------------------------

export const DEFAULT_THEME_COLORS: ThemeColors = {
  field: '#FAF8F4',
  paper: '#FFFFFF',
  tint: '#EFEBE4',
  line: '#E0DAD1',
  ink: '#000000',
  gold: '#FCA311',
  goldDeep: '#E08F00',
  accent: '#14213D',
  accentDark: '#0B1428',
};

export const THEME_PRESETS: readonly StoreTheme[] = [
  { id: 'default', name: 'Everyday', colors: DEFAULT_THEME_COLORS, decor: { motif: 'none', effect: 'none' }, schedule: null },
  {
    id: 'diwali',
    name: 'Diwali',
    // Marigold and deep maroon on a warm diya-lit cream.
    colors: { field: '#FFF7EC', paper: '#FFFFFF', tint: '#FBE8CF', line: '#EED3AE', ink: '#2A0F0A', gold: '#F5A30B', goldDeep: '#D98706', accent: '#7A1E1E', accentDark: '#4C0F0F' },
    decor: { motif: 'diya', effect: 'sparkles', bannerText: 'Happy Diwali! Light up their walls with memories' },
    schedule: null,
  },
  {
    id: 'pongal',
    name: 'Pongal',
    // Turmeric, sugarcane green and the white of a kolam.
    colors: { field: '#FFFBEF', paper: '#FFFFFF', tint: '#F6EDCB', line: '#E7D9A6', ink: '#1F2A12', gold: '#E8B008', goldDeep: '#C79500', accent: '#2F6B2A', accentDark: '#1C4519' },
    decor: { motif: 'kolam', effect: 'petals', bannerText: 'Pongalo Pongal! Frame this harvest season together' },
    schedule: null,
  },
  {
    id: 'christmas',
    name: 'Christmas',
    // Holly red and evergreen, with warm gold buttons.
    colors: { field: '#F8F6F1', paper: '#FFFFFF', tint: '#ECF2EC', line: '#D6E0D6', ink: '#10140F', gold: '#F2C14E', goldDeep: '#D9A62E', accent: '#A4161A', accentDark: '#165B33' },
    decor: { motif: 'star', effect: 'snow', bannerText: 'Merry Christmas! Gifts they will keep forever' },
    schedule: null,
  },
  {
    id: 'new-year',
    name: 'New Year',
    // Midnight indigo and champagne.
    colors: { field: '#F7F6FB', paper: '#FFFFFF', tint: '#ECEAF4', line: '#DAD6E8', ink: '#0E0B1F', gold: '#E6C26E', goldDeep: '#C9A24B', accent: '#2B2A6B', accentDark: '#17164A' },
    decor: { motif: 'sparkle', effect: 'confetti', bannerText: 'Happy New Year! Start it with your best memories' },
    schedule: null,
  },
];

/** What the site uses before an admin has ever saved theme settings. */
export function defaultThemeSettings(): ThemeSettings {
  return { mode: 'schedule', activeThemeId: 'default', themes: THEME_PRESETS.map((t) => ({ ...t, colors: { ...t.colors }, decor: { ...t.decor } })) };
}

/** Today's date in India (YYYY-MM-DD), the calendar schedules are written in. */
export function indiaDate(now: Date): string {
  return new Date(now.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * The theme the storefront shows right now. Manual mode: the chosen theme.
 * Schedule mode: the theme whose dates include today (the most recently
 * started if they overlap), otherwise the chosen theme.
 */
export function resolveActiveTheme(settings: ThemeSettings, now: Date = new Date()): StoreTheme {
  const byId = (id: string) => settings.themes.find((t) => t.id === id);
  const fallback = byId(settings.activeThemeId) ?? byId('default') ?? settings.themes[0];
  if (settings.mode === 'manual') return fallback;
  const today = indiaDate(now);
  const running = settings.themes
    .filter((t) => t.schedule && t.schedule.start <= today && today <= t.schedule.end)
    .sort((a, b) => (b.schedule!.start > a.schedule!.start ? 1 : -1));
  return running[0] ?? fallback;
}

// --- Readability ------------------------------------------------------------

function luminance(color: string): number {
  const n = parseInt(color.slice(1), 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

/** WCAG contrast ratio between two colours (1–21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Pairs that must stay readable, with plain-language problems when they are not (WCAG AA, 4.5:1). */
export function themeReadabilityIssues(colors: ThemeColors): string[] {
  const checks: Array<[string, string, string]> = [
    [colors.ink, colors.field, 'Text on the page background'],
    [colors.ink, colors.paper, 'Text on cards'],
    [colors.ink, colors.tint, 'Text on tinted bands'],
    [colors.ink, colors.gold, 'Text on the main buttons'],
    [colors.accent, colors.paper, 'Links on cards'],
    [colors.paper, colors.accent, 'Light text on accent blocks'],
  ];
  return checks
    .map(([fg, bg, label]) => ({ label, ratio: contrastRatio(fg, bg) }))
    .filter((c) => c.ratio < 4.5)
    .map((c) => `${c.label} is hard to read (contrast ${c.ratio.toFixed(1)}:1, needs 4.5:1).`);
}

/** "#FCA311" → "252 163 17", the form the stylesheet's colour variables use. */
export function hexToChannels(color: string): string {
  const n = parseInt(color.slice(1), 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** CSS custom properties for a theme's colours. */
export function themeCssVariables(colors: ThemeColors): Record<string, string> {
  return {
    '--color-field': hexToChannels(colors.field),
    '--color-paper': hexToChannels(colors.paper),
    '--color-tint': hexToChannels(colors.tint),
    '--color-line': hexToChannels(colors.line),
    '--color-ink': hexToChannels(colors.ink),
    '--color-gold': hexToChannels(colors.gold),
    '--color-gold-deep': hexToChannels(colors.goldDeep),
    '--color-accent': hexToChannels(colors.accent),
    '--color-accent-dark': hexToChannels(colors.accentDark),
  };
}
