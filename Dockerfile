FROM oven/bun:1.4.2-alpine AS build

WORKDIR /app

COPY . .
RUN bun install --frozen-lockfile
RUN APP_DEPLOY_TARGET=bun APP_WEB_MODE=integrated bun erp build
RUN bun install --production --frozen-lockfile

FROM oven/bun:1.4.2-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build --chown=bun:bun /app/package.json ./package.json
COPY --from=build --chown=bun:bun /app/bunfig.toml ./bunfig.toml
COPY --from=build --chown=bun:bun /app/node_modules ./node_modules
COPY --from=build --chown=bun:bun /app/apps/server ./apps/server
COPY --from=build --chown=bun:bun /app/apps/web/dist ./apps/web/dist
COPY --from=build --chown=bun:bun /app/packages/utils ./packages/utils
RUN mkdir -p /app/.data/storage && chown -R bun:bun /app/.data

USER bun
EXPOSE 3000

CMD ["bun", "apps/server/server.ts", "--with-jobs"]
