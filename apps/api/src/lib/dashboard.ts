import { one, q } from '../db.js'
import { listCards, toCard } from './cards.js'
import { buildAdvice } from '../agent/advice.js'

const REASON_LABEL: Record<string, string> = {
  time: 'нет времени', dont_want: 'не хочу', dont_know: 'не знаю как', wait: 'жду другого',
}

export type Dashboard = Awaited<ReturnType<typeof getDashboard>>

export async function getDashboard() {
  const today = await listCards(
    "c.state = 'active' and c.horizon = 'today' and c.stage <> 'done' and c.parent_id is null",
  )
  const waiting = await listCards(
    "c.state = 'active' and c.stage = 'waiting' and c.parent_id is null",
  )
  const week = await listCards(
    "c.state = 'active' and c.horizon = 'week' and c.stage not in ('done','waiting') and c.parent_id is null",
  )

  const heavy = await q<{ id: string; title: string; postpone_count: number; reason: string | null }>(
    `select c.id, c.title, c.postpone_count,
            (select payload->>'reason' from events
              where card_id = c.id and type = 'postponed'
              order by created_at desc limit 1) as reason
     from cards c
     where c.state = 'active' and c.postpone_count >= 2 and c.parent_id is null
     order by c.postpone_count desc, c.last_postponed_at desc
     limit 6`,
  )

  const researchRows = await q<{ id: string; title: string; ready: boolean }>(
    `select c.id, c.title,
            exists(select 1 from notes n
                   where n.card_id = c.id and n.author = 'agent'
                     and n.kind = 'research' and n.status = 'active') as ready
     from cards c
     where c.type = 'research' and c.state = 'active' and c.parent_id is null
       and (c.research_status is distinct from 'concluded')
     order by ready desc, c.created_at desc`,
  )

  const reasonRows = await q<{ reason: string | null; n: string }>(
    `select payload->>'reason' as reason, count(*) as n
     from events
     where type = 'postponed' and created_at > now() - interval '30 days'
     group by 1`,
  )
  const reasons: Record<string, number> = {}
  for (const r of reasonRows) if (r.reason) reasons[r.reason] = Number(r.n)

  const stats = await one<{
    inbox: string; done_today: string; done_week: string; overdue: string; rolled: string
  }>(`
    select
      (select count(*) from cards where horizon='inbox' and state='active' and stage<>'done') as inbox,
      (select count(*) from cards where stage='done' and completed_at::date = current_date) as done_today,
      (select count(*) from cards where stage='done' and completed_at > now() - interval '7 days') as done_week,
      (select count(*) from cards where state='active' and stage<>'done' and due_at < now()) as overdue,
      (select count(*) from events where type='rollover' and created_at::date = current_date) as rolled
  `)

  const todayMinutes = today.reduce((sum, c) => sum + (c.estimateMin ?? 20), 0)

  const decisions: { card: ReturnType<typeof toCard>; reason: string; weight: number }[] = []

  for (const row of researchRows.filter((r) => r.ready).slice(0, 2)) {
    const card = await cardById(row.id)
    if (card) decisions.push({ card, reason: 'ресерч готов', weight: 100 })
  }
  for (const h of heavy.slice(0, 3)) {
    if (decisions.some((d) => d.card.id === h.id)) continue
    const card = await cardById(h.id)
    if (card) {
      decisions.push({
        card,
        reason: `перенос ${h.postpone_count}${h.reason ? ` · ${REASON_LABEL[h.reason] ?? h.reason}` : ''}`,
        weight: 50 + Number(h.postpone_count),
      })
    }
  }
  for (const w of waiting) {
    if (w.dueAt && new Date(w.dueAt) < new Date()) {
      decisions.push({ card: w, reason: 'срок прошёл', weight: 40 })
    }
  }
  decisions.sort((a, b) => b.weight - a.weight)

  const advice = buildAdvice({
    todayCount: today.length,
    todayMinutes,
    postponedHeavy: heavy.map((h) => ({
      id: h.id, title: h.title, count: Number(h.postpone_count), reason: h.reason,
    })),
    research: researchRows.map((r) => ({ id: r.id, title: r.title, ready: Boolean(r.ready) })),
    reasons,
    inboxCount: Number(stats?.inbox ?? 0),
    waitingOverdue: decisions.filter((d) => d.reason === 'срок прошёл').length,
  })

  const brief = await one('select * from briefs where day = current_date')

  return {
    today,
    todayMinutes,
    decisions: decisions.slice(0, 4).map(({ card, reason }) => ({ card, reason })),
    waiting,
    week: week.slice(0, 5),
    advice,
    brief,
    stats: {
      inbox: Number(stats?.inbox ?? 0),
      doneToday: Number(stats?.done_today ?? 0),
      doneWeek: Number(stats?.done_week ?? 0),
      overdue: Number(stats?.overdue ?? 0),
      rolledOver: Number(stats?.rolled ?? 0),
    },
    researchCount: researchRows.length,
  }
}

async function cardById(id: string) {
  const { getCardRow } = await import('./cards.js')
  const row = await getCardRow(id)
  return row ? toCard(row) : null
}
