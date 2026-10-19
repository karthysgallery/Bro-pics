# Handover Document: Verification & State Audit (Antigravity -> Claude)

**Document Date:** 2026-10-18 / 2026-10-19  
**Target Next Agent:** Claude (when usage limit resets)  
**Safety Protocol:** Strict read-only against production. Zero commits made. Zero branches switched. Zero deploys. `WHATSAPP_MODE=disabled` unchanged. All existing local changes preserved.

---

## 1. Current Git Branch
- **Branch:** `San's(FE)`
- **Ahead of origin:** 118 commits (local commits preserved, unpushed)
- **Status:** Uncommitted working tree modifications preserved exactly as inherited.

---

## 2. Initial and Final Git Status

### Initial Status
- 24 modified tracked files across `apps/web`, `packages/shared`, `functions`, `firestore-rules-tests`, and `docs`.
- Untracked directories and files for the WhatsApp CRM features:
  - `apps/web/app/admin/whatsapp/contacts/`
  - `apps/web/app/admin/whatsapp/templates/`
  - `apps/web/app/api/admin/marketing/campaigns/[id]/report/`
  - `apps/web/app/api/admin/marketing/campaigns/campaign-routes.test.ts`
  - `apps/web/app/api/admin/whatsapp/contacts/`
  - `apps/web/app/api/admin/whatsapp/pricing/`
  - `apps/web/app/api/admin/whatsapp/templates/`
  - `functions/src/whatsapp/`
  - `packages/shared/src/whatsapp/` (consent, contact-import, order-notifications, order-sender, template-registry, templates)
  - `docs/WHATSAPP_DEPLOYMENT_AND_OPERATIONS.md`
  - `docs/WHATSAPP_META_SETUP_GUIDE.md`
  - `docs/WHATSAPP_READINESS_REPORT.md`

### Final Status
- Working tree preserved identical to initial state, plus this handoff document (`docs/ANTIGRAVITY_HANDOFF.md`) and non-invasive helper test scripts in `scratch/`.
- No files were deleted, overwritten, or reset.
- Next.js build file `apps/web/next-env.d.ts` touched during `next build` was cleanly checked out to maintain clean diffs.

---

## 3. Files Changed / Added by Antigravity Session
- **Created:** `docs/ANTIGRAVITY_HANDOFF.md` (this handoff file)
- **Scratch helpers (local testing only, untracked):**
  - `scratch/setup-qa-mfa.ts` (enrolling test admin MFA in local emulator)
  - `scratch/get-totp.ts` (generating matching TOTP code locally)

---

## 4. Existing Local Changes Preserved
All modifications implemented by the previous session remain intact in the working tree:
1. `apps/web/app/admin/marketing/whatsapp/page.tsx` (Campaign UI with template checks, audience recomputation, pause/resume/cancel/retry)
2. `apps/web/app/admin/whatsapp/messages/page.tsx` (Message log viewer with number masking)
3. `apps/web/app/api/admin/marketing/audience/route.ts` & `campaigns/` (Audience calculation, send gate, report CSV)
4. `apps/web/app/api/admin/whatsapp/messages/route.ts` (Admin message log endpoint)
5. `apps/web/app/api/route-permissions.enumeration.test.ts` (Permission enforcement enumeration)
6. `apps/web/app/api/webhooks/whatsapp/route.ts` & test (HMAC-SHA256 signature verification, verify token, STOP/START handling)
7. `apps/web/components/admin/AdminShell.tsx` (Admin navigation links)
8. `apps/web/lib/billing/server.ts` (MFA gate enforcement on billing & WhatsApp admin routes)
9. `apps/web/lib/services/whatsapp/CloudWhatsAppOtpProvider.ts` (Configurable `WHATSAPP_GRAPH_VERSION`, default `v25.0`)
10. `firestore.indexes.json` (Composite indexes for WhatsApp message retries and customer consent queries)
11. `functions/src/index.ts` & `functions/src/whatsapp/` (Order change listener `whatsappOnOrderChange` and retry scheduler `whatsappRetryFailed`)
12. `packages/shared/src/auth/permissions.ts` (New granular WhatsApp permissions: `whatsapp:contacts_import`, `whatsapp:consent_edit`, `whatsapp:campaign_send`, `whatsapp:templates_manage`, `whatsapp:export`, `whatsapp:logs`)
13. `packages/shared/src/whatsapp/` (Complete suite: `contact-import.ts`, `consent.ts`, `templates.ts`, `template-registry.ts`, `order-notifications.ts`, `order-sender.ts`, `campaigns.ts`, `service.ts`)

---

## 5. Work Completed
1. **Full Codebase & Git Inspection:**
   - Detailed reconciliation of commit history (118 local commits on `San's(FE)`).
   - Reconciled all documentation against actual source code files.
2. **Typecheck Across Monorepo:**
   - Executed `pnpm typecheck` across all 6 workspace packages (`functions`, `packages/shared`, `services/print-render`, `scripts/seed`, `apps/web`). Result: **PASS** (0 errors).
3. **Automated Unit & Integration Test Suites:**
   - Ran `pnpm test` across all packages:
     - Total: **330 test files passed, 3 skipped**.
     - Tests: **2,243 tests passed, 31 skipped** (0 failures).
     - `packages/shared`: 807 passed.
     - `functions`: 85 passed.
     - `scripts/seed`: 46 passed.
4. **Firestore & Storage Security Rules Verification:**
   - Located installed OpenJDK 21 at `/opt/homebrew/opt/openjdk@21`.
   - Executed `JAVA_HOME=/opt/homebrew/opt/openjdk@21 pnpm test:rules` with local Firebase emulators.
   - Result: **PASS (73 passed across 2 test files)**:
     - 59 Firestore rules tests (including 15 tests verifying WhatsApp collections are server-only deny-all).
     - 14 Storage rules tests.
5. **Production Build:**
   - Executed `pnpm --filter @bro-pics/web build`.
   - Result: **PASS (Exit code 0)**.
   - Successfully compiled 218 static and dynamic routes (including all new admin WhatsApp pages and API routes).
6. **Local Emulator Environment Spin-Up & Test Seeding:**
   - Successfully started Firebase emulators (Auth `9099`, Firestore `8080`, Storage `9199`, UI `4000`).
   - Successfully seeded test accounts (`qa_admin`, `qa_customer`) and full product catalogue.
   - Verified Next.js dev server running on port `3000` with emulator environment flags.

---

## 6. Work Not Completed / Blocked
1. **End-to-End Browser Flow with Subagent:**
   - Launched `browser_subagent` to test the new Admin screens against `http://localhost:3000`.
   - Subagent successfully accessed the sign-in and hit the live `AdminMfaGate`.
   - The subagent encountered the TOTP authenticator setup flow and attempted external online TOTP generation; the user manually skipped/cancelled the subagent task.
   - Per explicit instructions: **Do not claim browser testing passed if you only ran API tests.** Browser verification is marked **NOT FULLY TESTED / BLOCKED BY MANUAL SKIP**.
2. **Real Meta WhatsApp Calls:**
   - Blocked by design: requires approved Meta message templates, verified webhook configuration, secret attachment, and owner approval to change `WHATSAPP_MODE`.

---

## 7. Exact Tests Executed and Results

| Suite / Command | Scope | Result |
|---|---|---|
| `pnpm typecheck` | Monorepo typechecking | **PASS** (6 packages, 0 errors) |
| `pnpm test` | Unit/integration tests | **PASS** (330 files passed, 2,243 tests passed, 31 skipped) |
| `pnpm test:rules` | Firestore + Storage rules | **PASS** (73 tests passed in emulator) |
| `pnpm --filter @bro-pics/web build` | Production Next.js build | **PASS** (218 routes generated cleanly) |
| `curl http://localhost:3000/signin` | Local dev server availability | **PASS** (HTTP 200) |
| Route Permission Enumeration | 84 admin endpoints | **PASS** (401 anonymous, 403 unauthorized role/customer) |
| Cloud Functions | WhatsApp order trigger & retry | **PASS** (85 tests) |
| Rules Isolation | 7 WhatsApp collections | **PASS** (15 deny-all assertions) |

---

## 8. Browser Tests Performed

- **Status:** **ATTEMPTED & PARTIALLY OBSERVED / USER SKIPPED**
- **Details:**
  - Automated browser subagent loaded `http://localhost:3000/signin?mode=password&redirect=/admin/whatsapp/contacts`.
  - Admin login form with phone and password loaded correctly (HTTP 200).
  - Admin access gate (`AdminMfaGate`) triggered as designed, enforcing TOTP enrollment/verification.
  - The subagent navigated to an online TOTP generator to calculate matching codes for the dynamic secret; the user cancelled the subagent turn before the subagent completed the multi-page navigation.
  - Therefore, live visual verification of the Contacts, Templates, Campaigns, and Messages screens in a headless browser is documented as **NOT COMPLETE**.

---

## 9. Bugs Discovered and Fixed
- **JDK Path for Firebase Emulators:**
  - Running `pnpm test:rules` failed initially with `Unable to locate a Java Runtime`.
  - Discovered Homebrew OpenJDK 21 installed at `/opt/homebrew/opt/openjdk@21`, which is not on the default macOS shell PATH.
  - Resolved execution by invoking commands with `JAVA_HOME=/opt/homebrew/opt/openjdk@21 PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"`.
- **Next.js `next-env.d.ts` Route Artifact:**
  - Building locally touched `next-env.d.ts` pointing to `.next/types/routes.d.ts`. Reverted to preserve clean working tree.

---

## 10. Remaining Security Issues & Architectural Guarantees
1. **Authenticator Step on Admin Routes:**
   - `lib/billing/server.ts` now enforces `hasMfaProof` on all billing and WhatsApp admin routes.
   - Authenticator proof must be preserved on any new admin routes added in the future.
2. **Deny-All Collection Rules:**
   - 7 WhatsApp collections (`customers`, `whatsappSuppressions`, `whatsappImports`, `whatsappTemplates`, `whatsappConfig`, `whatsappMessages`, `whatsappCampaigns`) have default-deny client rules. Only Admin SDK / Cloud Functions can read/write them.
3. **Data Protection in Logs & Reports:**
   - Message logs mask phone numbers (showing last 4 digits only) unless the requesting staff member possesses `customers:read`.
   - Campaign CSV export only includes sanitized recipient status and masked numbers.
4. **Strict Isolation of WhatsApp Transports:**
   - Login OTP uses `CloudWhatsAppOtpProvider` (independent of `WHATSAPP_MODE`).
   - Transactional & Marketing use `transportFromEnv()`, which remains hard-disabled when `WHATSAPP_MODE=disabled`.

---

## 11. Meta Configuration Still Required (REQUIRES META ACTION)
1. **WABA Utility Templates Approval:**
   - `karthys_order_confirmed` (UTILITY)
   - `karthys_order_processing` (UTILITY)
   - `karthys_order_shipped` (UTILITY)
   - `karthys_order_delivered` (UTILITY)
   - `karthys_order_cancelled` (UTILITY)
   - `karthys_refund_status` (UTILITY)
   - `karthys_invoice` (UTILITY, Document header)
2. **Marketing Templates Approval:**
   - Festival / promotional templates must be created in WhatsApp Manager and approved by Meta before any campaign can be launched.
3. **Webhook Setup:**
   - Meta App Dashboard -> WhatsApp Configuration -> Webhook Callback URL: `https://karthysgallery.in/api/webhooks/whatsapp`.
   - Subscribe to `messages` and `message_template_status_update`.
   - Store `WHATSAPP_WEBHOOK_VERIFY_TOKEN` and `WHATSAPP_APP_SECRET` in Google Secret Manager.
4. **Billing & Funding:**
   - Top-up prepaid balance in WhatsApp Manager and establish payment method.

---

## 12. Required Owner Decisions (REQUIRES OWNER INPUT)
1. **Offline Customers Marketing Consent:**
   - Standardized consent wording compliant with DPDP Act 2023.
   - Physical or digital proof collection for the ~500 existing offline customers.
2. **Business Details & Policies:**
   - Confirmation of legal business entity, Udyam registered address, support email, grievance officer details.
   - Policy pages approval in Admin -> Pages.
3. **Catalogue / Seed Data:**
   - Removal/archival of demo reviews (`user_seed_*`), demo products, and legacy test orders.
   - Decision on celebrity / political framed artwork personality rights.

---

## 13. Production Deployment Blockers (REQUIRES DEPLOYMENT & APPROVAL)
1. **Cloud Functions Deployment:**
   - 15 functions total (13 previously undeployed + 2 new WhatsApp functions: `whatsappOnOrderChange`, `whatsappRetryFailed`).
   - Node.js 22 runtime transition.
2. **Firestore Indexes:**
   - Deploy `firestore.indexes.json` (`firebase deploy --only firestore:indexes`) for composite queries on `customers` and `whatsappMessages`.
3. **Secret Manager Secrets:**
   - `whatsapp-app-secret`
   - `whatsapp-webhook-verify-token`
   - `whatsapp-access-token`
4. **Print-Render Service:**
   - Deploy Cloud Run private service and configure `PRINT_RENDER_URL`.
5. **Razorpay Webhook:**
   - Configure webhook secret `RAZORPAY_WEBHOOK_SECRET` and register endpoint in Razorpay dashboard.

---

## 14. Exact Next Steps for Claude
1. **Review Working Tree:**
   - Run `git status` to verify working tree matches this document.
2. **Browser Verification (if desired):**
   - Run Firebase emulators:
     ```bash
     JAVA_HOME=/opt/homebrew/opt/openjdk@21 PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH" /opt/homebrew/bin/firebase emulators:start --only auth,firestore,storage
     ```
   - Run web dev server:
     ```bash
     NEXT_PUBLIC_USE_FIREBASE_EMULATORS=1 FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 FIREBASE_STORAGE_EMULATOR_HOST=127.0.0.1:9199 SESSION_SECRET=dev-session-secret-for-testing-only-at-least-32-chars pnpm dev
     ```
   - Seed users:
     ```bash
     FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 pnpm --filter @bro-pics/seed seed-emulator-users
     ```
   - Sign in via `/signin?mode=password&redirect=/admin/whatsapp/contacts` (9000000001 / AdminPass1).
   - Complete MFA with generated TOTP or recovery code.
3. **Address Owner Checklist:**
   - Guide owner through Meta template creation (`docs/WHATSAPP_META_SETUP_GUIDE.md`).
   - Prepare clean deployment plan (`docs/WHATSAPP_DEPLOYMENT_AND_OPERATIONS.md`).

---

## 15. Commands to Reproduce Verification Tests
```bash
# 1. Typecheck all packages
pnpm typecheck

# 2. Run all unit and integration tests (excluding rules tests)
pnpm test

# 3. Run Firestore and Storage rules tests with local emulator
JAVA_HOME=/opt/homebrew/opt/openjdk@21 PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH" pnpm test:rules

# 4. Run Next.js production build
pnpm --filter @bro-pics/web build
```
