FROM node:24-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:24-bookworm-slim@sha256:a5f4366e834695d5f363b920c104953a535d3a9864d1bdf74566a0ebe01daee5 AS runtime
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4173 DATA_DIR=/data MEDIA_ROOT=/media
WORKDIR /app
COPY --from=build /app/package.json ./
COPY --from=build /app/server.mjs ./
COPY --from=build /app/server ./server
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/dist/client ./dist/client
# Server modules import shared validation helpers directly from dist.
COPY --from=build /app/dist/*.js ./dist/
RUN mkdir -p /data /media && chown node:node /data /media
USER node
EXPOSE 4173
CMD ["node", "server.mjs", "--built"]
