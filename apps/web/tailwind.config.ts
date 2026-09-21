import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Black & Gold Elegance (2026-09-20), kept warm. The five palette
        // colours are used as given — black type, #FCA311 gold, Prussian
        // blue, alabaster, white — over a soft off-white field rather than
        // a cool grey one, so the golden-hour banners still sit in warm
        // light. Names are roles, not colours: the palette has changed
        // three times and role names survive the next change.
        ink: '#000000', // Black — all text
        paper: '#FFFFFF', // White — cards and raised surfaces
        field: '#FAF8F4', // the page itself: alabaster warmed, so white cards read as raised
        tint: '#EFEBE4', // Alabaster, warmed — image tiles, quiet bands, the search field
        line: '#E0DAD1', // a step down from tint, so a card still reads against a band
        gold: '#FCA311', // the accent AND the primary button. Always with ink on it (10.4:1).
        'gold-deep': '#E08F00', // gold hover/pressed
        accent: '#14213D', // Prussian Blue — links, small accent text, in-stock, focus ring
        'accent-dark': '#0B1428', // accent hover/pressed
        alert: '#A35A08', // errors: a deepened gold, since the palette carries no red

        // ---------------------------------------------------------------
        // Admin-only legacy tokens. The storefront re-skin left /app/admin
        // deliberately on its old styling, and these are the names those
        // screens still use — each mapped onto its nearest new value so the
        // two halves of the app at least share a palette. Nothing under
        // app/(shop), app/(account), app/(content) or components/
        // references them; do not reintroduce them there.
        // ---------------------------------------------------------------
        cream: '#FAF8F4',
        'gold-dark': '#E08F00',
        brown: '#14213D',
        'brown-light': '#14213D',
        'brown-dark': '#000000',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        // Outfit carries the headlines: geometric and wide, so "Handcrafted
        // With Love" reads as signage rather than as a big paragraph. Body
        // and UI stay on Manrope, which holds up at 12–14px where Outfit's
        // even strokes start to blur.
        display: ['var(--font-display)', 'var(--font-sans)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Adds the one step below Tailwind's 12px `xs` that a dense
        // catalogue needs (review counts, meta rows); everything else uses
        // the stock scale.
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
      maxWidth: {
        shell: '1280px',
      },
    },
  },
  plugins: [],
};

export default config;
