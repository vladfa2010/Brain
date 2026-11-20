import type { FastifyInstance } from 'fastify'
import { one, q } from '../db.js'
import { getDashboard } from '../lib/dashboard.js'
import { embed, toVectorLiteral } from '../lib/embed.js'

export function registerReadRoutes(app: FastifyInstance) {
  app.get('/api/bootstrap', async () => {
    const areas = await q<{ id: string; name: string; glyph: string; hue: string; sort_order: number }>(
      'select * from areas where archived_at is null order by sort_order, name',
    )
    const projects = await q<{ id: string; name: string; area_id: string | null; status: string }>(
      "select * from projects where status = 'active' order by name",
    )
    const counts = await one<{
      inbox: string; today: string; week: string; waiting: string; overdue: string; done_week: string
    }>(`
      select
        count(*) filter (where horizon='inbox' and state='active' and stage<>'done') as inbox,
        count(*) filter (where horizon='today' and state='active' and stage<>'done') as today,
        count(*) filter (where horizon='week' and state='active' and stage<>'done') as week,
        count(*) filter (where stage='waiting' and state='active') as waiting,
        count(*) filter (where state='active' and due_at < now() and stage<>'done') as overdue,
        count(*) filter (where stage='done' and completed_at > now() - interval '7 days') as done_week
      from cards where parent_id is null
    `)
    const settingsRows = await q<{ key: string; value: unknown }>('select key, value from settings')
    const settings: Record<string, unknown> = {}
    for (const r of settingsRows) settings[r.key] = r.value
    const areaCounts = await q<{ area_id: string; n: string }>(
      `select area_id, count(*) as n from cards
       where state = 'active' and stage <> 'done' and area_id is not null
       group by area_id`,
    )
    const countByArea = new Map(areaCounts.map((r) => [r.area_id, Number(r.n)]))
    const lastRun = await one(
      `select id, started_at, finished_at, status, summary from agent_runs order by started_at desc limit 1`,
    )
    return {
      areas: areas.map((a) => ({
        id: a.id, name: a.name, glyph: a.glyph, hue: a.hue, sortOrder: Number(a.sort_order),
        count: countByArea.get(a.id) ?? 0,
      })),
      projects: projects.map((p) => ({ id: p.id, name: p.name, areaId: p.area_id, status: p.status })),
      counts: {
        inbox: Number(counts?.inbox ?? 0),
        today: Number(counts?.today ?? 0),
        week: Number(counts?.week ?? 0),
        waiting: Number(counts?.waiting ?? 0),
        overdue: Number(counts?.overdue ?? 0),
        doneWeek: Number(counts?.done_week ?? 0),
      },
      lastAgentRun: lastRun,
      settings: {
        name: (settings.user_name as string) ?? null,
        wipLimit: Number(settings.wip_limit ?? 4),
        dayBudget: Number(settings.day_budget ?? 3),
      },
    }
  })

  app.get('/api/dashboard', async () => getDashboard())

  app.get('/api/search', async (req) => {
    const { q: query = '' } = req.query as { q?: string }
    const term = query.trim()
    if (term.length < 2) return { results: [] }

    const lexical = await q<{ id: string; title: string; type: string; rank: number }>(
      `select id, title, type, ts_rank(search, plainto_tsquery('russian', $1)) as rank
       from cards
       where search @@ plainto_tsquery('russian', $1) and state <> 'dropped'
       order by rank desc limit 20`,
      [term],
    )
    const vector = await q<{ id: string; title: string; type: string; score: number }>(
      `select id, title, type, 1 - (embedding <=> $1::vector) as score
       from cards
       where embedding is not null and state <> 'dropped'
       order by embedding <=> $1::vector limit 20`,
      [toVectorLiteral(embed(term))],
    )

    const merged = new Map<string, { id: string; title: string; type: string; score: number }>()
    for (const r of lexical) {
      merged.set(r.id, {
        id: r.id, title: r.title, type: r.type, score: Math.min(1, Number(r.rank) * 4 + 0.5),
      })
    }
    for (const r of vector) {
      const prev = merged.get(r.id)
      const score = Number(r.score)
      if (prev) prev.score = Math.max(prev.score, score)
      else if (score > 0.15) merged.set(r.id, { id: r.id, title: r.title, type: r.type, score })
    }
    const results = [...merged.values()].sort((a, b) => b.score - a.score).slice(0, 12)
    return { results }
  })
}
