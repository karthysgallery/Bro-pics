import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Black & Gold Elegance — warm palette.
        // Role names, not colour names: palette survives rebrand.
        ink: '#000000',        // Black — all text
        paper: '#FFFFFF',      // White — cards and raised surfaces
        field: '#FAF8F4',      // The page itself — warm alabaster
        tint: '#EFEBE4',       // Quiet bands, image tiles, search field
        line: '#E0DAD1',       // Borders — a step darker than tint
        gold: '#FCA311',       // Primary accent — CTA buttons
        'gold-deep': '#E08F00',// Gold hover/pressed
        accent: '#14213D',     // Prussian Blue — links, focus ring
        'accent-dark': '#0B1428',
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

