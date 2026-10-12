# Website container for Cloud Run. Build from the REPOSITORY ROOT:
#   docker build -f apps/web/Dockerfile --build-arg ... .
# Only NEXT_PUBLIC_* values (public, baked into the browser bundle) and
# SITE_PREVIEW are build args. Server secrets are given to Cloud Run at run
# time from Secret Manager — never baked into the image.

FROM node:20-slim AS build
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo

# Workspace manifests first, for a cacheable dependency install.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages/shared/package.json packages/shared/
COPY services/print-render/package.json services/print-render/
COPY functions/package.json functions/
COPY scripts/seed/package.json scripts/seed/
COPY firestore-rules-tests/package.json firestore-rules-tests/
RUN pnpm install --frozen-lockfile --filter "@bro-pics/web..."

COPY packages/shared packages/shared
COPY services/print-render services/print-render
COPY apps/web apps/web

ARG NEXT_PUBLIC_FIREBASE_API_KEY
ARG NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
ARG NEXT_PUBLIC_FIREBASE_PROJECT_ID
ARG NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
ARG NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
ARG NEXT_PUBLIC_FIREBASE_APP_ID
ARG NEXT_PUBLIC_SITE_URL
ARG NEXT_PUBLIC_WHATSAPP_NUMBER
ARG SITE_PREVIEW=0
ARG GOOGLE_CLOUD_PROJECT
# GOOGLE_ADC=1: the build reads the live catalogue (to pre-render pages) with
# the Cloud Build service account's own credentials — no key file. Build only.
ENV NEXT_OUTPUT=standalone NEXT_TELEMETRY_DISABLED=1 SITE_PREVIEW=$SITE_PREVIEW GOOGLE_ADC=1 GOOGLE_CLOUD_PROJECT=$GOOGLE_CLOUD_PROJECT
# next/font downloads the Google Fonts at build time. On Cloud Build Google now and then answers with a stylesheet
# Next.js cannot read and the build stops ("next/font ... Cannot read properties of null"), so the build is tried up to 3
# times. (Do NOT set NEXT_FONT_GOOGLE_MOCKED_RESPONSES here: it makes Next write the font's web address into the font
# file, which breaks every Google font on the live site.)
RUN for attempt in 1 2 3; do pnpm --filter @bro-pics/web build && exit 0; echo "next build attempt $attempt failed"; sleep 5; done; exit 1

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=8080 HOSTNAME=0.0.0.0
COPY --from=build /repo/apps/web/.next/standalone ./
COPY --from=build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 8080
CMD ["node", "apps/web/server.js"]
