import pg from 'pg'
import { env } from './env.js'

export const pool = new pg.Pool({ connectionString: env.databaseUrl, max: 10 })

export async function q<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const res = await pool.query(text, params as never[])
  return res.rows as T[]
}

export async function one<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await q<T>(text, params)
  return rows[0] ?? null
}

export async function tx<T>(fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('begin')
    const result = await fn(client)
    await client.query('commit')
    return result
  } catch (err) {
    await client.query('rollback')
    throw err
  } finally {
    client.release()
  }
}
