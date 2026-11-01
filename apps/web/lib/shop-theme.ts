import { resolveActiveTheme, type StoreTheme, type ThemeSettings } from '@bro-pics/shared';

/**
 * The theme the shop shows now. On a developer's machine `SHOP_THEME_PREVIEW=<theme id>` (e.g. `default`) shows
 * that theme instead, so a new look can be checked against live data before the owner switches themes. Ignored in
 * production builds.
 */
export function shopTheme(settings: ThemeSettings): StoreTheme {
  const preview = process.env.NODE_ENV !== 'production' ? process.env.SHOP_THEME_PREVIEW : undefined;
  const live = resolveActiveTheme(settings);
  const forced = preview ? settings.themes.find((t) => t.id === preview) : undefined;
  if (!forced) return live;
  // Keep the offer that is running now, as the owner will when moving it to the previewed theme.
  return forced.decor.offer || !live.decor.offer ? forced : { ...forced, decor: { ...forced.decor, offer: live.decor.offer } };
}
