# WhatsApp (Meta) setup guide for KarthysGallery

Written 2026-10-18 for the owner. Meta's pages were read on that date (links at the end). **Meta changes its screens and rules often: if a label below does not match what you see, trust Meta's own page and tell us.** Nothing in this guide has been switched on by us: `WHATSAPP_MODE` stays `disabled` until you say so.

Tags used below: **[META]** you do it inside Meta · **[APP]** you do it in the KarthysGallery admin · **[REVIEW]** Meta has to approve · **[YOU]** needs your business information · **[DEPLOY]** needs a production deployment (needs your approval).

**Never type or paste a token, app secret or PIN into a chat, an email, a document or the code.** Section 5 shows where each secret lives and how it is entered.

## What already exists (verified in the project, not assumed)

* A Meta app and a WhatsApp Business Account exist; business verification was completed with your Udyam registration; the dedicated login-code number is registered with the Cloud API; the login-code template is approved; a long-lived system-user token exists and is stored in Google Secret Manager (see `docs/PRODUCTION_LAUNCH_AUDIT.md` and the owner notes). These were set up with the helper script, not through this code base.
* **Not** done: the transactional order templates, any marketing template, the webhook, billing top-up routine, and a consent process for offline customers.
* The customer chat number (+91 63692 84351) is a separate number and is **not** connected to the API. Do not register it for the API without reading step 4.

## Step 1: Meta Business Portfolio

1. **[META]** Open Meta Business Suite → **Settings** (gear) and confirm the portfolio that owns the WhatsApp Business Account is the one in the shop's name.
2. **[YOU][META]** Business verification: done. If Meta ever asks again, use the Udyam certificate (UDYAM-TN-32-0114288).

## Step 2: Meta developer app

1. **[META]** developers.facebook.com → **My Apps** → open the app used for WhatsApp.
2. The WhatsApp product must be added to the app (left menu **WhatsApp**, or **Use cases** for apps created with the "Connect with customers through WhatsApp" use case).
3. Note the app mode (Development or Live). Messages to real customers need the app in **Live** mode with the permissions in step 5. We have not changed the mode.

## Step 3: WhatsApp Business Account (WABA)

1. **[META]** WhatsApp Manager → check the account name and that the phone numbers listed are yours.
2. The **WABA ID** and **Phone Number ID** are identifiers (not secrets). They are shown in App Dashboard → **WhatsApp** → **API setup** and in WhatsApp Manager. They are stored as server settings (section 5).

## Step 4: Phone number: read before you change anything

* The API number must belong to you and be able to receive the verification code. Registration happens **only through the API** (`POST /{phone-number-id}/register` with a 6-digit PIN): "you cannot register a number through WhatsApp Manager or the App Dashboard" (Meta). The helper script already does this for the login-code number.
* **Do not move a number that is in use on the WhatsApp Business app (your customer chat number) without a written plan.** Meta describes a "coexistence" mode for using the same number on the app and on the API, with limits (fixed 20 messages/second, no group chats, broadcast lists disabled, and it is offered through Embedded Signup for partners). Meta's registration page does not say what happens to chats when an app number is registered to the API directly. We will not guess: ask Meta's support or a Meta partner before touching the chat number.
* Using two numbers is the safest arrangement and is what we have today: the dedicated number for login codes and order messages, and the chat number for people to talk to you. Customers who reply to an order message reach the API number, whose inbox is not watched by a person unless you build one. Tell customers on the policy pages and in the message to use the chat number for questions. This is a decision for you.

## Step 5: API credentials

| Value | Secret? | What it is | Where it lives | How it gets there |
|---|---|---|---|---|
| Phone Number ID | No | Which number sends | Cloud Run env `WHATSAPP_PHONE_NUMBER_ID` | `gcloud run services update … --update-env-vars` (you run it) |
| WABA ID | No | The account (for template management by script) | Not needed by the website | n/a |
| Access token | **Yes** | Lets the server send messages | Google Secret Manager `whatsapp-access-token` → Cloud Run env `WHATSAPP_ACCESS_TOKEN` | Secret Manager version added by you; Cloud Run attached with `--update-secrets` |
| App secret | **Yes** | Verifies webhook signatures | Secret Manager `whatsapp-app-secret` → env `WHATSAPP_APP_SECRET` | same |
| Webhook verify token | **Yes** (treat as one) | Meta's subscription check | Secret Manager → env `WHATSAPP_WEBHOOK_VERIFY_TOKEN` | You invent a long random string once |
| Number PIN (two-step) | **Yes** | Needed to re-register the number | Secret Manager `whatsapp-2fa-pin` | already stored; used only by the helper script |

**Tokens:** Meta describes three kinds. A *user* token (from the API setup page) "expires quickly": use it only for the first test. A **system user** token is long-lived and meant for exactly this case (your own business, automated server). To create one (Meta's steps, as documented on 2026-10-18): Business settings → **System Users** → **+Add** → name it, role Admin → **Assign assets** → your app with **Manage app** → wait until it shows **Full control** → **Generate token** → choose the app, set an expiry preference, tick `business_management`, `whatsapp_business_management`, `whatsapp_business_messaging`. Meta calls this "long-lived", **not** permanent: put a reminder in your calendar before its expiry and rotate it (operations guide).
Put the token **directly into Secret Manager** from your own terminal (`gcloud secrets versions add …` reading from a file you then delete, or the Cloud Console secret screen). Never into chat.

## Step 6: Webhook (delivery reports and STOP replies)

The endpoint already exists in the website: `https://karthysgallery.in/api/webhooks/whatsapp`. It is **not usable yet** until the app secret and verify token are attached to Cloud Run (without them it refuses everything, which is the safe default).

1. **[DEPLOY][YOU]** Create the verify token (a long random string), store it and the app secret in Secret Manager, attach both to Cloud Run (operations guide §3).
2. **[META]** App Dashboard → **WhatsApp** → **Configuration** (or **Use cases** → **Customize** → **Configuration**): enter the **Callback URL** above and the **Verify token**, then save. Meta sends a GET with `hub.mode=subscribe`, `hub.verify_token` and `hub.challenge`; the endpoint answers 200 with the challenge only when the token matches. The page must be served over HTTPS with a valid certificate (self-signed is not supported).
3. **[META]** After saving, subscribe to the **messages** field (it carries message statuses and customer replies). Also subscribe to **message_template_status_update** so template approvals are visible in the logs (we do not act on it yet).
4. **How we validate:** every POST must carry `X-Hub-Signature-256: sha256=<hash>`, an HMAC-SHA256 of the raw body with your app secret. The endpoint recomputes it and rejects anything that does not match (401). Meta retries a failed delivery for up to 7 days with decreasing frequency, so the code tolerates duplicates.
5. **Test:** (a) Meta's "Test" button on the messages field after saving; (b) from a test phone, reply STOP to a message from the API number and check Admin → WhatsApp → Contacts shows "Opted out"; (c) check a sent message moves from Sent to Delivered in Message Logs.

## Step 7: Message templates

Templates are created in **WhatsApp Manager → message templates** (or the API). Every template has a category: **Utility**, **Marketing** or **Authentication**; the category changes the price. Meta reviews each one automatically (up to about 24 hours) and shows a status such as In review, Active, Rejected, Paused or Disabled. A template can only be sent through the API once it is `APPROVED`.

1. **[APP]** Open Admin → WhatsApp → **Templates**. It lists every template the code sends, with the variables each takes and a **suggested wording** to submit. These are suggestions: Meta reviews what you actually submit.
2. **[META][REVIEW]** Create each template with exactly the same name, language and variables in the same order. Use positional variables `{{1}}`, `{{2}}`; each variable needs an example value; do not begin or end the text with a variable; avoid special characters such as `#`, `$`, `%` inside variables.
3. **Transactional (Utility) list:** order confirmation, order processing, order shipped, order delivered, order cancelled, refund status, invoice (with a document header). Payment receipt exists but is not sent automatically.
4. **Marketing:** create a Marketing template per campaign (for example a festival offer). Meta reviews its wording: do not state a discount, coupon, date or product that is not true. Include a way to stop (the suggested text ends "Reply STOP to stop these messages").
5. **If rejected:** Meta tells you in WhatsApp Manager, by email and in Business Support Home with the reason. Edit and resubmit, or appeal (an appeal needs a sample; decided within about 24 hours). Common reasons: wrong curly-brace formatting, non-sequential variables, threats such as legal action, a template that duplicates another, sensitive requests.
6. **[APP]** After you have **seen it Approved in WhatsApp Manager**, record it in Admin → WhatsApp → **Templates** → "Record status…" (name, language, category, approved). A campaign refuses to send with a template that is not recorded as an approved **Marketing** template. The website cannot ask Meta, so this record is a person's dated confirmation.
7. A **Paused** or **Disabled** template cannot be sent. Meta pauses templates whose quality drops (customers blocking or reporting). Check Templates regularly and record the new status.

## Step 8: Customer marketing consent (offline customers)

**A phone number is not consent.** Meta's opt-in page says the business must clearly state that the person is opting in to receive communication from it, name the business, and follow applicable law; methods Meta lists include a website, SMS, a phone IVR, and **in-person or paper sign-up**. It recommends separate opt-ins for different message types (order updates, offers) and says opt-out requests must be honoured. Indian rules (the DPDP Act, 2023, and consumer-protection and telecom-marketing rules) also apply: ask a lawyer to review your wording. The code treats consent as follows:

* Importing a number records the customer as **consent unknown** unless the file proves otherwise (a consent source, a real past date and an evidence reference). Unknown customers are **never** sent offers.
* Order/invoice messages and marketing are separate permissions. Agreeing to one is not agreeing to the other.
* **STOP** (and "unsubscribe", "opt out") sent by the customer opts them out of marketing at once and puts the number on a **suppression list** that no import or staff edit can undo. Only the customer can opt back in (replying START), and the reply is kept as evidence.

**What you do to collect consent from your existing 500 offline customers (owner actions):**
1. Write a short consent wording and have it checked, for example: "I agree to receive offers and updates from KarthysGallery on WhatsApp. I can reply STOP at any time." It must name the business, say what messages, and say how to stop.
2. Collect it in a way you can prove: a signed sheet, a form at the counter, a form on the website, or a WhatsApp message from the customer to your **chat number** saying "YES". Keep the sheet/screenshot; give each a reference (form number, sheet and row).
3. Put the date, the source (for example "counter form") and the reference in the CSV (`marketing_consent` = `opted_in`, `consent_source`, `consent_at`, `consent_evidence`, `policy_version`), or record it one customer at a time under Admin → WhatsApp → Contacts → "Record agreement…". Customers you have not asked stay "unknown" and receive nothing.
4. Do not message people to "ask permission to message them" with a marketing template. Ask in person, on paper, on the website, or let them message you first.

## Step 9: Billing and pricing

* **[META]** Add a payment method to the WhatsApp Business Account (WhatsApp Manager → payment settings; a prepaid wallet is what the account used for login codes). If the balance or payment method fails, template messages stop sending and the message log shows the error. Check it weekly.
* Pricing (Meta, as read 2026-10-18): since **1 July 2025** charges are **per message**, not per conversation. You are charged when a **template** message is **delivered**. Ordinary (non-template) messages are free **within an open customer-service window**; utility templates sent inside an open window are free. Rates depend on the category, volume tier and the recipient's country calling code. Rate cards (including INR) are linked from Meta's pricing page. **The website holds no price list**: type the current marketing rate and the date you read it into Admin → WhatsApp → Templates → "Marketing price", and campaign estimates will use it. Meta's invoice is what counts. These are Meta's charges; there is no third-party provider fee because we call Meta directly.

## Step 10: Testing (no real customers)

1. Use the helper script's test mode or Meta's test number flow with **your own numbers** (people who have agreed): never the customer list.
2. Send each template once; check it arrives with the right variables.
3. Check the webhook: Sent → Delivered in Message Logs; reply STOP and see the opt-out; reply START and see the opt-in with its evidence.
4. Force a failure (a number that is not on WhatsApp) and see it in Message Logs with a reason, and that the order is unaffected.
5. Only after this: a campaign to a **test group** of 3 to 5 people who agreed.

## Step 11: Production checklist (all must be ticked)

- [ ] Business number registered and its display name approved.
- [ ] Every template in use is approved in WhatsApp Manager **and** recorded in Admin → WhatsApp → Templates.
- [ ] Access token created as a system-user token, in Secret Manager, expiry date in your calendar.
- [ ] App secret and verify token in Secret Manager and attached to Cloud Run; webhook saved and subscribed to **messages**.
- [ ] Billing active, balance checked.
- [ ] Consent wording reviewed; the offline list imported with consent unknown, with proven consents recorded.
- [ ] STOP tested end to end; the suppression list checked.
- [ ] Functions deployed (order notifications, retries, scheduled campaigns) and their logs read after a test order.
- [ ] A named person watches Message Logs daily for failures.
- [ ] **You said, in writing, "switch on WhatsApp"**, and `WHATSAPP_MODE` was changed by you. Until then it stays `disabled`.

## Official sources read for this guide (2026-10-18)

* Webhooks: https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/create-webhook-endpoint.md
* Access tokens and system users: https://developers.facebook.com/documentation/business-messaging/whatsapp/access-tokens.md
* Templates overview and review: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/overview.md and …/template-review.md
* Phone number registration: https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/registration.md
* Coexistence: https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users.md
* Opt-in: https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in.md
* Pricing: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing.md and https://developers.facebook.com/docs/whatsapp/pricing
* Graph API versions: https://developers.facebook.com/docs/graph-api/changelog/versions/ (v21.0 is scheduled for removal on 21 January 2027; the code now defaults to v25.0, overridable with `WHATSAPP_GRAPH_VERSION`).
* Documentation index (to find the current page for anything above): https://developers.facebook.com/documentation/business-messaging/whatsapp/llms.txt

Not confirmed from these pages and therefore not stated as fact here: the exact length of the customer-service window, SMS/voice code details for number verification, and what happens to chats when an app number is registered directly to the API.
