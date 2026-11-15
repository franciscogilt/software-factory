# syntax=docker/dockerfile:1
# One-off migration job image.
FROM node:22.23-alpine
# Pick up OS security fixes published after the base image was built.
RUN apk upgrade --no-cache
RUN npm install -g pnpm@10.28.0
WORKDIR /repo
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/db packages/db
RUN pnpm install --frozen-lockfile --filter @factory/db...
USER node
CMD ["pnpm", "--filter", "@factory/db", "migrate"]
