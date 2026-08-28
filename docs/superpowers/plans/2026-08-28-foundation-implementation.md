# Foundation Phase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the BroPics monorepo — workspace config, Firebase project config (rules, indexes, emulator), the `@bro-pics/shared` package (zod schemas, pricing/DPI math), and skeletons for `apps/web`, `functions`, and `services/print-render` — so later phases build features on a working, tested foundation instead of empty folders.

**Architecture:** pnpm workspace monorepo with four packages (`apps/web`, `functions`, `services/print-render`, `packages/shared`). `packages/shared` is built first since everything else imports its types, zod schemas, and pricing/DPI utilities. Firestore security rules and indexes are written and tested against the Firebase Emulator Suite before any app code touches them.

**Tech Stack:** Next.js 15 (App Router) + TypeScript, Tailwind CSS, Firebase (Firestore, Auth, Storage, Functions, App Hosting), Vitest for unit tests, `@firebase/rules-unit-testing` for security rules tests, pnpm workspaces.

## Global Constraints

- All monetary values are integer paise. Never floats. (Spec §2, ground rule.)
- Every schema/API boundary validates input with zod. Client values are never trusted for pricing. (Spec §2.)
- TypeScript strict mode everywhere; no `any` in shared package exports.
- No feature/business-logic code in this phase beyond the pure utilities named in this plan (pricing, DPI, order-number/webhook-idempotency helpers) — storefront, personalization engine, checkout, and admin panel are later phases per the Foundation design doc's Roadmap.
- Package manager is pnpm (not npm/yarn) — matches the Foundation design's repo structure.
- Follow the exact directory layout from `docs/superpowers/specs/2026-08-28-foundation-design.md` §4.

---

## File Structure

```
bro-pics/
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.base.json
├── .gitignore
├── .env.example
├── README.md
├── firebase.json
├── firestore.rules
├── firestore.indexes.json
├── storage.rules
├── packages/shared/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   └── src/
│       ├── index.ts
│       ├── schemas/
│       │   ├── product.ts
│       │   ├── variant.ts
│       │   ├── coupon.ts
│       │   ├── order.ts
│       │   ├── customization.ts
│       │   └── settings.ts
│       ├── pricing/
│       │   ├── money.ts
│       │   ├── money.test.ts
│       │   ├── coupon.ts
│       │   └── coupon.test.ts
│       └── dpi/
│           ├── calculate.ts
│           └── calculate.test.ts
├── functions/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   └── src/
│       ├── orders/
│       │   ├── orderNumber.ts
│       │   └── orderNumber.test.ts
│       └── webhooks/
│           ├── idempotency.ts
│           └── idempotency.test.ts
├── services/print-render/
│   ├── package.json
│   ├── tsconfig.json
│   ├── Dockerfile
│   ├── vitest.config.ts
│   └── src/
│       ├── server.ts
│       └── server.test.ts
├── apps/web/
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   ├── postcss.config.js
│   ├── vitest.config.ts
│   ├── vitest.setup.ts
│   ├── lib/
│   │   ├── firebase-client.ts
│   │   └── firebase-admin.ts
│   └── app/
│       ├── layout.tsx
│       ├── layout.test.tsx
│       ├── (shop)/page.tsx
│       ├── (account)/orders/page.tsx
│       └── (admin)/dashboard/page.tsx
├── scripts/seed/
│   ├── package.json
│   ├── tsconfig.json
│   ├── vitest.config.ts
│   └── src/
│       ├── data.ts
│       └── data.test.ts
└── firestore-rules-tests/
    ├── package.json
    ├── vitest.config.ts
    └── rules.test.ts
```

---

### Task 1: Monorepo workspace scaffold

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `README.md`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: pnpm workspace roots (`apps/*`, `functions`, `services/*`, `packages/*`, `scripts/*`, `firestore-rules-tests`) that every later task's `package.json` registers into.

- [ ] **Step 1: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - apps/*
  - functions
  - services/*
  - packages/*
  - scripts/*
  - firestore-rules-tests
```

- [ ] **Step 2: Create root `package.json`**

```json
{
  "name": "bro-pics",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "scripts": {
    "dev": "pnpm --filter @bro-pics/web dev",
    "build": "pnpm -r --if-present build",
    "test": "pnpm -r --if-present test",
    "lint": "pnpm -r --if-present lint"
  },
  "devDependencies": {
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 3: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "isolatedModules": true
  }
}
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
dist/
.next/
.firebase/
firebase-debug.log
firestore-debug.log
ui-debug.log
*.local
.env
.env.local
.DS_Store
```

- [ ] **Step 5: Create `.env.example`**

```
# Firebase (apps/web, functions)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=
FIREBASE_SERVICE_ACCOUNT_JSON=

# Razorpay
RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
RAZORPAY_WEBHOOK_SECRET=

# Algolia
ALGOLIA_APP_ID=
ALGOLIA_ADMIN_API_KEY=
NEXT_PUBLIC_ALGOLIA_SEARCH_ONLY_KEY=
NEXT_PUBLIC_ALGOLIA_INDEX_NAME=
```

- [ ] **Step 6: Create `README.md`**

```markdown
# BroPics — Personalized Photo Frame E-Commerce Platform

Monorepo for the BroPics & Kavi Vazhi Photography storefront, personalization
engine, and admin panel. See `docs/superpowers/specs/2026-08-28-foundation-design.md`
for the full architecture.

## Structure

- `apps/web` — Next.js storefront, account, and admin UI
- `functions` — Firebase Cloud Functions (webhooks, order/coupon logic, search sync)
- `services/print-render` — Cloud Run service for print-file rendering
- `packages/shared` — shared types, zod schemas, pricing/DPI math
- `scripts/seed` — Firestore seed data for local dev
- `firestore-rules-tests` — security rules test suite

## Setup

1. Install pnpm: `npm install -g pnpm@9`
2. Install dependencies: `pnpm install`
3. Copy `.env.example` to `.env.local` in `apps/web` and fill in Firebase/Razorpay/Algolia keys
4. Install the Firebase CLI: `npm install -g firebase-tools`
5. Start emulators: `firebase emulators:start`
6. Run the web app: `pnpm dev`
7. Run all tests: `pnpm test`

## Environments

- **local** — Firebase Emulator Suite, Razorpay test keys
- **preview** — per-PR or shared dev Firebase project, Razorpay test keys
- **production** — separate Firebase project, live Razorpay keys, custom domain
```

- [ ] **Step 7: Commit**

```bash
git add pnpm-workspace.yaml package.json tsconfig.base.json .gitignore .env.example README.md
git commit -m "chore: scaffold monorepo workspace"
```

---

### Task 2: `@bro-pics/shared` — zod schemas

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/vitest.config.ts`
- Create: `packages/shared/src/schemas/product.ts`
- Create: `packages/shared/src/schemas/variant.ts`
- Create: `packages/shared/src/schemas/coupon.ts`
- Create: `packages/shared/src/schemas/order.ts`
- Create: `packages/shared/src/schemas/customization.ts`
- Create: `packages/shared/src/schemas/settings.ts`
- Create: `packages/shared/src/index.ts`
- Test: `packages/shared/src/schemas/product.test.ts`

**Interfaces:**
- Consumes: nothing beyond `zod`
- Produces: `ProductSchema`, `Product`, `VariantSchema`, `Variant`, `CouponSchema`, `Coupon`, `OrderSchema`, `Order`, `OrderStatusSchema`, `CustomizationSchema`, `Customization`, `SettingsSchema`, `Settings` — all exported from `@bro-pics/shared`. Later tasks (Task 3, 4, functions, web) import these by name.

- [ ] **Step 1: Create `packages/shared/package.json`**

```json
{
  "name": "@bro-pics/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": {
    "test": "vitest run"
  },
  "dependencies": {
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "vitest": "^2.1.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Create `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `packages/shared/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

- [ ] **Step 4: Write the failing test for the product schema**

```ts
// packages/shared/src/schemas/product.test.ts
import { describe, it, expect } from 'vitest';
import { ProductSchema } from './product';

const validProduct = {
  id: 'prod_1',
  title: 'Classic Wooden Frame',
  slug: 'classic-wooden-frame',
  categoryId: 'cat_frames',
  shortDesc: 'A classic wooden photo frame',
  descriptionHtml: '<p>Details</p>',
  highlights: ['Solid wood', 'Handcrafted'],
  howItWorks: ['Upload', 'Adjust', 'Order'],
  careText: 'Wipe with a dry cloth',
  basePrice: 99900,
  isActive: true,
  isFeatured: false,
  badges: ['best-seller'],
  dispatchDaysMin: 3,
  dispatchDaysMax: 5,
  photoSlots: 1,
  allowsTextPersonalization: false,
  seo: { title: 'Classic Wooden Frame', description: 'Buy now' },
};

describe('ProductSchema', () => {
  it('accepts a valid product', () => {
    expect(ProductSchema.parse(validProduct)).toEqual(validProduct);
  });

  it('rejects a non-integer basePrice', () => {
    const invalid = { ...validProduct, basePrice: 999.5 };
    expect(() => ProductSchema.parse(invalid)).toThrow();
  });

  it('rejects a negative photoSlots', () => {
    const invalid = { ...validProduct, photoSlots: 0 };
    expect(() => ProductSchema.parse(invalid)).toThrow();
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/shared test`
Expected: FAIL — `./product` module not found

- [ ] **Step 6: Create `packages/shared/src/schemas/product.ts`**

```ts
import { z } from 'zod';

export const ProductSchema = z.object({
  id: z.string(),
  title: z.string().min(1),
  slug: z.string().min(1),
  categoryId: z.string(),
  shortDesc: z.string(),
  descriptionHtml: z.string(),
  highlights: z.array(z.string()),
  howItWorks: z.array(z.string()),
  careText: z.string(),
  basePrice: z.number().int().nonnegative(),
  isActive: z.boolean(),
  isFeatured: z.boolean(),
  badges: z.array(z.string()),
  dispatchDaysMin: z.number().int().nonnegative(),
  dispatchDaysMax: z.number().int().nonnegative(),
  photoSlots: z.number().int().positive(),
  allowsTextPersonalization: z.boolean(),
  seo: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
  }),
});

export type Product = z.infer<typeof ProductSchema>;
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/shared test`
Expected: PASS (3 tests)

- [ ] **Step 8: Create the remaining schema files**

```ts
// packages/shared/src/schemas/variant.ts
import { z } from 'zod';

export const VariantSchema = z.object({
  id: z.string(),
  productId: z.string(),
  sku: z.string().min(1),
  sizeLabel: z.string(),
  widthIn: z.number().positive(),
  heightIn: z.number().positive(),
  frameColour: z.string(),
  material: z.string(),
  price: z.number().int().nonnegative(),
  compareAtPrice: z.number().int().nonnegative().optional(),
  stockStatus: z.enum(['in_stock', 'out_of_stock', 'backorder']),
  printWidthPx: z.number().int().positive(),
  printHeightPx: z.number().int().positive(),
  minUploadPx: z.number().int().positive(),
  aspectRatio: z.number().positive(),
  isActive: z.boolean(),
});

export type Variant = z.infer<typeof VariantSchema>;
```

```ts
// packages/shared/src/schemas/coupon.ts
import { z } from 'zod';

export const CouponSchema = z.object({
  code: z.string().min(1),
  type: z.enum(['percent', 'flat', 'free_ship']),
  value: z.number().int().nonnegative(),
  minOrder: z.number().int().nonnegative().optional(),
  maxDiscountCap: z.number().int().nonnegative().optional(),
  startsAt: z.date(),
  endsAt: z.date(),
  usageLimit: z.number().int().nonnegative().optional(),
  perUserLimit: z.number().int().nonnegative().optional(),
  appliesTo: z.enum(['all', 'category', 'product']),
  usedCount: z.number().int().nonnegative(),
});

export type Coupon = z.infer<typeof CouponSchema>;
```

```ts
// packages/shared/src/schemas/order.ts
import { z } from 'zod';

export const OrderStatusSchema = z.enum([
  'pending_payment',
  'paid',
  'in_production',
  'printed_packed',
  'shipped',
  'delivered',
  'cancelled',
  'refunded',
  'replacement_issued',
]);

export const OrderSchema = z.object({
  id: z.string(),
  orderNo: z.string(),
  userId: z.string(),
  status: OrderStatusSchema,
  paymentStatus: z.enum(['pending', 'paid', 'failed', 'refunded']),
  subtotal: z.number().int().nonnegative(),
  discount: z.number().int().nonnegative(),
  shipping: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
  couponId: z.string().optional(),
  addressJson: z.record(z.string(), z.unknown()),
  razorpayOrderId: z.string().optional(),
  razorpayPaymentId: z.string().optional(),
  notes: z.string().optional(),
  placedAt: z.date(),
  paymentMode: z.enum(['prepaid', 'partial_cod']),
  amountPaidOnline: z.number().int().nonnegative(),
  amountDueOnDelivery: z.number().int().nonnegative(),
  taxLines: z.array(
    z.object({
      gstin: z.string().optional(),
      rate: z.number().nonnegative(),
      amount: z.number().int().nonnegative(),
    })
  ),
});

export type Order = z.infer<typeof OrderSchema>;
export type OrderStatus = z.infer<typeof OrderStatusSchema>;
```

```ts
// packages/shared/src/schemas/customization.ts
import { z } from 'zod';

export const CustomizationSchema = z.object({
  id: z.string(),
  uploadId: z.string(),
  variantId: z.string(),
  slotIndex: z.number().int().nonnegative(),
  transformJson: z.object({
    scale: z.number().positive(),
    offsetX: z.number(),
    offsetY: z.number(),
    rotation: z.number(),
    cropRect: z.object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    }),
  }),
  textFieldsJson: z.record(z.string(), z.string()).optional(),
  effectiveDpi: z.number().nonnegative(),
  previewUrl: z.string().optional(),
  printFileUrl: z.string().optional(),
  renderStatus: z.enum(['pending', 'rendering', 'done', 'failed']),
});

export type Customization = z.infer<typeof CustomizationSchema>;
```

```ts
// packages/shared/src/schemas/settings.ts
import { z } from 'zod';

export const SettingsSchema = z.object({
  gstin: z.string().optional(),
  gstEnabled: z.boolean(),
  taxRate: z.number().nonnegative(),
  freeShippingThreshold: z.number().int().nonnegative(),
  flatShippingCharge: z.number().int().nonnegative(),
  processingDays: z.number().int().nonnegative(),
  supportPhone: z.string(),
  announcementBar: z.object({
    text: z.string(),
    link: z.string().optional(),
    isActive: z.boolean(),
  }),
});

export type Settings = z.infer<typeof SettingsSchema>;
```

- [ ] **Step 9: Create `packages/shared/src/index.ts`**

Task 2 exports only the schemas created so far. Tasks 3 and 4 each append one `export * from` line to this same file when they add `pricing/money`, `pricing/coupon`, and `dpi/calculate` — do not add those lines yet, those files don't exist until those tasks run.

```ts
export * from './schemas/product';
export * from './schemas/variant';
export * from './schemas/coupon';
export * from './schemas/order';
export * from './schemas/customization';
export * from './schemas/settings';
```

- [ ] **Step 10: Run full package test suite**

Run: `pnpm --filter @bro-pics/shared test`
Expected: PASS (schema tests only — pricing and DPI tests are added in Tasks 3 and 4)

- [ ] **Step 11: Commit**

```bash
git add packages/shared/package.json packages/shared/tsconfig.json packages/shared/vitest.config.ts packages/shared/src/schemas packages/shared/src/index.ts
git commit -m "feat(shared): add zod schemas for core entities"
```

---

### Task 3: `@bro-pics/shared` — money & coupon pricing utilities

**Files:**
- Create: `packages/shared/src/pricing/money.ts`
- Test: `packages/shared/src/pricing/money.test.ts`
- Create: `packages/shared/src/pricing/coupon.ts`
- Test: `packages/shared/src/pricing/coupon.test.ts`

**Interfaces:**
- Consumes: `Coupon` type from Task 2 (`packages/shared/src/schemas/coupon.ts`)
- Produces: `isValidPaise(value: number): boolean`, `assertPaise(value: number, fieldName: string): number`, `calculateCouponDiscount(subtotalPaise: number, coupon: Coupon, now?: Date): CouponApplicationResult`. These are the functions the `functions` package (Task 7) and later checkout code will call for server-side price computation.

- [ ] **Step 1: Write the failing test for money utilities**

```ts
// packages/shared/src/pricing/money.test.ts
import { describe, it, expect } from 'vitest';
import { isValidPaise, assertPaise } from './money';

describe('isValidPaise', () => {
  it('accepts a non-negative integer', () => {
    expect(isValidPaise(99900)).toBe(true);
  });

  it('rejects a float', () => {
    expect(isValidPaise(999.5)).toBe(false);
  });

  it('rejects a negative number', () => {
    expect(isValidPaise(-100)).toBe(false);
  });
});

describe('assertPaise', () => {
  it('returns the value when valid', () => {
    expect(assertPaise(50000, 'subtotal')).toBe(50000);
  });

  it('throws with the field name when invalid', () => {
    expect(() => assertPaise(50.5, 'subtotal')).toThrow('subtotal must be a non-negative integer (paise), got 50.5');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/shared test money`
Expected: FAIL — `./money` module not found

- [ ] **Step 3: Create `packages/shared/src/pricing/money.ts`**

```ts
export function isValidPaise(value: number): boolean {
  return Number.isInteger(value) && value >= 0;
}

export function assertPaise(value: number, fieldName: string): number {
  if (!isValidPaise(value)) {
    throw new Error(`${fieldName} must be a non-negative integer (paise), got ${value}`);
  }
  return value;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/shared test money`
Expected: PASS (5 tests)

- [ ] **Step 5: Write the failing test for coupon discount calculation**

```ts
// packages/shared/src/pricing/coupon.test.ts
import { describe, it, expect } from 'vitest';
import { calculateCouponDiscount } from './coupon';
import type { Coupon } from '../schemas/coupon';

function makeCoupon(overrides: Partial<Coupon> = {}): Coupon {
  return {
    code: 'SAVE10',
    type: 'percent',
    value: 10,
    startsAt: new Date('2026-01-01'),
    endsAt: new Date('2026-12-31'),
    appliesTo: 'all',
    usedCount: 0,
    ...overrides,
  };
}

describe('calculateCouponDiscount', () => {
  it('calculates a percent discount', () => {
    const result = calculateCouponDiscount(100000, makeCoupon({ type: 'percent', value: 10 }));
    expect(result).toEqual({ valid: true, discountPaise: 10000 });
  });

  it('calculates a flat discount', () => {
    const result = calculateCouponDiscount(100000, makeCoupon({ type: 'flat', value: 5000 }));
    expect(result).toEqual({ valid: true, discountPaise: 5000 });
  });

  it('caps a percent discount at maxDiscountCap', () => {
    const result = calculateCouponDiscount(
      1000000,
      makeCoupon({ type: 'percent', value: 50, maxDiscountCap: 20000 })
    );
    expect(result).toEqual({ valid: true, discountPaise: 20000 });
  });

  it('rejects when subtotal is below minOrder', () => {
    const result = calculateCouponDiscount(1000, makeCoupon({ minOrder: 5000 }));
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('below_min_order');
  });

  it('rejects when the coupon has expired', () => {
    const result = calculateCouponDiscount(
      100000,
      makeCoupon({ endsAt: new Date('2020-01-01') }),
      new Date('2026-06-01')
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('expired');
  });

  it('rejects when the coupon has not started yet', () => {
    const result = calculateCouponDiscount(
      100000,
      makeCoupon({ startsAt: new Date('2027-01-01') }),
      new Date('2026-06-01')
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('not_started');
  });

  it('rejects when usageLimit has been reached', () => {
    const result = calculateCouponDiscount(
      100000,
      makeCoupon({ usageLimit: 10, usedCount: 10 })
    );
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('usage_limit_reached');
  });

  it('never returns a discount greater than the subtotal', () => {
    const result = calculateCouponDiscount(1000, makeCoupon({ type: 'flat', value: 5000 }));
    expect(result.discountPaise).toBe(1000);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/shared test coupon`
Expected: FAIL — `./coupon` module not found

- [ ] **Step 7: Create `packages/shared/src/pricing/coupon.ts`**

```ts
import type { Coupon } from '../schemas/coupon';
import { assertPaise } from './money';

export interface CouponApplicationResult {
  valid: boolean;
  discountPaise: number;
  reason?: 'below_min_order' | 'expired' | 'not_started' | 'usage_limit_reached';
}

export function calculateCouponDiscount(
  subtotalPaise: number,
  coupon: Coupon,
  now: Date = new Date()
): CouponApplicationResult {
  assertPaise(subtotalPaise, 'subtotalPaise');

  if (now < coupon.startsAt) {
    return { valid: false, discountPaise: 0, reason: 'not_started' };
  }
  if (now > coupon.endsAt) {
    return { valid: false, discountPaise: 0, reason: 'expired' };
  }
  if (coupon.minOrder !== undefined && subtotalPaise < coupon.minOrder) {
    return { valid: false, discountPaise: 0, reason: 'below_min_order' };
  }
  if (coupon.usageLimit !== undefined && coupon.usedCount >= coupon.usageLimit) {
    return { valid: false, discountPaise: 0, reason: 'usage_limit_reached' };
  }

  let discountPaise: number;
  if (coupon.type === 'flat') {
    discountPaise = coupon.value;
  } else if (coupon.type === 'percent') {
    discountPaise = Math.round((subtotalPaise * coupon.value) / 100);
  } else {
    discountPaise = 0; // free_ship discount is applied to shipping, not subtotal
  }

  if (coupon.maxDiscountCap !== undefined) {
    discountPaise = Math.min(discountPaise, coupon.maxDiscountCap);
  }
  discountPaise = Math.min(discountPaise, subtotalPaise);

  return { valid: true, discountPaise };
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/shared test coupon`
Expected: PASS (8 tests)

- [ ] **Step 9: Add the new exports to `packages/shared/src/index.ts`**

Append these two lines after the existing `export * from './schemas/settings';` line:

```ts
export * from './pricing/money';
export * from './pricing/coupon';
```

- [ ] **Step 10: Run the full shared package suite**

Run: `pnpm --filter @bro-pics/shared test`
Expected: PASS (schema tests + money tests + coupon tests, all green)

- [ ] **Step 11: Commit**

```bash
git add packages/shared/src/pricing packages/shared/src/index.ts
git commit -m "feat(shared): add money and coupon pricing utilities"
```

---

### Task 4: `@bro-pics/shared` — DPI calculation

**Files:**
- Create: `packages/shared/src/dpi/calculate.ts`
- Test: `packages/shared/src/dpi/calculate.test.ts`

**Interfaces:**
- Consumes: nothing beyond plain numbers
- Produces: `type DpiTier = 'green' | 'amber' | 'red'`, `calculateEffectiveDpi(originalWidthPx: number, originalHeightPx: number, cropScale: number, printWidthIn: number, printHeightIn: number): DpiResult`, `dpiTier(dpi: number): DpiTier`. The personalization engine phase (Phase 3) calls `calculateEffectiveDpi` live as the customer zooms, per spec §13.

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/dpi/calculate.test.ts
import { describe, it, expect } from 'vitest';
import { calculateEffectiveDpi, dpiTier } from './calculate';

describe('dpiTier', () => {
  it('returns green at or above 300 dpi', () => {
    expect(dpiTier(300)).toBe('green');
    expect(dpiTier(450)).toBe('green');
  });

  it('returns amber between 150 and 299 dpi', () => {
    expect(dpiTier(150)).toBe('amber');
    expect(dpiTier(299)).toBe('amber');
  });

  it('returns red below 150 dpi', () => {
    expect(dpiTier(149)).toBe('red');
    expect(dpiTier(0)).toBe('red');
  });
});

describe('calculateEffectiveDpi', () => {
  it('matches the spec reference table for an 8x12 print at full resolution, no zoom', () => {
    // Spec §13: 8x12in at 300 DPI requires 2400x3600px
    const result = calculateEffectiveDpi(2400, 3600, 1, 8, 12);
    expect(result.effectiveDpi).toBeCloseTo(300, 0);
    expect(result.tier).toBe('green');
  });

  it('halves effective dpi when the customer zooms in 2x', () => {
    const result = calculateEffectiveDpi(2400, 3600, 2, 8, 12);
    expect(result.effectiveDpi).toBeCloseTo(150, 0);
    expect(result.tier).toBe('amber');
  });

  it('flags a low-resolution upload as red', () => {
    const result = calculateEffectiveDpi(800, 1200, 1, 8, 12);
    expect(result.tier).toBe('red');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/shared test dpi`
Expected: FAIL — `./calculate` module not found

- [ ] **Step 3: Create `packages/shared/src/dpi/calculate.ts`**

```ts
export type DpiTier = 'green' | 'amber' | 'red';

export interface DpiResult {
  effectiveDpi: number;
  tier: DpiTier;
}

export function dpiTier(dpi: number): DpiTier {
  if (dpi >= 300) return 'green';
  if (dpi >= 150) return 'amber';
  return 'red';
}

/**
 * Effective DPI = pixels of the original image actually used inside the
 * printable area / print size in inches (spec §13). cropScale > 1 means
 * the customer has zoomed in, using fewer of the original pixels per inch
 * of print.
 */
export function calculateEffectiveDpi(
  originalWidthPx: number,
  originalHeightPx: number,
  cropScale: number,
  printWidthIn: number,
  printHeightIn: number
): DpiResult {
  const usedWidthPx = originalWidthPx / cropScale;
  const usedHeightPx = originalHeightPx / cropScale;
  const dpiFromWidth = usedWidthPx / printWidthIn;
  const dpiFromHeight = usedHeightPx / printHeightIn;
  const effectiveDpi = Math.min(dpiFromWidth, dpiFromHeight);

  return { effectiveDpi, tier: dpiTier(effectiveDpi) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/shared test dpi`
Expected: PASS (6 tests)

- [ ] **Step 5: Add the new export to `packages/shared/src/index.ts`**

Append this line after the existing `export * from './pricing/coupon';` line:

```ts
export * from './dpi/calculate';
```

- [ ] **Step 6: Run the full shared package suite**

Run: `pnpm --filter @bro-pics/shared test`
Expected: PASS (all tests across schemas, pricing, dpi)

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/dpi packages/shared/src/index.ts
git commit -m "feat(shared): add effective DPI calculation"
```

---

### Task 5: Firestore & Storage security rules

**Files:**
- Create: `firebase.json`
- Create: `firestore.rules`
- Create: `firestore.indexes.json`
- Create: `storage.rules`
- Create: `firestore-rules-tests/package.json`
- Create: `firestore-rules-tests/vitest.config.ts`
- Test: `firestore-rules-tests/rules.test.ts`

**Interfaces:**
- Consumes: collection names and field names from the Foundation design doc §2 (`products`, `orders`, `uploads`, `addresses` subcollection under `users`, `reviews`)
- Produces: enforced Firestore Security Rules that later phases (checkout, admin) rely on for data isolation — no code interface, but the *behavior* "customers can only read their own orders/uploads/addresses; public catalog is world-readable; all other writes are server-only" is the contract every later phase assumes.

- [ ] **Step 1: Create `firestore.rules`**

```
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {

    function isSignedIn() {
      return request.auth != null;
    }

    function isOwner(userId) {
      return isSignedIn() && request.auth.uid == userId;
    }

    function isStaffOrAdmin() {
      return isSignedIn() &&
        (request.auth.token.role == 'admin' || request.auth.token.role == 'staff');
    }

    // Public catalog — readable by anyone, writable only by server (Admin SDK bypasses rules).
    match /categories/{id} {
      allow read: if true;
      allow write: if false;
    }

    match /products/{id} {
      allow read: if true;
      allow write: if false;

      match /variants/{variantId} {
        allow read: if true;
        allow write: if false;
      }
      match /media/{mediaId} {
        allow read: if true;
        allow write: if false;
      }
      match /frameTemplates/{templateId} {
        allow read: if true;
        allow write: if false;
      }
    }

    match /homepageSections/{id} {
      allow read: if true;
      allow write: if false;
    }

    match /testimonials/{id} {
      allow read: if true;
      allow write: if false;
    }

    match /reviews/{id} {
      allow read: if resource.data.status == 'approved' || isStaffOrAdmin();
      allow write: if false;
    }

    match /settings/{key} {
      allow read: if true;
      allow write: if false;
    }

    // Customer-owned data — readable only by the owner or staff/admin.
    match /orders/{orderId} {
      allow read: if isOwner(resource.data.userId) || isStaffOrAdmin();
      allow write: if false;

      match /items/{itemId} {
        allow read: if isOwner(get(/databases/$(database)/documents/orders/$(orderId)).data.userId) || isStaffOrAdmin();
        allow write: if false;
      }
      match /events/{eventId} {
        allow read: if isOwner(get(/databases/$(database)/documents/orders/$(orderId)).data.userId) || isStaffOrAdmin();
        allow write: if false;
      }
    }

    match /uploads/{uploadId} {
      allow read: if isOwner(resource.data.userId) || isStaffOrAdmin();
      allow write: if false;
    }

    match /customizations/{id} {
      allow read: if isStaffOrAdmin();
      allow write: if false;
    }

    match /users/{userId} {
      allow read: if isOwner(userId) || isStaffOrAdmin();
      allow write: if false;

      match /addresses/{addressId} {
        allow read: if isOwner(userId) || isStaffOrAdmin();
        allow write: if false;
      }
    }

    match /coupons/{code} {
      allow read: if isStaffOrAdmin();
      allow write: if false;
    }

    match /carts/{sessionId} {
      allow read: if false;
      allow write: if false;
    }

    match /webhookEvents/{eventId} {
      allow read, write: if false;
    }

    match /counters/{id} {
      allow read, write: if false;
    }
  }
}
```

- [ ] **Step 2: Create `storage.rules`**

```
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if false;
    }
  }
}
```

- [ ] **Step 3: Create `firestore.indexes.json`**

```json
{
  "indexes": [
    {
      "collectionGroup": "products",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "categoryId", "order": "ASCENDING" },
        { "fieldPath": "isActive", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "reviews",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "productId", "order": "ASCENDING" },
        { "fieldPath": "status", "order": "ASCENDING" },
        { "fieldPath": "createdAt", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "orders",
      "queryScope": "COLLECTION",
      "fields": [
        { "fieldPath": "userId", "order": "ASCENDING" },
        { "fieldPath": "placedAt", "order": "DESCENDING" }
      ]
    }
  ],
  "fieldOverrides": []
}
```

- [ ] **Step 4: Create `firebase.json`**

```json
{
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "storage": {
    "rules": "storage.rules"
  },
  "functions": [
    {
      "source": "functions",
      "codebase": "default",
      "runtime": "nodejs20"
    }
  ],
  "emulators": {
    "auth": { "port": 9099 },
    "firestore": { "port": 8080 },
    "storage": { "port": 9199 },
    "functions": { "port": 5001 },
    "ui": { "enabled": true, "port": 4000 },
    "singleProjectMode": true
  }
}
```

- [ ] **Step 5: Create `firestore-rules-tests/package.json`**

```json
{
  "name": "@bro-pics/firestore-rules-tests",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "firebase emulators:exec --only firestore \"vitest run\""
  },
  "devDependencies": {
    "@firebase/rules-unit-testing": "^3.0.4",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 6: Create `firestore-rules-tests/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
```

- [ ] **Step 7: Write the failing rules test**

```ts
// firestore-rules-tests/rules.test.ts
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { readFileSync } from 'node:fs';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'bro-pics-rules-test',
    firestore: {
      rules: readFileSync('../firestore.rules', 'utf8'),
      host: 'localhost',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe('products collection', () => {
  it('allows anyone to read', async () => {
    const unauth = testEnv.unauthenticatedContext();
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('products/prod_1').set({ title: 'Frame' });
    });
    await assertSucceeds(unauth.firestore().doc('products/prod_1').get());
  });

  it('denies a direct client write', async () => {
    const unauth = testEnv.unauthenticatedContext();
    await assertFails(unauth.firestore().doc('products/prod_1').set({ title: 'Hacked' }));
  });
});

describe('orders collection', () => {
  it('allows the owning user to read their own order', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('orders/order_1').set({ userId: 'user_a' });
    });
    const userA = testEnv.authenticatedContext('user_a');
    await assertSucceeds(userA.firestore().doc('orders/order_1').get());
  });

  it('denies a different user from reading someone else\'s order', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('orders/order_1').set({ userId: 'user_a' });
    });
    const userB = testEnv.authenticatedContext('user_b');
    await assertFails(userB.firestore().doc('orders/order_1').get());
  });

  it('allows staff to read any order', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('orders/order_1').set({ userId: 'user_a' });
    });
    const staff = testEnv.authenticatedContext('staff_1', { role: 'staff' });
    await assertSucceeds(staff.firestore().doc('orders/order_1').get());
  });

  it('denies any direct client write to an order', async () => {
    const userA = testEnv.authenticatedContext('user_a');
    await assertFails(userA.firestore().doc('orders/order_1').set({ userId: 'user_a' }));
  });
});

describe('reviews collection', () => {
  it('allows anyone to read an approved review', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('reviews/rev_1').set({ status: 'approved' });
    });
    const unauth = testEnv.unauthenticatedContext();
    await assertSucceeds(unauth.firestore().doc('reviews/rev_1').get());
  });

  it('denies reading a pending review as an unauthenticated user', async () => {
    await testEnv.withSecurityRulesDisabled(async (ctx) => {
      await ctx.firestore().doc('reviews/rev_2').set({ status: 'pending' });
    });
    const unauth = testEnv.unauthenticatedContext();
    await assertFails(unauth.firestore().doc('reviews/rev_2').get());
  });
});
```

- [ ] **Step 8: Run test to verify it fails without rules present**

Run: `cd firestore-rules-tests && pnpm test`
Expected: FAIL — emulator cannot find `../firestore.rules` until Step 1 exists in the repo root (if Steps 1–4 above were already done, this instead validates the rules; if any assertion fails, re-check the rule matching the failing test)

- [ ] **Step 9: Run test to verify it passes**

Run: `cd firestore-rules-tests && pnpm test`
Expected: PASS (7 tests) — requires `firebase-tools` installed globally or via `pnpm dlx firebase-tools`

- [ ] **Step 10: Commit**

```bash
git add firebase.json firestore.rules firestore.indexes.json storage.rules firestore-rules-tests
git commit -m "feat: add Firestore/Storage security rules with emulator test suite"
```

---

### Task 6: Firebase Cloud Functions — order number & webhook idempotency

**Files:**
- Create: `functions/package.json`
- Create: `functions/tsconfig.json`
- Create: `functions/vitest.config.ts`
- Create: `functions/src/orders/orderNumber.ts`
- Test: `functions/src/orders/orderNumber.test.ts`
- Create: `functions/src/webhooks/idempotency.ts`
- Test: `functions/src/webhooks/idempotency.test.ts`

**Interfaces:**
- Consumes: nothing beyond a minimal `Transaction`-shaped interface (kept abstract so these are unit-testable without the emulator; the real call sites in Phase 4/5 pass a `firebase-admin` `Transaction`, which satisfies the same shape).
- Produces: `generateOrderNo(tx: CounterTransaction, year: number): Promise<string>`, `isDuplicateWebhookEvent(tx: WebhookTransaction, eventId: string): Promise<boolean>`, `markWebhookProcessed(tx: WebhookTransaction, eventId: string, orderId: string): void`. Phase 4 (checkout/payments) calls these inside the order-creation and Razorpay-webhook Cloud Functions.

- [ ] **Step 1: Create `functions/package.json`**

```json
{
  "name": "@bro-pics/functions",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "scripts": {
    "test": "vitest run"
  },
  "dependencies": {
    "@bro-pics/shared": "workspace:*",
    "firebase-admin": "^12.6.0",
    "firebase-functions": "^6.0.0"
  },
  "devDependencies": {
    "vitest": "^2.1.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Create `functions/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "lib",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `functions/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

- [ ] **Step 4: Write the failing test for order number generation**

```ts
// functions/src/orders/orderNumber.test.ts
import { describe, it, expect, vi } from 'vitest';
import { generateOrderNo } from './orderNumber';
import type { CounterTransaction } from './orderNumber';

function makeFakeTransaction(currentValue: number | undefined): CounterTransaction {
  const docSnapshot = {
    exists: currentValue !== undefined,
    data: () => (currentValue !== undefined ? { value: currentValue } : undefined),
  };
  return {
    get: vi.fn().mockResolvedValue(docSnapshot),
    set: vi.fn(),
  };
}

describe('generateOrderNo', () => {
  it('starts at 1 when the counter does not exist yet', async () => {
    const tx = makeFakeTransaction(undefined);
    const orderNo = await generateOrderNo(tx, 2026);
    expect(orderNo).toBe('BP-2026-00001');
    expect(tx.set).toHaveBeenCalledWith(expect.anything(), { value: 1 });
  });

  it('increments the existing counter', async () => {
    const tx = makeFakeTransaction(183);
    const orderNo = await generateOrderNo(tx, 2026);
    expect(orderNo).toBe('BP-2026-00184');
    expect(tx.set).toHaveBeenCalledWith(expect.anything(), { value: 184 });
  });

  it('pads to 5 digits', async () => {
    const tx = makeFakeTransaction(9);
    const orderNo = await generateOrderNo(tx, 2026);
    expect(orderNo).toBe('BP-2026-00010');
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/functions test orderNumber`
Expected: FAIL — `./orderNumber` module not found

- [ ] **Step 6: Create `functions/src/orders/orderNumber.ts`**

```ts
export interface CounterDocRef {
  readonly path: string;
}

export interface CounterTransaction {
  get(ref: CounterDocRef): Promise<{ exists: boolean; data(): { value: number } | undefined }>;
  set(ref: CounterDocRef, data: { value: number }): void;
}

const COUNTER_REF: CounterDocRef = { path: 'counters/orderSeq' };

export async function generateOrderNo(tx: CounterTransaction, year: number): Promise<string> {
  const snapshot = await tx.get(COUNTER_REF);
  const currentValue = snapshot.exists ? snapshot.data()!.value : 0;
  const nextValue = currentValue + 1;
  tx.set(COUNTER_REF, { value: nextValue });
  const padded = String(nextValue).padStart(5, '0');
  return `BP-${year}-${padded}`;
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/functions test orderNumber`
Expected: PASS (3 tests)

- [ ] **Step 8: Write the failing test for webhook idempotency**

```ts
// functions/src/webhooks/idempotency.test.ts
import { describe, it, expect, vi } from 'vitest';
import { isDuplicateWebhookEvent, markWebhookProcessed } from './idempotency';
import type { WebhookTransaction } from './idempotency';

function makeFakeTransaction(exists: boolean): WebhookTransaction {
  return {
    get: vi.fn().mockResolvedValue({ exists }),
    set: vi.fn(),
  };
}

describe('isDuplicateWebhookEvent', () => {
  it('returns false when the event has not been seen', async () => {
    const tx = makeFakeTransaction(false);
    const result = await isDuplicateWebhookEvent(tx, 'evt_123');
    expect(result).toBe(false);
  });

  it('returns true when the event already exists', async () => {
    const tx = makeFakeTransaction(true);
    const result = await isDuplicateWebhookEvent(tx, 'evt_123');
    expect(result).toBe(true);
  });
});

describe('markWebhookProcessed', () => {
  it('writes the event id and order id into the same transaction', () => {
    const tx = makeFakeTransaction(false);
    markWebhookProcessed(tx, 'evt_123', 'order_456');
    expect(tx.set).toHaveBeenCalledWith(
      { path: 'webhookEvents/evt_123' },
      expect.objectContaining({ orderId: 'order_456' })
    );
  });
});
```

- [ ] **Step 9: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/functions test idempotency`
Expected: FAIL — `./idempotency` module not found

- [ ] **Step 10: Create `functions/src/webhooks/idempotency.ts`**

```ts
export interface WebhookDocRef {
  readonly path: string;
}

export interface WebhookTransaction {
  get(ref: WebhookDocRef): Promise<{ exists: boolean }>;
  set(ref: WebhookDocRef, data: { processedAt: string; orderId: string }): void;
}

function webhookRef(eventId: string): WebhookDocRef {
  return { path: `webhookEvents/${eventId}` };
}

export async function isDuplicateWebhookEvent(
  tx: WebhookTransaction,
  eventId: string
): Promise<boolean> {
  const snapshot = await tx.get(webhookRef(eventId));
  return snapshot.exists;
}

export function markWebhookProcessed(tx: WebhookTransaction, eventId: string, orderId: string): void {
  tx.set(webhookRef(eventId), { processedAt: new Date().toISOString(), orderId });
}
```

- [ ] **Step 11: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/functions test idempotency`
Expected: PASS (3 tests)

- [ ] **Step 12: Commit**

```bash
git add functions/package.json functions/tsconfig.json functions/vitest.config.ts functions/src
git commit -m "feat(functions): add order number generator and webhook idempotency helpers"
```

---

### Task 7: `services/print-render` — Cloud Run service skeleton

**Files:**
- Create: `services/print-render/package.json`
- Create: `services/print-render/tsconfig.json`
- Create: `services/print-render/vitest.config.ts`
- Create: `services/print-render/Dockerfile`
- Create: `services/print-render/src/server.ts`
- Test: `services/print-render/src/server.test.ts`

**Interfaces:**
- Consumes: nothing (standalone service)
- Produces: an HTTP server with a `GET /health` endpoint returning `{ status: 'ok' }`, and an exported `createServer(): express.Express` function that Phase 3's print-rendering route handler will extend with the actual `sharp`-based render endpoint.

- [ ] **Step 1: Create `services/print-render/package.json`**

```json
{
  "name": "@bro-pics/print-render",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "src/server.ts",
  "scripts": {
    "start": "tsx src/server.ts",
    "test": "vitest run"
  },
  "dependencies": {
    "express": "^4.21.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.21",
    "@types/supertest": "^6.0.2",
    "supertest": "^7.0.0",
    "tsx": "^4.19.0",
    "vitest": "^2.1.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Create `services/print-render/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "module": "CommonJS",
    "moduleResolution": "Node"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `services/print-render/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

- [ ] **Step 4: Write the failing test**

```ts
// services/print-render/src/server.test.ts
import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createServer } from './server';

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const app = createServer();
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/print-render test`
Expected: FAIL — `./server` module not found

- [ ] **Step 6: Create `services/print-render/src/server.ts`**

```ts
import express, { type Express } from 'express';

export function createServer(): Express {
  const app = express();
  app.use(express.json({ limit: '30mb' }));

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  const port = process.env.PORT ? Number(process.env.PORT) : 8080;
  createServer().listen(port, () => {
    console.log(`print-render listening on port ${port}`);
  });
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/print-render test`
Expected: PASS (1 test)

- [ ] **Step 8: Create `services/print-render/Dockerfile`**

```dockerfile
FROM node:20-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json ./
RUN npm install --omit=dev

FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 8080
CMD ["npx", "tsx", "src/server.ts"]
```

- [ ] **Step 9: Commit**

```bash
git add services/print-render
git commit -m "feat(print-render): scaffold Cloud Run service with health check"
```

---

### Task 8: `apps/web` — Next.js scaffold with route groups and Firebase clients

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.ts`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/postcss.config.js`
- Create: `apps/web/app/globals.css`
- Create: `apps/web/vitest.config.ts`
- Create: `apps/web/vitest.setup.ts`
- Create: `apps/web/lib/firebase-client.ts`
- Create: `apps/web/lib/firebase-admin.ts`
- Create: `apps/web/app/layout.tsx`
- Test: `apps/web/app/layout.test.tsx`
- Create: `apps/web/app/(shop)/page.tsx`
- Create: `apps/web/app/(account)/orders/page.tsx`
- Create: `apps/web/app/(admin)/dashboard/page.tsx`

**Interfaces:**
- Consumes: `@bro-pics/shared` (Task 2–4)
- Produces: `getFirebaseApp(): FirebaseApp` (client SDK) and `getAdminApp(): App` (Admin SDK, server-only) — every later phase's data-fetching code imports one of these two rather than re-initializing Firebase.

- [ ] **Step 1: Create `apps/web/package.json`**

```json
{
  "name": "@bro-pics/web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run"
  },
  "dependencies": {
    "@bro-pics/shared": "workspace:*",
    "next": "^15.0.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "firebase": "^10.14.0",
    "firebase-admin": "^12.6.0"
  },
  "devDependencies": {
    "@testing-library/react": "^16.0.0",
    "@testing-library/jest-dom": "^6.5.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.20",
    "jsdom": "^25.0.0",
    "postcss": "^8.4.47",
    "tailwindcss": "^3.4.13",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create `apps/web/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "preserve",
    "noEmit": true,
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `apps/web/next.config.ts`**

```ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@bro-pics/shared'],
};

export default nextConfig;
```

- [ ] **Step 4: Create `apps/web/tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 5: Create `apps/web/postcss.config.js`**

```js
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 6: Create `apps/web/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 7: Create `apps/web/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
  },
});
```

- [ ] **Step 8: Create `apps/web/vitest.setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 9: Create `apps/web/lib/firebase-client.ts`**

```ts
import { type FirebaseApp, getApps, initializeApp } from 'firebase/app';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export function getFirebaseApp(): FirebaseApp {
  const existing = getApps();
  return existing.length > 0 ? existing[0] : initializeApp(firebaseConfig);
}
```

- [ ] **Step 10: Create `apps/web/lib/firebase-admin.ts`**

```ts
import { type App, getApps, initializeApp, cert } from 'firebase-admin/app';

export function getAdminApp(): App {
  const existing = getApps();
  if (existing.length > 0) return existing[0];

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serviceAccountJson) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON is not set');
  }

  return initializeApp({
    credential: cert(JSON.parse(serviceAccountJson)),
  });
}
```

- [ ] **Step 11: Write the failing test for the root layout**

```tsx
// apps/web/app/layout.test.tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import RootLayout from './layout';

describe('RootLayout', () => {
  it('renders its children', () => {
    render(
      <RootLayout>
        <p>Test child content</p>
      </RootLayout>
    );
    expect(screen.getByText('Test child content')).toBeInTheDocument();
  });
});
```

- [ ] **Step 12: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/web test layout`
Expected: FAIL — `./layout` module not found

- [ ] **Step 13: Create `apps/web/app/layout.tsx`**

```tsx
import type { ReactNode } from 'react';
import './globals.css';

export const metadata = {
  title: 'BroPics — Personalized Photo Frames',
  description: 'Custom photo frames, personalized and delivered.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 14: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/web test layout`
Expected: PASS (1 test)

- [ ] **Step 15: Create the three route-group placeholder pages**

```tsx
// apps/web/app/(shop)/page.tsx
export default function HomePage() {
  return (
    <main>
      <h1>BroPics</h1>
      <p>Personalized photo frames — storefront coming in Phase 2.</p>
    </main>
  );
}
```

```tsx
// apps/web/app/(account)/orders/page.tsx
export default function OrdersPage() {
  return (
    <main>
      <h1>Your Orders</h1>
      <p>Order history and tracking — coming in Phase 4.</p>
    </main>
  );
}
```

```tsx
// apps/web/app/(admin)/dashboard/page.tsx
export default function AdminDashboardPage() {
  return (
    <main>
      <h1>Admin Dashboard</h1>
      <p>Admin panel — coming in Phase 5.</p>
    </main>
  );
}
```

- [ ] **Step 16: Verify the app builds**

Run: `pnpm --filter @bro-pics/web build`
Expected: build succeeds with three routes listed (`/`, `/orders`, `/dashboard`)

- [ ] **Step 17: Commit**

```bash
git add apps/web
git commit -m "feat(web): scaffold Next.js app with route groups and Firebase client/admin init"
```

---

### Task 9: Seed data script

**Files:**
- Create: `scripts/seed/package.json`
- Create: `scripts/seed/tsconfig.json`
- Create: `scripts/seed/vitest.config.ts`
- Create: `scripts/seed/src/data.ts`
- Test: `scripts/seed/src/data.test.ts`

**Interfaces:**
- Consumes: `ProductSchema`, `VariantSchema` from `@bro-pics/shared` (Task 2)
- Produces: `seedCategories: Category[]`, `seedProducts: Product[]`, `seedVariants: Variant[]` — plain data arrays. A follow-on task in Phase 2 (not this plan) will add the Admin-SDK write script that consumes these arrays against the emulator.

- [ ] **Step 1: Create `scripts/seed/package.json`**

```json
{
  "name": "@bro-pics/seed",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run"
  },
  "dependencies": {
    "@bro-pics/shared": "workspace:*"
  },
  "devDependencies": {
    "vitest": "^2.1.0",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Create `scripts/seed/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `scripts/seed/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
  },
});
```

- [ ] **Step 4: Write the failing test**

```ts
// scripts/seed/src/data.test.ts
import { describe, it, expect } from 'vitest';
import { ProductSchema, VariantSchema } from '@bro-pics/shared';
import { seedProducts, seedVariants } from './data';

describe('seed data', () => {
  it('every seed product passes ProductSchema validation', () => {
    for (const product of seedProducts) {
      expect(() => ProductSchema.parse(product)).not.toThrow();
    }
  });

  it('every seed variant passes VariantSchema validation', () => {
    for (const variant of seedVariants) {
      expect(() => VariantSchema.parse(variant)).not.toThrow();
    }
  });

  it('every variant references a product that exists in seedProducts', () => {
    const productIds = new Set(seedProducts.map((p) => p.id));
    for (const variant of seedVariants) {
      expect(productIds.has(variant.productId)).toBe(true);
    }
  });

  it('seeds at least one product', () => {
    expect(seedProducts.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `pnpm --filter @bro-pics/seed test`
Expected: FAIL — `./data` module not found

- [ ] **Step 6: Create `scripts/seed/src/data.ts`**

```ts
import type { Product, Variant } from '@bro-pics/shared';

export const seedProducts: Product[] = [
  {
    id: 'prod_classic_wooden_frame',
    title: 'Classic Wooden Photo Frame',
    slug: 'classic-wooden-photo-frame',
    categoryId: 'cat_frames',
    shortDesc: 'A timeless wooden frame for your favourite memory',
    descriptionHtml: '<p>Placeholder description — replace with client copy.</p>',
    highlights: ['Solid wood construction', 'Ready to hang or stand'],
    howItWorks: ['Upload your photo', 'Adjust and preview', 'We print and ship'],
    careText: 'Wipe with a dry, soft cloth.',
    basePrice: 79900,
    isActive: true,
    isFeatured: true,
    badges: ['best-seller'],
    dispatchDaysMin: 3,
    dispatchDaysMax: 5,
    photoSlots: 1,
    allowsTextPersonalization: false,
    seo: {
      title: 'Classic Wooden Photo Frame | BroPics',
      description: 'Personalize a classic wooden photo frame with your own photo.',
    },
  },
];

export const seedVariants: Variant[] = [
  {
    id: 'var_classic_8x12_black',
    productId: 'prod_classic_wooden_frame',
    sku: 'CWF-8X12-BLK',
    sizeLabel: '8x12 in',
    widthIn: 8,
    heightIn: 12,
    frameColour: 'Black',
    material: 'Wood',
    price: 79900,
    stockStatus: 'in_stock',
    printWidthPx: 2400,
    printHeightPx: 3600,
    minUploadPx: 2400,
    aspectRatio: 8 / 12,
    isActive: true,
  },
];
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm --filter @bro-pics/seed test`
Expected: PASS (4 tests)

- [ ] **Step 8: Commit**

```bash
git add scripts/seed
git commit -m "feat(seed): add schema-validated placeholder seed data"
```

---

### Task 10: Wire up root scripts, install, and full-suite verification

**Files:**
- Modify: `package.json:scripts` (root, from Task 1)

**Interfaces:**
- Consumes: every package created in Tasks 1–9
- Produces: a single `pnpm install && pnpm test` entry point that proves the whole Foundation phase is wired together correctly.

- [ ] **Step 1: Install all workspace dependencies**

Run: `pnpm install`
Expected: lockfile generated, no errors

- [ ] **Step 2: Run the full test suite across every package**

Run: `pnpm test`
Expected: PASS across `@bro-pics/shared`, `@bro-pics/functions`, `@bro-pics/print-render`, `@bro-pics/web`, `@bro-pics/seed` (rules tests run separately since they require the emulator — see Task 5 Step 9)

- [ ] **Step 3: Run the Firestore rules test suite**

Run: `cd firestore-rules-tests && pnpm test`
Expected: PASS (7 tests)

- [ ] **Step 4: Build every buildable package**

Run: `pnpm build`
Expected: `@bro-pics/web` builds successfully; other packages have no build step or build cleanly

- [ ] **Step 5: Commit the lockfile**

```bash
git add pnpm-lock.yaml
git commit -m "chore: add pnpm lockfile"
```

---

## Self-Review Notes

**Spec coverage check against `docs/superpowers/specs/2026-08-28-foundation-design.md`:**
- §1 Architecture & stack → reflected in package dependencies (firebase, firebase-admin, express for Cloud Run, Next.js) across Tasks 6–8. ✅
- §2 Data model → all 6 core schemas implemented in Task 2, including the `paymentMode`/`amountPaidOnline`/`amountDueOnDelivery`/`taxLines` future-proofing fields on `OrderSchema`. ✅
- §2 Firestore mechanics (order_no, coupon limits, webhook idempotency, money discipline) → Tasks 3 (money, coupon) and 6 (order number, idempotency) implement each named mechanism with tests. ✅
- §3 Security model → Task 5 implements and tests the exact read/write rules described (public catalog read, owner-only order/upload/address read, server-only writes, staff/admin override). ✅
- §4 Repository structure → File Structure section and Tasks 1–9 match the design doc's tree exactly. ✅
- §5 Environments → `.env.example` (Task 1) and `firebase.json` emulator config (Task 5) cover local; preview/production are operational steps documented in README, not code. ✅
- §6 Open items (text personalization limits, shipping rule values, frame mockups, product catalogue) → correctly out of scope for this phase; not fabricated with placeholder values in the schemas (fields exist, no invented business values).

**Placeholder scan:** no "TBD"/"TODO" in any code block; the one placeholder-flavored string (`<p>Placeholder description — replace with client copy.</p>`) is explicit seed/test data clearly marked for replacement once the real catalogue arrives, not a plan gap.

**Type consistency check:** `Product`/`Variant`/`Coupon`/`Order`/`Customization`/`Settings` types from Task 2 are the exact types imported in Tasks 3, 4, 6, 8, 9 with matching field names (`basePrice`, `photoSlots`, `minOrder`, `usedCount`, `paymentMode`, etc.) — no renames across tasks.
