# Build in one image, run in a much smaller one. The runtime carries the
# standalone server bundle and the static assets — no source, no package
# manager, no build toolchain.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The client is generated from the schema, so it has to exist before the build.
# public/ is optional in this project; the copy in the runtime stage needs it.
RUN mkdir -p public && npx prisma generate && npm run build

# Applying migrations needs the Prisma CLI, and the CLI needs the whole
# node_modules it was installed with. Rather than smuggle pieces of that into
# the runtime image and watch it break on the next Prisma release, migrations
# run from their own short-lived container.
FROM node:22-alpine AS migrator
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY prisma ./prisma
CMD ["npx", "prisma", "migrate", "deploy"]

# Backups need `pg_dump` and `pg_restore` of the same major version as the
# server, so this starts from the Postgres image rather than trying to install
# a client into something else. The scripts are copied in rather than written
# into a compose file: a backup is the last thing that should be unreadable.
FROM postgres:16-alpine AS backup
COPY scripts/backup.sh scripts/backup-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/backup-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/backup-entrypoint.sh"]

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Nothing here needs root.
RUN addgroup -g 1001 -S nodejs && adduser -S -u 1001 -G nodejs tracker

# `output: "standalone"` traces exactly what the server imports — the Prisma
# client and its query engine included.
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public

# Uploads live on a volume; the image must not own the data.
RUN mkdir -p /app/uploads && chown -R tracker:nodejs /app/uploads
VOLUME ["/app/uploads"]

USER tracker
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
