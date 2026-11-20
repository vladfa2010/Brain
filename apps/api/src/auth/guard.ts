import type { FastifyInstance } from 'fastify'
import { verifyAccess } from './jwt.js'

declare module 'fastify' {
  interface FastifyRequest {
    userId: string
  }
}

const PUBLIC = ['/api/health', '/api/auth/status', '/api/auth/register', '/api/auth/login', '/api/auth/refresh', '/api/auth/logout']

export function registerAuthGuard(app: FastifyInstance) {
  app.decorateRequest('userId', '')
  app.addHook('onRequest', async (req, reply) => {
    if (!req.url.startsWith('/api')) return
    const path = req.url.split('?')[0]
    if (PUBLIC.includes(path)) return

    const header = req.headers.authorization
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null
    const claims = token ? await verifyAccess(token) : null
    if (!claims) {
      return reply.code(401).send({ error: 'unauthorized', message: 'Требуется вход' })
    }
    req.userId = claims.sub
  })
}
