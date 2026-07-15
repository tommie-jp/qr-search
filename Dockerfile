# ビルドステージ: 依存インストール + Prisma 生成 + Next.js standalone ビルド
FROM node:24-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
# postinstall (prisma generate) はソースコピー後に明示実行するためスキップ
RUN npm ci --ignore-scripts

COPY . .
# ビルド時のページデータ収集で db.ts が import されるためダミー URL を渡す
# (全ページ force-dynamic なので実際の接続は起きない。実行時は compose が上書き)
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build
RUN npx prisma generate && npx next build

# 実行ステージ: standalone 出力のみの最小イメージ
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

USER node
EXPOSE 3000
CMD ["node", "server.js"]
