# syntax=docker/dockerfile:1

# --------------------------------------------------
# Stage 1: Build Curator Core Engine
# --------------------------------------------------
FROM node:22-bookworm AS curator-build
WORKDIR /workspace/curator
COPY curator/package*.json ./
COPY curator/prisma ./prisma
COPY curator/tsconfig.json ./
RUN npm install
COPY curator/src ./src
RUN npx prisma generate --schema=prisma/schema.prisma
RUN npx prisma generate --schema=prisma/sqlite/schema.prisma
RUN npm run build

# --------------------------------------------------
# Stage 2: Build Keeris Miniapp & Web Interface
# --------------------------------------------------
FROM node:22-bookworm AS keeris-build
WORKDIR /workspace

# Copy built curator
COPY --from=curator-build /workspace/curator /workspace/curator

# Setup Keeris
WORKDIR /workspace/miniapps/keeris
COPY miniapps/keeris/package*.json ./
COPY miniapps/keeris/prisma ./prisma
COPY miniapps/keeris/prisma.config.js ./prisma.config.js
RUN npm install
COPY miniapps/keeris/src ./src
COPY miniapps/keeris/web ./web
RUN npm run build

# --------------------------------------------------
# Stage 3: Production Runtime Container
# --------------------------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production
ENV PORT=4000
ENV DATABASE_PATH=/app/data/keeris.db
ENV CURATOR_DATABASE_PATH=/app/data/curator.db
ENV CURATOR_DATABASE_NAME=keeris

# Copy built curator module
COPY --chown=node:node --from=curator-build /workspace/curator /curator

# Copy Keeris app files & built assets
COPY --chown=node:node --from=keeris-build /workspace/miniapps/keeris/package.json ./package.json
COPY --chown=node:node --from=keeris-build /workspace/miniapps/keeris/node_modules ./node_modules
COPY --chown=node:node --from=keeris-build /workspace/miniapps/keeris/prisma ./prisma
COPY --chown=node:node --from=keeris-build /workspace/miniapps/keeris/prisma.config.js ./prisma.config.js
COPY --chown=node:node --from=keeris-build /workspace/miniapps/keeris/src ./src
COPY --chown=node:node --from=keeris-build /workspace/miniapps/keeris/web-dist ./web-dist

# Create persistent data directory and grant ownership
RUN mkdir -p /app/data && chown -R node:node /app/data

VOLUME ["/app/data"]
EXPOSE 4000

USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://localhost:' + (process.env.PORT || 4000) + '/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"

CMD ["node", "src/server/index.js"]