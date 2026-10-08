import { z } from 'zod';

/**
 * How the shop LOOKS beyond its colours (Admin > Website > Appearance): the two typefaces, how rounded the corners
 * and buttons are, the browser-tab icon, and which sections the product page shows. Colours live in the theme
 * settings. Every default is exactly what the shop looked like before this was editable, so saving nothing
 * changes nothing, and "Reset" returns to it.
 */

/** Typefaces the admin can pick. Each is loaded for the shop (see apps/web/app/layout.tsx); `cssVar` is the next/font variable. */
export const FONT_CHOICES = [
  { key: 'outfit', label: 'Outfit', cssVar: '--font-outfit', style: 'modern geometric', roles: ['display', 'body'] },
  { key: 'manrope', label: 'Manrope', cssVar: '--font-manrope', style: 'clean, friendly', roles: ['display', 'body'] },
  { key: 'inter', label: 'Inter', cssVar: '--font-inter', style: 'neutral, very readable', roles: ['display', 'body'] },
  { key: 'dm-sans', label: 'DM Sans', cssVar: '--font-dm-sans', style: 'soft, modern', roles: ['display', 'body'] },
  { key: 'poppins', label: 'Poppins', cssVar: '--font-poppins', style: 'round, bold', roles: ['display', 'body'] },
  { key: 'nunito-sans', label: 'Nunito Sans', cssVar: '--font-nunito-sans', style: 'warm, rounded', roles: ['display', 'body'] },
  { key: 'montserrat', label: 'Montserrat', cssVar: '--font-montserrat', style: 'confident, wide', roles: ['display', 'body'] },
  { key: 'playfair', label: 'Playfair Display', cssVar: '--font-playfair', style: 'elegant serif', roles: ['display'] },
  { key: 'cormorant', label: 'Cormorant Garamond', cssVar: '--font-cormorant', style: 'refined serif', roles: ['display'] },
  { key: 'lora', label: 'Lora', cssVar: '--font-lora', style: 'classic serif', roles: ['display', 'body'] },
  { key: 'fraunces', label: 'Fraunces', cssVar: '--font-fraunces', style: 'characterful serif', roles: ['display'] },
] as const;
export type FontKey = (typeof FONT_CHOICES)[number]['key'];
const FONT_KEYS = FONT_CHOICES.map((f) => f.key) as [FontKey, ...FontKey[]];

export const CORNER_STYLES = ['sharp', 'soft', 'default', 'round'] as const;
export const BUTTON_STYLES = ['square', 'soft', 'default', 'pill'] as const;

export const CORNER_LABELS: Record<(typeof CORNER_STYLES)[number], string> = { sharp: 'Sharp', soft: 'Soft', default: 'Current look', round: 'Very round' };
export const BUTTON_LABELS: Record<(typeof BUTTON_STYLES)[number], string> = { square: 'Square', soft: 'Slightly rounded', default: 'Current look (pill)', pill: 'Pill' };

/** Sections of the product page the admin can switch off. */
export const PRODUCT_PAGE_SECTIONS = [
  { key: 'showTrustBar', label: 'Trust badges bar', hint: 'The four reassurance points under the product' },
  { key: 'showTabs', label: 'Description tabs', hint: 'Details, size guide and care information' },
  { key: 'showVideos', label: 'Product videos', hint: '“In motion” clips for the product' },
  { key: 'showReviews', label: 'Customer reviews', hint: 'Reviews and the rating summary' },
  { key: 'showFrequentlyBought', label: 'Frequently bought together', hint: 'Suggested companion products' },
  { key: 'showRelated', label: 'Related products', hint: 'More from the same collection' },
  { key: 'showRecentlyViewed', label: 'Recently viewed', hint: 'The visitor\'s own recent products' },
] as const;
export type ProductPageSectionKey = (typeof PRODUCT_PAGE_SECTIONS)[number]['key'];

export const AppearanceSchema = z
  .object({
    displayFont: z.enum(FONT_KEYS),
    bodyFont: z.enum(FONT_KEYS),
    corners: z.enum(CORNER_STYLES),
    buttons: z.enum(BUTTON_STYLES),
    /** A library image (Admin > Media) used as the browser-tab icon; null = the default icon. */
    faviconMediaId: z.string().min(1).max(80).nullable(),
    productPage: z.object(Object.fromEntries(PRODUCT_PAGE_SECTIONS.map((s) => [s.key, z.boolean()])) as Record<ProductPageSectionKey, z.ZodBoolean>),
  })
  .strict();
export type Appearance = z.infer<typeof AppearanceSchema>;

export const DEFAULT_APPEARANCE: Appearance = {
  displayFont: 'outfit',
  bodyFont: 'manrope',
  corners: 'default',
  buttons: 'default',
  faviconMediaId: null,
  productPage: Object.fromEntries(PRODUCT_PAGE_SECTIONS.map((s) => [s.key, true])) as Record<ProductPageSectionKey, boolean>,
};

/** Saved values over the defaults; anything missing or invalid falls back to the original look. */
export function resolveAppearance(raw: unknown): Appearance {
  const merged = {
    ...DEFAULT_APPEARANCE,
    ...(raw && typeof raw === 'object' ? (raw as object) : {}),
    productPage: { ...DEFAULT_APPEARANCE.productPage, ...((raw as { productPage?: object } | null | undefined)?.productPage ?? {}) },
  };
  const parsed = AppearanceSchema.safeParse(merged);
  return parsed.success ? parsed.data : DEFAULT_APPEARANCE;
}

export function fontChoice(key: FontKey) {
  return FONT_CHOICES.find((f) => f.key === key)!;
}

/** The corner radii (CSS custom properties) for each style. `default` equals Tailwind's own values, so it changes nothing. */
const CORNER_VALUES: Record<(typeof CORNER_STYLES)[number], Record<string, string>> = {
  sharp: { '--radius-md': '0.125rem', '--radius-lg': '0.125rem', '--radius-xl': '0.125rem', '--radius-2xl': '0.25rem', '--radius-3xl': '0.25rem', '--radius-card': '2px' },
  soft: { '--radius-md': '0.25rem', '--radius-lg': '0.375rem', '--radius-xl': '0.5rem', '--radius-2xl': '0.625rem', '--radius-3xl': '0.875rem', '--radius-card': '8px' },
  default: { '--radius-md': '0.375rem', '--radius-lg': '0.5rem', '--radius-xl': '0.75rem', '--radius-2xl': '1rem', '--radius-3xl': '1.5rem', '--radius-card': '12px' },
  round: { '--radius-md': '0.625rem', '--radius-lg': '0.875rem', '--radius-xl': '1.125rem', '--radius-2xl': '1.5rem', '--radius-3xl': '2rem', '--radius-card': '20px' },
};

const BUTTON_RADIUS: Record<(typeof BUTTON_STYLES)[number], string> = { square: '2px', soft: '8px', default: '9999px', pill: '9999px' };

/** The radii a corner style sets, for previews in the admin. */
export function cornerValues(corners: (typeof CORNER_STYLES)[number]): Record<string, string> {
  return CORNER_VALUES[corners];
}

/** The radius a button style gives main call-to-action buttons. */
export function buttonRadius(buttons: (typeof BUTTON_STYLES)[number]): string {
  return BUTTON_RADIUS[buttons];
}

/** Selector for the shop's main call-to-action buttons (pill-shaped gold/ink buttons and links). */
const PRIMARY_BUTTONS = ':is(button,a,input[type="submit"])[class~="rounded-full"]:is([class~="bg-gold"],[class~="bg-ink"])';

/**
 * The CSS for the chosen look, or '' when it is the original look. Scoped so the admin area keeps its own look
 * (the same rule the festival themes follow). Fonts: only the two variables the whole shop is styled with are re-pointed.
 */
export function appearanceCss(appearance: Appearance): string {
  const scope = ':root:not(:has([data-admin-root]))';
  const parts: string[] = [];
  const vars: string[] = [];
  if (appearance.displayFont !== DEFAULT_APPEARANCE.displayFont) vars.push(`--font-display:var(${fontChoice(appearance.displayFont).cssVar})`);
  if (appearance.bodyFont !== DEFAULT_APPEARANCE.bodyFont) vars.push(`--font-sans:var(${fontChoice(appearance.bodyFont).cssVar})`);
  if (appearance.corners !== 'default') for (const [k, v] of Object.entries(CORNER_VALUES[appearance.corners])) vars.push(`${k}:${v}`);
  if (vars.length) parts.push(`html${scope}{${vars.join(';')}}`);
  if (appearance.buttons !== 'default') {
    parts.push(`${scope} body ${PRIMARY_BUTTONS}{border-radius:${BUTTON_RADIUS[appearance.buttons]}}`);
  }
  return parts.join('\n');
}
