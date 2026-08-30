# ─────────────────────────────────────────────────────────────────────────────
# Trading Wolf AI — server image (used by both `api` and `worker` services)
# Builds the Node.js backend from server/ and runs ROLE-based entrypoint.
#   docker build -f deploy/Dockerfile -t wolf-server .
# ─────────────────────────────────────────────────────────────────────────────
FROM oven/bun:1-alpine AS build
WORKDIR /app
COPY server/package.json server/tsconfig.json ./
RUN bun install
COPY server/src ./src
RUN bun run build

FROM oven/bun:1-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
RUN apk add --no-cache curl
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD curl -sf http://localhost:3001/health || exit 1
CMD ["sh", "-c", "bun dist/${ROLE:-api}.js"]
