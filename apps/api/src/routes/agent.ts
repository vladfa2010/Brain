import type { FastifyInstance } from 'fastify'
import { q } from '../db.js'
import { runAgent } from '../agent/run.js'
import { getDashboard } from '../lib/dashboard.js'

export function registerAgentRoutes(app: FastifyInstance) {
  app.post('/api/agent/run', async () => runAgent('manual'))

  app.get('/api/agent/runs', async () => {
    const runs = await q(
      `select id, started_at, finished_at, status, summary, steps, tokens_in, tokens_out
       from agent_runs order by started_at desc limit 20`,
    )
    return { runs }
  })

  app.post('/api/brief/run', async () => {
    const dash = await getDashboard()
    await q(
      `insert into briefs (day, payload) values (current_date, $1)
       on conflict (day) do update set payload = excluded.payload, created_at = now()`,
      [JSON.stringify({ advice: dash.advice, stats: dash.stats, generatedAt: new Date().toISOString() })],
    )
    return { ok: true, advice: dash.advice }
  })

  app.get('/api/brief/today', async () => {
    const row = await q('select * from briefs where day = current_date')
    return row[0] ?? null
  })
}
