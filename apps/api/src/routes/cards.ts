import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { one, q, run } from '../db.js'
import { logEvent } from '../lib/events.js'
import {
  CARD_SELECT, findSimilar, getCardRow, horizonRank, listCards,
  refreshCardEmbedding, toCard,
} from '../lib/cards.js'
import { embed, toVectorLiteral } from '../lib/embed.js'
import { draftResearch } from '../agent/llm.js'

const HORIZONS = ['inbox', 'today', 'week', 'someday'] as const
const STAGES = ['todo', 'doing', 'waiting', 'done'] as const
const PRIORITIES = ['p0', 'p1', 'p2', 'p3'] as const
const TYPES = ['task', 'research', 'decision'] as const
const REASONS = ['time', 'dont_want', 'dont_know', 'wait'] as const

const isoDate = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), 'неверная дата')
  .nullish()

const createSchema = z.object({
  title: z.string().min(1).max(500),
  type: z.enum(TYPES).default('task'),
  horizon: z.enum(HORIZONS).default('inbox'),
  stage: z.enum(STAGES).default('todo'),
  areaId: z.string().uuid().nullish(),
  projectId: z.string().uuid().nullish(),
  parentId: z.string().uuid().nullish(),
  priority: z.enum(PRIORITIES).default('p2'),
  dueAt: isoDate,
  dueKind: z.enum(['hard', 'intent']).default('intent'),
  scheduledAt: isoDate,
  estimateMin: z.number().int().min(5).max(2880).nullish(),
  why: z.string().nullish(),
  researchKind: z.enum(['article', 'video', 'book', 'topic', 'product', 'person']).nullish(),
  researchUrl: z.string().nullish(),
  checklist: z.array(z.string()).optional(),
})

const patchSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  type: z.enum(TYPES).optional(),
  stage: z.enum(STAGES).optional(),
  horizon: z.enum(HORIZONS).optional(),
  state: z.enum(['active', 'postponed', 'dropped']).optional(),
  areaId: z.string().uuid().nullish(),
  projectId: z.string().uuid().nullish(),
  priority: z.enum(PRIORITIES).optional(),
  dueAt: isoDate,
  dueKind: z.enum(['hard', 'intent']).optional(),
  scheduledAt: isoDate,
  estimateMin: z.number().int().min(5).max(2880).nullish(),
  why: z.string().nullish(),
  researchKind: z.enum(['article', 'video', 'book', 'topic', 'product', 'person']).nullish(),
  researchUrl: z.string().nullish(),
  researchStatus: z.enum(['new', 'seen', 'concluded', 'applied']).nullish(),
  verdict: z.string().nullish(),
  myTake: z.string().nullish(),
  droppedReason: z.string().nullish(),
})

const FIELD_MAP: Record<string, string> = {
  title: 'title', type: 'type', stage: 'stage', horizon: 'horizon', state: 'state',
  areaId: 'area_id', projectId: 'project_id', priority: 'priority', dueAt: 'due_at',
  dueKind: 'due_kind', scheduledAt: 'scheduled_at', estimateMin: 'estimate_min',
  why: 'why', researchKind: 'research_kind', researchUrl: 'research_url',
  researchStatus: 'research_status', verdict: 'verdict', myTake: 'my_take',
  droppedReason: 'dropped_reason',
}

const EMBED_FIELDS = new Set(['title', 'why', 'verdict', 'myTake'])

export function registerCardRoutes(app: FastifyInstance) {
  app.get('/api/board', async (req) => {
    const cards = await listCards(
      req.userId,
      `c.state <> 'dropped' and c.parent_id is null
       and (c.stage <> 'done' or c.completed_at > now() - interval '3 days')`,
    )
    const areas = await q(
      `select * from areas where user_id = $1 and archived_at is null order by sort_order, name`,
      [req.userId],
    )
    const projects = await q(
      `select * from projects where user_id = $1 and status = 'active' order by name`,
      [req.userId],
    )
    return { cards, areas: areas.map(mapArea), projects: projects.map(mapProject) }
  })

  app.get('/api/cards/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const row = await getCardRow(id, req.userId)
    if (!row) return reply.code(404).send({ error: 'not_found' })

    const [checklist, notes, attachments, events, children, similar] = await Promise.all([
      q(`select * from checklists where card_id = $1 order by position, created_at`, [id]),
      q(`select * from notes where card_id = $1 order by created_at`, [id]),
      q(`select * from attachments where card_id = $1 order by created_at`, [id]),
      q(`select * from events where card_id = $1 order by created_at desc limit 40`, [id]),
      q(`${CARD_SELECT} where c.parent_id = $1 and c.user_id = $2 order by c.created_at`, [id, req.userId]),
      findSimilar(id, req.userId),
    ])

    return {
      card: toCard(row),
      checklist: checklist.map((c) => ({
        id: c.id, title: c.title, done: c.done, position: Number(c.position),
      })),
      notes: notes.map(mapNote),
      attachments,
      events,
      children: children.map(toCard),
      similar,
    }
  })

  app.post('/api/cards', async (req, reply) => {
    const body = createSchema.parse(req.body ?? {})
    const pos = await nextPosition(req.userId, body.horizon)
    const inserted = await one<{ id: string }>(
      `insert into cards (user_id, title, type, horizon, stage, area_id, project_id, parent_id,
                          priority, due_at, due_kind, scheduled_at, estimate_min, why,
                          research_kind, research_url, research_status, sort_order)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
       returning id`,
      [
        req.userId,
        body.title, body.type, body.horizon, body.stage, body.areaId ?? null,
        body.projectId ?? null, body.parentId ?? null, body.priority,
        body.dueAt ?? null, body.dueKind, body.scheduledAt ?? null,
        body.estimateMin ?? null, body.why ?? null, body.researchKind ?? null,
        body.researchUrl ?? null, body.type === 'research' ? 'new' : null, pos,
      ],
    )
    if (!inserted) return reply.code(500).send({ error: 'insert_failed' })

    if (body.checklist?.length) {
      let i = 0
      for (const title of body.checklist) {
        await q('insert into checklists (card_id, title, position) values ($1,$2,$3)', [
          inserted.id, title, i++ * 1024,
        ])
      }
    }
    if (body.researchUrl) {
      await q(
        `insert into attachments (card_id, kind, url, title) values ($1,'link',$2,$3)`,
        [inserted.id, body.researchUrl, body.title],
      )
    }
    await logEvent(inserted.id, 'me', 'created', { title: body.title })
    await refreshCardEmbedding(inserted.id, req.userId)
    return reply.code(201).send({ card: toCard((await getCardRow(inserted.id, req.userId))!) })
  })

  app.patch('/api/cards/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = patchSchema.parse(req.body ?? {})
    const before = await getCardRow(id, req.userId)
    if (!before) return reply.code(404).send({ error: 'not_found' })

    const sets: string[] = []
    const values: unknown[] = []
    let embeddingDirty = false
    for (const [key, column] of Object.entries(FIELD_MAP)) {
      if (!(key in body)) continue
      const value = (body as Record<string, unknown>)[key]
      values.push(value ?? null)
      sets.push(`${column} = $${values.length}`)
      if (EMBED_FIELDS.has(key)) embeddingDirty = true
    }
    if (!sets.length) return { card: toCard(before) }

    sets.push('updated_at = now()')
    if ('stage' in body) {
      sets.push(`completed_at = ${body.stage === 'done' ? 'now()' : 'null'}`)
    }
    values.push(id, req.userId)
    await q(
      `update cards set ${sets.join(', ')} where id = $${values.length - 1} and user_id = $${values.length}`,
      values,
    )

    if ('horizon' in body && body.horizon !== before.horizon) {
      await logEvent(id, 'me', 'moved', { group: 'horizon', from: before.horizon, to: body.horizon })
    }
    if ('stage' in body && body.stage !== before.stage) {
      await logEvent(id, 'me', 'moved', { group: 'stage', from: before.stage, to: body.stage })
    }
    if (embeddingDirty) await refreshCardEmbedding(id, req.userId)
    return { card: toCard((await getCardRow(id, req.userId))!) }
  })

  app.delete('/api/cards/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const removed = await run('delete from cards where id = $1 and user_id = $2', [id, req.userId])
    if (!removed) return reply.code(404).send({ error: 'not_found' })
    return { ok: true }
  })

  app.post('/api/cards/:id/move', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = z
      .object({
        group: z.enum(['horizon', 'stage']),
        value: z.string(),
        position: z.number().optional(),
      })
      .parse(req.body ?? {})
    const before = await getCardRow(id, req.userId)
    if (!before) return reply.code(404).send({ error: 'not_found' })

    const sets: string[] = [`updated_at = now()`]
    const values: unknown[] = []
    let postponed = false

    if (body.group === 'horizon') {
      if (!HORIZONS.includes(body.value as (typeof HORIZONS)[number])) {
        return reply.code(400).send({ error: 'bad_horizon' })
      }
      const movingLater =
        horizonRank(body.value) > horizonRank(before.horizon) &&
        ['today', 'week'].includes(before.horizon) &&
        ['week', 'someday'].includes(body.value) &&
        before.state === 'active' &&
        before.stage !== 'done'
      if (movingLater && Number(before.postpone_count) >= 2) {
        return reply.code(409).send({
          error: 'escalation_required',
          message: 'Третий перенос требует решения',
          count: Number(before.postpone_count) + 1,
        })
      }
      values.push(body.value)
      sets.push(`horizon = $${values.length}`)
      if (before.state === 'dropped') {
        values.push('active')
        sets.push(`state = $${values.length}`)
        sets.push('dropped_at = null')
      }
      if (movingLater) {
        sets.push('postpone_count = postpone_count + 1', 'last_postponed_at = now()')
        postponed = true
      }
      const position = body.position ?? (await nextPosition(req.userId, body.value))
      values.push(position)
      sets.push(`sort_order = $${values.length}`)
    } else {
      if (!STAGES.includes(body.value as (typeof STAGES)[number])) {
        return reply.code(400).send({ error: 'bad_stage' })
      }
      values.push(body.value)
      sets.push(`stage = $${values.length}`)
      sets.push(`completed_at = ${body.value === 'done' ? 'now()' : 'null'}`)
      const position = body.position ?? (await nextPosition(req.userId, before.horizon))
      values.push(position)
      sets.push(`sort_order = $${values.length}`)
    }

    values.push(id, req.userId)
    await q(
      `update cards set ${sets.join(', ')} where id = $${values.length - 1} and user_id = $${values.length}`,
      values,
    )
    await logEvent(id, 'me', 'moved', {
      group: body.group, from: before[body.group], to: body.value,
    })
    if (postponed) {
      await logEvent(id, 'me', 'postponed', {
        from: before.horizon, to: body.value, count: Number(before.postpone_count) + 1,
      })
    }
    return { card: toCard((await getCardRow(id, req.userId))!) }
  })

  app.post('/api/cards/:id/postpone', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = z
      .object({
        to: z.enum(['week', 'someday']).default('week'),
        reason: z.enum(REASONS).nullish(),
        force: z.boolean().optional(),
      })
      .parse(req.body ?? {})
    const before = await getCardRow(id, req.userId)
    if (!before) return reply.code(404).send({ error: 'not_found' })
    if (!body.force && Number(before.postpone_count) >= 2) {
      return reply.code(409).send({
        error: 'escalation_required',
        message: 'Третий перенос требует решения',
        count: Number(before.postpone_count) + 1,
      })
    }
    const pos = await nextPosition(req.userId, body.to)
    await q(
      `update cards set horizon = $2, postpone_count = postpone_count + 1,
              last_postponed_at = now(), sort_order = $3, updated_at = now()
       where id = $1 and user_id = $4`,
      [id, body.to, pos, req.userId],
    )
    await logEvent(id, 'me', 'postponed', {
      from: before.horizon, to: body.to, reason: body.reason ?? null,
      count: Number(before.postpone_count) + 1,
    })
    return { card: toCard((await getCardRow(id, req.userId))!) }
  })

  app.post('/api/cards/:id/complete', async (req, reply) => {
    const { id } = req.params as { id: string }
    const row = await getCardRow(id, req.userId)
    if (!row) return reply.code(404).send({ error: 'not_found' })
    await q(
      `update cards set stage = 'done', completed_at = now(), updated_at = now()
       where id = $1 and user_id = $2`,
      [id, req.userId],
    )
    await logEvent(id, 'me', 'completed', {})
    return { card: toCard((await getCardRow(id, req.userId))!) }
  })

  app.post('/api/cards/:id/drop', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = z.object({ reason: z.string().nullish() }).parse(req.body ?? {})
    const row = await getCardRow(id, req.userId)
    if (!row) return reply.code(404).send({ error: 'not_found' })
    await q(
      `update cards set state = 'dropped', dropped_at = now(), dropped_reason = $2,
              updated_at = now() where id = $1 and user_id = $3`,
      [id, body.reason ?? null, req.userId],
    )
    await logEvent(id, 'me', 'dropped', { reason: body.reason ?? null })
    return { card: toCard((await getCardRow(id, req.userId))!) }
  })

  app.post('/api/cards/:id/restore', async (req, reply) => {
    const { id } = req.params as { id: string }
    const row = await getCardRow(id, req.userId)
    if (!row) return reply.code(404).send({ error: 'not_found' })
    await q(
      `update cards set state = 'active', dropped_at = null, dropped_reason = null,
              horizon = case when horizon = 'someday' then 'week' else horizon end,
              updated_at = now()
       where id = $1 and user_id = $2`,
      [id, req.userId],
    )
    await logEvent(id, 'me', 'restored', {})
    return { card: toCard((await getCardRow(id, req.userId))!) }
  })

  app.post('/api/cards/:id/research', async (req, reply) => {
    const { id } = req.params as { id: string }
    const card = await getCardRow(id, req.userId)
    if (!card) return reply.code(404).send({ error: 'not_found' })
    const own = await q<{ body: string }>(
      "select body from notes where card_id = $1 and author = 'me' and status = 'active' limit 8",
      [id],
    )
    const draft = await draftResearch({
      title: card.title,
      why: card.why,
      existingNotes: own.map((n) => n.body),
    })
    if (!draft) return reply.code(503).send({ error: 'llm_off', note: null })
    const row = await one(
      `insert into notes (card_id, author, kind, body) values ($1,'agent','research',$2) returning *`,
      [id, draft],
    )
    await q(
      "update cards set research_status = 'seen', updated_at = now() where id = $1 and user_id = $2",
      [id, req.userId],
    )
    await logEvent(id, 'agent', 'agent_research', { trigger: 'on_demand' })
    await refreshCardEmbedding(id, req.userId)
    return { note: mapNote(row!) }
  })

  // ── чек-лист ────────────────────────────────────────────────
  app.post('/api/cards/:id/checklist', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = z.object({ title: z.string().min(1).max(300) }).parse(req.body ?? {})
    if (!(await getCardRow(id, req.userId))) return reply.code(404).send({ error: 'not_found' })
    const last = await one<{ max: number }>(
      'select coalesce(max(position), 0) + 1024 as max from checklists where card_id = $1',
      [id],
    )
    const row = await one(
      'insert into checklists (card_id, title, position) values ($1,$2,$3) returning *',
      [id, body.title, last?.max ?? 0],
    )
    return reply.code(201).send({ item: row })
  })

  app.patch('/api/checklist/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = z
      .object({ title: z.string().min(1).optional(), done: z.boolean().optional() })
      .parse(req.body ?? {})
    const sets: string[] = []
    const values: unknown[] = []
    if (body.title !== undefined) { values.push(body.title); sets.push(`title = $${values.length}`) }
    if (body.done !== undefined) { values.push(body.done); sets.push(`done = $${values.length}`) }
    if (sets.length) {
      values.push(id, req.userId)
      const updated = await run(
        `update checklists set ${sets.join(', ')} where id = $${values.length - 1}
           and card_id in (select id from cards where user_id = $${values.length})`,
        values,
      )
      if (!updated) return reply.code(404).send({ error: 'not_found' })
    }
    return { ok: true }
  })

  app.delete('/api/checklist/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const removed = await run(
      'delete from checklists where id = $1 and card_id in (select id from cards where user_id = $2)',
      [id, req.userId],
    )
    if (!removed) return reply.code(404).send({ error: 'not_found' })
    return { ok: true }
  })

  // ── заметки ─────────────────────────────────────────────────
  app.post('/api/cards/:id/notes', async (req, reply) => {
    const { id } = req.params as { id: string }
    if (!(await getCardRow(id, req.userId))) return reply.code(404).send({ error: 'not_found' })
    const body = z
      .object({
        body: z.string().min(1),
        author: z.enum(['me', 'agent']).default('me'),
        kind: z.enum(['note', 'research', 'suggestion', 'system']).default('note'),
        anchorNoteId: z.string().uuid().nullish(),
      })
      .parse(req.body ?? {})
    const vec = toVectorLiteral(embed(body.body))
    const row = await one(
      `insert into notes (card_id, author, kind, body, anchor_note_id, embedding)
       values ($1,$2,$3,$4,$5,$6::vector) returning *`,
      [id, body.author, body.kind, body.body, body.anchorNoteId ?? null, vec],
    )
    await logEvent(id, body.author, body.author === 'agent' ? 'agent_note' : 'note_added', {
      kind: body.kind,
    })
    await refreshCardEmbedding(id, req.userId)
    return reply.code(201).send({ note: mapNote(row!) })
  })

  app.patch('/api/notes/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const body = z
      .object({
        body: z.string().min(1).optional(),
        status: z.enum(['active', 'accepted', 'dismissed']).optional(),
      })
      .parse(req.body ?? {})
    const sets: string[] = ['updated_at = now()']
    const values: unknown[] = []
    if (body.body !== undefined) {
      values.push(body.body)
      sets.push(`body = $${values.length}`)
      values.push(toVectorLiteral(embed(body.body)))
      sets.push(`embedding = $${values.length}::vector`)
    }
    if (body.status !== undefined) {
      values.push(body.status)
      sets.push(`status = $${values.length}`)
    }
    values.push(id)
    values.push(req.userId)
    const row = await one(
      `update notes set ${sets.join(', ')} where id = $${values.length - 1}
         and card_id in (select id from cards where user_id = $${values.length}) returning *`,
      values,
    )
    if (!row) return reply.code(404).send({ error: 'not_found' })
    return { note: mapNote(row) }
  })

  app.delete('/api/notes/:id', async (req) => {
    const { id } = req.params as { id: string }
    await q(
      'delete from notes where id = $1 and card_id in (select id from cards where user_id = $2)',
      [id, req.userId],
    )
    return { ok: true }
  })

  // ── вложения ────────────────────────────────────────────────
  app.post('/api/cards/:id/attachments', async (req, reply) => {
    const { id } = req.params as { id: string }
    if (!(await getCardRow(id, req.userId))) return reply.code(404).send({ error: 'not_found' })
    const body = z
      .object({
        kind: z.enum(['link', 'file', 'image', 'document']),
        url: z.string().nullish(),
        title: z.string().nullish(),
        site: z.string().nullish(),
        snapshot: z.string().nullish(),
      })
      .parse(req.body ?? {})
    const row = await one(
      `insert into attachments (card_id, kind, url, title, site, snapshot)
       values ($1,$2,$3,$4,$5,$6) returning *`,
      [id, body.kind, body.url ?? null, body.title ?? null, body.site ?? null, body.snapshot ?? null],
    )
    await logEvent(id, 'me', 'attachment', { kind: body.kind, url: body.url ?? null })
    return reply.code(201).send({ attachment: row })
  })
}

async function nextPosition(userId: string, horizon: string): Promise<number> {
  const row = await one<{ max: number }>(
    'select coalesce(max(sort_order), 0) + 1024 as max from cards where user_id = $1 and horizon = $2',
    [userId, horizon],
  )
  return Number(row?.max ?? 1024)
}

export function mapArea(a: Record<string, any>) {
  return { id: a.id, name: a.name, glyph: a.glyph, hue: a.hue, sortOrder: Number(a.sort_order) }
}

export function mapProject(p: Record<string, any>) {
  return { id: p.id, name: p.name, areaId: p.area_id, status: p.status }
}

export function mapNote(n: Record<string, any>) {
  return {
    id: n.id,
    cardId: n.card_id,
    author: n.author,
    kind: n.kind,
    body: n.body,
    anchorNoteId: n.anchor_note_id,
    status: n.status,
    createdAt: n.created_at,
    updatedAt: n.updated_at,
  }
}
