# Deploying the print renderer

The renderer turns a paid order item into its print file. It is private:
only the project's Cloud Functions may call it.

```
order paid ──► printJobs/{orderId_itemId} = queued
            ──► dispatchPrintJob (Cloud Function, asia-south1)
                  POST {PRINT_RENDER_URL}/render/{jobId} with a Google ID token
            ──► print-render (Cloud Run, asia-south1, no public access)
                  lease job ─► render printed artwork ─► store
                  print-files/{orderId}/{itemId}/print.png ─► verify stored size
                  ─► job done ─► order print_ready  (or: job failed + backoff)
sweepPrintJobs (every 5 min) re-dispatches failed-and-due, expired-lease and
lost-dispatch jobs. 5 attempts, then failed_permanent for staff.
```

**Only connect this when the live website creates print jobs.** The website
release that moves paid orders to `print_rendering` and writes `printJobs`
must be live first, or the dispatcher has nothing to do.

## 1. Build and check locally

```bash
pnpm --filter @bro-pics/print-render bundle
docker build --platform linux/amd64 -t print-render:check services/print-render
docker run --rm -p 8282:8080 -e FIREBASE_STORAGE_BUCKET=x -e GCLOUD_PROJECT=x print-render:check
# GET http://localhost:8282/health -> {"status":"ok","fonts":{"ok":true,...,"rendering":{"checked":true,"ok":true,"fallingBack":[]}}}
# "rendering" proves text is drawn in the bundled fonts (on Linux; skipped on macOS).
# fallingBack non-empty = fonts not installed for fontconfig: customer text would print in a default font.
```

## 2. Runtime identity (least privilege)

```bash
gcloud iam service-accounts create print-render --project bropics-app \
  --display-name "Print renderer (Cloud Run)"
SA=print-render@bropics-app.iam.gserviceaccount.com
gcloud projects add-iam-policy-binding bropics-app --member serviceAccount:$SA --role roles/datastore.user
gcloud storage buckets add-iam-policy-binding gs://bropics-app.firebasestorage.app \
  --member serviceAccount:$SA --role roles/storage.objectAdmin
```

## 3. Deploy privately

```bash
gcloud run deploy print-render --project bropics-app --region asia-south1 \
  --source services/print-render \
  --service-account print-render@bropics-app.iam.gserviceaccount.com \
  --no-allow-unauthenticated \
  --set-env-vars FIREBASE_STORAGE_BUCKET=bropics-app.firebasestorage.app,GCLOUD_PROJECT=bropics-app \
  --memory 2Gi --cpu 2 --concurrency 1 --max-instances 5 --timeout 540
```

The request timeout (540 s) is shorter than the job lease (10 min), so a
lease can only expire after the request that held it is gone.

## 4. Allow only the Cloud Functions to call it

```bash
# The account the functions really run as:
gcloud functions describe dispatchPrintJob --region asia-south1 --project bropics-app \
  --format "value(serviceConfig.serviceAccountEmail)"
gcloud run services add-iam-policy-binding print-render --region asia-south1 --project bropics-app \
  --member serviceAccount:<that account> --role roles/run.invoker
```

Check: `curl -X POST <url>/render/x` without a token must return **403**;
with `gcloud auth print-identity-token --audiences <url>` as an account that
has run.invoker, `GET <url>/health` returns 200.

## 5. Connect the order flow

`functions/.env.bropics-app`:

```
PRINT_RENDER_URL=https://print-render-....a.run.app
# Jobs created before this moment are left alone by the sweep (no surprise backlog):
PRINT_DISPATCH_AFTER=2026-10-07T00:00:00Z
```

```bash
firebase deploy --project bropics-app --only functions:dispatchPrintJob,functions:sweepPrintJobs
```

## 6. Verify with a test order

Place an order on the live site, then check: order `print_rendering` →
`printJobs/{orderId_itemId}` `leased` → `done` with `renderedFilePath`; the
Cloud Run request log shows `POST /render/...` 200; the Storage object
`print-files/{orderId}/{itemId}/print.png` exists with a non-zero size; the
order is `print_ready`. Cancel the test order in admin afterwards.
