'use client';

import { useState } from 'react';

// The homepage itself IS Firestore-backed (the `homepageSections`
// collection, read by getActiveHomepageSections() and rendered section-by-
// section on the real homepage) — there just isn't a write/edit path for
// it yet. This panel is a demo of what that editor would look like; Save
// only updates local state, it doesn't write to homepageSections. See the
// backend requirements doc for the API this would need to persist for real.
export default function AdminHomepagePage() {
  const [hero, setHero] = useState({
    title: 'Frames That Hold Your Story',
    subtitle: 'Handcrafted, personalized photo frames — delivered with care.',
    link: '/category/frames-wall-decor',
  });
  const [closingCta, setClosingCta] = useState({
    heading: 'Build Your Story With Confident Frames On Every Wall.',
    link: '/category/frames-wall-decor',
  });
  const [note, setNote] = useState<string | null>(null);

  const handleSave = () => {
    setNote('Homepage content saved (locally only — not yet persisted).');
  };

  return (
    <div className="max-w-2xl flex flex-col gap-6">
      <h1 className="font-display text-2xl text-brown-dark">Homepage Content</h1>

      <div className="rounded-lg bg-gold/10 border border-gold/30 px-4 py-3 text-sm text-brown/80">
        The homepage already reads real, admin-manageable sections from Firestore — this form isn't wired to save
        into them yet. See the backend requirements doc for the write API this would need.
      </div>

      <section className="rounded-xl border border-gold/30 p-4 flex flex-col gap-3">
        <h2 className="font-display text-lg text-brown-dark">Hero Banner</h2>
        <label htmlFor="hero-title" className="text-sm text-brown/70">Title</label>
        <input id="hero-title" value={hero.title} onChange={(e) => setHero((h) => ({ ...h, title: e.target.value }))} className="rounded-lg border border-gold/30 px-3 py-2" />
        <label htmlFor="hero-subtitle" className="text-sm text-brown/70">Subtitle</label>
        <input id="hero-subtitle" value={hero.subtitle} onChange={(e) => setHero((h) => ({ ...h, subtitle: e.target.value }))} className="rounded-lg border border-gold/30 px-3 py-2" />
        <label htmlFor="hero-link" className="text-sm text-brown/70">Link</label>
        <input id="hero-link" value={hero.link} onChange={(e) => setHero((h) => ({ ...h, link: e.target.value }))} className="rounded-lg border border-gold/30 px-3 py-2" />
      </section>

      <section className="rounded-xl border border-gold/30 p-4 flex flex-col gap-3">
        <h2 className="font-display text-lg text-brown-dark">Closing Banner</h2>
        <label htmlFor="cta-heading" className="text-sm text-brown/70">Heading</label>
        <input id="cta-heading" value={closingCta.heading} onChange={(e) => setClosingCta((c) => ({ ...c, heading: e.target.value }))} className="rounded-lg border border-gold/30 px-3 py-2" />
        <label htmlFor="cta-link" className="text-sm text-brown/70">Link</label>
        <input id="cta-link" value={closingCta.link} onChange={(e) => setClosingCta((c) => ({ ...c, link: e.target.value }))} className="rounded-lg border border-gold/30 px-3 py-2" />
      </section>

      <div className="rounded-xl border border-gold/30 p-4">
        <p className="text-sm text-brown/70">
          Category tiles, best sellers, how-it-works, featured collections, products-in-motion, reviews, why-us
          and recently-viewed editing follow the same pattern — omitted here for brevity but covered by the same
          backend requirement.
        </p>
      </div>

      <button onClick={handleSave} className="rounded-full bg-gradient-to-b from-brown-light to-brown text-cream px-6 py-2 w-fit">
        Save changes
      </button>
      {note && <p className="text-sm text-brown/70">{note}</p>}
    </div>
  );
}
