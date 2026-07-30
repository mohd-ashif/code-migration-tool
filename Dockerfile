# Stage 1: Build stage
FROM node:20-alpine AS builder
WORKDIR /app

# Copy root package files
COPY package*.json ./
COPY packages/backend/package*.json ./packages/backend/

# Install dependencies for workspace
RUN npm ci --workspace=packages/backend

# Copy backend source
COPY packages/backend ./packages/backend

# Compile TypeScript
RUN npm --prefix packages/backend run build

# Stage 2: Runtime stage
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
COPY packages/backend/package*.json ./packages/backend/

# Install production dependencies only
RUN npm ci --workspace=packages/backend --only=production

# Copy compiled output & DB migration scripts
COPY --from=builder /app/packages/backend/dist ./packages/backend/dist
COPY --from=builder /app/packages/backend/scripts ./packages/backend/scripts
COPY --from=builder /app/packages/backend/db ./packages/backend/db

EXPOSE 4000

CMD ["node", "packages/backend/dist/index.js"]
