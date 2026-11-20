import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { one, q } from '../db.js'
import { hashPassword, verifyPassword } from './password.js'
import { signAccess } from './jwt.js'
import {
  auditEvent, clearRefreshCookie, issueRefresh, REFRESH_COOKIE,
  revokeAllSessions, revokeSessionByRaw, rotateRefresh,
} from './session.js'

const LOCK_AFTER = 5
const LOCK_MINUTES = 15

// Простой лимитер в памяти: защищает от перебора до того, как включится блокировка аккаунта.
const buckets = new Map<string, { count: number; reset: number }>()
function allow(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || bucket.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs })
    return true
  }
  if (bucket.count >= limit) return false
  bucket.count += 1
  return true
}
setInterval(() => {
  const now = Date.now()
  for (const [key, bucket] of buckets) if (bucket.reset < now) buckets.delete(key)
}, 60_000).unref()

const emailField = z.string().trim().toLowerCase().email('Некорректная почта').max(200)
const passwordField = z.string().min(10, 'Пароль короче 10 символов').max(200)

// Хеш-пустышка: проверяем пароль даже для несуществующей почты,
// иначе по времени ответа видно, зарегистрирован аккаунт или нет.
const DUMMY_HASH = hashPassword('dummy-password-for-constant-time-000')

const publicUser = (u: { id: string; email: string; name: string | null }) => ({
  id: u.id, email: u.email, name: u.name,
})

const DEFAULT_AREAS: [string, string, string][] = [
  ['Бизнес', '◆', 'oxide'],
  ['Здоровье', '◐', 'sage'],
  ['Дом', '⌂', 'sand'],
  ['Знания', '✦', 'blue'],
]

export function registerAuthRoutes(app: FastifyInstance) {
  // публично: нужно, чтобы первый экран понимал, показывать вход или регистрацию
  app.get('/api/auth/status', async () => {
    const row = await one<{ n: string }>('select count(*) as n from users')
    return { hasUsers: Number(row?.n ?? 0) > 0 }
  })

  app.post('/api/auth/register', async (req, reply) => {
    reply.header('cache-control', 'no-store')
    if (!allow(`register:${req.ip ?? 'unknown'}`, 5, 60_000)) {
      return reply.code(429).send({ error: 'rate_limited', message: 'Слишком много попыток. Подождите минуту.' })
    }

    const body = z
      .object({
        email: emailField,
        password: passwordField,
        name: z.string().trim().max(80).optional(),
      })
      .parse(req.body ?? {})

    if (!/[a-zа-яё]/i.test(body.password) || !/\d/.test(body.password)) {
      return reply.code(400).send({
        error: 'weak_password',
        message: 'Нужен пароль минимум из 10 символов, с буквами и цифрами.',
      })
    }
    const localPart = body.email.split('@')[0]
    if (localPart.length > 2 && body.password.toLowerCase().includes(localPart)) {
      return reply.code(400).send({ error: 'weak_password', message: 'Пароль не должен содержать почту.' })
    }

    const existing = await one('select id from users where lower(email) = lower($1)', [body.email])
    if (existing) {
      return reply.code(409).send({ error: 'email_taken', message: 'Эта почта уже зарегистрирована.' })
    }

    const user = await one<{ id: string; email: string; name: string | null }>(
      `insert into users (email, password_hash, name) values ($1, $2, $3)
       returning id, email, name`,
      [body.email, await hashPassword(body.password), body.name?.trim() || null],
    )

    let i = 0
    for (const [name, glyph, hue] of DEFAULT_AREAS) {
      await q('insert into areas (user_id, name, glyph, hue, sort_order) values ($1,$2,$3,$4,$5)', [
        user!.id, name, glyph, hue, i++ * 1024,
      ])
    }

    await q(
      `insert into settings (user_id, key, value) values
         ($1, 'day_budget', '3'), ($1, 'wip_limit', '4'), ($1, 'user_name', $2)
       on conflict (user_id, key) do nothing`,
      [user!.id, JSON.stringify(body.name?.trim() || '')],
    )

    await issueRefresh(user!.id, req, reply)
    await auditEvent({ userId: user!.id, email: user!.email, type: 'register', req })
    return reply.code(201).send({ accessToken: await signAccess(user!), user: publicUser(user!) })
  })

  app.post('/api/auth/login', async (req, reply) => {
    reply.header('cache-control', 'no-store')
    const ip = req.ip ?? 'unknown'
    if (!allow(`login:${ip}`, 20, 60_000)) {
      return reply.code(429).send({ error: 'rate_limited', message: 'Слишком много попыток. Подождите минуту.' })
    }

    const body = z.object({ email: emailField, password: z.string().max(200) }).parse(req.body ?? {})
    const invalid = () =>
      reply.code(401).send({ error: 'invalid_credentials', message: 'Неверная почта или пароль.' })

    const user = await one<{
      id: string; email: string; name: string | null; password_hash: string
      failed_attempts: number; locked_until: Date | null
    }>('select id, email, name, password_hash, failed_attempts, locked_until from users where lower(email) = lower($1)', [body.email])

    if (user?.locked_until && new Date(user.locked_until) > new Date()) {
      return reply.code(429).send({
        error: 'locked', message: `Слишком много попыток. Вход заблокирован на ${LOCK_MINUTES} минут.`,
      })
    }

    const ok = await verifyPassword(body.password, user?.password_hash ?? (await DUMMY_HASH))
    if (!user || !ok) {
      if (user) {
        const attempts = Number(user.failed_attempts) + 1
        const lock = attempts >= LOCK_AFTER
        await q(
          `update users set failed_attempts = $2,
             locked_until = case when $3 then now() + ($4 || ' minutes')::interval else locked_until end
           where id = $1`,
          [user.id, lock ? 0 : attempts, lock, String(LOCK_MINUTES)],
        )
      }
      await auditEvent({ userId: user?.id ?? null, email: body.email, type: 'login_failed', req })
      return invalid()
    }

    await q(
      'update users set failed_attempts = 0, locked_until = null, last_login_at = now() where id = $1',
      [user.id],
    )
    await issueRefresh(user.id, req, reply)
    await auditEvent({ userId: user.id, email: user.email, type: 'login', req })
    return { accessToken: await signAccess(user), user: publicUser(user) }
  })

  app.post('/api/auth/refresh', async (req, reply) => {
    reply.header('cache-control', 'no-store')
    const userId = await rotateRefresh(req.cookies[REFRESH_COOKIE], req, reply)
    if (!userId) {
      clearRefreshCookie(reply)
      return reply.code(401).send({ error: 'unauthorized', message: 'Сессия истекла' })
    }
    const user = await one<{ id: string; email: string; name: string | null }>(
      'select id, email, name from users where id = $1',
      [userId],
    )
    if (!user) {
      clearRefreshCookie(reply)
      return reply.code(401).send({ error: 'unauthorized' })
    }
    return { accessToken: await signAccess(user), user: publicUser(user) }
  })

  app.post('/api/auth/logout', async (req, reply) => {
    await revokeSessionByRaw(req.cookies[REFRESH_COOKIE])
    clearRefreshCookie(reply)
    return { ok: true }
  })

  app.post('/api/auth/logout-all', async (req) => {
    await revokeAllSessions(req.userId)
    return { ok: true }
  })

  app.get('/api/auth/me', async (req, reply) => {
    const user = await one<{ id: string; email: string; name: string | null; created_at: string }>(
      'select id, email, name, created_at from users where id = $1',
      [req.userId],
    )
    if (!user) return reply.code(401).send({ error: 'unauthorized' })
    return { user: { ...publicUser(user), createdAt: user.created_at } }
  })
}
