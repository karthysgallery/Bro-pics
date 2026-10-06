import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Black & Gold Elegance — warm palette.
        // Role names, not colour names: palette survives rebrand.
        // Storefront colour roles come from CSS variables so an admin-chosen
        // theme (festivals — see packages/shared/src/schemas/theme.ts) can
        // repaint the whole site. Defaults live in app/globals.css :root.
        ink: 'rgb(var(--color-ink) / <alpha-value>)',               // All text
        paper: 'rgb(var(--color-paper) / <alpha-value>)',           // Cards and raised surfaces
        field: 'rgb(var(--color-field) / <alpha-value>)',           // The page itself
        tint: 'rgb(var(--color-tint) / <alpha-value>)',             // Quiet bands, image tiles, search field
        line: 'rgb(var(--color-line) / <alpha-value>)',             // Borders
        gold: 'rgb(var(--color-gold) / <alpha-value>)',             // Primary accent — CTA buttons
        'gold-deep': 'rgb(var(--color-gold-deep) / <alpha-value>)', // Gold hover/pressed
        accent: 'rgb(var(--color-accent) / <alpha-value>)',         // Links, focus ring
        'accent-dark': 'rgb(var(--color-accent-dark) / <alpha-value>)',
        alert: '#A35A08',      // Errors — deepened gold (no red in palette)

        // Admin-only legacy tokens (do NOT use in storefront)
        cream: '#FAF8F4',
        'gold-dark': '#E08F00',
        brown: '#14213D',
        'brown-light': '#14213D',
        'brown-dark': '#000000',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      letterSpacing: {
        // Eyebrow labels (uppercase micro-text)
        eyebrow: '0.18em',
        // Tight headings
        snug: '-0.02em',
        // Very tight display headlines
        tight: '-0.03em',
      },
      lineHeight: {
        // Editorial display headline
        display: '1.05',
        // Comfortable body reading
        reading: '1.65',
      },
      maxWidth: {
        shell: '1280px',
        // Narrower reading column for editorial text
        prose: '640px',
      },
      borderRadius: {
        // Refined card corners — slightly less "bubbly" than rounded-2xl
        card: '12px',
        // Slightly softer than fully circular buttons
        btn: '6px',
      },
      transitionTimingFunction: {
        // Premium deceleration curve
        'out-expo': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      transitionDuration: {
        '140': '140ms',
        '180': '180ms',
        '220': '220ms',
      },
      boxShadow: {
        // Very subtle elevation — replaces the heavy shadows
        lift: '0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)',
        'lift-md': '0 2px 8px rgba(0,0,0,0.08), 0 8px 24px rgba(0,0,0,0.06)',
      },
      spacing: {
        // Header height token — used by sticky offset calculations
        'header': '56px',
        'header-md': '64px',
      },
    },
  },
  plugins: [],
};

export default config;

