# Production deployment requirements

Status 2026-10-17. **Nothing here has been executed.** This lists what each piece needs; deployments happen only after the
owner's explicit approval, in the order of `docs/REAL_ORDER_ACCEPTANCE_TEST.md` section 0. Secret values are never written in docs or chat:
they live in Secret Manager (names only below).

## 1. Cloud Functions (16 exported triggers, runtime now Node 22 in `firebase.json`)
Runtime change (local, uncommitted until you approve): `firebase.json` `nodejs20` → `nodejs22`, and esbuild `--target=node22`.
Verified locally: typecheck, 14 test files / 81 tests, and the bundle build pass on Node 20.20 and Node 25.8; the bundle loads and exports all 16 functions.
**NOT VERIFIED:** an actual deploy on the Node 22 runtime (needs the deploy itself). `firebase-functions 6.6.0` and `firebase-admin 12.7.0` have no engine limits.

| # | Function | Trigger | Region | Status live | Needs |
|---|---|---|---|---|---|
| 1 | `onVariantWritten` | Firestore `products/{id}/variants/{id}` | asia-south1 (trigger) | deployed | datastore |
| 2 | `onMediaWritten` | Firestore `products/{id}/media/{id}` | asia-south1 (trigger) | deployed | datastore |
| 3 | `reconcileSessionOnLogin` | (login reconcile) | us-central1 | deployed 2026-10-07 | datastore, auth |
| 4 | `onReviewWritten` | Firestore `reviews/{id}` | asia-south1 (set in code) | **not deployed** | datastore |
| 5 | `razorpayWebhook` | HTTPS | asia-south1 (set in code) | **not deployed** | secret `RAZORPAY_WEBHOOK_SECRET` (env), datastore |
| 6 | `reconcileStuckOrders` | schedule every 15 min | asia-south1 (set in code) | **not deployed** | datastore only (it reads Firestore and writes a report; it does not call Razorpay) |
| 7 | `cleanupStaleSessions` | schedule daily | asia-south1 (set in code) | **not deployed** | datastore |
| 8 | `rollupDailyAnalytics` | schedule daily 19:00 | asia-south1 (set in code) | **not deployed** | datastore |
| 9 | `dispatchPrintJob` | Firestore `printJobs/{id}`, timeout 540 s | asia-south1 | **not deployed** | `PRINT_RENDER_URL`, `run.invoker` on print-render |
| 10 | `sweepPrintJobs` | schedule every 5 min | asia-south1 | **not deployed** | same as 9 |
| 11 | `recordBudgetAlert` | Pub/Sub topic `billing-budget-alerts` | asia-south1 | **not deployed** | the topic + a Billing budget publishing to it |
| 12 | `releaseStockOnCancel` | Firestore `orders/{id}` update | asia-south1 | **not deployed** | datastore |
| 13 | `releaseUnpaidStock` | schedule hourly (IST) | asia-south1 | **not deployed** | datastore |
| 14 | `invoiceOnPayment` | Firestore `orders/{id}` write, retries on | asia-south1 | **not deployed** | datastore, Storage write (invoice PDFs), WhatsApp transport stays disabled |
| 15 | `creditNoteOnRefund` | Firestore `orders/{id}/refunds/{id}` write | asia-south1 | **not deployed** | same as 14 |
| 16 | `sendWhatsAppCampaigns` | schedule every 5 min | asia-south1 | **not deployed** | **keep it harmless**: disabled transport; no campaigns exist |

Project APIs needed for 4–16: Cloud Functions, Cloud Run, Cloud Build, Artifact Registry, Eventarc, Cloud Scheduler, Pub/Sub (11). **NOT VERIFIED** which are enabled; the first deploy reports missing ones.
Deploy identity: the account that runs `firebase deploy` must be the project owner (the CLI's saved account `allwinedwinofficial@gmail.com` gets 403 on this project; use `--account karthysgallery@gmail.com`).
Functions run as the default compute service account `991383044884-compute@developer.gserviceaccount.com` (as used by the 3 deployed ones). It needs (verify, do not assume): `roles/datastore.user`, Storage object write on the bucket for invoices, `roles/run.invoker` on `print-render`, `roles/secretmanager.secretAccessor` for any secret it reads.
Note: Cloud Functions on this plan run `us-central1` for `reconcileSessionOnLogin`; leave it, because moving it would create a second copy.

## 2. Print-render service (Cloud Run, private) — not deployed
Source: `services/print-render`, deploy runbook `services/print-render/DEPLOY.md`. Image base `node:20-slim` (a container; the Cloud Functions Node 20 shutdown does not apply; upgrading it is optional and would need a render re-test, so it is left as is).
- Service account `print-render@bropics-app.iam.gserviceaccount.com` with `roles/datastore.user` (project) and `roles/storage.objectAdmin` on `gs://bropics-app.firebasestorage.app`.
- Deploy flags from the runbook: `--no-allow-unauthenticated --memory 2Gi --cpu 2 --concurrency 1 --max-instances 5 --timeout 540`. (An older checklist says 8 GiB / 2 CPU for the background-removal model; **decide before deploying**: the runbook and the go-live note disagree, so the first test render must confirm memory is enough.)
- Env: `FIREBASE_STORAGE_BUCKET=bropics-app.firebasestorage.app`, `GCLOUD_PROJECT=bropics-app`. Optional: `CUTOUT_MODEL_PATH`, `PRINT_RENDER_FONTS_DIR` (defaults bundled).
- Pre-build: `pnpm --filter @bro-pics/print-render fetch-model` and `download-fonts` (a download from the model/font hosts; needs your OK when run).
- Invoker: only the Functions' service account (`run.invoker`); verify `POST /render/x` without a token returns 403 and `/health` with a token returns 200 with `fonts.rendering.ok: true`.
- Web link: `CUTOUT_SERVICE_URL` (or `PRINT_RENDER_URL`) on the website service + `run.invoker` for `karthys-web@…` so the customer cut-out route works. **Currently unset**, so that feature is off.
- Functions link: `functions/.env.bropics-app` `PRINT_RENDER_URL=<service url>`, `PRINT_DISPATCH_AFTER=<ISO time of go-live>` (empty today = dispatcher off).
- Deploy order: website live → print-render → `firebase deploy --only functions:dispatchPrintJob,functions:sweepPrintJobs`.

## 3. Website (Cloud Run `karthys-gallery`, asia-south1, SA `karthys-web@bropics-app.iam.gserviceaccount.com`)
Project roles seen: `datastore.user`, `firebaseauth.admin` (plus bucket and secret bindings added earlier). Env and secrets (names only):

| Variable | Current live value/state | Production value |
|---|---|---|
| `SITE_PREVIEW` | `1` | `0` at go-live (build arg `_SITE_PREVIEW` in `cloudbuild-deploy.yaml` **and** the service env) |
| `NEXT_PUBLIC_SITE_URL` | run.app address | `https://karthysgallery.in` (build arg `_SITE_URL` + env) |
| `SEO_CANONICAL_ORIGIN` | unset (code default `https://karthysgallery.in`) | leave unset |
| `NEXT_PUBLIC_WHATSAPP_NUMBER` | build placeholder `910000000000` live; `916369284351` in local commit `f2db7b5` | `916369284351` (customer chat; unchanged) |
| `SESSION_SECRET` | secret ✓ | keep |
| `PAYMENT_PROVIDER` | `razorpay` ✓ | keep |
| `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | secrets ✓ (live keys) | keep; no live payment made yet |
| `WHATSAPP_OTP_MODE` | unset | `production` |
| `WHATSAPP_PHONE_NUMBER_ID` | unset | `1280515481821881` |
| `WHATSAPP_OTP_TEMPLATE_NAME` | unset | `karthys_auth_otp` |
| `WHATSAPP_ACCESS_TOKEN` | secret `whatsapp-access-token` stored, not attached | attach |
| `WHATSAPP_APP_SECRET` | secret `whatsapp-app-secret` stored, not attached | attach only with the inbound webhook |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | none | create a random secret if the delivery-report webhook is enabled |
| `WHATSAPP_MODE` | unset | **`disabled`** until transactional templates are approved |
| `ADMIN_MFA` | unset (on) | leave unset; never `off` in production |
| `OTP_STORE` | unset | **NOT VERIFIED** default in production (`otp-store.ts` line 204); confirm it uses Firestore, not memory |
| `PIXABAY_API_KEY` | secret ✓ (rotate; it was pasted in chat) | keep, rotate |
| `CUTOUT_SERVICE_URL` / `PRINT_RENDER_URL` | unset | set after print-render deploy |
| `BILLING_PROJECT_ID`, `BILLING_EXPORT_TABLE`, `BIGQUERY_ENDPOINT` | unset | only for the Running costs page; needs a BigQuery billing export (not set up) |

Build: Cloud Build trigger `deploy-karthys-gallery` on branch `master` (`apps/web/cloudbuild-deploy.yaml`; machine `E2_STANDARD_2`). Substitution `_FIREBASE_API_KEY` must be set on the trigger.

## 4. Webhooks and external dependencies
- **Razorpay → `razorpayWebhook`** (HTTPS function URL printed after deploy). Events (verified in `functions/src/webhooks/razorpay.ts`): `payment.captured`, `payment.failed`, `refund.processed`, `refund.failed`; anything else is ignored. Secret: `RAZORPAY_WEBHOOK_SECRET` as a function env/secret (the function reads `process.env.RAZORPAY_WEBHOOK_SECRET`). The functions never use the Razorpay API keys (only the website's verify-payment route does), so no key needs to be given to the functions; only the webhook secret.
- **Meta WhatsApp:** business verified; OTP number registered; template `karthys_auth_otp` approved. Utility templates **not created**: `karthys_invoice`, `karthys_order_confirmed`, `karthys_payment_received`, `karthys_order_shipped`. Delivery-report webhook not configured (app is unpublished/in development, the dashboard warns it will not deliver production webhooks until published). Prepaid balance ₹50; OTP stops at ₹0.
- **Firebase Hosting:** rewrites `**` to Cloud Run (live). Domain `karthysgallery.in` + `www` active. A stale-edge-cache incident happened once; a Hosting release purges it.
- **Google Cloud:** TTL policy on `otpSessions.expireAt` (not set), PITR/backups (not set), budget alert ₹300 (not set), Firebase web API key restrictions, Pub/Sub topic for budget alerts.
- **Domain email / support mailbox**, Search Console, Razorpay dashboard (KYC, settlement account, webhook), Meta Business payment method.
- **Stock photo search** (Pixabay) is optional for the admin.

## 5. Rules
- Firestore: live == repo (released 2026-10-10). No deploy needed.
- Storage: live deny-all (2026-09-01). **Do not deploy `storage.rules`** until the access review in `docs/PRODUCTION_LAUNCH_AUDIT.md` §4 is signed off.

## 6. Rollback notes
- Website: Cloud Run keeps previous revisions; traffic can be moved back (`gcloud run services update-traffic`).
- Functions: redeploying previous code; schedulers can be paused. Deleting data is not reversible without a backup (take one first).
- Meta/Razorpay changes are in their dashboards.

## Added 2026-10-17: what deploying the business-settings work changes (nothing has been deployed)

* No new infrastructure, secrets or environment variables are required.
* No Firestore index or rules change is required (the readiness API uses a single-field query and `select`; no new composite index).
* Behaviour that changes for customers the moment this build is live: policy pages show a neutral holding notice until each is approved and published; checkout refuses delivery to states that have no charge (set the charges, or a fallback, before opening the shop); WhatsApp contact buttons are hidden until a number is saved; `/policies` redirects to the shipping policy; the Shipping Rates admin page is replaced by a pointer to Settings.
* An existing `settings/shipping` document with the old threshold/flat fields is not deleted or rewritten; those fields are simply ignored. Saving the new Shipping form replaces the document with the state-based one.
* Rollback: redeploy the previous Cloud Run revision (no data migration to undo).
* Owner steps before opening: fill the business profile and policy wording, set shipping charges, set returns decisions, approve and publish the eight pages (see `docs/LEGAL_OWNER_REVIEW_CHECKLIST.md`).


## Added 2026-10-17 (verification pass)

* **Firestore rules change in the repo (not deployed):** `pages` is readable only when `isPublished == true`. Deploy together with the web release (the site does not read `pages` from the browser, so there is no ordering risk). Verified by rules tests (58 pass, local emulator). Do **not** deploy `storage.rules` (it would open reads); the live deny-all stays.
* **New permission `policies:approve`** (super_admin, admin). Existing custom claims need no change. Roles that had `settings:write` (marketing_manager) can still edit SEO/header/footer/theme but no longer shipping, returns, store profile, policy wording, GST or page approval.
* **Optional data step (owner approval, writes data):** import the India Post PIN directory into `shippingServiceability` (see the verification report §4) to verify Tamil Nadu/Puducherry PINs.
* **Rollback:** previous Cloud Run revision (`karthys-gallery-00022-kn8` is current); previous rules file from git; no data migration to undo.
* The build step downloads Google Fonts; one build attempt failed on that fetch and the retry passed. If Cloud Build shows `next/font` errors, re-run it.
