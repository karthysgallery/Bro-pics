# BroPics Admin Panel: Operator & Developer Manual

> **Control Center for BroPics E-Commerce Operations (India, INR, GST)**  
> **Status:** Code Complete & Verified | **Test Coverage:** 290 Test Suites Passing (1,897 Tests)

---

## 1. Access & Authentication

- **Admin URL:** `http://localhost:3000/admin` (or `https://<domain>/admin`)
- **Isolation:** Standalone dark theme backoffice layout completely isolated from the customer storefront.
- **Instant Test Admin Sign-In:**
  - **Phone:** `+91 9999999999` (or `9999999999`)
  - **OTP:** `123456`
  - Automatically grants `super_admin` privileges in development.
- **Global Keyboard Shortcut:**
  - Press `/` from anywhere in the admin panel to focus the global search bar.

---

## 2. Navigation & Module Overview

```
Overview
├── 📊 Dashboard (/admin) — Real-time revenue KPIs, 30d charts, operational action queues
Catalogue
├── 🖼️ Products (/admin/products) — Multi-tab editor, variant matrices, SKU auto-generation
├── 📁 Categories (/admin/categories) — Hierarchy tree and drag-and-drop sort order
├── ✨ Collections (/admin/collections) — Promotional collections & date windows
├── 📐 Frame Templates (/admin/frame-templates) — Visual slot canvas editor & 300 DPI test-render engine
├── 📦 Inventory Matrix (/admin/inventory) — Stock levels, low-stock threshold alerts, audit ledger
└── 🎨 Media Assets (/admin/media) — Centralized image/video registry with usage count tracking
Operations
├── 📋 Orders Queue (/admin/orders) — Status tabbed orders, customer search, GST invoices
├── 🔍 Photo Validation (/admin/orders/photo-validation) — Low-DPI photo review & re-upload triggers
├── 🖨️ Production Board (/admin/production) — Station Kanban, barcode job sheets, batch ZIP print files
├── 🏷️ QC Terminal (/admin/production/qc) — 5-point barcode quality inspection
├── ⚡ Print Jobs DLQ (/admin/production/jobs) — Cloud Run Sharp render queue & Dead Letter retry panel
└── ↩️ Returns & Refunds (/admin/returns) — Return claims, evidence lightbox, Razorpay refund execution
Logistics
├── 📍 Pincode Coverage (/admin/delivery/serviceability) — 19k+ pincodes, ETA ranges, bulk CSV import
├── 🚚 Shipping Rates (/admin/delivery/rates) — Free shipping threshold, flat fees, express surcharges
├── 🏢 Courier Partners (/admin/delivery/couriers) — Delhivery, Blue Dart, DTDC, Xpressbees tracking templates
└── 📦 Shipments Center (/admin/delivery/shipments) — Outbound parcel tracking & courier handover manifests
Customers & Growth
├── 👥 Customer Directory (/admin/customers) — Customer profiles, LTV, order history, disable account
├── 🎟️ Coupons (/admin/coupons) — Percentage/flat discounts, usage caps, first-order rules
├── ⭐ Reviews (/admin/reviews) — Moderation queue, verified purchase badges, staff replies
└── 📢 Merchandising (/admin/merchandising) — Announcement bar text and featured items sort
Configuration
├── ⚙️ Store & GST Settings (/admin/settings) — Business info, GSTIN (18% GST), Razorpay credentials
├── 🔔 Notifications (/admin/settings/notifications) — SMS, Email, WhatsApp templates & test dispatch
├── 🛡️ Team & Roles (/admin/settings/team) — Staff invitations & 5-tier RBAC permission controls
└── 📜 Audit Trail (/admin/audit) — Immutable append-only log with JSON diff inspector & CSV export
```

---

## 3. Key Operational Workflows

### 3.1 Creating Frame Templates (`/admin/frame-templates`)
1. Select the Product and Frame Variant.
2. Provide the Mockup Overlay Asset URL.
3. Add and drag photo slots over the frame preview; specify exact millimeter sizes (`widthMm`, `heightMm`).
4. Add customizable text zones with typography (Cinzel, Playfair Display, Inter, Caveat).
5. Click **⚡ Run Test Render** to composite sample photos at true 300 DPI print resolution via the Cloud Run Sharp engine.
6. Click **💾 Publish New Version** to atomically publish the template at `version + 1` with `isCurrent: true`.

### 3.2 Low-DPI Customization Validation (`/admin/orders/photo-validation`)
- When customer photos fall below 150 DPI, orders are placed in the validation queue.
- Staff can inspect uploaded dimensions vs required 300 DPI print pixels.
- Staff can click **Approve For Print** or **Request Re-Upload Link** (which dispatches an SMS/Email to the customer).

### 3.3 Fulfillment, QC & Shipping Handover
1. Workshop staff pull orders on the **Production Kanban Board** (`/admin/production`) and print barcode job sheets.
2. Once assembled, the parcel is scanned at the **QC Terminal** (`/admin/production/qc`).
3. If QC passes, order transitions to `packed`.
4. Dispatch manager creates the shipment (`/admin/delivery/shipments`), assigns the courier AWB, and generates the **Courier Manifest** for pickup handover signature.

### 3.4 Returns & Razorpay Refunds (`/admin/returns/[id]`)
- Inspect uploaded defect/damage evidence photos via the in-page Lightbox.
- Staff choose between **Refund Money** (invokes Razorpay refund API with idempotency protection) or **Free Remake** (creates a zero-cost replacement production order).

---

## 4. Technical Architecture & Security

- **Permissions Model:** Enforced server-side in `lib/require-permission.ts` and client-side in `AdminShell.tsx`.
- **Audit Logging:** Every administrative mutation automatically writes an immutable entry to `auditLogs` with actor UID, timestamp, and before/after diffs.
- **Cache Invalidation:** Route mutations invoke targeted revalidation for instant storefront synchronization.
