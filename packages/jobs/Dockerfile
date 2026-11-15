# syntax=docker/dockerfile:1
# Background worker: sends emails and other queued work.
FROM node:22.12-alpine
RUN npm install -g pnpm@10.28.0
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/db packages/db
COPY packages/jobs packages/jobs
RUN pnpm install --frozen-lockfile --filter @factory/jobs...
USER node
CMD ["pnpm", "--filter", "@factory/jobs", "worker"]
