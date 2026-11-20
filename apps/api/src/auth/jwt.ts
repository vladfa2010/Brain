import { SignJWT, jwtVerify } from 'jose'
import { env } from '../env.js'

const ISSUER = 'secondbrain'
const AUDIENCE = 'secondbrain-web'

function secret(): Uint8Array {
  return new TextEncoder().encode(env.jwtSecret)
}

export type AccessClaims = { sub: string; email: string; name: string | null }

/** Короткоживущий access-токен (15 минут) — в памяти клиента, не в localStorage. */
export async function signAccess(user: { id: string; email: string; name: string | null }): Promise<string> {
  return new SignJWT({ email: user.email, name: user.name })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(user.id)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(secret())
}

export async function verifyAccess(token: string): Promise<AccessClaims | null> {
  try {
    const { payload } = await jwtVerify(token, secret(), { issuer: ISSUER, audience: AUDIENCE })
    if (!payload.sub) return null
    return {
      sub: payload.sub,
      email: typeof payload.email === 'string' ? payload.email : '',
      name: typeof payload.name === 'string' ? payload.name : null,
    }
  } catch {
    return null
  }
}
