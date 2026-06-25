# ---- build stage ----
# debian-slim (not alpine) — far more reliable for Prisma's query engine.
FROM node:20-slim AS builder
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
# --include=dev is REQUIRED: the NestJS CLI + Prisma CLI are devDependencies
# and are needed to build. Railway sets NODE_ENV=production at build time,
# which would otherwise make npm skip them and leave dist/ unbuilt.
RUN npm ci --include=dev
COPY . .
# `npm run build` = prisma generate && nest build  ->  produces dist/
RUN npm run build

# ---- runtime stage ----
FROM node:20-slim
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production
# Copy the built app + node_modules (incl. the generated Prisma client).
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./
# Railway injects PORT; main.ts listens on process.env.PORT and 0.0.0.0.
CMD ["node", "dist/main.js"]
