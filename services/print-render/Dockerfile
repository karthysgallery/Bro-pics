FROM node:20-slim AS base
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    fontconfig \
    librsvg2-dev \
    libvips-dev \
  && rm -rf /var/lib/apt/lists/*

FROM base AS deps
COPY package.json ./
RUN npm install --omit=dev

FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Update font cache for bundled fonts
RUN fc-cache -f -v

EXPOSE 8080
CMD ["npx", "tsx", "src/server.ts"]

