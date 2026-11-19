# One image for both processes: `node server.js` (dashboard + API) and `pnpm worker`.
FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY . .
RUN pnpm build

FROM base AS runtime
# git/tar for cloning and build contexts; Railpack (pinned, checksum-verified) for repos without a Dockerfile.
ARG RAILPACK_VERSION=0.43.0
ARG RAILPACK_SHA256=248a8f60f36854aabed6124113631078a802de3461660855fc4de9c26065c1fb
RUN apk add --no-cache git tar docker-cli tini \
 && wget -qO /tmp/railpack.tgz "https://github.com/railwayapp/railpack/releases/download/v${RAILPACK_VERSION}/railpack-v${RAILPACK_VERSION}-x86_64-unknown-linux-musl.tar.gz" \
 && echo "${RAILPACK_SHA256}  /tmp/railpack.tgz" | sha256sum -c - \
 && tar -xzf /tmp/railpack.tgz -C /usr/local/bin railpack \
 && rm /tmp/railpack.tgz
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
COPY package.json pnpm-workspace.yaml tsconfig.json drizzle.config.ts ./
COPY src ./src
EXPOSE 3000
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "server.js"]
