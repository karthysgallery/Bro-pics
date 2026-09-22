# PDP Personalization Panel Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle and extend the existing product-page personalization experience (live canvas editor + BuyBox) to match the structure of a reference competitor page — a visible product-photo strip, a full-size preview, a boxed support callout, and visual polish on the slot picker/clipart grid/text fields — without regressing the existing live-canvas preview or touching any backend code.

**Architecture:** Frontend-only. Two new small reusable components (`Lightbox` in `components/ui/`, extracted from `Gallery`'s existing zoom-modal pattern; `GalleryStrip` in `components/product/`, a compact thumbnail rail reusing `Lightbox`), one new support-contact component (`HelpCallout`) plus a shared constant, a visual-polish pass on three existing editor components, and a final integration task wiring the Preview button and gallery strip into `PersonalizationEditor`/`ProductDetailClient`.

**Tech Stack:** Next.js 15 App Router, React 18, TypeScript, Tailwind CSS, Vitest + `@testing-library/react`. No new dependencies.

## Global Constraints

- Frontend-only — no changes to `packages/shared`, `functions/`, Firestore rules/indexes, or any API route.
- Follow the existing colour-token vocabulary exactly: `ink` (black, text), `paper` (white, cards), `field` (page background), `tint` (quiet bands/image tiles), `line` (borders), `gold`/`gold-deep` (primary action), `accent`/`accent-dark` (links, secondary), `alert` (errors). Never introduce a new raw hex value — see `tailwind.config.ts`.
- Support email is `support@bropics.in` — read from the new `lib/support-contact.ts` constant everywhere, never restated as a literal.
- Preserve the live-canvas preview exactly as-is — no changes to `EditorCanvas.tsx`, `lib/editor-geometry.ts`, or any DPI/crop/transform math.
- Keep `DeliveryTimeline.tsx` untouched — day-count ranges, not literal calendar dates (ISR staleness risk, confirmed with client).
- Every new component ships with tests in the same task that creates it. Pure restyle changes to already-tested components (`SlotPicker`, `TextFieldEditor`) need no new tests — just confirm the existing suite still passes.
- Run `pnpm --filter @bro-pics/web typecheck` and the affected test files after every task, before committing.

---

### Task 1: Extract `Lightbox`, refactor `Gallery` to use it

**Files:**
- Create: `apps/web/components/ui/Lightbox.tsx`
- Create: `apps/web/components/ui/Lightbox.test.tsx`
- Modify: `apps/web/components/product/Gallery.tsx`
- Create: `apps/web/components/product/Gallery.test.tsx` (no test file exists for `Gallery` today)

**Interfaces:**
- Produces: `Lightbox({ src: string; alt: string; onClose: () => void })` — a full-screen image overlay. Used by Task 2 (`GalleryStrip`) and Task 6 (`PersonalizationEditor`'s Preview button).

- [ ] **Step 1: Write the failing test for `Lightbox`**

Create `apps/web/components/ui/Lightbox.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Lightbox } from './Lightbox';

describe('Lightbox', () => {
  it('renders the image with the given src and alt', () => {
    render(<Lightbox src="/photo.jpg" alt="A test photo" onClose={() => {}} />);
    expect(screen.getByRole('img', { name: 'A test photo' })).toBeInTheDocument();
  });

  it('calls onClose when the backdrop is clicked', () => {
    const onClose = vi.fn();
    render(<Lightbox src="/photo.jpg" alt="A test photo" onClose={onClose} />);
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    render(<Lightbox src="/photo.jpg" alt="A test photo" onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /close preview/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @bro-pics/web test Lightbox.test.tsx`
Expected: FAIL — `Cannot find module './Lightbox'`

- [ ] **Step 3: Create `Lightbox.tsx`**

Create `apps/web/components/ui/Lightbox.tsx`:

```tsx
'use client';

import Image from 'next/image';

interface LightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
}

// Full-screen image viewer, extracted from Gallery's original inline zoom
// modal so PersonalizationEditor's Preview button (Task 6) can reuse the
// identical pattern instead of a second near-identical overlay. Clicking
// anywhere on the backdrop — including the image itself — closes it, which
// matches Gallery's pre-extraction behavior exactly, not a new interaction.
export function Lightbox({ src, alt, onClose }: LightboxProps) {
  return (
    <div
      className="fixed inset-0 z-50 bg-ink/90 flex items-center justify-center p-4 cursor-zoom-out"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={alt}
    >
      <button
        type="button"
        aria-label="Close preview"
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-paper text-ink flex items-center justify-center text-2xl leading-none hover:bg-tint transition-colors"
      >
        &times;
      </button>
      <div className="relative w-full h-full">
        <Image src={src} alt={alt} fill sizes="100vw" className="object-contain" />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @bro-pics/web test Lightbox.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing test for `Gallery`'s refactored zoom behavior**

Create `apps/web/components/product/Gallery.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ProductMedia } from '@bro-pics/shared';
import { Gallery } from './Gallery';

const media: ProductMedia[] = [
  { id: 'm1', productId: 'prod_1', variantId: null, type: 'image', url: '/one.jpg', alt: 'Photo one', sortOrder: 0 },
  { id: 'm2', productId: 'prod_1', variantId: null, type: 'image', url: '/two.jpg', alt: 'Photo two', sortOrder: 1 },
];

describe('Gallery', () => {
  it('renders a placeholder tile when there is no media', () => {
    const { container } = render(<Gallery media={[]} productTitle="Test Product" />);
    expect(container.querySelector('.aspect-square')).toBeInTheDocument();
  });

  it('shows the first media item by default', () => {
    render(<Gallery media={media} productTitle="Test Product" />);
    expect(screen.getByRole('img', { name: 'Photo one' })).toBeInTheDocument();
  });

  it('switches the active image when a thumbnail is clicked', () => {
    render(<Gallery media={media} productTitle="Test Product" />);
    fireEvent.click(screen.getByRole('button', { name: /show media 2/i }));
    expect(screen.getByRole('img', { name: 'Photo two' })).toBeInTheDocument();
  });

  it('opens a Lightbox when the active image is clicked, and closes it on backdrop click', () => {
    render(<Gallery media={media} productTitle="Test Product" />);
    fireEvent.click(screen.getByRole('img', { name: 'Photo one' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('dialog'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run the test to verify it currently passes against the OLD (inline-modal) `Gallery`**

Run: `pnpm --filter @bro-pics/web test Gallery.test.tsx`
Expected: PASS (this locks in the current behavior before refactoring — if this fails, stop and investigate before proceeding)

- [ ] **Step 7: Refactor `Gallery.tsx` to use `Lightbox`**

In `apps/web/components/product/Gallery.tsx`, add the import:

```tsx
import { Lightbox } from '../ui/Lightbox';
```

Replace the inline zoom-modal block (the `{isZoomed && active.type === 'image' && (...)}` block at the bottom of the returned JSX) with:

```tsx
      {isZoomed && active.type === 'image' && (
        <Lightbox src={active.url} alt={active.alt || productTitle} onClose={() => setIsZoomed(false)} />
      )}
```

- [ ] **Step 8: Run the test to verify it still passes against the refactored `Gallery`**

Run: `pnpm --filter @bro-pics/web test Gallery.test.tsx`
Expected: PASS (4 tests) — confirms the extraction introduced no behavior change

- [ ] **Step 9: Typecheck**

Run: `pnpm --filter @bro-pics/web typecheck`
Expected: no errors

- [ ] **Step 10: Commit**

```bash
git add apps/web/components/ui/Lightbox.tsx apps/web/components/ui/Lightbox.test.tsx apps/web/components/product/Gallery.tsx apps/web/components/product/Gallery.test.tsx
git commit -m "refactor(product): extract Lightbox from Gallery's zoom modal"
```

---

### Task 2: `GalleryStrip` component

**Files:**
- Create: `apps/web/components/product/GalleryStrip.tsx`
- Create: `apps/web/components/product/GalleryStrip.test.tsx`

**Interfaces:**
- Consumes: `Lightbox` from Task 1 (`../ui/Lightbox`).
- Produces: `GalleryStrip({ media: ProductMedia[]; productTitle: string })` — a compact thumbnail rail. Used by Task 6 inside `PersonalizationEditor`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/components/product/GalleryStrip.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ProductMedia } from '@bro-pics/shared';
import { GalleryStrip } from './GalleryStrip';

const media: ProductMedia[] = [
  { id: 'm1', productId: 'prod_1', variantId: null, type: 'image', url: '/one.jpg', alt: 'Photo one', sortOrder: 0 },
  { id: 'm2', productId: 'prod_1', variantId: null, type: 'image', url: '/two.jpg', alt: 'Photo two', sortOrder: 1 },
];

describe('GalleryStrip', () => {
  it('renders nothing when there is no media', () => {
    const { container } = render(<GalleryStrip media={[]} productTitle="Test Product" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders one thumbnail button per media item', () => {
    render(<GalleryStrip media={media} productTitle="Test Product" />);
    expect(screen.getAllByRole('button')).toHaveLength(2);
  });

  it('opens a Lightbox with the clicked item when a thumbnail is clicked', () => {
    render(<GalleryStrip media={media} productTitle="Test Product" />);
    fireEvent.click(screen.getByRole('button', { name: /view product photo 2/i }));
    expect(screen.getByRole('img', { name: 'Photo two' })).toBeInTheDocument();
  });

  it('closes the Lightbox on backdrop click', () => {
    render(<GalleryStrip media={media} productTitle="Test Product" />);
    fireEvent.click(screen.getByRole('button', { name: /view product photo 1/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('dialog'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @bro-pics/web test GalleryStrip.test.tsx`
Expected: FAIL — `Cannot find module './GalleryStrip'`

- [ ] **Step 3: Create `GalleryStrip.tsx`**

Create `apps/web/components/product/GalleryStrip.tsx`:

```tsx
'use client';

import { useState } from 'react';
import Image from 'next/image';
import type { ProductMedia } from '@bro-pics/shared';
import { Lightbox } from '../ui/Lightbox';

interface GalleryStripProps {
  media: ProductMedia[];
  productTitle: string;
}

// Compact, thumbnails-only companion to Gallery — shown above the live
// personalization canvas (see PersonalizationEditor, Task 6) so real
// product photography (lifestyle shots, close-ups) stays visible while a
// shopper is customizing, instead of disappearing entirely the way it did
// before this component existed. No large hero image: the canvas is
// already the page's visual focus, so this is deliberately smaller than
// Gallery's own thumbnail rail.
export function GalleryStrip({ media, productTitle }: GalleryStripProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  if (media.length === 0) return null;

  const openItem = openIndex !== null ? media[openIndex] : null;

  return (
    <div className="mb-3">
      <div className="rail flex gap-2 overflow-x-auto">
        {media.map((item, index) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setOpenIndex(index)}
            aria-label={`View product photo ${index + 1}`}
            className="relative w-14 h-14 flex-shrink-0 rounded-lg overflow-hidden bg-tint border border-line hover:border-gold transition-colors"
          >
            {item.type === 'video' ? (
              <div className="w-full h-full bg-ink/80 text-paper flex items-center justify-center text-xs">▶</div>
            ) : (
              <Image src={item.url} alt="" fill sizes="56px" className="object-cover" />
            )}
          </button>
        ))}
      </div>

      {openItem && openItem.type === 'image' && (
        <Lightbox src={openItem.url} alt={openItem.alt || productTitle} onClose={() => setOpenIndex(null)} />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @bro-pics/web test GalleryStrip.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @bro-pics/web typecheck`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/product/GalleryStrip.tsx apps/web/components/product/GalleryStrip.test.tsx
git commit -m "feat(product): add GalleryStrip, a compact product-photo rail"
```

---

### Task 3: Support-email constant, `HelpCallout`, wire into `BuyBox`

**Files:**
- Create: `apps/web/lib/support-contact.ts`
- Create: `apps/web/components/product/HelpCallout.tsx`
- Create: `apps/web/components/product/HelpCallout.test.tsx`
- Modify: `apps/web/components/product/BuyBox.tsx`
- Modify: `apps/web/app/(content)/contact/page.tsx`
- Modify: `apps/web/app/(content)/privacy/page.tsx`

**Interfaces:**
- Produces: `SUPPORT_EMAIL: string` (from `lib/support-contact.ts`), `HelpCallout({ whatsappHref: string })`.

- [ ] **Step 1: Create the shared support-email constant**

Create `apps/web/lib/support-contact.ts`:

```ts
// Single source of truth for the support email address — previously
// restated as a literal string in three places (the contact page, the
// privacy page, and now HelpCallout), which is exactly the kind of drift
// risk a shared constant exists to prevent.
export const SUPPORT_EMAIL = 'support@bropics.in';
```

- [ ] **Step 2: Write the failing test for `HelpCallout`**

Create `apps/web/components/product/HelpCallout.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HelpCallout } from './HelpCallout';

describe('HelpCallout', () => {
  it('renders a WhatsApp link using the given href', () => {
    render(<HelpCallout whatsappHref="https://wa.me/910000000000?text=hi" />);
    expect(screen.getByRole('link', { name: /whatsapp/i })).toHaveAttribute(
      'href',
      'https://wa.me/910000000000?text=hi'
    );
  });

  it('renders the support email as a mailto link', () => {
    render(<HelpCallout whatsappHref="https://wa.me/910000000000" />);
    expect(screen.getByRole('link', { name: 'support@bropics.in' })).toHaveAttribute(
      'href',
      'mailto:support@bropics.in'
    );
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @bro-pics/web test HelpCallout.test.tsx`
Expected: FAIL — `Cannot find module './HelpCallout'`

- [ ] **Step 4: Create `HelpCallout.tsx`**

Create `apps/web/components/product/HelpCallout.tsx`:

```tsx
import { SUPPORT_EMAIL } from '../../lib/support-contact';

interface HelpCalloutProps {
  whatsappHref: string;
}

// Boxed support callout, replacing BuyBox's old single inline WhatsApp text
// link — matches the visual weight of BuyBox's trust-points strip
// immediately below it, giving support contact the same prominence the
// reference site gives it.
export function HelpCallout({ whatsappHref }: HelpCalloutProps) {
  return (
    <div className="mt-3 rounded-2xl bg-tint p-4 text-center sm:flex sm:items-center sm:justify-center sm:gap-4 sm:text-left">
      <p className="text-xs text-ink/70 mb-2 sm:mb-0">Need help uploading or personalizing?</p>
      <div className="flex items-center justify-center gap-3 text-sm font-medium">
        <a href={whatsappHref} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-dark">
          WhatsApp us
        </a>
        <span className="text-line" aria-hidden="true">|</span>
        <a href={`mailto:${SUPPORT_EMAIL}`} className="text-accent hover:text-accent-dark">
          {SUPPORT_EMAIL}
        </a>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @bro-pics/web test HelpCallout.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 6: Wire `HelpCallout` into `BuyBox.tsx`**

In `apps/web/components/product/BuyBox.tsx`, add the import near the other local imports:

```tsx
import { HelpCallout } from './HelpCallout';
```

Replace this existing block:

```tsx
      <a
        href={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '910000000000'}?text=${encodeURIComponent(whatsappMessage)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="block text-center mt-3 text-sm text-accent hover:text-accent-dark"
      >
        Need help? Chat with us on WhatsApp
      </a>
```

with:

```tsx
      <HelpCallout
        whatsappHref={`https://wa.me/${process.env.NEXT_PUBLIC_WHATSAPP_NUMBER ?? '910000000000'}?text=${encodeURIComponent(whatsappMessage)}`}
      />
```

- [ ] **Step 7: Update `/contact` and `/privacy` to use the shared constant**

In `apps/web/app/(content)/contact/page.tsx`, add the import:

```tsx
import { SUPPORT_EMAIL } from '../../../lib/support-contact';
```

Replace:

```tsx
        <a href="mailto:support@bropics.in">support@bropics.in</a> — best for anything that needs
```

with:

```tsx
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> — best for anything that needs
```

In `apps/web/app/(content)/privacy/page.tsx`, add the same import, then replace both occurrences:

```tsx
        <a href="mailto:support@bropics.in">support@bropics.in</a> and we will action it within 30
```

with:

```tsx
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> and we will action it within 30
```

and:

```tsx
        <a href="mailto:support@bropics.in">support@bropics.in</a>, or via the{' '}
```

with:

```tsx
        <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>, or via the{' '}
```

- [ ] **Step 8: Run the full `apps/web` test suite to confirm nothing broke**

Run: `pnpm --filter @bro-pics/web test`
Expected: PASS, same total count as before plus the 2 new `HelpCallout` tests. No test currently asserts on the old "Need help? Chat with us on WhatsApp" link text (verified by search before writing this plan), so no other test file needs updating.

- [ ] **Step 9: Typecheck**

Run: `pnpm --filter @bro-pics/web typecheck`
Expected: no errors

- [ ] **Step 10: Commit**

```bash
git add apps/web/lib/support-contact.ts apps/web/components/product/HelpCallout.tsx apps/web/components/product/HelpCallout.test.tsx apps/web/components/product/BuyBox.tsx "apps/web/app/(content)/contact/page.tsx" "apps/web/app/(content)/privacy/page.tsx"
git commit -m "feat(product): add boxed HelpCallout, replacing the bare WhatsApp link"
```

---

### Task 4: Visual polish — `SlotPicker` and `ClipartPicker`

**Files:**
- Modify: `apps/web/components/editor/SlotPicker.tsx`
- Modify: `apps/web/components/editor/ClipartPicker.tsx`
- Create: `apps/web/components/editor/ClipartPicker.test.tsx` (no test file exists for `ClipartPicker` today, and this task adds new caption behavior worth locking in)

**Interfaces:**
- No prop/interface changes to either component — `SlotPicker` and `ClipartPicker` keep their exact existing signatures.

- [ ] **Step 1: Restyle `SlotPicker.tsx`**

In `apps/web/components/editor/SlotPicker.tsx`, replace the button's `className`:

```tsx
          className={`w-10 h-10 flex-shrink-0 rounded-lg border text-sm ${
            slotIndex === activeSlotIndex
              ? 'bg-accent text-paper border-accent'
              : 'bg-paper text-ink border-line'
          }`}
```

with:

```tsx
          className={`w-11 h-11 flex-shrink-0 rounded-lg border text-sm font-semibold transition-colors ${
            slotIndex === activeSlotIndex
              ? 'bg-gold text-ink border-gold'
              : 'bg-paper text-ink border-line hover:border-gold'
          }`}
```

(Tabs grow from 40px to 44px to match other tap targets on the page; active-tab color switches from `accent` (blue, our link/secondary color) to `gold` (our primary-action color) since the slot picker is a primary editing control, not a link.)

- [ ] **Step 2: Run the existing `SlotPicker` test to confirm no behavior regression**

Run: `pnpm --filter @bro-pics/web test SlotPicker.test.tsx`
Expected: PASS (4 tests, unchanged) — the test only asserts `aria-pressed` and text content, neither of which changed.

- [ ] **Step 3: Write the failing test for `ClipartPicker`'s new caption**

Create `apps/web/components/editor/ClipartPicker.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { ClipartOption } from '@bro-pics/shared';
import { ClipartPicker } from './ClipartPicker';

const options: ClipartOption[] = [
  { id: 'heart', label: 'Heart', assetUrl: '/clipart/heart.svg', x: 0.8, y: 0.05, width: 0.1, height: 0.1 },
  { id: 'star', label: 'Star', assetUrl: '/clipart/star.svg', x: 0.8, y: 0.2, width: 0.1, height: 0.1 },
];

describe('ClipartPicker', () => {
  it('renders nothing when there are no options', () => {
    const { container } = render(<ClipartPicker options={[]} selectedId={null} onSelect={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a caption for each option', () => {
    render(<ClipartPicker options={options} selectedId={null} onSelect={() => {}} />);
    expect(screen.getByText('Heart')).toBeInTheDocument();
    expect(screen.getByText('Star')).toBeInTheDocument();
  });

  it('marks the selected option', () => {
    render(<ClipartPicker options={options} selectedId="star" onSelect={() => {}} />);
    expect(screen.getByRole('button', { name: 'Star' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('calls onSelect with the id when an unselected option is clicked', () => {
    const onSelect = vi.fn();
    render(<ClipartPicker options={options} selectedId={null} onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Heart' }));
    expect(onSelect).toHaveBeenCalledWith('heart');
  });

  it('calls onSelect with null when the already-selected option is clicked again', () => {
    const onSelect = vi.fn();
    render(<ClipartPicker options={options} selectedId="heart" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole('button', { name: 'Heart' }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });
});
```

- [ ] **Step 4: Run the test to verify the caption assertions fail**

Run: `pnpm --filter @bro-pics/web test ClipartPicker.test.tsx`
Expected: FAIL on "renders a caption for each option" (no visible text today — `option.label` is currently only used as `aria-label`, not rendered)

- [ ] **Step 5: Restyle `ClipartPicker.tsx` and add the caption**

In `apps/web/components/editor/ClipartPicker.tsx`, replace the `<div className="flex flex-wrap gap-2" ...>` block:

```tsx
      <div className="flex flex-wrap gap-2" role="group" aria-label="Clipart">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-label={option.label}
            aria-pressed={selectedId === option.id}
            onClick={() => onSelect(selectedId === option.id ? null : option.id)}
            className={`w-11 h-11 rounded-md border flex items-center justify-center bg-paper transition-colors ${
              selectedId === option.id ? 'border-accent ring-1 ring-accent' : 'border-line hover:border-accent'
            }`}
          >
            <Image src={option.assetUrl} alt="" width={28} height={28} />
          </button>
        ))}
      </div>
```

with:

```tsx
      <div className="flex flex-wrap gap-3" role="group" aria-label="Clipart">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-label={option.label}
            aria-pressed={selectedId === option.id}
            onClick={() => onSelect(selectedId === option.id ? null : option.id)}
            className="flex flex-col items-center gap-1 w-16"
          >
            <span
              className={`w-14 h-14 rounded-md border flex items-center justify-center bg-paper transition-colors ${
                selectedId === option.id ? 'border-accent ring-1 ring-accent' : 'border-line hover:border-accent'
              }`}
            >
              <Image src={option.assetUrl} alt="" width={32} height={32} />
            </span>
            <span className="text-2xs text-ink/60 text-center leading-tight truncate w-full">{option.label}</span>
          </button>
        ))}
      </div>
```

(Swatch frame grows from 44px to 56px; the caption sits below it inside the same button, in a slightly wider `w-16` wrapper so short labels like "Heart" don't truncate.)

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm --filter @bro-pics/web test ClipartPicker.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @bro-pics/web typecheck`
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add apps/web/components/editor/SlotPicker.tsx apps/web/components/editor/ClipartPicker.tsx apps/web/components/editor/ClipartPicker.test.tsx
git commit -m "style(editor): restyle SlotPicker and ClipartPicker, add clipart captions"
```

---

### Task 5: Visual polish — `TextFieldEditor`

**Files:**
- Modify: `apps/web/components/editor/TextFieldEditor.tsx`

**Interfaces:**
- No prop/interface changes — same `TextFieldEditorProps`, same behavior.

- [ ] **Step 1: Align micro-label typography with `VariantSelector`'s existing convention**

In `apps/web/components/editor/TextFieldEditor.tsx`, there are two identical micro-label spans — `<span className="block text-xs text-ink/60 mb-1">Font</span>` and `<span className="block text-xs text-ink/60 mb-1">Colour</span>`. Replace both instances of `text-xs text-ink/60 mb-1` with `text-xs text-ink/70 mb-1.5` (matching `VariantSelector`'s label exactly — `text-xs text-ink/70` — and adding a touch more breathing room before the button row).

Also increase the gap in both button-group rows from `gap-2` to `gap-2.5`:

```tsx
        <div className="flex flex-wrap gap-2" role="group" aria-label={`${label} font`}>
```

becomes:

```tsx
        <div className="flex flex-wrap gap-2.5" role="group" aria-label={`${label} font`}>
```

and:

```tsx
        <div className="flex items-center gap-2" role="group" aria-label={`${label} colour`}>
```

becomes:

```tsx
        <div className="flex items-center gap-2.5" role="group" aria-label={`${label} colour`}>
```

- [ ] **Step 2: Run the existing personalization test suite to confirm no regression**

`TextFieldEditor` has no standalone test file — it's exercised through `ProductDetailClient.personalization.test.tsx`. Since this change is className-only (no text, role, or attribute changes), run:

Run: `pnpm --filter @bro-pics/web test ProductDetailClient.personalization.test.tsx`
Expected: PASS, same count as before this task

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @bro-pics/web typecheck`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/editor/TextFieldEditor.tsx
git commit -m "style(editor): align TextFieldEditor label typography with VariantSelector"
```

---

### Task 6: Wire the Preview button and `GalleryStrip` into `PersonalizationEditor`

**Files:**
- Modify: `apps/web/components/editor/PersonalizationEditor.tsx`
- Modify: `apps/web/components/product/ProductDetailClient.tsx`
- Modify: `apps/web/components/product/ProductDetailClient.personalization.test.tsx`

**Interfaces:**
- Consumes: `GalleryStrip` (Task 2), `Lightbox` (Task 1).
- `PersonalizationEditor` gains three new required props: `media: ProductMedia[]`, `productTitle: string`, `previewDataUrl: string | null`. `ProductDetailClient` already computes all three (`galleryMedia`, `product.title`, and its own `previewDataUrl` state) — this task only threads them through.

- [ ] **Step 1: Write the failing tests**

In `apps/web/components/product/ProductDetailClient.personalization.test.tsx`, update the `EditorCanvas` mock at the top of the file to also simulate the canvas reporting a rendered frame — needed so the new Preview button's lightbox has something real to show in tests, the same way the real `EditorCanvas` calls `onCanvasUpdate` after every draw. The file has no existing import from `'react'` — add a new import line, right after the `vitest` import:

```tsx
import { useEffect } from 'react';
```

and add `within` to the existing testing-library import:

```tsx
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
```

Replace the existing mock:

```tsx
let lastEditorCanvasProps: Record<string, unknown> | undefined;
vi.mock('../editor/EditorCanvas', () => ({
  EditorCanvas: (props: Record<string, unknown>) => {
    lastEditorCanvasProps = props;
    return <div data-testid="editor-canvas" />;
  },
}));
```

with:

```tsx
let lastEditorCanvasProps: Record<string, unknown> | undefined;
vi.mock('../editor/EditorCanvas', () => ({
  EditorCanvas: (props: Record<string, unknown>) => {
    lastEditorCanvasProps = props;
    // Simulates the real canvas reporting a rendered frame back to the
    // parent, the same way the actual EditorCanvas calls onCanvasUpdate
    // after every draw — needed so tests can exercise the Preview button's
    // lightbox, which reads previewDataUrl from that same callback.
    useEffect(() => {
      (props.onCanvasUpdate as ((url: string) => void) | undefined)?.('data:image/png;base64,mockPreview');
    }, [props.onCanvasUpdate]);
    return <div data-testid="editor-canvas" />;
  },
}));
```

Then add two new `describe` blocks at the end of the file, inside the outer `describe('ProductDetailClient — inline personalization', ...)` block (before its closing `});`):

```tsx
  describe('preview lightbox', () => {
    it('does not render a Preview button before any photo is uploaded', async () => {
      renderProduct(makeProduct(), [variant], [makeTemplate()]);
      await screen.findByLabelText(/upload a photo/i);
      expect(screen.queryByRole('button', { name: /^preview$/i })).not.toBeInTheDocument();
    });

    it('shows a Preview button once a slot has a photo, and opens the lightbox with the current canvas preview on click', async () => {
      mockUploadFetch();
      renderProduct(makeProduct(), [variant], [makeTemplate()]);

      const input = (await screen.findByLabelText(/upload a photo/i)) as HTMLInputElement;
      fireEvent.change(input, { target: { files: [new File(['x'], 'photo.jpg', { type: 'image/jpeg' })] } });
      await waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));

      const previewButton = await screen.findByRole('button', { name: /^preview$/i });
      fireEvent.click(previewButton);

      const dialog = await screen.findByRole('dialog');
      const img = within(dialog).getByRole('img');
      expect(img.getAttribute('src')).toContain('mockPreview');
    });
  });

  describe('gallery strip', () => {
    it('renders a thumbnail for each product media item alongside the live editor', async () => {
      renderProduct(makeProduct(), [variant], [makeTemplate()]);
      await screen.findByLabelText(/upload a photo/i);
      expect(screen.getByRole('button', { name: /view product photo 1/i })).toBeInTheDocument();
    });
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @bro-pics/web test ProductDetailClient.personalization.test.tsx`
Expected: FAIL on the 3 new tests — no Preview button and no gallery-strip thumbnail exist yet (existing tests in this file should still pass unchanged).

- [ ] **Step 3: Add the new props and imports to `PersonalizationEditor.tsx`**

In `apps/web/components/editor/PersonalizationEditor.tsx`, update the imports:

```tsx
import type { FrameTemplate } from '@bro-pics/shared';
```

becomes:

```tsx
import type { FrameTemplate, ProductMedia } from '@bro-pics/shared';
```

and add, near the other local imports:

```tsx
import { GalleryStrip } from '../product/GalleryStrip';
import { Lightbox } from '../ui/Lightbox';
```

Update `PersonalizationEditorProps` — add three fields after `photoSlots: number;`:

```tsx
  photoSlots: number;
  allowsTextPersonalization: boolean;
```

becomes:

```tsx
  photoSlots: number;
  allowsTextPersonalization: boolean;
  media: ProductMedia[];
  productTitle: string;
  previewDataUrl: string | null;
```

Update the function signature/destructuring to match:

```tsx
export function PersonalizationEditor({
  template,
  photoSlots,
  allowsTextPersonalization,
  activeSlotIndex,
```

becomes:

```tsx
export function PersonalizationEditor({
  template,
  photoSlots,
  allowsTextPersonalization,
  media,
  productTitle,
  previewDataUrl,
  activeSlotIndex,
```

- [ ] **Step 4: Add local state for the preview lightbox**

Just below the existing `const [isDraggingOver, setIsDraggingOver] = useState(false);` line, add:

```tsx
  const [showPreview, setShowPreview] = useState(false);
```

- [ ] **Step 5: Render `GalleryStrip` above `SlotPicker`**

At the top of the first returned `<div className="rounded-2xl bg-paper border border-line p-4 md:p-5 flex flex-col">`, immediately before `<SlotPicker`, add:

```tsx
        <GalleryStrip media={media} productTitle={productTitle} />
```

- [ ] **Step 6: Add the Preview button**

Immediately after the existing `{activeSlot && zoomBounds && (...)}` zoom/rotate/reset block (leave that block completely unmodified), add a new sibling block:

```tsx
        {slots.size > 0 && (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              className="px-4 h-9 rounded-full bg-gold text-ink text-sm font-semibold hover:bg-gold-deep transition-colors"
            >
              Preview
            </button>
          </div>
        )}
```

(Rendered whenever any slot has a photo — not tied to which slot is currently active, since the preview shows the whole composed canvas.)

- [ ] **Step 7: Render the `Lightbox` when `showPreview` is true**

At the very end of the component's returned JSX, immediately before the final closing `</>`, add a third sibling block:

```tsx
      {showPreview && previewDataUrl && (
        <Lightbox src={previewDataUrl} alt="Your personalized preview" onClose={() => setShowPreview(false)} />
      )}
```

- [ ] **Step 8: Pass the three new props from `ProductDetailClient.tsx`**

In `apps/web/components/product/ProductDetailClient.tsx`, in the `<PersonalizationEditor ... />` call, add three new props after `allowsTextPersonalization={product.allowsTextPersonalization}`:

```tsx
          allowsTextPersonalization={product.allowsTextPersonalization}
          activeSlotIndex={activeSlotIndex}
```

becomes:

```tsx
          allowsTextPersonalization={product.allowsTextPersonalization}
          media={galleryMedia}
          productTitle={product.title}
          previewDataUrl={previewDataUrl}
          activeSlotIndex={activeSlotIndex}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `pnpm --filter @bro-pics/web test ProductDetailClient.personalization.test.tsx`
Expected: PASS, all tests in the file including the 3 new ones

- [ ] **Step 10: Run the full `apps/web` test suite**

Run: `pnpm --filter @bro-pics/web test`
Expected: PASS — confirms nothing elsewhere (e.g. `ProductDetailClient.test.tsx`) broke from the new required props, since `ProductDetailClient` supplies them internally from data it already has.

- [ ] **Step 11: Typecheck**

Run: `pnpm --filter @bro-pics/web typecheck`
Expected: no errors

- [ ] **Step 12: Manual browser verification**

Start the dev server (`pnpm dev`) and check on both a desktop and a mobile viewport, against a multi-slot product (e.g. the vintage collage frame):
- The gallery strip renders above the canvas and its thumbnails open in a lightbox.
- The Preview button is absent with no photos uploaded, appears once the first slot is filled, and opens a full-size view of the current canvas composite.
- The restyled slot-picker tabs, clipart swatches (with captions), and text-field labels render correctly at both viewport sizes.
- The new `HelpCallout` box renders correctly below Add to Cart, and its WhatsApp/email links work.
- No new console errors, and the fixed WhatsApp button (bottom-right) does not overlap any of the new elements on mobile — this project has hit that regression multiple times before (see `PROJECT_STATUS.md` §5).

- [ ] **Step 13: Commit**

```bash
git add apps/web/components/editor/PersonalizationEditor.tsx apps/web/components/product/ProductDetailClient.tsx apps/web/components/product/ProductDetailClient.personalization.test.tsx
git commit -m "feat(product): wire Preview lightbox and GalleryStrip into the personalization panel"
```
