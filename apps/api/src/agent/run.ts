import { env } from '../env.js'
import { one, q } from '../db.js'
import { getDashboard } from '../lib/dashboard.js'
import { refreshCardEmbedding } from '../lib/cards.js'
import { logEvent } from '../lib/events.js'
import { draftResearch } from './llm.js'

export type Step = { name: string; detail: string; ms?: number }

/**
 * Один прогон агента в сутки:
 *  1. чинит эмбеддинги,
 *  2. дотягивает ресерч там, где он застрял,
 *  3. ищет дубли,
 *  4. считает бриф и совет дня,
 *  5. отмечает залежавшееся.
 * Всё логируется в agent_runs, чтобы было видно, чем он занят.
 */
export async function runAgent(trigger: 'schedule' | 'manual' = 'manual') {
  const started = Date.now()
  const run = await one<{ id: string }>(
    `insert into agent_runs (status) values ('running') returning id`,
  )
  if (!run) throw new Error('cannot start agent run')
  const steps: Step[] = []

  try {
    const t0 = Date.now()
    const missing = await q<{ id: string }>(
      "select id from cards where embedding is null and state = 'active'",
    )
    for (const c of missing) await refreshCardEmbedding(c.id)
    steps.push({
      name: 'память',
      detail: missing.length
        ? `пересчитал смысловые векторы у ${missing.length} карточек`
        : 'все карточки уже проиндексированы',
      ms: Date.now() - t0,
    })

    const t1 = Date.now()
    let researched = 0
    if (env.deepseekKey) {
      const candidates = await q<{ id: string; title: string; why: string | null }>(
        `select c.id, c.title, c.why
         from cards c
         where c.type = 'research' and c.state = 'active'
           and c.research_status = 'new'
           and not exists (select 1 from notes n
                           where n.card_id = c.id and n.author = 'agent' and n.kind = 'research')
         order by c.created_at limit 2`,
      )
      for (const c of candidates) {
        const notes = await q<{ body: string }>(
          "select body from notes where card_id = $1 and author = 'me' limit 10",
          [c.id],
        )
        const draft = await draftResearch({
          title: c.title, why: c.why, existingNotes: notes.map((n) => n.body),
        })
        if (!draft) continue
        await q(
          `insert into notes (card_id, author, kind, body) values ($1,'agent','research',$2)`,
          [c.id, draft],
        )
        await q(
          `update cards set research_status = 'seen', updated_at = now() where id = $1`,
          [c.id],
        )
        await logEvent(c.id, 'agent', 'agent_research', { trigger })
        researched++
      }
    }
    steps.push({
      name: 'ресерч',
      detail: researched
        ? `подготовил ${researched} разбор(а)`
        : env.deepseekKey
          ? 'новых карточек для разбора нет'
          : 'LLM выключен (нет ключа), работаю на правилах',
      ms: Date.now() - t1,
    })

    const t2 = Date.now()
    const dupes = await q<{ a: string; b: string; score: number }>(
      `select a.id as a, b.id as b, 1 - (a.embedding <=> b.embedding) as score
       from cards a join cards b on a.id < b.id
       where a.embedding is not null and b.embedding is not null
         and a.state = 'active' and b.state = 'active'
         and a.horizon = 'inbox' and b.horizon = 'inbox'
         and 1 - (a.embedding <=> b.embedding) > 0.62
       limit 5`,
    )
    steps.push({
      name: 'дубли',
      detail: dupes.length ? `похожих пар: ${dupes.length}` : 'дублей не нашёл',
      ms: Date.now() - t2,
    })

    const t3 = Date.now()
    const stale = await one<{ n: string }>(
      `select count(*) as n from cards
       where state = 'active' and stage <> 'done'
         and coalesce(last_postponed_at, updated_at) < now() - interval '21 days'`,
    )
    steps.push({
      name: 'залежалось',
      detail: `${Number(stale?.n ?? 0)} карточек без движения больше трёх недель`,
      ms: Date.now() - t3,
    })

    const t4 = Date.now()
    const dash = await getDashboard()
    await q(
      `insert into briefs (day, payload) values (current_date, $1)
       on conflict (day) do update set payload = excluded.payload, created_at = now()`,
      [
        JSON.stringify({
          advice: dash.advice,
          today: dash.today.map((c) => c.id),
          decisions: dash.decisions.map((d) => ({ id: d.card.id, reason: d.reason })),
          stats: dash.stats,
          steps,
          generatedAt: new Date().toISOString(),
        }),
      ],
    )
    steps.push({ name: 'бриф', detail: 'собрал утреннюю сводку', ms: Date.now() - t4 })

    const summary =
      `Проверил ${await countActive()} карточек · ` +
      `входящих ${dash.stats.inbox} · совет: «${dash.advice.title}»`

    await q(
      `update agent_runs set status = 'ok', finished_at = now(), summary = $2, steps = $3
       where id = $1`,
      [run.id, summary, JSON.stringify(steps)],
    )
    return { runId: run.id, summary, steps, advice: dash.advice }
  } catch (err) {
    await q(
      `update agent_runs set status = 'error', finished_at = now(), summary = $2, steps = $3
       where id = $1`,
      [run.id, String(err), JSON.stringify(steps)],
    )
    throw err
  }
}

async function countActive(): Promise<number> {
  const row = await one<{ n: string }>(
    "select count(*) as n from cards where state = 'active' and stage <> 'done'",
  )
  return Number(row?.n ?? 0)
}

/** Ночной перенос незакрытого «Сегодня» обратно на неделю. */
export async function rolloverDay(): Promise<{ moved: number }> {
  const rows = await q<{ id: string }>(
    `update cards
     set horizon = 'week', updated_at = now()
     where horizon = 'today' and state = 'active' and stage <> 'done'
     returning id`,
  )
  for (const r of rows) {
    await logEvent(r.id, 'system', 'rollover', { from: 'today', to: 'week' })
  }
  return { moved: rows.length }
}
