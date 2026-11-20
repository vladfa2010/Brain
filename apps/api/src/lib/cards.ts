import { one, q } from '../db.js'
import { embed, toVectorLiteral } from './embed.js'

export const CARD_SELECT = `
  select c.*,
    a.name as area_name, a.hue as area_hue, a.glyph as area_glyph,
    p.name as project_name,
    coalesce(cl.total, 0)::int as checklist_total,
    coalesce(cl.done, 0)::int as checklist_done,
    (select count(*) from notes n
       where n.card_id = c.id and n.author = 'agent' and n.status = 'active')::int as agent_notes
  from cards c
  left join areas a on a.id = c.area_id
  left join projects p on p.id = c.project_id
  left join (
    select card_id, count(*) as total, count(*) filter (where done) as done
    from checklists group by card_id
  ) cl on cl.card_id = c.id
`

export const CARD_ORDER = `
  order by array_position(array['p0','p1','p2','p3'], c.priority),
           c.sort_order,
           c.created_at
`

export type CardRow = Record<string, any>

export function toCard(r: CardRow) {
  return {
    id: r.id,
    title: r.title,
    type: r.type,
    stage: r.stage,
    horizon: r.horizon,
    state: r.state,
    areaId: r.area_id,
    areaName: r.area_name,
    areaHue: r.area_hue,
    areaGlyph: r.area_glyph,
    projectId: r.project_id,
    projectName: r.project_name,
    priority: r.priority,
    dueAt: r.due_at,
    dueKind: r.due_kind,
    scheduledAt: r.scheduled_at,
    estimateMin: r.estimate_min,
    why: r.why,
    researchKind: r.research_kind,
    researchUrl: r.research_url,
    researchStatus: r.research_status,
    verdict: r.verdict,
    myTake: r.my_take,
    postponeCount: r.postpone_count,
    lastPostponedAt: r.last_postponed_at,
    completedAt: r.completed_at,
    droppedAt: r.dropped_at,
    droppedReason: r.dropped_reason,
    sortOrder: Number(r.sort_order),
    checklistTotal: r.checklist_total ?? 0,
    checklistDone: r.checklist_done ?? 0,
    agentNotes: r.agent_notes ?? 0,
    updatedAt: r.updated_at,
    createdAt: r.created_at,
  }
}

export async function getCardRow(id: string): Promise<CardRow | null> {
  return one(`${CARD_SELECT} where c.id = $1`, [id])
}

export async function listCards(where: string, params: unknown[] = []) {
  const rows = await q(`${CARD_SELECT} where ${where} ${CARD_ORDER}`, params)
  return rows.map(toCard)
}

export function horizonRank(h: string): number {
  return { inbox: 0, today: 1, week: 2, someday: 3, done: 4 }[h] ?? 0
}

/** Пересчитывает эмбеддинги карточки по её смысловым полям и заметкам. */
export async function refreshCardEmbedding(cardId: string): Promise<void> {
  const card = await one<{ title: string; why: string | null; verdict: string | null; my_take: string | null }>(
    'select title, why, verdict, my_take from cards where id = $1',
    [cardId],
  )
  if (!card) return
  const notes = await q<{ body: string }>(
    "select body from notes where card_id = $1 and status = 'active'",
    [cardId],
  )
  const text = [card.title, card.why, card.verdict, card.my_take, ...notes.map((n) => n.body)]
    .filter(Boolean)
    .join('\n')
  const vec = embed(text)
  await q('update cards set embedding = $2::vector where id = $1', [cardId, toVectorLiteral(vec)])
}

/** Вектор «похожих» карточек + сохранённые ссылки на них. */
export async function findSimilar(cardId: string, limit = 4) {
  const rows = await q(
    `select c.id, c.title, c.type, c.state,
            1 - (c.embedding <=> src.embedding) as score
     from cards src
     join cards c on c.id <> src.id
     where src.id = $1 and src.embedding is not null and c.embedding is not null
       and c.state = 'active' and c.parent_id is null
     order by c.embedding <=> src.embedding
     limit $2`,
    [cardId, limit],
  )
  return rows.map((r) => ({ ...r, score: Number(r.score) }))
}
