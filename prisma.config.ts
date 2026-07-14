import 'dotenv/config'
import { defineConfig } from 'prisma/config'

// Prisma 7 は .env を自動では読まないため dotenv で明示的に読む。
// datasource.url は migrate / introspect 系 CLI が使う
// (アプリ実行時の接続は src/lib/db.ts の driver adapter 経由)。
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? '',
  },
})
