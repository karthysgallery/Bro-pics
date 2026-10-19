# WhatsApp: deployment and operations

Status (2026-10-18): the code described here is built and tested **locally and is not deployed**. Live Cloud Run has `WHATSAPP_MODE=disabled`, so no transactional or marketing message can be sent. Nothing here activates messaging.

## 1. What runs where

| Part | Where | Deployed today? |
|---|---|---|
| Login codes (OTP) | Website (Cloud Run), `CloudWhatsAppOtpProvider`, env `WHATSAPP_OTP_MODE=production` | **Yes** (live; the pre-existing code, now using the configurable Graph version) |
| Webhook (delivery status, STOP/START) | Website route `/api/webhooks/whatsapp` | Code live in the website build, but **inert**: needs `WHATSAPP_APP_SECRET` and `WHATSAPP_WEBHOOK_VERIFY_TOKEN` |
| Admin screens: Contacts, Templates, Campaigns, Message logs | Website admin | Deployed with the next website build |
| Order notifications (`whatsappOnOrderChange`) and retries (`whatsappRetryFailed`) | Cloud Functions, asia-south1 | **No** (functions not deployed) |
| Scheduled campaigns (`sendWhatsAppCampaigns`), invoice delivery (`invoiceOnPayment`) | Cloud Functions | **No** |

## 2. Environment variables

| Variable | Secret? | Used by | Notes |
|---|---|---|---|
| `WHATSAPP_MODE` | no | website + functions | `disabled` (current), `mock` (logs, sends nothing), `cloud` (real). **Change only on the owner's written instruction.** |
| `WHATSAPP_ACCESS_TOKEN` | **yes** | website + functions | from Secret Manager `whatsapp-access-token` |
| `WHATSAPP_PHONE_NUMBER_ID` | no | website + functions | |
| `WHATSAPP_APP_SECRET` | **yes** | website (webhook) | Secret Manager `whatsapp-app-secret` |
| `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | **yes** | website (webhook) | new random string, Secret Manager |
| `WHATSAPP_OTP_MODE`, `WHATSAPP_OTP_TEMPLATE_NAME` | no | website | existing |
| `WHATSAPP_TEMPLATE_*` (ORDER_CONFIRMED, ORDER_PROCESSING, ORDER_SHIPPED, ORDER_DELIVERED, ORDER_CANCELLED, REFUND_STATUS, INVOICE, PAYMENT_RECEIVED), `WHATSAPP_TEMPLATE_LANGUAGE` | no | website + functions | override the default template names (see Admin → WhatsApp → Templates) |
| `WHATSAPP_GRAPH_VERSION` | no | website + functions | default `v25.0` |

Functions read the same values from `functions/.env.bropics-app` (never committed) and Secret Manager secrets attached to the function; the website reads them from Cloud Run. **No secret is in a `NEXT_PUBLIC_*` variable, a response body, a log line or the repo.** Template names and phone-number IDs are not secrets.

## 3. Deployment order (each step needs the owner's approval)

1. Website release (admin screens, API routes, Graph version default). Verify: sign in to the admin, open WhatsApp → Contacts / Templates / Campaigns; with `WHATSAPP_MODE=disabled`, "Send now" on a campaign must answer "switched off on the server".
2. Firestore rules (unchanged by this feature; new collections are server-only by default) and **indexes** (`firestore.indexes.json`: `customers` by marketing status + updatedAt; `whatsappMessages` by status + nextAttemptAt). `firebase deploy --only firestore:indexes`; wait until they are "Ready".
3. Secrets and webhook: add the three secrets, attach to Cloud Run with `gcloud run services update karthys-gallery --update-secrets WHATSAPP_APP_SECRET=whatsapp-app-secret:latest,WHATSAPP_WEBHOOK_VERIFY_TOKEN=whatsapp-webhook-verify-token:latest`; then configure the callback in Meta (setup guide step 6).
4. Functions: deploy `whatsappOnOrderChange`, `whatsappRetryFailed` (and, already planned, `invoiceOnPayment`, `creditNoteOnRefund`, `sendWhatsAppCampaigns`). They stay silent while the mode is `disabled`.
5. Templates approved in Meta and recorded in the admin.
6. Test with your own numbers in `mock` then `cloud`, then **only then** the owner changes `WHATSAPP_MODE` to `cloud`.

## 4. Webhook URLs

* Callback URL (Meta → Configuration): `https://karthysgallery.in/api/webhooks/whatsapp`. The Cloud Run service URL is not used.
* The functions have no public WhatsApp URL (they are triggered by Firestore and by schedules).

## 5. Permissions (enforced in the backend, not only hidden in screens)

| Permission | super_admin | admin | marketing_manager | staff |
|---|---|---|---|---|
| `customers:read` (see the contacts list; full numbers and names in logs for those who also have `whatsapp:logs`) | ✓ | ✓ | – | ✓ |
| `whatsapp:contacts_import` (CSV import) | ✓ | ✓ | – | – |
| `whatsapp:consent_edit` (record opt-in/out) | ✓ | ✓ | – | – |
| `marketing:whatsapp` (create/edit drafts, preview, pause, cancel, view reports) | ✓ | ✓ | ✓ | – |
| `whatsapp:campaign_send` (send, schedule, resume, retry failed) | ✓ | ✓ | **–** | – |
| `whatsapp:templates_manage` (record template status, cost rate) | ✓ | ✓ | – | – |
| `whatsapp:export` (download campaign CSV) | ✓ | ✓ | – | – |
| `whatsapp:logs` (message logs; numbers shown as last four digits without `customers:read`) | ✓ | ✓ | ✓ | – |

**Behaviour change for existing roles:** a marketing manager could previously start a campaign; now only an administrator can. Billing and WhatsApp admin APIs now also require the authenticator proof, like the other admin routes (before, they only checked the role).
Every import, consent change, template record, rate change, campaign send/schedule/cancel/retry and report export writes an audit log entry with counts and ids, never names, numbers or message text.

## 6. Data model (collections; all server-only, no client access: tested in the rules tests)

| Collection | Purpose | Notes |
|---|---|---|
| `customers/{p<digits>}` | one record per phone number (existing) | added optional: `origin`, `city`, `state`, `tags`, `consent.*.evidence`, `consent.*.policyVersion` |
| `whatsappSuppressions/{customerId}` | numbers that opted out of marketing | written on STOP, staff opt-out, or an opted-out import; removed only by the customer's own START |
| `whatsappImports/{id}` | one record per import: counts only | no names/numbers |
| `whatsappTemplates/{name__lang}` | what an administrator recorded from WhatsApp Manager | status, category, verifiedAt/By |
| `whatsappConfig/pricing` | owner-entered marketing rate, date, source | |
| `whatsappMessages/{id}` | message log (existing) | order messages use id `wa_{orderId}_{event}` (the once-only key); added `event`, `attempts`, `nextAttemptAt`; never message text or OTP |
| `whatsappCampaigns/{id}` + `recipients/{customerId}` | campaigns (existing) | added status `paused`, recipient status `sending`/`cancelled`, audiences `origin` and `tag` |

**Retention (proposal, owner to confirm):** import records and message logs 12 months; suppression records kept for as long as you keep the customer list (deleting one would allow messaging an opted-out person); recipient subcollections 12 months after a campaign ends.
**Migration:** none required. New fields are optional; existing customers read as "origin unknown, no tags". **Rollback:** redeploy the previous website revision; leave the new collections in place (unused, harmless); delete the two new functions; the previous code ignores the new fields.

## 7. How a message is sent (so you can reason about failures)

* **Order messages:** the function watches `orders/{id}`; a real change (payment verified by the server, production started, shipped with courier and tracking number, delivered, cancelled, refunded) creates **one** log record `wa_{orderId}_{event}` in a transaction and sends once. WhatsApp failing never touches the order, payment or invoice. Retry schedule for errors that can succeed later (network, 5xx, throttling): 5 minutes, 30 minutes, 2 hours, then stop. Errors that cannot succeed (wrong template name, number not on WhatsApp, bad token) are not retried; they show in Message Logs.
* **Campaigns:** audience recomputed on the server; final confirmation must match the recomputed number; recipients are claimed one at a time (so a crash cannot double-send); sending is sequential in batches of 200 (500 for the scheduled sender) every 5 minutes: bounded, never hundreds of parallel calls; Pause stops at the next batch; Cancel marks unsent recipients cancelled.
* While `WHATSAPP_MODE=disabled` nothing is queued and nothing is recorded as failed.

## 8. Troubleshooting

| Symptom in Message Logs | Likely cause | What to do |
|---|---|---|
| `Invalid OAuth access token (code 190)` | token expired or revoked | create a new system-user token, add a new Secret Manager version, redeploy/refresh Cloud Run |
| `Template name does not exist (code 132001)` or parameter mismatch (132000) | template not created/approved, name or language or variable count differs | fix in WhatsApp Manager; check Admin → Templates |
| `Message undeliverable (131026)` | number not on WhatsApp or blocked | nothing to retry |
| `Too many messages (130429 / 131056)` | throttling | the retry handles it; reduce batch size if frequent |
| Payment/billing error | payment method or balance | WhatsApp Manager billing |
| Campaign says "template not approved" | not recorded in Admin → Templates | check WhatsApp Manager, record the status |
| Campaign says "switched off" | `WHATSAPP_MODE=disabled` | owner's decision |
| Everything "sent" but never "delivered" | webhook not connected | setup guide step 6 |

## 9. Token expiry and rotation

Meta describes system-user tokens as long-lived, with an expiry you choose when generating it (or none). Record the expiry in your calendar. To rotate: generate a new token, add it as a **new version** of `whatsapp-access-token`, redeploy/refresh Cloud Run, send one test, then revoke the old token in Business settings. The app secret and verify token rotate the same way (update Meta's configuration at the same time).

## 10. Monitoring

Daily: Admin → WhatsApp → Message Logs filtered to **Failed**. Per campaign: report counts (sent = accepted by WhatsApp; delivered/read only from WhatsApp's own events). Cloud Run and Functions logs: filter for "Order WhatsApp message failed" and "WhatsApp campaign batch". Budget alert already exists for Google Cloud; Meta charges are separate (WhatsApp Manager billing).

## 11. Costs (assumptions, not quotes)

* Meta charges per delivered **template** message by category and recipient country (rate cards linked from Meta's pricing page, INR available; effective dates change). Utility templates inside an open customer-service window are free. We cannot state rupee rates here because the figures are not in the page text read on 2026-10-18; enter the current marketing rate in the admin and use it for estimates.
* Rough shape for planning: monthly cost ≈ (utility messages after the window × utility rate) + (campaign recipients × marketing rate) + login codes (authentication rate). Example method only: 500 recipients × marketing rate (read from the rate card) = campaign cost.
* Google Cloud: functions and Cloud Run are within normal usage; the 5-minute scheduler and 10-minute retry add negligible cost.

## 12. Backup and recovery

Firestore export or scheduled backup (point-in-time recovery) must cover `customers`, `whatsappSuppressions` and `whatsappTemplates`. **Losing the suppression list is a compliance problem** (opted-out people could be messaged), so restore it before any campaign after a recovery. Keep a separate dated export of suppression ids.
