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
/** The festive garland strung under the header. */
export const THEME_GARLANDS = ['none', 'marigold', 'thoranam', 'string-lights', 'bunting', 'diya-row', 'tricolor', 'hearts'] as const;
/** Ornaments hanging down at the page edges (large screens). */
export const THEME_HANGINGS = ['none', 'lanterns', 'baubles', 'stars', 'bells', 'hearts', 'crescents'] as const;
export const THEME_EFFECTS = ['none', 'sparkles', 'snow', 'petals', 'confetti', 'lanterns', 'fireworks', 'colors', 'hearts'] as const;
/** The picture on the homepage greeting banner. */
export const THEME_GREETING_ART = [
  'none',
  'rangoli',
  'pongal-pot',
  'tree',
  'fireworks',
  'holi',
  'dandiya',
  'lamps',
  'modak',
  'pookalam',
  'rakhi',
  'crescent',
  'flag',
  'heart',
  'frame',
  'kolam',
  'peacock',
] as const;

export const ThemeGreetingSchema = z.object({
  title: z.string().trim().min(1).max(60),
  subtitle: z.string().trim().max(160).optional(),
  ctaLabel: z.string().trim().max(30).optional(),
  ctaHref: SafeHrefSchema.optional(),
  art: z.enum(THEME_GREETING_ART).default('none'),
});
export type ThemeGreeting = z.infer<typeof ThemeGreetingSchema>;

export const ThemeDecorSchema = z.object({
  /** A thin ornament band under the header (simpler alternative to a garland). */
  motif: z.enum(THEME_MOTIFS).default('none'),
  garland: z.enum(THEME_GARLANDS).default('none'),
  hanging: z.enum(THEME_HANGINGS).default('none'),
  /** Gentle animation over the page (off for visitors who ask for reduced motion). */
  effect: z.enum(THEME_EFFECTS).default('none'),
  /** Festive message shown in the announcement bar while the theme is on. */
  bannerText: z.string().max(140).optional(),
  bannerLink: SafeHrefSchema.optional(),
  /** A decorated greeting at the top of the homepage. */
  greeting: ThemeGreetingSchema.optional(),
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
    themes: z.array(StoreThemeSchema).min(1).max(48),
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
  { id: 'default', name: 'Everyday', colors: DEFAULT_THEME_COLORS, decor: { motif: 'none', garland: 'none', hanging: 'none', effect: 'none' }, schedule: null },
  {
    id: 'diwali',
    name: 'Diwali',
    // Marigold and deep maroon on a warm diya-lit cream.
    colors: { field: '#FFF7EC', paper: '#FFFFFF', tint: '#FBE8CF', line: '#EED3AE', ink: '#2A0F0A', gold: '#F5A30B', goldDeep: '#D98706', accent: '#7A1E1E', accentDark: '#4C0F0F' },
    decor: {
      motif: 'none',
      garland: 'marigold',
      hanging: 'lanterns',
      effect: 'lanterns',
      bannerText: 'Happy Diwali! Light up their walls with memories',
      greeting: {
        title: 'Happy Diwali',
        subtitle: 'Gift the glow of a moment they love. Festive frames, made by hand and delivered in time for the festival.',
        ctaLabel: 'Shop Diwali gifts',
        ctaHref: '/category',
        art: 'rangoli',
      },
    },
    schedule: null,
  },
  {
    id: 'pongal',
    name: 'Pongal',
    // Turmeric, sugarcane green and the white of a kolam.
    colors: { field: '#FFFBEF', paper: '#FFFFFF', tint: '#F6EDCB', line: '#E7D9A6', ink: '#1F2A12', gold: '#E8B008', goldDeep: '#C79500', accent: '#2F6B2A', accentDark: '#1C4519' },
    decor: {
      motif: 'none',
      garland: 'thoranam',
      hanging: 'none',
      effect: 'petals',
      bannerText: 'Pongalo Pongal! Frame this harvest season together',
      greeting: {
        title: 'Pongalo Pongal!',
        subtitle: 'A harvest of happy faces deserves a place on the wall. Frame the family moments of this Thai Pongal.',
        ctaLabel: 'Frame your family',
        ctaHref: '/category',
        art: 'pongal-pot',
      },
    },
    schedule: null,
  },
  {
    id: 'christmas',
    name: 'Christmas',
    // Holly red and evergreen, with warm gold buttons.
    colors: { field: '#F8F6F1', paper: '#FFFFFF', tint: '#ECF2EC', line: '#D6E0D6', ink: '#10140F', gold: '#F2C14E', goldDeep: '#D9A62E', accent: '#A4161A', accentDark: '#165B33' },
    decor: {
      motif: 'none',
      garland: 'string-lights',
      hanging: 'baubles',
      effect: 'snow',
      bannerText: 'Merry Christmas! Gifts they will keep forever',
      greeting: {
        title: 'Merry Christmas',
        subtitle: 'The gift that outlasts the season: their favourite photo, framed and ready to unwrap.',
        ctaLabel: 'Find a Christmas gift',
        ctaHref: '/category',
        art: 'tree',
      },
    },
    schedule: null,
  },
  {
    id: 'new-year',
    name: 'New Year',
    // Midnight indigo and champagne.
    colors: { field: '#F7F6FB', paper: '#FFFFFF', tint: '#ECEAF4', line: '#DAD6E8', ink: '#0E0B1F', gold: '#E6C26E', goldDeep: '#C9A24B', accent: '#2B2A6B', accentDark: '#17164A' },
    decor: {
      motif: 'none',
      garland: 'bunting',
      hanging: 'stars',
      effect: 'fireworks',
      bannerText: 'Happy New Year! Start it with your best memories',
      greeting: {
        title: 'Happy New Year',
        subtitle: 'Turn last year’s best moments into this year’s favourite wall. New year, new frames.',
        ctaLabel: 'Start the year framed',
        ctaHref: '/category',
        art: 'fireworks',
      },
    },
    schedule: null,
  },
  {
    id: 'holi',
    name: 'Holi',
    colors: { field: '#FFF8FB', paper: '#FFFFFF', tint: '#FCE7F3', line: '#F5CFE4', ink: '#1E1024', gold: '#F7B32B', goldDeep: '#E39A0C', accent: '#8E1F6B', accentDark: '#5B1245' },
    decor: {
      motif: 'none',
      garland: 'bunting',
      hanging: 'none',
      effect: 'colors',
      bannerText: 'Happy Holi! Fill their walls with colour',
      greeting: { title: 'Happy Holi', subtitle: 'Bright days deserve a bright frame. Frame the colours, the laughter and the people you play Holi with.', ctaLabel: 'Frame your colours', ctaHref: '/category', art: 'holi' },
    },
    schedule: null,
  },
  {
    id: 'navratri',
    name: 'Navratri',
    colors: { field: '#FFF7F0', paper: '#FFFFFF', tint: '#FDEBDD', line: '#F3D3BA', ink: '#2A0D15', gold: '#F59E0B', goldDeep: '#D97706', accent: '#9D174D', accentDark: '#63102F' },
    decor: {
      motif: 'none',
      garland: 'marigold',
      hanging: 'bells',
      effect: 'sparkles',
      bannerText: 'Shubh Navratri! Nine nights of memories to frame',
      greeting: { title: 'Shubh Navratri', subtitle: 'Garba nights, dandiya and family pooja: nine nights of moments worth keeping on the wall.', ctaLabel: 'Frame the festivities', ctaHref: '/category', art: 'dandiya' },
    },
    schedule: null,
  },
  {
    id: 'durga-puja',
    name: 'Durga Puja',
    colors: { field: '#FFFAF5', paper: '#FFFFFF', tint: '#FBE9E4', line: '#EFD3CB', ink: '#250A0A', gold: '#E9B949', goldDeep: '#CB9A28', accent: '#B91C1C', accentDark: '#7A1010' },
    decor: {
      motif: 'none',
      garland: 'marigold',
      hanging: 'bells',
      effect: 'sparkles',
      bannerText: 'Shubho Pujo! Keep the pandal memories close',
      greeting: { title: 'Shubho Pujo', subtitle: 'From pandal hopping to dhunuchi naach, frame the Durga Puja moments your family loves.', ctaLabel: 'Shop Puja gifts', ctaHref: '/category', art: 'lamps' },
    },
    schedule: null,
  },
  {
    id: 'ganesh-chaturthi',
    name: 'Ganesh Chaturthi',
    colors: { field: '#FFF8EE', paper: '#FFFFFF', tint: '#FCEBD3', line: '#F1D4AE', ink: '#2A1206', gold: '#F59E0B', goldDeep: '#D97706', accent: '#9A3412', accentDark: '#64220B' },
    decor: {
      motif: 'none',
      garland: 'marigold',
      hanging: 'bells',
      effect: 'petals',
      bannerText: 'Ganpati Bappa Morya! Festive frames for every home',
      greeting: { title: 'Ganpati Bappa Morya', subtitle: 'Welcome Bappa home with the memories that matter. Festive frames, made by hand for your celebration.', ctaLabel: 'Shop festive frames', ctaHref: '/category', art: 'modak' },
    },
    schedule: null,
  },
  {
    id: 'onam',
    name: 'Onam',
    colors: { field: '#FFFCF2', paper: '#FFFFFF', tint: '#F6EED5', line: '#E9DCB2', ink: '#1B1F12', gold: '#E3B341', goldDeep: '#C4962A', accent: '#2F6B2A', accentDark: '#1D451A' },
    decor: {
      motif: 'none',
      garland: 'thoranam',
      hanging: 'none',
      effect: 'petals',
      bannerText: 'Happy Onam! Frame the sadhya, the pookalam and the family',
      greeting: { title: 'Happy Onam', subtitle: "The pookalam, the sadhya and everyone around the table: frame this Onam's best moments.", ctaLabel: 'Frame your Onam', ctaHref: '/category', art: 'pookalam' },
    },
    schedule: null,
  },
  {
    id: 'raksha-bandhan',
    name: 'Raksha Bandhan',
    colors: { field: '#FFF7F9', paper: '#FFFFFF', tint: '#FCE6EC', line: '#F2CBD6', ink: '#2A0F1A', gold: '#F4B740', goldDeep: '#DB9A1C', accent: '#B4235A', accentDark: '#7A153C' },
    decor: {
      motif: 'none',
      garland: 'bunting',
      hanging: 'none',
      effect: 'sparkles',
      bannerText: 'Happy Raksha Bandhan! A gift for your sibling they will keep',
      greeting: { title: 'Happy Raksha Bandhan', subtitle: 'Say it with a frame: the childhood photos, the silly ones and the ones that still make you smile.', ctaLabel: 'Find a rakhi gift', ctaHref: '/category', art: 'rakhi' },
    },
    schedule: null,
  },
  {
    id: 'eid',
    name: 'Eid',
    colors: { field: '#F7FBF8', paper: '#FFFFFF', tint: '#E6F2EA', line: '#CDE3D5', ink: '#0C1A15', gold: '#E2B54F', goldDeep: '#C3962E', accent: '#0F5B45', accentDark: '#0A3D2F' },
    decor: {
      motif: 'none',
      garland: 'string-lights',
      hanging: 'crescents',
      effect: 'sparkles',
      bannerText: 'Eid Mubarak! Gifts of memories for the whole family',
      greeting: { title: 'Eid Mubarak', subtitle: 'Share the joy of Eid with a gift that lasts: family moments, beautifully framed.', ctaLabel: 'Shop Eid gifts', ctaHref: '/category', art: 'crescent' },
    },
    schedule: null,
  },
  {
    id: 'janmashtami',
    name: 'Krishna Janmashtami',
    colors: { field: '#F5FAFC', paper: '#FFFFFF', tint: '#E1F0F5', line: '#C9E1EA', ink: '#0A1A22', gold: '#E9B949', goldDeep: '#C9992A', accent: '#0E5E7E', accentDark: '#083B50' },
    decor: {
      motif: 'none',
      garland: 'marigold',
      hanging: 'bells',
      effect: 'petals',
      bannerText: 'Happy Janmashtami! Frame your little Krishna',
      greeting: { title: 'Happy Janmashtami', subtitle: 'Little Krishnas, makhan and matki: frame the sweetest moments of the celebration.', ctaLabel: 'Frame your little Krishna', ctaHref: '/category', art: 'peacock' },
    },
    schedule: null,
  },
  {
    id: 'karthigai-deepam',
    name: 'Karthigai Deepam',
    colors: { field: '#FFF8EC', paper: '#FFFFFF', tint: '#FCE9CF', line: '#F0D2A8', ink: '#26120A', gold: '#F59E0B', goldDeep: '#D97706', accent: '#7C2D12', accentDark: '#4F1C0B' },
    decor: {
      motif: 'none',
      garland: 'diya-row',
      hanging: 'none',
      effect: 'sparkles',
      bannerText: 'Karthigai Deepam wishes! Light up your walls with memories',
      greeting: { title: 'Karthigai Deepam', subtitle: 'Rows of agal vilakku and a home full of light. Frame the glow of this Karthigai.', ctaLabel: 'Shop festive frames', ctaHref: '/category', art: 'lamps' },
    },
    schedule: null,
  },
  {
    id: 'tamil-new-year',
    name: 'Tamil New Year',
    colors: { field: '#FFFBEF', paper: '#FFFFFF', tint: '#F3EFCF', line: '#E4DCA8', ink: '#1C2010', gold: '#EBB51F', goldDeep: '#C99510', accent: '#3F6212', accentDark: '#26400A' },
    decor: {
      motif: 'none',
      garland: 'thoranam',
      hanging: 'none',
      effect: 'petals',
      bannerText: 'Puthandu Vazhthukkal! Start the year with your best memories',
      greeting: { title: 'Puthandu Vazhthukkal', subtitle: 'A new year, a fresh kolam and the family together. Frame the moments that begin it.', ctaLabel: 'Start the year framed', ctaHref: '/category', art: 'kolam' },
    },
    schedule: null,
  },
  {
    id: 'independence-day',
    name: 'Independence Day',
    colors: { field: '#FFFDF8', paper: '#FFFFFF', tint: '#FFF1E2', line: '#F2DEC4', ink: '#0B1426', gold: '#FF9933', goldDeep: '#E67E10', accent: '#0B3D91', accentDark: '#06204D' },
    decor: {
      motif: 'none',
      garland: 'tricolor',
      hanging: 'none',
      effect: 'confetti',
      bannerText: 'Happy Independence Day! Jai Hind',
      greeting: { title: 'Happy Independence Day', subtitle: 'Celebrate the freedom to make memories. Frame the moments that make you proud.', ctaLabel: 'Shop now', ctaHref: '/category', art: 'flag' },
    },
    schedule: null,
  },
  {
    id: 'republic-day',
    name: 'Republic Day',
    colors: { field: '#FFFDF8', paper: '#FFFFFF', tint: '#EEF5EC', line: '#D7E5D3', ink: '#0B1426', gold: '#FF9933', goldDeep: '#E67E10', accent: '#138808', accentDark: '#0B5A05' },
    decor: {
      motif: 'none',
      garland: 'tricolor',
      hanging: 'none',
      effect: 'confetti',
      bannerText: 'Happy Republic Day! Jai Hind',
      greeting: { title: 'Happy Republic Day', subtitle: 'Proud of where we come from. Frame the family moments that make us who we are.', ctaLabel: 'Shop now', ctaHref: '/category', art: 'flag' },
    },
    schedule: null,
  },
  {
    id: 'valentines-day',
    name: "Valentine's Day",
    colors: { field: '#FFF7F8', paper: '#FFFFFF', tint: '#FDE5EA', line: '#F5C9D3', ink: '#2A0A12', gold: '#F9A8C4', goldDeep: '#F17FA7', accent: '#B3123A', accentDark: '#7A0B27' },
    decor: {
      motif: 'none',
      garland: 'hearts',
      hanging: 'hearts',
      effect: 'hearts',
      bannerText: "Happy Valentine's Day! Frame your love story",
      greeting: { title: "Happy Valentine's Day", subtitle: 'Your love story deserves pride of place. Frame the photos only the two of you understand.', ctaLabel: 'Find a love gift', ctaHref: '/category', art: 'heart' },
    },
    schedule: null,
  },
  {
    id: 'mothers-day',
    name: "Mother's Day",
    colors: { field: '#FFF8F6', paper: '#FFFFFF', tint: '#FBE7E4', line: '#F1CCC6', ink: '#2B1418', gold: '#F4B6A6', goldDeep: '#EC9883', accent: '#9F3A54', accentDark: '#6B2337' },
    decor: {
      motif: 'none',
      garland: 'bunting',
      hanging: 'hearts',
      effect: 'petals',
      bannerText: "Happy Mother's Day! Give Amma a memory to keep",
      greeting: { title: "Happy Mother's Day", subtitle: 'For the one who kept every photo: give her one framed, to keep forever.', ctaLabel: 'Gift Amma a frame', ctaHref: '/category', art: 'frame' },
    },
    schedule: null,
  },
  {
    id: 'fathers-day',
    name: "Father's Day",
    colors: { field: '#F6F7FA', paper: '#FFFFFF', tint: '#E7EAF1', line: '#D2D8E4', ink: '#0F1724', gold: '#E0B866', goldDeep: '#C49A40', accent: '#1E3A5F', accentDark: '#11243D' },
    decor: {
      motif: 'none',
      garland: 'bunting',
      hanging: 'stars',
      effect: 'confetti',
      bannerText: "Happy Father's Day! A gift Appa will actually keep",
      greeting: { title: "Happy Father's Day", subtitle: "Frame his favourite photo: the one he'd never ask for, but will look at every day.", ctaLabel: 'Gift Appa a frame', ctaHref: '/category', art: 'frame' },
    },
    schedule: null,
  },
];

/** What the site uses before an admin has ever saved theme settings. */
export function defaultThemeSettings(): ThemeSettings {
  return { mode: 'schedule', activeThemeId: 'default', themes: THEME_PRESETS.map((t) => ({ ...t, colors: { ...t.colors }, decor: { ...t.decor } })) };
}

/**
 * Theme settings saved before garlands, hanging ornaments and greetings
 * existed: built-in festivals pick up the new decorations from their preset,
 * while everything the admin chose (colours, message, dates, effect) is kept.
 */
export function upgradeThemeSettings(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || !Array.isArray((raw as { themes?: unknown }).themes)) return raw;
  const themes = (raw as { themes: Array<Record<string, unknown>> }).themes.map((t) => {
    const preset = THEME_PRESETS.find((p) => p.id === t?.id);
    const decor = (t?.decor ?? {}) as Record<string, unknown>;
    if (!preset || 'garland' in decor || 'hanging' in decor || 'greeting' in decor) return t;
    return {
      ...t,
      decor: {
        ...decor,
        garland: preset.decor.garland,
        hanging: preset.decor.hanging,
        ...(preset.decor.greeting && { greeting: preset.decor.greeting }),
      },
    };
  });
  // Festivals added to the shop since the settings were saved appear too.
  for (const preset of THEME_PRESETS) {
    if (!themes.some((t) => t?.id === preset.id)) themes.push(JSON.parse(JSON.stringify(preset)));
  }
  return { ...(raw as object), themes };
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
