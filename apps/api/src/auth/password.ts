import { randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'

const scrypt = promisify(scryptCb) as (
  password: string | Buffer, salt: Buffer, keylen: number, options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>

// scrypt из стандартной библиотеки: без нативных сборок и без внешних зависимостей.
const N = 32768
const R = 8
const P = 1
const KEYLEN = 64
const MAXMEM = 128 * 1024 * 1024

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scrypt(password.normalize('NFKC'), salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM })
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$')
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false
  const [, n, r, p, saltB64, keyB64] = parts
  try {
    const salt = Buffer.from(saltB64, 'base64')
    const expected = Buffer.from(keyB64, 'base64')
    const key = await scrypt(password.normalize('NFKC'), salt, expected.length, {
      N: Number(n), r: Number(r), p: Number(p), maxmem: MAXMEM,
    })
    return key.length === expected.length && timingSafeEqual(key, expected)
  } catch {
    return false
  }
}
