# syntax=docker/dockerfile:1
# One-off migration job image.
FROM node:22.12-alpine
RUN corepack enable
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/db packages/db
RUN pnpm install --frozen-lockfile --filter @factory/db...
USER node
CMD ["pnpm", "--filter", "@factory/db", "migrate"]
