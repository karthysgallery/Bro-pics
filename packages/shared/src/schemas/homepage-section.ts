import { z } from 'zod';

export const HomepageSectionTypeSchema = z.enum([
  'hero_slider',
  'category_tiles',
  'best_sellers',
  'how_it_works',
  'featured_collection',
  'products_in_motion',
  'reviews_testimonials',
  'why_us',
  'offer_strip',
  'recently_viewed',
]);

// [ABE-17] `hero_slider` is the one section type with a concrete, already-
// evidenced content shape: `HeroSlider.tsx` already reaches for `eyebrow`
// (informally, via the untyped `config` bag) and a CTA it has nowhere to
// source, defaulting to a hardcoded label. The other 9 section types have
// no equivalent evidence of a structured shape they need beyond the
// existing `title`/`subtitle`/`image`/`link` fields plus `config` — adding
// speculative typed content for them without a concrete consumer would be
// guessing at the (inaccessible) master plan, so only `hero_slider` gets a
// typed array here; everything else keeps using `config`.
export const HeroSlideSchema = z.object({
  id: z.string(),
  image: z.string(),
  mobileImage: z.string(),
  eyebrow: z.string().optional(),
  title: z.string(),
  subtitle: z.string().optional(),
  ctaLabel: z.string().optional(),
  ctaLink: z.string().optional(),
  sortOrder: z.number().int().nonnegative(),
});

// [FE-26] Same reasoning/precedent as HeroSlideSchema above: `how_it_works`
// and `why_us` are the two OTHER section types with a concrete, already-
// evidenced content shape — HowItWorks.tsx and WhyUs.tsx each render a
// hardcoded local array (numbered steps; trust-point bullets) with no
// field anywhere to source it from instead. Only these two get a typed
// field here, for the same reason the other 8 section types still don't:
// no concrete consumer needing a further shape exists yet, and guessing
// at one would still be guessing at the inaccessible master plan.
export const HomepageStepSchema = z.object({
  label: z.string(),
  desc: z.string(),
});

export const HomepageSectionSchema = z.object({
  id: z.string(),
  type: HomepageSectionTypeSchema,
  title: z.string(),
  subtitle: z.string(),
  image: z.string(),
  mobileImage: z.string(),
  link: z.string(),
  sortOrder: z.number().int().nonnegative(),
  startsAt: z.date().nullable(),
  endsAt: z.date().nullable(),
  isActive: z.boolean(),
  config: z.record(z.string(), z.unknown()),
  // Only meaningful when type === 'hero_slider'; optional (not defaulted)
  // so every pre-existing section object literal built without this field
  // still typechecks as a valid HomepageSection.
  heroSlides: z.array(HeroSlideSchema).optional(),
  // [FE-26] Only meaningful when type === 'how_it_works'. Optional/not
  // defaulted for the same reason heroSlides isn't — every pre-existing
  // section object literal (including every seeded how_it_works doc,
  // which still has none of these) stays a valid HomepageSection. When
  // absent, HowItWorks.tsx falls back to its previous hardcoded steps
  // rather than rendering nothing, matching every other "safe default
  // until an admin actually configures it" field in this codebase.
  steps: z.array(HomepageStepSchema).optional(),
  // [FE-26] Only meaningful when type === 'why_us'. Same optional/
  // fallback-on-absence treatment as `steps` above.
  valueProps: z.array(z.string()).optional(),
  // [ABE-17] Set by POST .../preview-token, cleared by rotating it again.
  // Lets a non-staff stakeholder view a draft/inactive/future-dated
  // section via a public token-gated route without a staff account.
  previewToken: z.string().nullable().optional(),
});

export type HomepageSection = z.infer<typeof HomepageSectionSchema>;
export type HomepageSectionType = z.infer<typeof HomepageSectionTypeSchema>;
export type HeroSlide = z.infer<typeof HeroSlideSchema>;
export type HomepageStep = z.infer<typeof HomepageStepSchema>;
