# Billing & POS — Handover

Status as of 9 Oct 2026. Branch `San's(FE)`. **Not pushed to master. Not deployed.**

Status markers used below:

| Marker | Meaning |
|---|---|
| **BUILT** | Code exists and typechecks |
| **TESTED** | Covered by automated tests and/or verified live on the Firebase emulators |
| **DEPLOYED** | Running in production — *nothing in this document is deployed yet* |
| **MOCKED** | Works end to end, but the outside service is simulated (WhatsApp mock mode) |
| **BLOCKED** | Cannot be finished until something outside the code is provided |
| **REQUIRES EXTERNAL CONFIGURATION** | Code is ready; needs credentials / Meta approval / console setup |

---

## 1. What it is

One billing system for both the website and the shop counter:

- **One invoice engine** (`packages/shared/src/billing/invoice-engine.ts`): online orders and in-store bills produce the same `Invoice` document, the same PDF and the same number series.
- **One stock count** (`packages/shared/src/inventory/stock.ts`): a frame sold in the shop is no longer available online and vice versa.
- **One customer per mobile number** (`customers/p{digits}`): website account, online orders and counter purchases are linked by phone.
- **WhatsApp kept in three separate lanes**: OTP (login codes), transactional (invoices, order updates) and marketing (campaigns), with consent checked per lane.

Every money value (prices, discounts, GST, totals) is recalculated on the server. The browser only sends *what* was chosen (product, variant, quantity, discount %), never amounts.

Invoices are never edited after issue. Returns and refunds produce a **credit note** (`KG-CN-…`) that references the original invoice.

---

## 2. Architecture

```
 Admin POS page ─┐                         ┌─ Firestore: invoices, customers, posSales,
 Admin pages     ├─► Next.js /api/admin/… ─┤    inventoryMovements, whatsappMessages,
                 │   (RBAC guard + audit)  │    whatsappCampaigns, settings/billing,
 Checkout ───────┘                         │    counters, invoiceNumbers
                                           ├─ Storage: invoices/FY{yyyy}/{id}.pdf (server-only)
 Order paid ──► Cloud Function invoiceOnPayment ─► same invoice engine ─► PDF ─► WhatsApp
 Order refund ─► Cloud Function creditNoteOnRefund ─► credit note
 Every 5 min ──► sendWhatsAppCampaigns (scheduled & large campaigns)
 Every 60 min ─► releaseUnpaidStock (unpaid > 24h)
 Order cancelled ─► releaseStockOnCancel
 Meta ──► /api/webhooks/whatsapp (signed) ─► delivery statuses, STOP / START replies
```

Shared server-only modules are imported **by path**, not via the `@bro-pics/shared` barrel:

- `@bro-pics/shared/src/billing/invoice-service`
- `@bro-pics/shared/src/billing/invoice-pdf`
- `@bro-pics/shared/src/inventory/stock`
- `@bro-pics/shared/src/whatsapp/service`
- `@bro-pics/shared/src/whatsapp/campaigns`

---

## 3. Data model (Firestore)

| Collection | Purpose | Key / id |
|---|---|---|
| `invoices/{id}` | Invoices and credit notes (`kind: invoice \| credit_note`, `channel: online \| pos`) | Deterministic: `order_{orderId}`, `pos_s{hash(staffUid, clientRequestId)}`, `cn_r{hash}`, `cn_refund_{refundId}` |
| `invoiceNumbers/{no}` | Uniqueness lock for each number (created with `tx.create`) | The invoice number |
| `counters/invoice-FY{yyyy}`, `counters/creditNote-FY{yyyy}` | Running sequence per Indian financial year | — |
| `customers/{id}` | One record per mobile number; `userId` links the website account; `consent.{transactional,marketing} = {status, at, source}`; `stats` | `p` + E.164 digits, e.g. `p919876543210` |
| `posSales/{id}` (+ `returns` subcollection) | Counter sale record (lines, payments, staff) | Same id as its invoice |
| `inventoryMovements/{id}` | Every stock change with reason `ONLINE_ORDER`, `ONLINE_RELEASE`, `OFFLINE_POS`, `RETURN`, `MANUAL_ADJUSTMENT`, `RESTOCK` | Auto |
| `whatsappMessages/{id}` | Log of every WhatsApp message: category, template, status history, provider id, failure reason. OTP codes are **never** stored | Auto |
| `whatsappCampaigns/{id}` (+ `recipients`) | Campaigns, frozen recipient list, counts | Auto |
| `settings/billing` | Business name, address, GSTIN text, prefixes, payment methods, staff discount limit, WhatsApp invoices on/off | — |

Product variants gained two optional fields: `trackStock` (boolean) and `stockQty` (integer). Variants without `trackStock` are made-to-order and unlimited, as before. Orders gained `stockReservation`.

**Security rules:** all billing collections fall under the existing deny-all, and invoice PDFs fall under the Storage deny-all — only the server (Admin SDK) can read or write them. `settings/billing` is public-read like every other `settings/*` doc; it holds nothing secret.

**Indexes:** every query uses a single field, so no composite indexes are needed.

**Numbering:** `KG-INV-2026-000001`. The prefix comes from `settings/billing` (default `KG-INV` / `KG-CN`). The year is the Indian financial year (April–March). The online payment transaction uses the same counter, so online and counter bills share one gap-free series.

---

## 4. Flows

### 4.1 In-store bill (POS) — BUILT, TESTED (emulator + live UI)

1. Staff open **Billing / POS → New Bill** and type the mobile number. An existing customer, or a website account with that phone, is found and the name filled in.
2. Staff add products by search or SKU (keyboard: ↑ ↓ Enter), change quantities and set per-line discount %.
   - Discounts above `maxStaffDiscountPercent` (default 10%) need the `billing.discount_override` permission.
   - The page warns when there isn't enough stock and blocks the sale.
3. Staff pick a payment method (cash / UPI / card / split). The sale can only be completed when the payments add up to the total.
4. `POST /api/admin/billing/sales` runs one Firestore transaction that does all of this:
   - re-prices everything
   - checks and takes the stock
   - numbers the invoice
   - creates or updates the customer
   - writes `posSales` and `invoices`
5. After the transaction, the server renders the PDF, stores it, and sends the WhatsApp invoice if consent allows.
6. A double-click or retry with the same `clientRequestId` returns the same bill. Nothing is charged or counted twice.

### 4.2 Online order — BUILT, TESTED (emulator + live mock payment)

1. **Checkout.** `create-order` reserves the stock of tracked variants. If order creation fails afterwards, the reservation is given back.
2. **Payment.** When the order is paid, the `invoiceOnPayment` function builds an invoice from the order's own totals.
   - The id is `order_{orderId}`, so a retried trigger never makes a copy.
   - The function then renders the PDF and sends it on WhatsApp.
3. **Cancellation.** The reserved stock is released exactly once (`releaseStockOnCancel`).
4. **Never paid.** If an order stays unpaid for 24 hours, its stock is released (`releaseUnpaidStock`).

### 4.3 Returns / refunds — BUILT, TESTED

- **In store:** from the bill page, choose the lines and quantities to return and the refund method.
  - A credit note is issued, with the discount refunded pro rata.
  - Stock goes back to the shelf (`RETURN`).
  - The invoice becomes `partially_refunded` or `refunded`.
- **Online:** a refund document on the order triggers `creditNoteOnRefund`.
  - Stock for delivered online returns is put back by hand on the Inventory page (`MANUAL_ADJUSTMENT`). See Known limitations.

### 4.4 WhatsApp — BUILT, TESTED, MOCKED

| Lane | Sent when | Consent rule |
|---|---|---|
| OTP | Login / sign-up | Always (the user asked for it). The send is logged; the code is not |
| Transactional | Invoice, order confirmation, payment, shipping | Sent unless the customer has **opted out** |
| Marketing | Campaigns only | Sent only if the customer **opted in**, re-checked at the moment of sending |

- **Delivery statuses:** the webhook updates the message log, the invoice's WhatsApp badge and the campaign counts. Statuses only move forward.
- **Opting out and back in:** a customer replying `STOP` is opted out of marketing immediately; `START` opts them back in. Unknown numbers that reply `STOP` get a customer record marked opted-out.
- **Recording consent:** staff can record consent on the customer profile. Every change stores the time and the source.

### 4.5 Campaigns — BUILT, TESTED, MOCKED

**Marketing → WhatsApp Campaigns**: pick an approved Marketing template, its variables (`{{name}}` becomes the first name) and an audience:

- everyone opted in
- previous customers
- bought from a category
- bought in the last 30 / 60 / 90 days
- high-value customers
- haven't bought recently

Before you save, the page shows how many opted-in customers the campaign will reach.

- **Send now:** the recipient list is frozen and up to 200 messages go out immediately. The scheduled function sends the rest every 5 minutes.
- **Schedule:** the scheduled function starts the campaign when its time comes.

---

## 5. Admin pages

| Menu | Path | Permission |
|---|---|---|
| Billing / POS → New Bill | `/admin/billing/new` | `billing.create` |
| Bills / Invoices | `/admin/billing/invoices` | `billing.view` |
| Invoice detail (PDF open/download/print, resend WhatsApp, return) | `/admin/billing/invoices/[id]` | `billing.view` (+ `download`, `send_whatsapp`, `refund`) |
| Customers / profile & consent | `/admin/billing/customers`, `/[id]` | `billing.view` (recording consent: `billing.create`) |
| Offline Sales | `/admin/billing/pos-sales` | `billing.view` |
| Online Orders | `/admin/billing/invoices?channel=online` | `billing.view` |
| Returns / Refunds | `/admin/billing/invoices?kind=credit_note` | `billing.view` |
| Billing Reports | `/admin/billing/reports` | `billing.reports` (in-store dashboard: `billing.view`) |
| WhatsApp Invoice Settings | `/admin/billing/whatsapp` | `billing.settings` |
| Billing Settings / Settings → Billing | `/admin/billing/settings` | `billing.settings` |
| Marketing → WhatsApp Campaigns | `/admin/marketing/whatsapp` | `marketing.whatsapp` |
| WhatsApp → Message Logs | `/admin/whatsapp/messages` | `whatsapp.logs` |
| Inventory (track stock / restock / set) | existing Inventory page, new stock column | existing inventory permission |

**Roles:**

| Role | Billing permissions |
|---|---|
| Staff | view, create, download, send WhatsApp |
| Marketing manager | campaigns, message logs |
| Admin / super admin | everything, including refunds, reports, discount override and settings |

There is no separate `billing.edit` permission. Issued invoices can't be edited; corrections go through `billing.refund` (credit notes), and customer details/consent through `billing.create`.

Every action writes an audit entry, among them:

- `bill_created`, `discount_applied`, `billing.refund_created`
- `billing.whatsapp_sent`, `billing.invoice_resent`, `billing.invoice_regenerated`
- `customer.consent_updated`, `billing.settings_updated`
- `marketing.campaign_created`, `marketing.campaign_sent`, `inventory.*`

---

## 6. API routes

All `/api/admin/*` routes need a staff ID token and the listed permission (`guard()` in `apps/web/lib/billing/server.ts`).

- **Billing (`/api/admin/billing/`):**
  - `catalogue` GET
  - `customers` GET (by phone / list)
  - `customers/[id]` GET, PATCH (consent)
  - `sales` POST (complete sale), GET
  - `sales/[id]/returns` POST
  - `invoices` GET
  - `invoices/[id]` GET
  - `invoices/[id]/pdf` GET (streams the stored PDF; regenerates it if the file is missing)
  - `invoices/[id]/whatsapp` POST
  - `reports` GET
  - `settings` GET, PUT
- **WhatsApp:** `/api/admin/whatsapp/messages` GET.
- **Marketing (`/api/admin/marketing/`):**
  - `campaigns` GET, POST
  - `campaigns/[id]` PATCH (schedule / cancel)
  - `campaigns/[id]/send` POST
  - `audience` POST (preview count)
- **Inventory:** `/api/admin/inventory/stock` POST (track / untrack / restock / set); `/api/admin/inventory/movements` GET.
- **Webhook:** `/api/webhooks/whatsapp` GET (Meta verify), POST (requires a valid `X-Hub-Signature-256`).
- **Changed:** `/api/checkout/create-order` (stock reservation); the OTP send/resend routes (send log).

**Cloud Functions (asia-south1):**

| Function | Runs |
|---|---|
| `invoiceOnPayment` | On payment |
| `creditNoteOnRefund` | On refund |
| `sendWhatsAppCampaigns` | Every 5 min |
| `releaseStockOnCancel` | On cancel |
| `releaseUnpaidStock` | Every 60 min |

---

## 7. Environment variables

Set these in the **server env** (App Hosting / `apps/web/.env.local` for local) **and** the **Functions env**. Never commit them and never paste them into chat.

| Variable | Used for | Default when unset |
|---|---|---|
| `WHATSAPP_MODE` | `cloud` (real) or `mock` | `mock` outside production; `cloud` if `WHATSAPP_OTP_MODE=production` and credentials exist; otherwise **disabled** (sends fail visibly in the log) |
| `WHATSAPP_ACCESS_TOKEN` | Cloud API permanent token | — |
| `WHATSAPP_PHONE_NUMBER_ID` | Sending number | — |
| `WHATSAPP_APP_SECRET` | Verifies webhook signatures (webhook refuses all POSTs without it) | — |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | Meta's subscription check | — |
| `WHATSAPP_TEMPLATE_LANGUAGE` | Template language | `en` |
| `WHATSAPP_OTP_TEMPLATE_NAME` | OTP template | `karthys_auth_otp` |
| `WHATSAPP_TEMPLATE_INVOICE` | Invoice (document header) | `karthys_invoice` |
| `WHATSAPP_TEMPLATE_ORDER_CONFIRMED` | Order confirmed | `karthys_order_confirmed` |
| `WHATSAPP_TEMPLATE_PAYMENT_RECEIVED` | Payment received | `karthys_payment_received` |
| `WHATSAPP_TEMPLATE_ORDER_SHIPPED` | Shipped | `karthys_order_shipped` |

### Templates to create and get approved in WhatsApp Manager — REQUIRES EXTERNAL CONFIGURATION

| Template | Category | Header | Body variables |
|---|---|---|---|
| `karthys_invoice` | Utility | Document (PDF) | 1 first name, 2 invoice no, 3 order no (or "In-store purchase"), 4 amount in ₹ |
| `karthys_order_confirmed` | Utility | — | name, order no |
| `karthys_payment_received` | Utility | — | name, amount, order no |
| `karthys_order_shipped` | Utility | — | name, order no, tracking |
| Each campaign template | **Marketing** | optional | as defined; must include a "Stop promotions" quick-reply button |

In Meta's app dashboard, point the webhook to `https://<domain>/api/webhooks/whatsapp`, use the verify token, and subscribe to the **messages** field.

---

## 8. Testing status

| Area | Automated tests | Live emulator QA |
|---|---|---|
| Invoice engine (pricing, GST split, discounts, payments, credit-note maths) | ✅ `invoice-engine.test.ts` | ✅ |
| Invoice PDF (pages, ₹ font, credit note) | ✅ `invoice-engine.test.ts` (PDF cases) | ✅ rendered and checked |
| Numbering: per-FY, no duplicates, shared with online | ✅ `invoice-number.test.ts`, emulator | ✅ KG-INV-2026-000001/2, KG-CN-2026-000001 |
| POS sale: idempotent, server pricing, stock, customer link (incl. website account) | ✅ emulator | ✅ |
| Online invoice: idempotent, same customer | ✅ emulator + functions tests | ✅ via mock payment |
| Returns / credit notes, refunds | ✅ emulator + functions tests | ✅ |
| Stock: concurrency (10 buyers racing for 3 units), reservation, cancel release, 24h release | ✅ `stock.emulator.test.ts`, functions tests | ✅ 20 → 17 → 18 |
| WhatsApp service (consent lanes, logging, status order) | ✅ `service.test.ts` | ✅ mock |
| Campaigns: opted-in only, opt-out mid-campaign skipped, no double send | ✅ `campaigns.emulator.test.ts` | ✅ 1 targeted / 1 sent |
| Webhook: verify, signature, statuses, STOP/START | ✅ `route.test.ts` (5) | — needs Meta |
| RBAC: every route has a permission | ✅ `route-permissions.enumeration.test.ts` | ✅ |
| Reports | ✅ `reports.test.ts` | ✅ figures match |
| POS page UI | ✅ `new/page.test.tsx` | ✅ |

Last full run (9 Oct 2026):

| Package | Passed | Skipped |
|---|---|---|
| web | 1994 | 5 |
| shared | 600 | 10 (emulator-only; 29/29 pass on the emulator) |
| functions | 81 | — |
| print-render | 103 | 3 |
| seed | 46 | — |

Typecheck is clean in every package.

### How to re-run

```bash
firebase emulators:exec --only firestore --project demo-bropics "cd packages/shared && npx vitest run src/billing src/inventory src/whatsapp"
```

For full click-through QA, see the emulator recipe in `docs/LAUNCH_AUDIT.md`, the `web-emulator` launch config on :3100, and the seeded admin user. **Never use the :3000 dev server — it talks to the live project.**

---

## 9. Status summary

| Item | Status |
|---|---|
| Invoice engine, PDF, numbering | BUILT · TESTED |
| POS (new bill, split payment, discount limits, idempotency) | BUILT · TESTED |
| Online invoices & credit notes (functions) | BUILT · TESTED (emulator) |
| Shared stock, reservations, releases, movements | BUILT · TESTED |
| Customers, consent, account linking | BUILT · TESTED |
| Reports | BUILT · TESTED |
| RBAC & audit log | BUILT · TESTED |
| WhatsApp transactional invoices | BUILT · TESTED · MOCKED · REQUIRES EXTERNAL CONFIGURATION |
| WhatsApp campaigns | BUILT · TESTED · MOCKED · REQUIRES EXTERNAL CONFIGURATION |
| WhatsApp delivery statuses / STOP replies (webhook) | BUILT · TESTED (unit) · REQUIRES EXTERNAL CONFIGURATION |
| WhatsApp OTP in production | BLOCKED — waiting for production credentials (unchanged; release freeze) |
| Anything in production | **Not DEPLOYED** — waiting for owner approval |

---

## 10. Going to production (owner approval required for every step)

1. Fill in **Billing Settings**: business name, address, GSTIN, phone, prefixes. Check that **Settings → GST** has the right rate.
2. Mark the variants you keep in stock as tracked on the Inventory page and enter their counts. Made-to-order variants stay untracked.
3. Create the WhatsApp templates above and wait for Meta's approval.
4. Set the env vars (§7) in App Hosting and in the Functions environment (secrets via Secret Manager). Set `WHATSAPP_MODE=cloud`.
5. Configure the webhook in the Meta dashboard.
6. Give staff accounts the right roles.
7. Deploy Firestore/Storage rules, Functions and the web app together, after the owner says go.
8. Smoke test with a ₹1 product: one counter bill, one online order, one return. Check the PDF, the WhatsApp message and the stock.

---

## 11. Known limitations

- **Script support in the PDF:** the font covers Latin and ₹ only. Tamil or other scripts in names or product titles are dropped from the PDF (the website and WhatsApp show them correctly). A Tamil font can be added later if needed.
- **List size caps:** lists filter in memory over a capped window — invoices 3,000 per date range, reports 10,000, message log 1,000, customers 500. Fine for one shop for years; narrow the dates beyond that.
- **Online returns:** stock for delivered online returns is put back by hand (Inventory → adjust, reason `MANUAL_ADJUSTMENT`).
- **Late payments:** if a payment arrives *after* an unpaid order's 24-hour release, its stock is not taken again. Staff should check stock for such orders (rare).
- **Functions need their own env:** without the WhatsApp variables, Functions run in disabled mode in production, so the invoice is created but the WhatsApp send is logged as failed.
- **Bucket mismatch on the emulator:** locally, the Functions emulator stores PDFs in a different bucket from the website, so the PDF route regenerates them on first open. Production uses one bucket.
- **Public settings:** `settings/billing` is publicly readable, like all `settings/*`. Don't put secrets there.
