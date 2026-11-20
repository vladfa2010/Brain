import { config } from 'dotenv'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// .env лежит в корне репозитория, а pnpm запускает API из apps/api —
// поэтому путь задаём явно, иначе ключи молча не подхватятся.
const here = dirname(fileURLToPath(import.meta.url))
config({ path: resolve(here, '../../../.env'), quiet: true })
config({ quiet: true }) // локальный .env рядом с API, если появится

export const env = {
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://localhost:5432/secondbrain',
  port: Number(process.env.API_PORT ?? 4010),
  host: process.env.API_HOST || '127.0.0.1',
  webOrigin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
  deepseekKey: process.env.DEEPSEEK_API_KEY || null,
  llmModel: process.env.LLM_MODEL || 'deepseek-flash',
  llmBaseUrl: (process.env.LLM_BASE_URL || 'https://api.deepseek.com').replace(/\/$/, ''),
  timezone: process.env.TZ || 'Asia/Yekaterinburg',
  // production: тот же процесс отдаёт и API, и собранный фронт (один origin)
  serveWeb: process.env.SERVE_WEB === '1',
  // если задан — все /api требуют Bearer-токен (обязательно для VDS)
  authToken: process.env.AUTH_TOKEN || null,
}
