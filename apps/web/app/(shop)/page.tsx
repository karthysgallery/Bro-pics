import { dpiTier } from '@bro-pics/shared';

// Proves apps/web's transpilePackages config actually resolves
// @bro-pics/shared's TypeScript source at build time (see next.config.ts).
// Real storefront UI arrives in Phase 2 — this is a placeholder page.
const sampleDpiTier = dpiTier(300);

export default function HomePage() {
  return (
    <main>
      <h1>BroPics</h1>
      <p>Personalized photo frames — storefront coming in Phase 2.</p>
      <p data-sample-dpi-tier={sampleDpiTier} style={{ display: 'none' }} />
    </main>
  );
}
