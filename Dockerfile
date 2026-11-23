# Multi-Stage Production Dockerfile for LedgerFlow Enterprise SaaS
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json tsconfig.json ./
COPY prisma ./prisma/
RUN npm ci
RUN npx prisma generate

COPY src ./src
COPY ledgerflow_expense_tracker ./ledgerflow_expense_tracker
RUN npm run build || true

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --omit=dev
RUN npx prisma generate

COPY --from=builder /app/src ./src
COPY --from=builder /app/ledgerflow_expense_tracker ./ledgerflow_expense_tracker
COPY --from=builder /app/tsconfig.json ./tsconfig.json

RUN npm install -g tsx

EXPOSE 4000 4001 4002 4003
CMD ["tsx", "src/server.ts"]
