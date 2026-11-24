# Multi-Stage Production Dockerfile for LedgerFlow Enterprise SaaS
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json tsconfig.json ./
COPY prisma ./prisma/
RUN npm ci
RUN npx prisma@6.3.1 generate

COPY src ./src
COPY public ./public
COPY index.html styles.css app.js ./
COPY api ./api
COPY ledgerflow_expense_tracker ./ledgerflow_expense_tracker
RUN npm run build || true

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --omit=dev
RUN npx prisma@6.3.1 generate

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/src ./src
COPY --from=builder /app/public ./public
COPY --from=builder /app/index.html ./index.html
COPY --from=builder /app/styles.css ./styles.css
COPY --from=builder /app/app.js ./app.js
COPY --from=builder /app/api ./api
COPY --from=builder /app/ledgerflow_expense_tracker ./ledgerflow_expense_tracker
COPY --from=builder /app/tsconfig.json ./tsconfig.json

RUN npm install -g tsx

EXPOSE 4000 4001 4002 4003
CMD ["tsx", "src/server.ts"]
