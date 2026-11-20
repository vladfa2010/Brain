import Fastify from 'fastify'
import cors from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { env } from './env.js'
import { registerCardRoutes } from './routes/cards.js'
import { registerReadRoutes } from './routes/read.js'
import { registerCaptureRoutes } from './routes/capture.js'
import { registerAgentRoutes } from './routes/agent.js'
import { startJobs } from './jobs.js'
import { runAgent } from './agent/run.js'

const app = Fastify({
  logger: { level: process.env.LOG_LEVEL ?? 'info' },
  bodyLimit: 5 * 1024 * 1024,
})

await app.register(cors, { origin: true, credentials: true })

app.setErrorHandler((error: unknown, _req, reply) => {
  const err = error as { statusCode?: number; name?: string; code?: string; message?: string }
  const status = err.statusCode ?? (err.name === 'ZodError' ? 400 : 500)
  if (status >= 500) app.log.error(err)
  reply.code(status).send({
    error: err.name === 'ZodError' ? 'validation_error' : (err.code ?? 'error'),
    message: err.message,
  })
})

app.get('/api/health', async () => ({ ok: true, t: new Date().toISOString() }))

if (env.authToken) {
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api') || req.url.startsWith('/api/health')) return
    if (req.headers.authorization !== `Bearer ${env.authToken}`) {
      return reply.code(401).send({ error: 'unauthorized' })
    }
  })
}

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

// ручной прогон для проверки: `AGENT_ONCE=1 pnpm dev:api`
if (process.env.AGENT_ONCE === '1') {
  runAgent('manual').then((r) => console.log(r.summary)).catch(console.error)
}
