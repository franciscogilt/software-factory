# syntax=docker/dockerfile:1
# Background worker: sends emails and other queued work. The runtime image holds only Node and one bundled file.
FROM node:22.23-alpine AS build
RUN apk upgrade --no-cache
RUN npm install -g pnpm@10.28.0
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY scripts/bundle.mjs scripts/bundle.mjs
COPY packages/db packages/db
COPY packages/jobs packages/jobs
RUN pnpm install --frozen-lockfile --filter @factory/jobs...
RUN cd packages/jobs && node ../../scripts/bundle.mjs src/worker.ts /out/worker.mjs

FROM node:22.23-alpine
# Pick up OS security fixes, and remove the package managers: the runtime never installs anything.
RUN apk upgrade --no-cache \
 && rm -rf /usr/local/lib/node_modules /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /opt/yarn*
WORKDIR /app
COPY --from=build /out/worker.mjs dist/worker.mjs
USER node
CMD ["node", "dist/worker.mjs"]
