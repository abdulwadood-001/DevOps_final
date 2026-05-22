# ---- Build stage ----
FROM node:18-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY . .

# ---- Runtime stage ----
FROM node:18-alpine
WORKDIR /app
COPY --from=builder /app /app
EXPOSE 3000
USER node
CMD ["node", "server.js"]
