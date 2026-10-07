FROM oven/bun:1.4.2-alpine AS build

WORKDIR /app

# Dependency layer first: manifests only, so an app or docs edit does not re-run the install.
COPY package.json bun.lock bunfig.toml ./
COPY packages ./packages
# `cli/` carries the `prepare` script bun runs after install, so it has to be present here.
COPY cli ./cli
RUN bun install --frozen-lockfile

# The template ships apps/ empty; the image installs the reference combination without agent wiring.
COPY templates ./templates
RUN bun erp init --apps server,web --yes --no-agents

# The remaining sources come last, keeping the install and catalog layers cached.
COPY . .
RUN APP_DEPLOY_TARGET=bun APP_WEB_MODE=integrated bun erp build
RUN bun install --production --frozen-lockfile
# Development-only files never run in the container.
RUN rm -rf apps/server/tests apps/server/cli packages/*/tests

FROM oven/bun:1.4.2-alpine AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build --chown=bun:bun /app/package.json ./package.json
COPY --from=build --chown=bun:bun /app/bunfig.toml ./bunfig.toml
COPY --from=build --chown=bun:bun /app/node_modules ./node_modules
# Workspace packages: `bun install` links every workspace member into each app's node_modules, so
# the runtime needs the whole tree. It is ~0.8 MB of source, and a hand-derived list (the old
# packages/utils-only copy) dangles the moment a server app imports another package.
COPY --from=build --chown=bun:bun /app/packages ./packages
COPY --from=build --chown=bun:bun /app/apps/server ./apps/server
COPY --from=build --chown=bun:bun /app/apps/web/dist ./apps/web/dist
RUN mkdir -p /app/.data/storage && chown -R bun:bun /app/.data

USER bun
EXPOSE 3000

# Same probe as compose.yaml, now part of the image itself.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD bun -e "fetch('http://127.0.0.1:3000/api/v1/health').then((response) => process.exit(response.ok ? 0 : 1)).catch(() => process.exit(1))"

CMD ["bun", "apps/server/bootstrap/server.ts", "--with-jobs"]
