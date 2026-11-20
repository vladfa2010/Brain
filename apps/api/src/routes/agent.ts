import type { FastifyInstance } from 'fastify'
import { q } from '../db.js'
import { runAgent } from '../agent/run.js'
import { getDashboard } from '../lib/dashboard.js'

export function registerAgentRoutes(app: FastifyInstance) {
  app.post('/api/agent/run', async (req) => runAgent(req.userId, 'manual'))

  app.get('/api/agent/runs', async (req) => {
    const runs = await q(
      `select id, started_at, finished_at, status, summary, steps, tokens_in, tokens_out
       from agent_runs where user_id = $1 order by started_at desc limit 20`,
      [req.userId],
    )
    return { runs }
  })

  app.post('/api/brief/run', async (req) => {
    const dash = await getDashboard(req.userId)
    await q(
      `insert into briefs (user_id, day, payload) values ($1, current_date, $2)
       on conflict (user_id, day) do update set payload = excluded.payload, created_at = now()`,
      [req.userId, JSON.stringify({ advice: dash.advice, stats: dash.stats, generatedAt: new Date().toISOString() })],
    )
    return { ok: true, advice: dash.advice }
  })

  app.get('/api/brief/today', async (req) => {
    const row = await q(
      'select * from briefs where user_id = $1 and day = current_date',
      [req.userId],
    )
    return row[0] ?? null
  })
}
