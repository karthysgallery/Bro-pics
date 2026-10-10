# Admin security

Status (10 Oct 2026): built and tested on the local emulators. Commit `2827b1f` on branch `San's(FE)`, not yet on master.

## Signing in to the admin

Every staff and admin account needs two things:

1. **A password**, or your phone number. Staff accounts cannot sign in with a WhatsApp OTP alone.
2. **A 6-digit code from an authenticator app** on your phone: Google Authenticator, Microsoft Authenticator, Authy or 1Password.

**First time:**

- The admin shows **"Set up your authenticator app"**.
- Install one of the apps, tap **+** and scan the QR code.
- Type the 6-digit code it shows.
- Save the **10 recovery codes** with Download or Copy, and keep them somewhere other than your phone.

**After that:** each sign-in asks for the current code. One code keeps the browser verified for **12 hours**, then the admin asks again.

**Owner first.** When this goes live, the owner sets up their app first. Every staff member is asked to set up theirs the next time they open the admin.

## Lost or changed phone

| Situation | What to do |
|---|---|
| You still have a recovery code | Tap **"Lost your phone? Use a recovery code"**. Each code works once. |
| A staff member lost their phone | Owner: **Admin → Settings → Team → Reset authenticator** on their row. They scan a new QR code at their next sign-in. |
| The owner lost the phone **and** every recovery code | On the owner's computer, with the project's server credentials: `pnpm --filter @bro-pics/seed reset-admin-mfa +91XXXXXXXXXX` |

A reset signs that account out of the admin in every browser at once.

## What protects the admin

- **Every admin and staff API checks the authenticator step on the server**, all 100+ routes, through one shared check. A stolen password, or a stolen sign-in token, gets "401 not allowed" until the code is entered.
- **Codes:**
  - A code can't be used twice.
  - 5 wrong codes lock the account for 15 minutes.
  - Every set-up, sign-in, failure, lock, recovery-code use and reset is written to the audit log.
- **Authenticator secrets are stored encrypted** (AES-256-GCM) in the `staffMfa` collection, which no browser can read. Recovery codes are stored only as hashes.
- **The "verified" proof lives in the signed session cookie,** which page scripts can't read. It's the only cookie Firebase Hosting passes to the server.
- **Staff no longer read the database directly from the browser.** Every admin screen goes through the server. Direct reads of orders, customers, customizations, templates and similar data were removed from `firestore.rules`.
- **The admin sign-in page no longer shows a "Test Admin Credentials" box** with an admin phone number and OTP to every visitor.
- **Already in place:**
  - security headers (HSTS, X-Frame-Options DENY, a content security policy in report mode)
  - `/admin`, `/staff` and `/api` are hidden from search engines
  - password login is rate-limited
  - the dev-only "instant admin" sign-in is blocked in production

## "API keys in the console"

- **The only values the browser receives** are Firebase's web settings (API key, project ID, app ID…) and the shop's WhatsApp number.
- **The Firebase web API key isn't a secret.** Google designs it to be public, and every Firebase website sends it. What protects the data is sign-in, the database rules and the server checks above.
- **No real secrets reach the browser:** not Razorpay, WhatsApp, the session secret or service accounts. No client code writes to the browser console.
- **Optional extra step (owner, Google Cloud console):** APIs & Services → Credentials → the "Browser key" → set **Application restrictions: Websites** to `karthysgallery.in/*`, `*.karthysgallery.in/*` and `bropics-app.web.app/*`, and allow only the Firebase APIs. Then the key can't be used from other sites.

## Important

- **Don't change `SESSION_SECRET`** (Secret Manager) without asking every staff member to set up their app again. The stored secrets are encrypted with it.
- **The tighter database rules take effect only when they're deployed:** `firebase deploy --only firestore:rules --project bropics-app`. The live rules are older than the repository's; deploy them together with the go-live.
