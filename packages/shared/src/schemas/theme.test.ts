import { describe, it, expect } from 'vitest';
import {
  THEME_PRESETS,
  ThemeSettingsSchema,
  contrastRatio,
  defaultThemeSettings,
  hexToChannels,
  indiaDate,
  resolveActiveTheme,
  themeCssVariables,
  themeReadabilityIssues,
  type ThemeSettings,
} from './theme';

const withSchedules = (patch: Record<string, { start: string; end: string } | null>, mode: ThemeSettings['mode'] = 'schedule'): ThemeSettings => {
  const s = defaultThemeSettings();
  return { ...s, mode, themes: s.themes.map((t) => (t.id in patch ? { ...t, schedule: patch[t.id] } : t)) };
};

describe('festival themes', () => {
  it('every preset is readable (WCAG AA) and valid', () => {
    for (const preset of THEME_PRESETS) expect(themeReadabilityIssues(preset.colors), preset.name).toEqual([]);
    expect(ThemeSettingsSchema.safeParse(defaultThemeSettings()).success).toBe(true);
  });

  it('follows the calendar in India time, falling back to the chosen theme', () => {
    const s = withSchedules({ diwali: { start: '2026-10-25', end: '2026-11-05' }, christmas: { start: '2026-12-20', end: '2026-12-26' } });
    expect(resolveActiveTheme(s, new Date('2026-10-30T10:00:00Z')).id).toBe('diwali');
    // 24 Oct 20:00 UTC is already 25 Oct in India.
    expect(resolveActiveTheme(s, new Date('2026-10-24T20:00:00Z')).id).toBe('diwali');
    expect(resolveActiveTheme(s, new Date('2026-11-06T10:00:00Z')).id).toBe('default');
    expect(resolveActiveTheme(s, new Date('2026-12-25T10:00:00Z')).id).toBe('christmas');
  });

  it('picks the most recently started theme when dates overlap, and manual mode ignores the calendar', () => {
    const s = withSchedules({ christmas: { start: '2026-12-20', end: '2027-01-02' }, 'new-year': { start: '2026-12-31', end: '2027-01-02' } });
    expect(resolveActiveTheme(s, new Date('2027-01-01T06:00:00Z')).id).toBe('new-year');
    expect(resolveActiveTheme({ ...s, mode: 'manual', activeThemeId: 'pongal' }, new Date('2027-01-01T06:00:00Z')).id).toBe('pongal');
  });

  it('refuses settings without the Default theme, with an unknown active theme, or backwards dates', () => {
    const s = defaultThemeSettings();
    expect(ThemeSettingsSchema.safeParse({ ...s, themes: s.themes.filter((t) => t.id !== 'default') }).success).toBe(false);
    expect(ThemeSettingsSchema.safeParse({ ...s, activeThemeId: 'nope' }).success).toBe(false);
    expect(ThemeSettingsSchema.safeParse(withSchedules({ diwali: { start: '2026-11-05', end: '2026-10-25' } })).success).toBe(false);
  });

  it('flags unreadable colour choices in plain words', () => {
    const issues = themeReadabilityIssues({ ...THEME_PRESETS[0].colors, gold: '#222222' });
    expect(issues.join(' ')).toMatch(/main buttons is hard to read/);
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 0);
  });

  it('turns colours into stylesheet variables', () => {
    expect(hexToChannels('#FCA311')).toBe('252 163 17');
    expect(themeCssVariables(THEME_PRESETS[0].colors)['--color-gold-deep']).toBe('224 143 0');
    expect(indiaDate(new Date('2026-10-24T19:00:00Z'))).toBe('2026-10-25');
  });
});

describe('safe links', () => {
  it('allows site pages and http(s) addresses only', async () => {
    const { isSafeHref, SafeHrefSchema } = await import('./theme');
    for (const ok of ['/how-it-works', '/category/diwali?x=1', 'https://instagram.com/k', 'http://example.com']) expect(isSafeHref(ok), ok).toBe(true);
    for (const bad of ['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html,x', '//evil.com', 'evil.com', 'vbscript:x']) expect(isSafeHref(bad), bad).toBe(false);
    expect(SafeHrefSchema.safeParse('javascript:alert(1)').success).toBe(false);
  });
});

describe('upgrading saved themes', () => {
  it('gives an old saved festival the new decorations but keeps the admin’s choices', async () => {
    const { upgradeThemeSettings, ThemeSettingsSchema, defaultThemeSettings } = await import('./theme');
    const old = defaultThemeSettings();
    const saved = JSON.parse(JSON.stringify(old));
    for (const t of saved.themes) t.decor = { motif: 'diya', effect: 'sparkles', bannerText: 'My own Diwali text' };
    saved.themes.find((t: { id: string }) => t.id === 'diwali').colors.gold = '#F5A30B';
    const parsed = ThemeSettingsSchema.parse(upgradeThemeSettings(saved));
    const diwali = parsed.themes.find((t) => t.id === 'diwali')!;
    expect(diwali.decor).toMatchObject({ garland: 'marigold', hanging: 'lanterns', effect: 'sparkles', bannerText: 'My own Diwali text' });
    expect(diwali.decor.greeting?.title).toBe('Happy Diwali');
    // Already-new settings are left alone.
    const fresh = defaultThemeSettings();
    fresh.themes[1].decor = { ...fresh.themes[1].decor, garland: 'none' };
    expect((upgradeThemeSettings(fresh) as typeof fresh).themes[1].decor.garland).toBe('none');
  });
});
