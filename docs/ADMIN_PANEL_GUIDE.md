# KarthysGallery (BroPics) — Admin Panel Architecture, Features & Operations Manual

> **System:** KarthysGallery / BroPics E-Commerce Backoffice Control Center  
> **Target Audience:** Operators, Workshop Fulfillment Leads, Support Engineers, Developers  
> **Status:** 100% Code Complete & Verified | **Test Suite:** 290 Passed (1,897 Tests)  
> **Tech Stack:** Next.js 15 App Router, React 18, TailwindCSS, Firebase Firestore, Cloud Storage, Cloud Run Sharp Print Render Microservice, Razorpay API.

---

## 1. System Architecture & Access Control

### 1.1 Standalone Dark Backoffice Shell
The Admin Control Center is completely isolated from the customer storefront navigation, footers, and layout chrome. It is housed under `/admin` and powered by `components/admin/AdminShell.tsx`.

* **Theme:** Sleek, high-contrast Dark UI (`bg-[#0B0F17]`, `bg-[#131B26]`, `border-[#1E293B]`, `text-[#F1F5F9]`, `text-[#94A3B8]`).
* **Responsive Layout:**
  - **Desktop ($\ge 1024\text{px}$):** Fixed 260px left sidebar with categorized navigation groups, active route highlighting, user profile badge, and notification indicator.
  - **Mobile & Tablet ($< 1024\text{px}$):** Slide-out navigation drawer with gesture backdrop blur, sticky header with mobile breadcrumbs, and quick-action menu.
* **Global Command Shortcut (`/`):** Pressing `/` anywhere in the admin panel instantly focuses the global navigation & search bar.

### 1.2 Authentication & Quick Test Login
Authentication utilizes Firebase Auth Phone OTP with server-side Role-Based Access Control (RBAC):

* **Admin Portal URL:** `http://localhost:3000/admin` (or `https://<domain>/admin`).
* **Test Admin Access:**
  - **Phone:** `+91 9999999999` (or `9999999999`)
  - **OTP:** `123456`
  - Instantly grants `super_admin` permissions in development mode without external SMS API charges.
* **Production Staff Login:** Real phone numbers receive 6-digit SMS OTP via Firebase Auth; staff roles are validated against the `staff` Firestore collection.

### 1.3 Role-Based Access Control (RBAC) Matrix

| Role | Description | Allowed Permissions |
|---|---|---|
| `super_admin` | Store Owner / System Architect | Full access to all modules, team management, billing, credentials, and destructive actions. |
| `admin` | General Operations Manager | Products, Categories, Collections, Orders, Production, Returns, Delivery, Inventory, Coupons, Reviews. |
| `fulfillment_lead` | Logistics & Dispatch Supervisor | Orders, Production Kanban, QC Terminal, DLQ Jobs, Pincode Serviceability, Couriers, Shipments. |
| `workshop_operator`| Printing & Assembly Technician | Production Kanban, Barcode QC Terminal, Printable Job Sheets, Low-DPI Validation. |
| `support_rep` | Customer Service Agent | Customer Directory, Order Inspector, Return Claims Review, Review Moderation, FAQ/CMS. |

Permissions are verified both client-side (conditionally rendering navigation tabs and buttons) and server-side in `lib/require-permission.ts` (throwing `403 Forbidden` on unauthorized REST API calls).

---

## 2. Executive Dashboard (`/admin`)

The primary command dashboard aggregates real-time business health metrics and highlights operational bottlenecks requiring immediate staff attention.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  EXECUTIVE METRICS                                                                     │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐   │
│  │ Gross Revenue    │ │ Net Revenue      │ │ Total Orders     │ │ Avg Order Value  │   │
│  │ ₹1,48,250        │ │ ₹1,36,750        │ │ 84               │ │ ₹1,765           │   │
│  └──────────────────┘ └──────────────────┘ └──────────────────┘ └──────────────────┘   │
│                                                                                        │
│  30-DAY REVENUE PERFORMANCE                                                            │
│  [ Interactive SVG Multi-Point Revenue Curve with Hover Tooltips ]                     │
│                                                                                        │
│  OPERATIONAL QUEUES                                                                    │
│  ┌─────────────────────────┐ ┌─────────────────────────┐ ┌─────────────────────────┐  │
│  │ 🔍 Low-DPI Review (3)   │ │ 🏷️ Pending QC (7)       │ │ ↩️ Return Claims (2)    │  │
│  └─────────────────────────┘ └─────────────────────────┘ └─────────────────────────┘  │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Key Features:
1. **Financial KPIs:**
   - **Gross Revenue:** Total order value placed across all payment gateways.
   - **Net Revenue:** Gross revenue minus discounts and processed refunds.
   - **Total Orders & Average Order Value (AOV):** Real-time order volume and basket size calculations.
2. **Interactive 30-Day Revenue Trend:** Dynamic SVG line/bar chart displaying daily sales volume.
3. **Action Queues:** One-click shortcut badges leading directly to pending photo validations, QC queues, failed print rendering jobs, and return claims.

---

## 3. Catalogue & Inventory Management

### 3.1 Products Management (`/admin/products`, `/admin/products/new`, `/admin/products/[id]`)
Comprehensive multi-tab editor for managing the entire product catalog:

* **Tab 1: Basic Details:** Product title, slug (auto-generated from title), description (with rich HTML preview), category selector, collection tags, and status toggle (`Active`, `Draft`, `Archived`).
* **Tab 2: Variants & SKU Matrix Generator:**
  - Configurable matrix combining frame sizes (e.g., `8x10 in`, `12x16 in`, `16x20 in`) and frame finishes (`Matte Black`, `Natural Oak`, `Classic Walnut`, `Minimal White`).
  - Automatic SKU generator (`SKU-PROD-SIZE-FINISH`).
  - Per-variant pricing: Base Price, MRP / Strike Price, Cost Price (for gross margin reporting).
  - Physical dimensions: Width (mm), Height (mm), Depth (mm), Packaged Weight (grams) for shipping calculations.
* **Tab 3: Personalization Template Link:** Associates the product with a calibrated 2D Frame Template for customer personalization.
* **Tab 4: Media Gallery:** Drag-and-drop image reordering, hover image assignment, badge pills (`Bestseller`, `New Arrival`, `Staff Pick`).
* **Tab 5: SEO & Meta Data:** Custom page title, meta description, OpenGraph social preview tags.

### 3.2 Category Hierarchy & Reordering (`/admin/categories`)
* Tree view of all catalog categories (`Frames & Wall Decor`, `Canvas Prints`, `Collage & Combo Sets`, `Personalized Gifts`).
* Create, edit, and archive categories with customizable promotional taglines and cover imagery.
* Drag-and-drop sort order determining priority in the storefront navigation bar and mobile drawer.

### 3.3 Curated Collections (`/admin/collections`)
* Group products into curated themes (e.g. *Wedding & Anniversary*, *Baby & Milestones*, *Minimalist Gallery Walls*).
* Set scheduled date windows (Start Date / End Date) for automatic promotional campaign activation.

### 3.4 Inventory Matrix & Low-Stock Alerts (`/admin/inventory`)
* Centralized SKU table tracking real-time stock levels across all variants and raw frame moldings.
* **Low-Stock Thresholds:** Configurable warning levels (e.g. $<10$ units triggers yellow warning, $<3$ units triggers red alert).
* **Quick Restock Modal:** Instant inventory adjustments with mandatory reason logging (`Supplier Delivery`, `Inventory Audit Correction`, `Damaged Stock Written Off`).
* **Inventory Audit Ledger:** Immutable record of all stock adjustments linked to order IDs or staff UIDs.

### 3.5 Media Assets Registry (`/admin/media`)
* Unified Cloud Storage asset manager.
* Filter by media type (`Images`, `Videos`, `Mockup Overlays`, `Vector Clipart`).
* **Usage Count Tracking:** Inspect which products, templates, or homepage banners reference each media asset before deletion to prevent broken links.

---

## 4. Visual Frame Template Studio (`/admin/frame-templates`)

The Frame Template Studio is the visual design engine where admins create, calibrate, test, and publish photo-slot personalization templates for the customer studio.

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│  VISUAL CANVAS EDITOR                                                                  │
│  ┌──────────────────────────────────────────────┐  ┌─────────────────────────────────┐ │
│  │                                              │  │ TEMPLATE PROPERTIES             │ │
│  │   [Transparent Mockup Background Layer]      │  │ • Target Variant: 12x16 Black   │ │
│  │                                              │  │ • Total Photo Slots: 3          │ │
│  │   ┌───────────────┐      ┌───────────────┐   │  │                                 │ │
│  │   │ Slot 1 (4x6") │      │ Slot 2 (4x6") │   │  │ SLOT CONFIGURATION              │ │
│  │   │ x: 15%, y: 20%│      │ x: 55%, y: 20%│   │  │ • Slot #1: 101.6 x 152.4 mm     │ │
│  │   └───────────────┘      └───────────────┘   │  │ • Aspect Ratio: 2:3             │ │
│  │                                              │  │ • Min DPI Requirement: 300      │ │
│  │   ┌──────────────────────────────────────┐   │  │                                 │ │
│  │   │ Text Zone: "Our Story" (Cinzel Font) │   │  │ TEXT ZONES                      │ │
│  │   └──────────────────────────────────────┘   │  │ • Zone 1: Allowed Fonts: Cinzel │ │
│  │                                              │  │ • Max Length: 32 chars          │ │
│  └──────────────────────────────────────────────┘  └─────────────────────────────────┘ │
│                                                                                        │
│  [ ⚡ Run 300 DPI Sharp Test Render ]               [ 💾 Publish New Atomic Version ] │
└────────────────────────────────────────────────────────────────────────────────────────┘
```

### Core Capabilities:
1. **Interactive Coordinate Positioning:** Click and drag photo slots and text zones over the uploaded transparent frame PNG mockup.
2. **Physical Millimeter Precision:** Slot dimensions (`widthMm`, `heightMm`) specify real-world printing sizes, automatically calculating minimum pixel resolution for 300 DPI archival quality.
3. **Typography & Text Zones:**
   - Configure custom text fields (e.g. *Couple Names*, *Wedding Date*, *Family Quote*).
   - Constrain font families (`Cinzel`, `Playfair Display`, `Inter`, `Caveat`).
   - Define minimum and maximum font size boundaries with auto-shrink text fitting.
4. **Instant 300 DPI Cloud Run Sharp Test Render:**
   - Injects sample high-resolution images into the template.
   - Sends payload to the Cloud Run `services/print-render` microservice.
   - Renders a true 300 DPI composite proof in seconds, validating exact mask alignment, bleeding boundaries, and typography rasterization before making the template live.
5. **Atomic Version Publishing:**
   - All published templates are versioned (`v1`, `v2`, `v3`).
   - Existing customer carts and historical orders remain bound to their creation version, preventing layout shifts on past orders when a template is updated.

---

## 5. Fulfillment, Production & Workshop Operations

### 5.1 Order Queue & Detail Inspector (`/admin/orders`, `/admin/orders/[id]`)
* **Status Filter Tabs:** `All`, `Placed`, `Verified`, `In Production`, `Printed`, `QC Passed`, `Packed`, `Shipped`, `Delivered`, `Cancelled`.
* **Search & Filters:** Search by Customer Name, Order Number (`BP-YYYY-XXXXX`), Phone, PIN code, or Date Range.
* **Order Detail View:**
  - High-resolution customer photo preview with DPI readout.
  - Variant specifications (Size, Wood Finish, Matting Border).
  - Live Courier AWB tracking link with one-click copy.
  - Printable GST Tax Invoice generator (`/invoice`).
  - Internal Staff Notes log with timestamp and actor tracking.

### 5.2 Low-DPI Photo Validation Queue (`/admin/orders/photo-validation`)
* **Automated Flagging:** Automatically intercepts orders containing customer photos uploaded under 150 DPI.
* **Staff Review Panel:**
  - Displays uploaded pixel resolution vs minimum required 300 DPI dimensions.
  - **Action 1: "Approve For Print":** Operator confirms the image looks acceptable and moves the order into the production queue.
  - **Action 2: "Request Re-Upload":** Dispatches an automated SMS/Email/WhatsApp notification to the customer with a secure one-click link to upload a higher-resolution photo without re-ordering.

### 5.3 Production Kanban Board (`/admin/production`)
* Workshop operational board with drag-and-drop or single-click status progression:
  1. **To Print:** Awaiting composite generation on the Cloud Run Sharp worker.
  2. **Printing:** Sent to large-format archival pigment printers.
  3. **Mounting:** Matting and substrate dry-mounting station.
  4. **Framing:** Frame assembly, acrylic glazing, corner nailing, and hanger installation.
  5. **Ready for QC:** Assembled frame awaiting barcode scan at the QC terminal.
* **Printable Barcode Job Sheets:** Generates A4 production sheets containing order barcodes, frame dimensions, variant specs, and customer gift notes.
* **Batch ZIP Print Asset Downloads:** One-click download of all high-resolution 300 DPI print files in a ZIP archive for batch printing.

### 5.4 5-Point Barcode QC Terminal (`/admin/production/qc`)
* Designed for barcode scanner hardware at the final packaging bench.
* Operator scans the job sheet barcode to pull up the order.
* **Mandatory 5-Point Checkpoints:**
  - [x] **1. Print Quality:** Sharpness, color fidelity, zero banding or ink spots.
  - [x] **2. Frame Assembly:** 45° corner miter joints tight, wood finish unblemished.
  - [x] **3. Acrylic Cleanliness:** Zero dust, scratches, or fingerprints inside the frame.
  - [x] **4. Matting Symmetry:** Even borders and centered photo placement.
  - [x] **5. Hardware & Packaging:** Wall hangers attached, bubble wrap and edge protectors applied.
* Submitting QC advances the order to `packed` and notifies the dispatch manager.

### 5.5 Print Render DLQ & Background Jobs (`/admin/production/jobs`)
* Real-time monitoring of Cloud Run print render jobs (`queued`, `rendering`, `completed`, `failed`).
* **Dead Letter Queue (DLQ):** Displays error traces for failed renders (e.g. corrupt customer image stream, memory limit).
* **One-Click Retry Trigger:** Resubmits failed jobs directly to the worker queue after error resolution.

---

## 6. Logistics & Delivery Suite

### 6.1 Pincode Serviceability & ETA Matrix (`/admin/delivery/serviceability`)
* Database of 19,000+ Indian Postal PIN codes.
* Configure per-pincode capabilities:
  - Standard Delivery Serviceability (Active/Inactive).
  - Express Shipping Availability.
  - Cash on Delivery (COD) Availability (if enabled).
  - Estimated Transit Days (Min Days / Max Days).
  - Remote / Special Surcharge Flag (e.g., Northeast, Andaman & Nicobar, J&K).
* **Bulk CSV Import & Export:** Upload updated courier serviceability spreadsheets with instant validation.

### 6.2 Shipping Rate Rules Engine (`/admin/delivery/rates`)
* **Free Shipping Threshold:** E.g., Free delivery on orders over ₹1,999.
* **Standard Shipping Fee:** Flat rate applied to orders below the threshold (e.g., ₹99).
* **Express Delivery Surcharge:** Fixed additional charge for express courier transit (e.g., ₹199).
* **Remote Area Surcharge:** Configurable regional surcharge applied dynamically at checkout.

### 6.3 Courier Partner Registry (`/admin/delivery/couriers`)
* Pre-configured courier integrations: **Delhivery**, **Blue Dart**, **DTDC**, **Xpressbees**, **Shadowfax**.
* Configure API credentials, account numbers, and dynamic tracking URL templates (`https://www.delhivery.com/track/package/{{AWB}}`).

### 6.4 Shipments & Courier Handover Manifests (`/admin/delivery/shipments`)
* Outbound shipment center tracking all in-transit parcels.
* Assign single or bulk AWB numbers.
* **Printable Pickup Manifests:** Generates official handover manifests listing all parcels, weights, and destinations for courier pickup driver signature and proof of dispatch.

---

## 7. Customer & Returns Management

### 7.1 Customer Directory (`/admin/customers`, `/admin/customers/[id]`)
* Searchable directory of registered and guest customers.
* **Customer Profile:**
  - Lifetime Value (LTV) and total orders placed.
  - Saved delivery address book.
  - Full chronological order history.
  - Account status toggle (`Active` / `Disabled`).

### 7.2 Return & Defect Claim Inspector (`/admin/returns`, `/admin/returns/[id]`)
* Customer return claims filed within 7 days of delivery.
* **Evidence Photo Lightbox:** Inspect customer-uploaded photos of damaged frames, defective printing, or broken glass in full resolution.
* **Resolution Actions:**
  - **Option A: "Approve Refund":** Triggers Razorpay refund API for full or partial amounts with server-side idempotency protection.
  - **Option B: "Approve Remake":** Automatically spawns a ₹0 replacement production order with priority workshop flag.
  - **Option C: "Reject Claim":** Sends customer rejection rationale with policy citations.

---

## 8. Growth, Merchandising & CMS Content

### 8.1 Coupons & Promotions Engine (`/admin/coupons`)
* Create custom promotional coupon codes (`SUMMER10`, `WELCOME200`, `FREESHIP`).
* **Discount Types:**
  - Percentage Discount (e.g. 15% off).
  - Flat Paise Discount (e.g. ₹200 off).
  - Free Shipping Override.
* **Rules & Constraints:**
  - Minimum Order Value threshold.
  - Per-User Usage Limit (e.g., 1 per customer).
  - Total Global Usage Cap (e.g., first 500 customers).
  - First-Order Only Flag.
  - Active Date Range (Start Date $\rightarrow$ Expiry Date).

### 8.2 Review Moderation Queue (`/admin/reviews`)
* Moderate customer reviews and photo submissions.
* Star rating filters ($1\text{--}5$ stars) and verified purchase badge validation.
* **Actions:** Approve for public display, Reject inappropriate content, Publish official Staff Public Reply.

### 8.3 Storefront Merchandising (`/admin/merchandising`)
* **Announcement Bar:** Edit top banner announcement message, background color, and CTA destination link.
* **Featured Collection Carousel:** Choose and order the collections highlighted on the homepage.

### 8.4 CMS Pages & Dynamic Content (`/admin/pages`, `/admin/faqs`, `/admin/homepage`)
* **Policy Pages:** Rich HTML editor for Shipping Policy, Return & Refund Policy, Privacy Policy, Terms of Service.
* **FAQ Manager:** Group questions by category (`Framing & Materials`, `Shipping & Delivery`, `Photo Quality & Studio`).
* **Homepage Sections:** Reorder homepage carousels, testimonials, and video banners.

---

## 9. Security, Team & System Configuration

### 9.1 Immutable Append-Only Audit Trail (`/admin/audit`)
* Every administrative mutation across products, templates, orders, inventory, settings, and staff writes an immutable audit record to Firestore.
* **Captured Fields:** Timestamp, Actor UID, Actor Email, Assigned Role, Target Resource (`orders`, `products`, `settings`), Action (`create`, `update`, `delete`, `refund`), and full before/after JSON state diffs.
* **Search & Export:** Filter by operator or date range and export to CSV.

### 9.2 Team Management & Invitations (`/admin/settings/team`)
* Invite new staff members via cryptographically secure single-use invitation tokens.
* Assign RBAC roles (`admin`, `fulfillment_lead`, `workshop_operator`, `support_rep`).
* Revoke staff access or reset roles instantly.

### 9.3 Store Configuration & Notifications (`/admin/settings`, `/admin/settings/notifications`)
* **Store Profile & GST:** Legal Business Name, Trade Name, Registered Address, PAN, and GSTIN (18% GST rate rules).
* **Payment Credentials:** Razorpay Key ID and Webhook Secret configuration.
* **Notification Templates:** Customize SMS, Email, and WhatsApp templates with live test dispatch tools.

---

## 10. Complete Admin Routes & REST API Directory

### 10.1 Frontend Page Routes

| Route | Module | Purpose |
|---|---|---|
| `/admin` | Dashboard | Executive financial KPIs, revenue charts, action queues |
| `/admin/products` | Catalogue | Product list, filters, status toggles |
| `/admin/products/new` | Catalogue | New product multi-tab creation form |
| `/admin/products/[id]` | Catalogue | Edit product details, SKU matrix, pricing, media |
| `/admin/categories` | Catalogue | Category hierarchy tree & drag-and-drop sort |
| `/admin/collections` | Catalogue | Promotional collections & scheduled date campaigns |
| `/admin/frame-templates` | Studio | Visual 2D coordinate slot & text zone canvas editor |
| `/admin/inventory` | Inventory | SKU stock levels, low-stock alerts, restock modal |
| `/admin/media` | Media | CDN asset registry with usage counter tracking |
| `/admin/orders` | Operations | Status-filtered order queue, customer search |
| `/admin/orders/[id]` | Operations | Order details, customer photo inspection, GST invoice |
| `/admin/orders/photo-validation`| Operations | Low-DPI photo review (<150 DPI) & re-upload triggers |
| `/admin/production` | Operations | Workshop Kanban board, batch ZIP print downloads |
| `/admin/production/qc` | Operations | 5-point barcode quality inspection terminal |
| `/admin/production/jobs` | Operations | Cloud Run Sharp print render jobs & DLQ monitor |
| `/admin/returns` | Operations | Return claims directory |
| `/admin/returns/[id]` | Operations | Defect photo evidence lightbox, Razorpay refund / remake |
| `/admin/delivery/serviceability`| Logistics | 19k+ PIN codes, ETA ranges, bulk CSV import/export |
| `/admin/delivery/rates` | Logistics | Free shipping thresholds, express & remote surcharges |
| `/admin/delivery/couriers` | Logistics | Delhivery, Blue Dart, DTDC, Xpressbees tracking templates |
| `/admin/delivery/shipments` | Logistics | Outbound parcel tracking & courier pickup manifests |
| `/admin/customers` | Customers | Customer directory, LTV, order counts |
| `/admin/customers/[id]` | Customers | Customer profile, address book, account disable/enable |
| `/admin/coupons` | Growth | Percentage/flat discounts, usage limits, date windows |
| `/admin/reviews` | Growth | Review moderation, photo submissions, staff replies |
| `/admin/merchandising` | Growth | Top announcement bar & featured collection sort |
| `/admin/pages` | CMS | Rich HTML policy and guide page manager |
| `/admin/faqs` | CMS | Structured FAQ categories and answers |
| `/admin/homepage` | CMS | Homepage sections, banners, video carousel curation |
| `/admin/settings` | Settings | Legal entity, GSTIN, Razorpay credentials |
| `/admin/settings/notifications`| Settings | SMS, Email, WhatsApp notification templates |
| `/admin/settings/team` | Settings | Staff invitations & RBAC role assignments |
| `/admin/audit` | Security | Append-only audit logs with JSON diffs & CSV export |

### 10.2 Backend REST API Endpoints

| Endpoint | Method | Role Required | Action |
|---|---|---|---|
| `/api/admin/dashboard` | `GET` | `admin` | Real-time financial KPIs, 30d revenue chart, queue counts |
| `/api/admin/products` | `GET`, `POST` | `admin` | List products / create new product |
| `/api/admin/products/[id]` | `GET`, `PATCH`, `DELETE` | `admin` | Fetch, update, or archive product |
| `/api/admin/categories` | `GET`, `POST`, `PATCH` | `admin` | Manage categories and sort order |
| `/api/admin/frame-templates` | `GET`, `POST` | `admin` | List templates / create new template |
| `/api/admin/frame-templates/[id]` | `GET`, `PATCH`, `DELETE`| `admin` | Fetch, update, or delete template |
| `/api/admin/frame-templates/[id]/test-render` | `POST` | `admin` | 300 DPI Cloud Run Sharp composite test render |
| `/api/admin/inventory` | `GET`, `PATCH` | `admin` | Fetch SKU stock levels / adjust stock with audit log |
| `/api/admin/media` | `GET`, `POST`, `DELETE` | `admin` | Upload asset, list registry, delete with usage check |
| `/api/admin/orders` | `GET` | `orders:view` | Filtered order list with search & pagination |
| `/api/admin/orders/[id]` | `GET`, `PATCH` | `orders:view` | Fetch order details / update status |
| `/api/admin/orders/[id]/validate-photo` | `POST` | `orders:update`| Approve low-DPI photo or trigger re-upload notice |
| `/api/admin/production/batch-zip` | `POST` | `production:manage` | Generate bulk ZIP archive of 300 DPI print files |
| `/api/admin/production/qc-scan` | `POST` | `production:manage` | Verify barcode & submit 5-point QC pass |
| `/api/admin/production/jobs/retry` | `POST` | `production:manage` | Retry failed print rendering task from DLQ |
| `/api/admin/returns/[id]/resolve` | `POST` | `orders:refund` | Execute Razorpay refund or create ₹0 remake order |
| `/api/admin/delivery/serviceability` | `GET`, `POST` | `delivery:manage` | Fetch PIN codes / bulk CSV import serviceability |
| `/api/admin/delivery/rates` | `GET`, `PUT` | `delivery:manage` | Get or update shipping rate rules |
| `/api/admin/delivery/couriers` | `GET`, `POST`, `PATCH` | `delivery:manage` | Manage courier partner integrations & tracking URLs |
| `/api/admin/delivery/manifest` | `POST` | `delivery:manage` | Generate printable pickup handover manifest |
| `/api/admin/customers` | `GET` | `admin` | Search and list customer profiles with LTV |
| `/api/admin/customers/[id]/status` | `PATCH` | `users:manage` | Enable or disable customer account |
| `/api/admin/coupons` | `GET`, `POST`, `PATCH`, `DELETE`| `admin` | Manage discount coupons, limits, date rules |
| `/api/admin/reviews/[id]` | `PATCH`, `DELETE` | `admin` | Approve, reject, or reply to customer review |
| `/api/admin/settings` | `GET`, `PUT` | `settings:manage`| Get or update store GST and Razorpay credentials |
| `/api/admin/staff/invite` | `POST` | `super_admin` | Generate staff invitation token link |
| `/api/admin/audit` | `GET` | `audit:view` | Query immutable audit logs with before/after diffs |

---

## 11. Operational Runbook & Summary

The KarthysGallery Admin Panel provides a comprehensive, resilient, and fully auditable operating environment:

* **Production Speed:** Zero layout shifts, sub-second route transitions, and keyboard-driven efficiency.
* **Hardware Ready:** Seamlessly integrates with barcode scanners and receipt/label printers.
* **Error Tolerant:** Dead Letter Queue monitors background print jobs with one-click re-rendering.
* **Financial Compliance:** Complete GST 18% tax calculation, printable invoices, and idempotent Razorpay refund execution.
* **Mobile Ready:** Operators and managers can inspect queues, approve photos, and manage orders from any phone, tablet, or workstation.
