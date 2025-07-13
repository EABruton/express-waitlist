# syntax=docker/dockerfile:1
FROM node:latest AS base

WORKDIR /usr/local/app


FROM base AS builder

ARG NODE_ENV=prod
ENV NODE_ENV=${NODE_ENV}

# install packages
COPY package*.json ./
RUN if [ "$NODE_ENV" = "prod" ]; then \
      npm ci --only=production; \
    else \
      npm ci; \
    fi

# bundle javascript / css
COPY src/ src/
COPY webpack.config.js ./
COPY .babelrc ./
COPY shared-constants/ src/js/shared-constants/
RUN npm run build


# main app
FROM base AS runtime

WORKDIR /usr/local/app

COPY . ./
COPY --from=builder /usr/local/app/node_modules ./node_modules
# only copy over the dist part, rather than the raw javascript / css
COPY --from=builder /usr/local/app/public/dist ./public/dist

EXPOSE 3000
