# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app
# Copy package files, prisma schema và config
COPY package*.json ./
COPY prisma ./prisma/
COPY prisma.config.ts ./

# Install all dependencies
RUN npm install

# Copy source code
COPY . .

# Generate Prisma Client (output → /app/generated/prisma theo schema.prisma)
RUN npx prisma generate

# Build NestJS app
RUN npm run build

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# Copy package files, install production deps + đúng phiên bản prisma
COPY package*.json ./
RUN npm install --omit=dev && npm install prisma@7.8.0 dotenv

# Copy build output từ builder
COPY --from=builder /app/dist ./dist

# Copy Prisma generated client (custom output path)
COPY --from=builder /app/generated ./generated

# Copy prisma schema + config (cần để migrate deploy)
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/prisma.config.ts ./

ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main"]
