# FE Config — Bro-pics Storefront

> **Last updated:** 2026-09-21
> This file is a quick-reference memory of the frontend configuration.
> Keep it updated when config changes.

---

## Stack

| Layer | Technology | Version |
|---|---|---|
| Framework | Next.js (App Router) | ^15.0.0 |
| Language | TypeScript | ^5.6.0 |
| Styling | Tailwind CSS | ^3.4.13 |
| Animation | Framer Motion | ^13.3.0 |
| Backend-as-a-Service | Firebase (client) | ^10.14.0 |
| Server Admin | firebase-admin | ^12.6.0 |
| Image Processing | sharp | ^0.35.0 |
| Testing | Vitest + Testing Library + jsdom | vitest ^2.1.0 |
| Bundle Analysis | @next/bundle-analyzer | ^16.3.4 |
| Monorepo | pnpm workspaces | — |

---

## Colour Palette — "Black & Gold Elegance" (2026-09-20)

Defined in [`tailwind.config.ts`](file:///c:/Users/akash/Downloads/San's/Bro-pics/apps/web/tailwind.config.ts) and mirrored in [`design-tokens.ts`](file:///c:/Users/akash/Downloads/San's/Bro-pics/apps/web/lib/design-tokens.ts).

| Token | Hex | Role |
|---|---|---|
| `ink` | `#000000` | All text (Black) |
| `paper` | `#FFFFFF` | Cards & raised surfaces (White) |
| `field` | `#FAF8F4` | Page background (warm alabaster) |
| `tint` | `#EFEBE4` | Image tiles, quiet bands, search field |
| `line` | `#E0DAD1` | Borders — card against band |
| `gold` | `#FCA311` | Primary accent & CTA buttons |
| `gold-deep` | `#E08F00` | Gold hover/pressed |
| `accent` | `#14213D` | Links, focus ring, accent text (Prussian Blue) |
| `accent-dark` | `#0B1428` | Accent hover/pressed |
| `alert` | `#A35A08` | Errors (deepened gold, no red in palette) |

> [!NOTE]
> Legacy admin tokens (`cream`, `gold-dark`, `brown`, `brown-light`, `brown-dark`) are mapped onto the new palette for `/app/admin` screens only. **Do not use them in storefront code.**

---

## Typography

| Use | Font Family | Tailwind Class |
|---|---|---|
| Headlines / Display | **Outfit** | `font-display` |
| Body / UI | **Manrope** | `font-sans` |

Custom font-size: `2xs` → `0.6875rem / 1rem` (for review counts, meta rows).

---

## Layout

| Token | Value | Purpose |
|---|---|---|
| `max-w-shell` | `1280px` | Page content max-width |

---

## Next.js Config Highlights

- **`transpilePackages`**: `['@bro-pics/shared']`
- **`serverExternalPackages`**: `['sharp']` — keeps sharp as a plain Node `require` so native bindings work in route handlers.
- **`images.remotePatterns`**: Scoped to `storage.googleapis.com/bropics-app.firebasestorage.app/**` only.
- **Bundle Analyzer**: Activated via `ANALYZE=true` env var.

---

## Key Scripts

```bash
pnpm dev          # next dev
pnpm build        # next build
pnpm test         # vitest run
pnpm typecheck    # tsc --noEmit
```

---

## Design Tokens (Canvas / SVG use)

When Tailwind classes can't reach (e.g. `<canvas>`, SVG attributes), import from [`design-tokens.ts`](file:///c:/Users/akash/Downloads/San's/Bro-pics/apps/web/lib/design-tokens.ts):

```ts
import { PAPER, FIELD, INK, TINT, LINE, GOLD, ACCENT, ALERT } from '@/lib/design-tokens';
```

> [!IMPORTANT]
> These MUST stay in lockstep with `tailwind.config.ts`. They are the *same* colours, not a second palette.

---

## Shared Package

- **Package:** `@bro-pics/shared` (workspace dependency)
- **Location:** `packages/shared/`
- **Contains:** Zod schemas (address, customization, frame-template, notification, order, return, user), editor-geometry utils, return-status state machine.

---

## Test Setup

- **Runner:** Vitest with `jsdom` environment
- **Setup file:** [`vitest.setup.ts`](file:///c:/Users/akash/Downloads/San's/Bro-pics/apps/web/vitest.setup.ts) — includes DOM matchers, Firebase mocks, and global test utilities.
