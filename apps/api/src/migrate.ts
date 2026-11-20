import { readdir, readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { pool } from './db.js'

const here = dirname(fileURLToPath(import.meta.url))
const dir = join(here, '..', 'migrations')

async function main() {
  const reset = process.argv.includes('--reset')
  if (reset) {
    console.log('reset: удаляю таблицы (расширения остаются)')
    await pool.query(`
      drop table if exists events, checklists, notes, attachments, cards,
        projects, areas, briefs, agent_runs, settings, schema_migrations cascade
    `)
  }
  await pool.query(
    'create table if not exists schema_migrations (name text primary key, applied_at timestamptz default now())',
  )
  const applied = new Set(
    (await pool.query('select name from schema_migrations')).rows.map((r) => r.name),
  )
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) {
    if (applied.has(file)) continue
    const sql = await readFile(join(dir, file), 'utf8')
    const client = await pool.connect()
    try {
      await client.query('begin')
      await client.query(sql)
      await client.query('insert into schema_migrations (name) values ($1)', [file])
      await client.query('commit')
      console.log('applied:', file)
    } catch (err) {
      await client.query('rollback')
      console.error('failed:', file, err)
      process.exit(1)
    } finally {
      client.release()
    }
  }
  console.log('migrations ok')
  await pool.end()
}

main()
