# Print renderer for Cloud Run.
#
# Build the bundle first (it inlines @bro-pics/shared, which is a pnpm
# workspace package and cannot be installed from npm):
#   pnpm --filter @bro-pics/print-render bundle
# then deploy this directory (see DEPLOY.md). The image only installs the
# three runtime packages, inside Linux, so sharp gets its Linux binaries.
FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends fontconfig \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production
ENV PRINT_RENDER_FONTS_DIR=/app/fonts

COPY deploy/package.json ./package.json
RUN npm install --omit=dev --no-audit --no-fund

COPY lib ./lib
COPY fonts ./fonts
RUN fc-cache -f

# Cloud Run sets PORT (8080).
EXPOSE 8080
USER node
CMD ["node", "lib/server.js"]
