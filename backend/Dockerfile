# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Generate Prisma Client
RUN npx prisma generate

# Build the application
RUN npm run build

# Stage 2: Production
FROM node:20-alpine

WORKDIR /app

# Copy package files and install production only dependencies
COPY package*.json ./
RUN npm install --omit=dev && npm install prisma@5.8.0

# Copy built files and prisma from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma

# Environment variables (Defaults - should be overridden by docker-compose)
ENV NODE_ENV=production
ENV PORT=5000

EXPOSE 5000

# Start the application
CMD npx prisma migrate deploy && node dist/main
