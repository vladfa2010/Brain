import Fastify from 'fastify'
import cors from '@fastify/cors'
import cookie from '@fastify/cookie'
import fastifyStatic from '@fastify/static'
import { randomBytes } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { env } from './env.js'
import { registerCardRoutes } from './routes/cards.js'
import { registerReadRoutes } from './routes/read.js'
import { registerCaptureRoutes } from './routes/capture.js'
import { registerAgentRoutes } from './routes/agent.js'
import { registerAuthRoutes } from './auth/routes.js'
import { registerAuthGuard } from './auth/guard.js'
import { startJobs } from './jobs.js'
import { runAgent } from './agent/run.js'

if (!env.jwtSecret) {
  if (process.env.NODE_ENV === 'production') {
    console.error('JWT_SECRET не задан. В production это обязательная переменная.')
    process.exit(1)
  }
  env.jwtSecret = randomBytes(32).toString('base64url')
  console.warn('[auth] JWT_SECRET не задан — сгенерирован временный, токены умрут при перезапуске.')
}

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
  bodyLimit: 5 * 1024 * 1024,
  trustProxy: env.trustProxy,
})

// CORS только для своих origin'ов: отражать любой Origin с credentials нельзя
const allowedOrigins = new Set(env.webOrigins)
await app.register(cors, {
  credentials: true,
  origin(origin, cb) {
    if (!origin) return cb(null, true)
    return cb(null, allowedOrigins.has(origin))
  },
})
await app.register(cookie)
registerAuthGuard(app)

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

app.addHook('onSend', async (req, reply, payload) => {
  reply.header('x-content-type-options', 'nosniff')
  reply.header('x-frame-options', 'DENY')
  reply.header('referrer-policy', 'strict-origin-when-cross-origin')
  reply.header('permissions-policy', 'camera=(), microphone=(), geolocation=()')
  reply.header('cross-origin-opener-policy', 'same-origin')
  if (env.cookieSecure) {
    reply.header('strict-transport-security', 'max-age=31536000; includeSubDomains')
  }
  // CSP ставим только на собранный фронт: в dev Vite вставляет инлайн-скрипты
  if (env.serveWeb && !req.url.startsWith('/api') && (reply.getHeader('content-type') ?? '').toString().includes('text/html')) {
    reply.header('content-security-policy', CSP)
  }
  return payload
})

app.setErrorHandler((error: unknown, _req, reply) => {
  const err = error as { statusCode?: number; name?: string; code?: string; message?: string }
  const isValidation = err.name === 'ZodError'
  const status = err.statusCode ?? (isValidation ? 400 : 500)
  if (status >= 500) app.log.error(err)
  if (isValidation) {
    const issues = (err as { issues?: { message?: string; path?: (string | number)[] }[] }).issues ?? []
    const first = issues[0]
    return reply.code(400).send({
      error: 'validation_error',
      message: first?.message ?? 'Некорректные данные',
      field: first?.path?.join('.'),
    })
  }
  reply.code(status).send({
    error: err.code ?? 'error',
    message: status >= 500 ? 'Внутренняя ошибка' : err.message,
  })
})

app.get('/api/health', async () => ({ ok: true, t: new Date().toISOString() }))

registerAuthRoutes(app)
registerReadRoutes(app)
registerCardRoutes(app)
registerCaptureRoutes(app)
registerAgentRoutes(app)

if (env.serveWeb) {
  const webDist = resolve(dirname(fileURLToPath(import.meta.url)), '../../web/dist')
  await app.register(fastifyStatic, { root: webDist, wildcard: false })
  app.setNotFoundHandler((req, reply) => {
    const url = req.url.split('?')[0]
    const looksLikeFile = /\.[a-z0-9]+$/i.test(url)
    if (req.method !== 'GET' || url.startsWith('/api') || url.startsWith('/assets') || looksLikeFile) {
      return reply.code(404).send({ error: 'not_found' })
    }
    return reply.sendFile('index.html')
  })
  console.log(`Отдаю фронт из ${webDist}`)
}

await app.listen({ port: env.port, host: env.host })
console.log(`SecondBrain API на http://${env.host}:${env.port}`)

if (process.env.JOBS !== 'off') startJobs()

if (process.env.AGENT_ONCE === '1') {
  runAgent('manual').then((r) => console.log(r.summary)).catch(console.error)
}
