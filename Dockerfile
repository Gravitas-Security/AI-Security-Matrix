# ── Build stage ──────────────────────────────────────────────
FROM node:26-alpine AS builder
WORKDIR /app
COPY package.json .
RUN npm install --production

# ── Runtime stage ─────────────────────────────────────────────
FROM dhi.io/node:26-alpine
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY server.js .
COPY public/ ./public/

EXPOSE 3000

CMD ["node", "server.js"]
