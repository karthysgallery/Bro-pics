#!/bin/zsh
# Sets up the Flat 50% offer on the LIVE site — run by the owner, AFTER the website update with the offer is live,
# signed in to Google as karthysgallery@gmail.com (gcloud auth application-default login).
#   zsh scratch/flat50/run-setup-offer.sh
# Creates "Your Photo Frame" as a DRAFT, the offer page /offers/flat-50 switched OFF, and the homepage banner
# switched OFF (with the three banner pictures). Nothing is shown to customers until you switch them on in Admin.
# Safe to run again.
set -e
cd "$(dirname "$0")/../../apps/web"
export GCLOUD_PROJECT=bropics-app BUCKET=bropics-app.firebasestorage.app CONFIRM=bropics-app
unset FIRESTORE_EMULATOR_HOST FIREBASE_STORAGE_EMULATOR_HOST FIREBASE_AUTH_EMULATOR_HOST
NODE_OPTIONS="--require $(cd ../../scratch/collage-import && pwd)/no-server-only.cjs" npx tsx ../../scratch/flat50/setup-offer.ts
