# Firestore/Storage restore runbook

[BE-38] Written ahead of the backup configuration itself existing — the
actual daily managed Firestore backups, point-in-time recovery (PITR)
window, weekly export schedule, and Storage bucket soft-delete
(versioning) policy are Firebase/GCP console (or `gcloud`) configuration,
not application code, and none of them are set up yet on `bropics-app`
(no live GCP console access from this session). This runbook exists so
that whoever does set that configuration up has the restore procedure
ready in the same pass, rather than writing it under pressure during a
real incident.

**Restore drill into staging**: not run — there's no separate staging
Firebase project yet (see PROJECT_STATUS.md's tracked gaps). Run this
runbook for real, once, against staging the first time it's available,
before ever trusting it for a production incident.

## 1. What's being protected

- **Firestore** (`bropics-app`, default database): every collection this
  app writes — `products`, `variants` (subcollection), `orders` + its
  `items`/`events` subcollections, `customizations`, `uploads`, `returns`
  + `events`, `coupons`, `users` + `addresses`/`private` subcollections,
  `printJobs`, `notificationOutbox`, `reconciliations`, `webhookEvents`,
  `counters`, `categories`, `reviews`, `homepageSections`, `settings`.
- **Cloud Storage** (the `bropics-app.firebasestorage.app` bucket):
  `uploads/**` (customer photos — private, irreplaceable), `print-files/**`
  (rendered output — regenerable from `uploads/**` + Firestore state, not
  irreplaceable, lower restore priority), `returns/**` (evidence photos),
  `public/**` (catalog imagery — regenerable from source assets elsewhere,
  lowest priority).

Firebase Auth users are **not** covered by a Firestore backup — they live
in a separate system. Auth has its own export/import via
`firebase auth:export` / `firebase auth:import`, out of scope for this
runbook (add a companion runbook if/when that's set up).

## 2. Prerequisites (once the backup configuration exists)

- A Firestore managed backup schedule (daily, some retention window) and
  PITR enabled — `gcloud firestore backups schedules create` /
  the Firebase console's Backups tab.
- A weekly Firestore export to a GCS bucket (separate from the app's own
  storage bucket) — `gcloud firestore export`, or a scheduled Cloud
  Function calling the same API.
- Storage bucket versioning/soft-delete enabled on the app's storage
  bucket, so a deleted or overwritten object has recoverable prior
  versions for some retention window.

## 3. Restore scenarios

### 3a. Accidental deletion or corruption of a small number of documents

**Use PITR**, not a full restore — PITR lets you read the database as it
existed at a specific timestamp within the retention window, without
restoring anything destructively.

```bash
# Read a single doc as it existed at a past timestamp (does not modify
# anything — inspect before deciding to act).
gcloud firestore documents describe orders/ORDER_ID \
  --database='(default)' \
  --read-time='2026-09-24T10:00:00Z'
```

If the lost data is confirmed via PITR read, re-create it by writing the
recovered field values back through the application's own write path
(e.g., re-run the specific Admin SDK write, or restore via the Firebase
console's document editor) — **do not** bulk-import PITR reads directly
back into the live database; that risks reintroducing whatever caused
the corruption in the first place, or bypassing a schema/validation
change made since.

### 3b. Widespread corruption or accidental bulk deletion (a full restore)

**This is destructive to the live database and stops the app.** Confirm
with whoever owns the decision before running it — this is exactly the
kind of hard-to-reverse action this project's own operating guidelines
flag for explicit confirmation, not something to run solo mid-incident
without a second person aware.

1. Put the app in maintenance mode if that exists, or at minimum warn
   staff — writes during a restore can be lost or conflict with the
   restored state.
2. Identify the correct backup or export to restore from (the daily
   managed backup for "restore to yesterday," a PITR timestamp for
   "restore to this exact minute," or a weekly export for anything older
   than the managed-backup retention window).
3. Restore to a **new, separate database** first, never directly
   overwriting `(default)`:
   ```bash
   gcloud firestore databases restore \
     --source-backup=BACKUP_NAME \
     --destination-database='restore-verify'
   ```
4. Verify the restored data in `restore-verify` looks right — spot-check
   a handful of recent orders, confirm `counters/orderSeq` and
   `counters/invoiceSeq` have sane values (a restore to an earlier point
   means these counters roll back too — the next order/invoice number
   issued after the restore will collide with one issued between the
   backup point and the incident unless corrected first).
5. Only once verified, point the app at the restored database (or copy
   its contents into `(default)`, per whichever your GCP support
   guidance recommends at the time — the exact mechanics of promoting a
   verified restore to primary are worth confirming with GCP support
   before doing it for real, not assumed from this runbook alone).
6. Re-run `pnpm --filter @bro-pics/seed migrate-storage-paths --execute`
   style follow-up migrations if the restore point predates one that's
   since run live — check PROJECT_STATUS.md's own history of live
   migrations for anything that would need re-applying.

### 3c. Storage object accidentally deleted or overwritten

With bucket versioning/soft-delete enabled:

```bash
# List prior versions/generations of an object.
gsutil ls -a gs://bropics-app.firebasestorage.app/uploads/SESSION_ID/UPLOAD_ID/original.jpg

# Restore a specific prior generation.
gsutil cp gs://bropics-app.firebasestorage.app/uploads/.../original.jpg#GENERATION \
  gs://bropics-app.firebasestorage.app/uploads/.../original.jpg
```

`print-files/**` objects don't need this path in practice — they're
regenerable by re-invoking `POST /render/:jobId` (services/print-render)
against the same `printJobs` doc, once that job's `status` is reset to
`queued` (see `packages/shared/src/print-jobs/print-jobs.ts`).

## 4. After any restore

- Write down what was restored, from what point, and why, in
  `reconciliations` or a dated entry in PROJECT_STATUS.md — the same
  "log it, don't let it vanish silently" convention this project already
  follows for every other gap.
- Run the full test suite (`pnpm -r typecheck && pnpm test && pnpm
  test:rules`) against whatever environment now holds the restored data,
  before resuming normal write traffic to it.
