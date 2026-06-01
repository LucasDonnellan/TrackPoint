# ── Frontend Dockerfile ───────────────────────────────────────────────────────
# Build React, then serve with Nginx.

FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm build --legacy-peer-deps
COPY . .
RUN npm run build


FROM nginx:1.25-alpine

COPY --from=builder /app/build /usr/share/nginx/html

# React Router requires all paths to serve index.html
RUN echo 'server { \
  listen 80; \
  root /usr/share/nginx/html; \
  index index.html; \
  location / { try_files $uri $uri/ /index.html; } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80
