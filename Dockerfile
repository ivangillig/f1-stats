# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# NEXT_PUBLIC_ vars are baked into the JS bundle at build time.
# Pass NEXT_PUBLIC_PROXY_URL so the browser connects directly to the proxy
# instead of going through the Next.js rewrite (which doesn't stream SSE properly).
ARG NEXT_PUBLIC_PROXY_URL=http://localhost:4000
ENV NEXT_PUBLIC_PROXY_URL=${NEXT_PUBLIC_PROXY_URL}

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
