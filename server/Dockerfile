# --- Build Stage ---
FROM node:20-slim AS builder

WORKDIR /app

# Install openssl for Prisma
RUN apt-get update && apt-get install -y openssl python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

COPY . .

# Generate Prisma client and build the TS code
RUN npx prisma generate
RUN npm run build

# --- Production Stage ---
FROM node:20-slim

WORKDIR /app

# Install openssl for Prisma runtime
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

EXPOSE 4000

# We use a shell form to allow environment variable expansion if needed, 
# or a script to run migrations before starting.
CMD ["node", "dist/index.js"]
