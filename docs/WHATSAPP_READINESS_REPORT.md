# WhatsApp CRM and notifications: readiness report (2026-10-18)

Everything below is **local and uncommitted** unless stated. No push, deploy, DNS change, rules deploy, customer message, real import or campaign was made. `WHATSAPP_MODE=disabled` is unchanged. Companion documents: `WHATSAPP_META_SETUP_GUIDE.md`, `WHATSAPP_DEPLOYMENT_AND_OPERATIONS.md`.

Status labels: IMPLEMENTED · TESTED · NOT TESTED · BLOCKED · REQUIRES META ACTION · REQUIRES OWNER INPUT · REQUIRES DEPLOYMENT · REQUIRES APPROVAL.

## 1. What existed (verified in the code)

| Item | Finding |
|---|---|
| Transport (`packages/shared/src/whatsapp/service.ts`) | Real Meta Cloud API sender with mock and disabled modes; `WHATSAPP_MODE`. Was pinned to Graph v21.0. |
| Login OTP | Real Cloud API provider, **live** on the website, separate from everything else. |
| Customer model (`customers`, one per phone) with separate transactional and marketing consent (`opted_in/opted_out/unknown`) | Existed. No evidence/policy-version fields, no suppression list. |
| Webhook `/api/webhooks/whatsapp` | Existed: verify-token handshake, HMAC signature check, status updates, STOP/START. Inert on live (secrets not attached). |
| Campaigns (create, audience preview, schedule, send now, cancel) and a scheduled sender function | Existed; sequential batches; no pause, no template-approval check, no final confirmation, marketing role could send. |
| Message log page | Existed. |
| Invoice on WhatsApp (function `invoiceOnPayment`) | Existed, **function not deployed**. |
| `sendOrderConfirmation`, `sendPaymentConfirmation`, `sendShippingUpdate` | Existed in the service but **were never called anywhere**: no order message was ever sent. |
| CSV import, contact import UI, template registry, retries, delivery/cancel/refund messages | Did not exist. |
| Mocked | Mock transport only in dev/tests. Nothing in production sends except login codes. |
| Missing Meta side | Transactional and marketing templates, webhook callback and secrets, billing routine, consent process. |

## 2. Decisions (reuse, not rebuild)
Kept the one service/transport and `customers`/`whatsappMessages`/`whatsappCampaigns`. Added modules beside them: consent rules, contact import, template registry, order notifier. Order messages are **derived from real order changes by a Firestore function**, so order/payment/invoice code never calls WhatsApp. No third-party provider was introduced.

## 3. Implemented and tested locally

| Area | Status | Evidence |
|---|---|---|
| **A. Customer import** (`contact-import.ts`, `contact-import-service.ts`, routes `/api/admin/whatsapp/contacts/{template,import}`, page Admin → WhatsApp → Contacts) | IMPLEMENTED, TESTED (unit 38, Firestore-emulator 5, route 12) | CSV only (XLSX not added: no secure dependency in the repo). Template download, bounded parse (1 MB, 2,000 rows), binary and formula rejection, E.164 normalisation (India + international), per-row errors, duplicate detection in file and against the database, three conflict strategies, dry-run preview, server-side recomputation at import time (409 if the database changed), safe error report (line numbers, last-4 numbers, reasons only), import record with counts only. |
| **B. Consent** (`consent.ts`) | IMPLEMENTED, TESTED | Imports default to **consent unknown**; "opted in" needs source + real past date + evidence, otherwise it is downgraded with a warning (no date is invented). Transactional consent is never granted by an import. One eligibility function for marketing (opt-in only, never opted-out/suppressed/invalid) and a separate one for transactional. **Suppression list**: STOP, staff opt-out and opted-out imports add the number; no import, edit or staff action can lift it; only the customer's own START does (reply kept as evidence). Campaign audience and each individual send re-check it. |
| **C. Transactional messages** (`order-notifications.ts`, `order-sender.ts`, functions `whatsappOnOrderChange`, `whatsappRetryFailed`) | IMPLEMENTED, TESTED (unit 12, emulator 8, function 4) | Events: order confirmed (only after the server-verified `paymentStatus: paid`), production started, shipped (only with a recorded courier and tracking number; tracking link only if a real https URL exists), delivered, cancelled, refund processed. **Once per (order, event)** via a transactional claim (two concurrent sends → one WhatsApp call). A WhatsApp failure is recorded and never thrown into the order. Retries 5 min / 30 min / 2 h for retryable errors only. Silent (nothing queued, nothing logged as failed) while mode is `disabled`. Invoice delivery uses the existing path. Not implemented: out-for-delivery (no reliable data source), replacement/support updates (no lifecycle event exists). |
| **D. Templates** (`templates.ts`, `template-registry.ts`, routes `/api/admin/whatsapp/{templates,pricing}`, page Admin → WhatsApp → Templates) | IMPLEMENTED, TESTED (unit 10) | Inventory of every template the code sends (key, name, category, variables, intended use, suggested wording). An administrator **records** what WhatsApp Manager shows (status, category, language, date, who). The code never claims Meta approved anything. Variable text is flattened (control characters removed, length capped). |
| **E. Campaign manager** | IMPLEMENTED, TESTED (emulator 4, route 12) | New: approved-MARKETING-template requirement (send and schedule), final confirmation that must equal the server-recomputed audience (409 `audience_changed`), pause/resume/cancel (cancel marks unsent recipients), retry failed, recipient claim before send (no double send after a crash), refuses to start while WhatsApp is off, audiences by origin and tag, exclusion summary (not asked / opted out / suppressed / outside audience), cost **estimate only from a rate the owner typed with its date** (no price list in code), minimal CSV report (hidden numbers, statuses, reasons). Sending stays sequential (concurrency 1) in batches: bounded. |
| **F. Logs, reports, permissions, audit** | IMPLEMENTED, TESTED | Message log shows event, tries, next retry, failure reason; numbers masked to last four digits for anyone without `customers:read`. New permissions `whatsapp:contacts_import`, `whatsapp:consent_edit`, `whatsapp:campaign_send`, `whatsapp:templates_manage`, `whatsapp:export` (super_admin + admin only). All new routes are in the real-permission enumeration test (401 signed out, 403 for a marketing manager). Imports, consent edits, template records, rate changes, sends, schedules, cancels, retries and exports are audit-logged with counts/ids only. |
| **Security fix found on the way** | IMPLEMENTED, TESTED | The billing/marketing/WhatsApp admin APIs checked the role but **not the authenticator step** that every other admin route requires; they now do. |
| **Graph version** | IMPLEMENTED, TESTED | Code was on v21.0, which Meta schedules for removal on 21 Jan 2027. Now `WHATSAPP_GRAPH_VERSION`, default v25.0 (the version the setup script already used to register the number and send a test). The live login code path takes the new default only when deployed: **verify one login code after the next deploy.** |
| **Rules/indexes** | TESTED (rules), REQUIRES DEPLOYMENT (indexes) | 15 new rules tests: the seven WhatsApp collections cannot be read or written by visitors or customers. Two composite indexes added to `firestore.indexes.json` (not deployed). No rules change was needed (default deny). |

## 4. Test results (final run, this tree)

| Suite | Result |
|---|---|
| `tsc` all packages | PASS |
| `packages/shared` incl. Firestore-emulator tests | PASS 807 |
| `apps/web` | PASS 2243 passed, 31 skipped |
| `functions` | PASS 85 |
| Firestore + Storage rules tests | PASS 73 |
| `scripts/seed` | PASS 46 |
| Production `next build` | PASS |
| New admin screens in a **browser** (Contacts, Templates, Campaign changes) | **NOT TESTED** (type-checked and API-tested only) |
| Real Meta calls, real webhook delivery, real template approval, real order → message end to end | **NOT TESTED / BLOCKED** (needs deployment, secrets, approved templates) |
| Large-import performance beyond 1,500 rows; XLSX | NOT TESTED / not built |

Unit tests do **not** make this production-ready.

## 5. Meta and owner actions still required
REQUIRES META ACTION: create and get approved the 7 utility templates (+ invoice) and each marketing template; configure the webhook callback and subscribe to `messages`; billing check. REQUIRES OWNER INPUT: consent wording and the process for the 500 offline customers; template wording; who watches the logs; whether to use the chat number for replies. REQUIRES DEPLOYMENT: website release, indexes, secrets (app secret, verify token), the two new functions (plus the three existing undeployed ones: invoice delivery, credit note, scheduled campaigns). REQUIRES APPROVAL: every deployment step, and the change of `WHATSAPP_MODE`. Full steps: `WHATSAPP_META_SETUP_GUIDE.md`.

## 6. Production blockers
1. Functions are not deployed (13 + 2 new): no order message, retry, scheduled campaign or invoice delivery can run.
2. Webhook inert until the app secret and verify token are attached; without it there are no delivered/read statuses and STOP replies are not processed.
3. No transactional template is approved; no marketing template exists.
4. No consent has been collected from offline customers; until it is, no campaign has any audience.
5. Indexes not deployed (contacts filter and retry sweep would fail).
6. Browser/end-to-end verification not done.
7. Legal review of consent wording and Indian marketing-message rules (DPDP Act, telecom/consumer rules): REQUIRES OWNER INPUT, not legal advice from us.
8. Existing production items in `PRODUCTION_LAUNCH_AUDIT.md` (payment-to-print, webhook for Razorpay, seed data, etc.).

## 7. Rollback
Redeploy the previous website revision; delete the two new functions; leave the new collections (unused); the previous code ignores new fields. Switching WhatsApp off is `WHATSAPP_MODE=disabled` (already the state). Details: operations guide §6.

## 8. Behaviour changes to know about
Marketing managers can no longer send or schedule campaigns (administrators only). Billing/WhatsApp admin APIs require the authenticator step. Message logs hide full numbers from people without `customers:read`. A campaign cannot start while WhatsApp is off or with an unrecorded template. A re-import never changes someone who opted out.
