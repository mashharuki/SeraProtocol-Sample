# Sera FX Telegram Bot — Cloud Run image
FROM oven/bun:1 AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1
WORKDIR /app
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src

# Cloud Run injects PORT; the app reads it from env.
EXPOSE 3000
CMD ["bun", "src/index.ts"]
