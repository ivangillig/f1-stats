# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# NEXT_PUBLIC_ vars are baked into the JS bundle at build time.
# Leave NEXT_PUBLIC_PROXY_URL empty so the browser uses the same-origin
# /api/proxy Next.js rewrite (→ INTERNAL_PROXY_URL, proxy stays internal).
# Only set it to a PUBLIC https URL if you intentionally expose the proxy.
# NEVER default it to localhost — it bakes into every visitor's browser.
ARG NEXT_PUBLIC_PROXY_URL=
ENV NEXT_PUBLIC_PROXY_URL=${NEXT_PUBLIC_PROXY_URL}

# Server-side rewrite destination: the internal Docker hostname where the proxy
# runs. Baked into routes-manifest.json at build time (Next.js evaluates
# next.config.js rewrites during `next build`, not at server startup).
ARG INTERNAL_PROXY_URL=
ENV INTERNAL_PROXY_URL=${INTERNAL_PROXY_URL}

# Build the Next.js app
RUN npm run build

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy necessary files
COPY --from=builder /app/next.config.js ./
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
