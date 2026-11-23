FROM node:20-bookworm-slim

WORKDIR /app

# Native modules (@napi-rs/canvas, sqlite) need build tooling on some arches.
RUN apt-get update -qq \
    && apt-get install -y -qq --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["npm", "start"]
