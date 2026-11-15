# syntax=docker/dockerfile:1
# One-off migration job image. The runtime image holds only Node, one bundled file and the SQL migrations.
FROM node:22.23-alpine AS build
RUN apk upgrade --no-cache
RUN npm install -g pnpm@10.28.0
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY scripts/bundle.mjs scripts/bundle.mjs
COPY packages/db packages/db
RUN pnpm install --frozen-lockfile --filter @factory/db...
RUN cd packages/db && node ../../scripts/bundle.mjs src/migrate.ts /out/migrate.mjs

FROM node:22.23-alpine
# Pick up OS security fixes, and remove the package managers: the runtime never installs anything.
RUN apk upgrade --no-cache \
 && rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn*
WORKDIR /app
COPY --from=build /out/migrate.mjs dist/migrate.mjs
COPY packages/db/migrations migrations
USER node
CMD ["node", "dist/migrate.mjs"]
