FROM node:22-alpine AS build
WORKDIR /app
ARG VITE_API_BASE=http://localhost:21114
ENV VITE_API_BASE=$VITE_API_BASE
COPY package*.json ./
COPY web/package*.json web/
COPY server/package*.json server/
RUN npm ci
COPY web web
RUN npm --workspace @rustdesk-admin/web run build

FROM nginx:1.27-alpine
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/web/dist /usr/share/nginx/html
EXPOSE 80
