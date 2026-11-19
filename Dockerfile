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
# git/tar for cloning and build contexts; docker-cli so the worker can talk to the host daemon if needed.
RUN apk add --no-cache git tar docker-cli tini \
 && wget -qO- https://railpack.com/install.sh | sh -s -- --bin-dir /usr/local/bin || echo "railpack install skipped"
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
