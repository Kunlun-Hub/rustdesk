FROM node:22-alpine AS deps
WORKDIR /app
COPY package*.json ./
COPY server/package*.json server/
COPY web/package*.json web/
RUN npm ci

FROM deps AS build
COPY server server
RUN npm --workspace @rustdesk-admin/server run prisma:generate
RUN npm --workspace @rustdesk-admin/server run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY server/package*.json server/
RUN npm ci --omit=dev --workspace @rustdesk-admin/server
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/server/prisma server/prisma
COPY --from=build /app/server/node_modules/.prisma server/node_modules/.prisma
COPY server/docker-entrypoint.sh server/docker-entrypoint.sh
RUN chmod +x server/docker-entrypoint.sh
RUN mkdir -p /data/recordings
EXPOSE 21114
ENTRYPOINT ["server/docker-entrypoint.sh"]
CMD ["node", "server/dist/src/index.js"]
