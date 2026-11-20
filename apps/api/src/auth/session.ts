import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { one, q } from '../db.js'
import { env } from '../env.js'

export const REFRESH_COOKIE = 'sb_rt'
const TTL_DAYS = 30

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'strict' as const,
    secure: env.cookieSecure,
    path: '/api/auth',
    maxAge: TTL_DAYS * 24 * 3600,
  }
}

function setRefreshCookie(reply: FastifyReply, value: string) {
  reply.setCookie(REFRESH_COOKIE, value, cookieOptions())
}

export function clearRefreshCookie(reply: FastifyReply) {
  reply.clearCookie(REFRESH_COOKIE, { ...cookieOptions(), maxAge: 0 })
}

/** Ставит новую refresh-сессию. В куке — `id.секрет`, в базе только хеш секрета. */
export async function issueRefresh(userId: string, req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const secret = randomBytes(32).toString('base64url')
  const row = await one<{ id: string }>(
    `insert into refresh_tokens (user_id, token_hash, expires_at, user_agent, ip)
     values ($1, $2, now() + ($3 || ' days')::interval, $4, $5)
     returning id`,
    [
      userId,
      hashToken(secret),
      String(TTL_DAYS),
      String(req.headers['user-agent'] ?? '').slice(0, 300),
      req.ip ?? null,
    ],
  )
  setRefreshCookie(reply, `${row!.id}.${secret}`)
}

/**
 * Ротация: старый токен гасится, выдаётся новый.
 * Если пришёл уже отозванный токен — это кража, гасим все сессии пользователя.
 */
export async function rotateRefresh(
  raw: string | undefined,
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<string | null> {
  if (!raw) return null
  const [id, secret] = raw.split('.')
  if (!id || !secret) return null

  const row = await one<{
    id: string; user_id: string; token_hash: string; revoked_at: Date | null; expires_at: Date
  }>('select id, user_id, token_hash, revoked_at, expires_at from refresh_tokens where id = $1', [id])
  if (!row) return null

  if (row.revoked_at) {
    await revokeAllSessions(row.user_id)
    return null
  }
  if (new Date(row.expires_at) < new Date()) return null

  const expected = Buffer.from(row.token_hash, 'hex')
  const actual = Buffer.from(hashToken(secret), 'hex')
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null

  await revokeRefresh(row.id)
  await issueRefresh(row.user_id, req, reply)
  return row.user_id
}

export async function revokeRefresh(id: string): Promise<void> {
  await q('update refresh_tokens set revoked_at = now() where id = $1 and revoked_at is null', [id])
}

export async function revokeSessionByRaw(raw: string | undefined): Promise<void> {
  if (!raw) return
  const [id] = raw.split('.')
  if (id) await revokeRefresh(id)
}

export async function revokeAllSessions(userId: string): Promise<void> {
  await q('update refresh_tokens set revoked_at = now() where user_id = $1 and revoked_at is null', [userId])
}

export async function auditEvent(input: {
  userId?: string | null
  email?: string | null
  type: string
  req: FastifyRequest
}): Promise<void> {
  await q(
    `insert into auth_events (user_id, email, type, ip, user_agent) values ($1,$2,$3,$4,$5)`,
    [
      input.userId ?? null,
      input.email?.slice(0, 200) ?? null,
      input.type,
      input.req.ip ?? null,
      String(input.req.headers['user-agent'] ?? '').slice(0, 300),
    ],
  ).catch(() => {})
}
