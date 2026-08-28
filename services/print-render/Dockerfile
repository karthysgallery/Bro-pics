FROM node:20-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json ./
RUN npm install --omit=dev

FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 8080
CMD ["npx", "tsx", "src/server.ts"]
