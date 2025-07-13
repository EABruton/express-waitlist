# syntax=docker/dockerfile:1
FROM node:latest AS base

WORKDIR /usr/local/app

COPY package*.json ./

# === Development Stage ===
FROM base AS dev
ENV NODE_ENV=dev
RUN npm ci
COPY . .


# === Build Stage ===
FROM base AS builder
ENV NODE_ENV=production
RUN npm ci --omit=dev

COPY src/ ./src/
COPY webpack.config.js ./
COPY .babelrc ./

RUN npm run build


# === Test Build Stage ===
FROM base AS test
ENV NODE_ENV=test

COPY . .
COPY --from=builder /usr/local/app/node_modules ./node_modules
COPY --from=builder /usr/local/app/public/dist ./public/dist


# === Runtime Image ===
FROM base AS runtime
ENV NODE_ENV=production

COPY . .
COPY --from=builder /usr/local/app/node_modules ./node_modules
COPY --from=builder /usr/local/app/public/dist ./public/dist

