import { randomBytes } from 'node:crypto'
import { pool, q, one } from './db.js'
import { refreshCardEmbedding } from './lib/cards.js'
import { runAgent } from './agent/run.js'
import { hashPassword } from './auth/password.js'

const ids: Record<string, string> = {}
let userId = ''

function d(days: number, hour = 12, minute = 0): Date {
  const x = new Date()
  x.setDate(x.getDate() + days)
  x.setHours(hour, minute, 0, 0)
  return x
}

type CardInput = {
  key: string
  title: string
  type?: 'task' | 'research' | 'decision'
  horizon?: 'inbox' | 'today' | 'week' | 'someday'
  stage?: 'todo' | 'doing' | 'waiting' | 'done'
  priority?: 'p0' | 'p1' | 'p2' | 'p3'
  area?: string
  project?: string
  estimate?: number
  due?: Date
  dueKind?: 'hard' | 'intent'
  scheduled?: Date
  why?: string
  researchKind?: string
  researchUrl?: string
  researchStatus?: 'new' | 'seen' | 'concluded' | 'applied'
  postpone?: number
  lastPostponed?: Date
  state?: 'active' | 'postponed' | 'dropped'
  completedAt?: Date
  droppedAt?: Date
  droppedReason?: string
  createdAgo?: number
  sort?: number
}

async function card(input: CardInput): Promise<string> {
  const row = await one<{ id: string }>(
    `insert into cards (title, type, horizon, stage, priority, area_id, project_id,
                        estimate_min, due_at, due_kind, scheduled_at, why, research_kind,
                        research_url, research_status, postpone_count, last_postponed_at,
                        state, completed_at, dropped_at, dropped_reason, sort_order, created_at,
                        user_id)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24)
     returning id`,
    [
      input.title,
      input.type ?? 'task',
      input.horizon ?? 'inbox',
      input.stage ?? 'todo',
      input.priority ?? 'p2',
      input.area ? ids[input.area] : null,
      input.project ? ids[input.project] : null,
      input.estimate ?? null,
      input.due ?? null,
      input.dueKind ?? 'intent',
      input.scheduled ?? null,
      input.why ?? null,
      input.researchKind ?? null,
      input.researchUrl ?? null,
      input.researchStatus ?? (input.type === 'research' ? 'new' : null),
      input.postpone ?? 0,
      input.lastPostponed ?? null,
      input.state ?? 'active',
      input.completedAt ?? null,
      input.droppedAt ?? null,
      input.droppedReason ?? null,
      input.sort ?? 1024,
      d(-(input.createdAgo ?? 6)),
      userId,
    ],
  )
  ids[input.key] = row!.id
  return row!.id
}

async function event(
  key: string, actor: 'me' | 'agent' | 'system', type: string,
  payload: Record<string, unknown>, daysAgo: number,
) {
  await q(
    `insert into events (card_id, actor, type, payload, created_at)
     values ($1,$2,$3,$4,$5)`,
    [ids[key], actor, type, JSON.stringify(payload), d(-daysAgo, 9, 30)],
  )
}

async function checklist(key: string, items: [string, boolean][]) {
  let i = 0
  for (const [title, done] of items) {
    await q(
      `insert into checklists (card_id, title, done, position) values ($1,$2,$3,$4)`,
      [ids[key], title, done, i++ * 1024],
    )
  }
}

async function note(
  key: string, author: 'me' | 'agent', kind: string, body: string,
  daysAgo = 2, anchor?: string,
) {
  const row = await one<{ id: string }>(
    `insert into notes (card_id, author, kind, body, anchor_note_id, created_at)
     values ($1,$2,$3,$4,$5,$6) returning id`,
    [ids[key], author, kind, body, anchor ? ids[anchor] : null, d(-daysAgo, 10, 15)],
  )
  return row!.id
}

async function main() {
  await q(`truncate events, checklists, notes, attachments, cards, projects, areas,
           briefs, agent_runs, refresh_tokens, auth_events, users restart identity cascade`)

  const email = process.env.SEED_EMAIL || 'demo@secondbrain.local'
  const password = process.env.SEED_PASSWORD || randomBytes(9).toString('base64url')
  const user = await one<{ id: string }>(
    `insert into users (email, password_hash, name) values ($1,$2,$3) returning id`,
    [email, await hashPassword(password), 'Влад'],
  )
  userId = user!.id
  console.log(`Демо-вход: ${email} / ${password}`)

  const areas: [string, string, string, string][] = [
    ['biz', 'Бизнес', '◆', 'oxide'],
    ['health', 'Здоровье', '◐', 'sage'],
    ['home', 'Дом', '⌂', 'sand'],
    ['mind', 'Знания', '✦', 'blue'],
  ]
  for (let i = 0; i < areas.length; i++) {
    const [key, name, glyph, hue] = areas[i]
    const row = await one<{ id: string }>(
      `insert into areas (name, glyph, hue, sort_order, user_id) values ($1,$2,$3,$4,$5) returning id`,
      [name, glyph, hue, i * 1024, userId],
    )
    ids[key] = row!.id
  }

  const projects: [string, string, string][] = [
    ['sb', 'Second Brain', 'biz'],
    ['report', 'Квартальный отчёт', 'biz'],
    ['office', 'Ремонт кабинета', 'home'],
  ]
  for (const [key, name, area] of projects) {
    const row = await one<{ id: string }>(
      `insert into projects (name, area_id, status, user_id) values ($1,$2,'active',$3) returning id`,
      [name, ids[area], userId],
    )
    ids[key] = row!.id
  }

  // ── сегодня ──────────────────────────────────────────────────
  await card({
    key: 'contract', title: 'Дожать договор с Альфой', horizon: 'today', stage: 'doing',
    priority: 'p0', area: 'biz', estimate: 45, due: d(0, 18), dueKind: 'hard',
    createdAgo: 9, sort: 1,
  })
  await card({
    key: 'acquiring', title: 'Разобраться с эквайрингом', type: 'research',
    horizon: 'today', priority: 'p1', area: 'biz', estimate: 30, due: d(1, 12), dueKind: 'hard',
    why: 'Нужно решить, где принимать оплату, до запуска лендинга.',
    researchKind: 'article', researchStatus: 'seen', postpone: 3,
    lastPostponed: d(-2, 19), createdAgo: 14, sort: 2,
  })
  await card({
    key: 'report', title: 'Сдать квартальный отчёт', horizon: 'today', priority: 'p0',
    area: 'biz', project: 'report', estimate: 90, due: d(5, 18), dueKind: 'hard',
    createdAgo: 21, sort: 3,
  })
  await card({
    key: 'walk', title: 'Прогулка 40 минут', horizon: 'today', priority: 'p2',
    area: 'health', estimate: 40, scheduled: d(0, 19), createdAgo: 4, sort: 4,
  })

  // ── неделя ───────────────────────────────────────────────────
  await card({
    key: 'investors', title: 'Письмо инвесторам: апдейт за ноябрь', horizon: 'week',
    priority: 'p1', area: 'biz', estimate: 60, due: d(4, 12), dueKind: 'hard', createdAgo: 8,
  })
  await card({
    key: 'metrics', title: 'Собрать метрики за ноябрь', horizon: 'week', priority: 'p1',
    area: 'biz', estimate: 45, due: d(3, 18), createdAgo: 6,
  })
  await card({
    key: 'laptop', title: 'Отвезти ноутбук в ремонт', horizon: 'week', priority: 'p2',
    area: 'home', estimate: 30, due: d(2, 11), dueKind: 'hard', createdAgo: 5,
  })
  await card({
    key: 'shapeup', title: 'Прочитать «Shape Up»', type: 'research', horizon: 'week',
    priority: 'p2', area: 'mind', estimate: 120, researchKind: 'book',
    why: 'Хочу перенять подход с фиксированным сроком вместо фиксированного объёма.',
    createdAgo: 12,
  })
  await card({
    key: 'crm', title: 'Выбрать CRM', type: 'research', horizon: 'week', priority: 'p1',
    area: 'biz', estimate: 30, why: 'Нужно до найма менеджера — иначе он сядет в пустоту.',
    researchKind: 'topic', postpone: 2, lastPostponed: d(-3, 18), createdAgo: 18,
  })
  await card({
    key: 'lock', title: 'Заменить замок в кабинете', horizon: 'week', priority: 'p3',
    area: 'home', project: 'office', estimate: 30, createdAgo: 11,
  })

  // ── ждёт ─────────────────────────────────────────────────────
  await card({
    key: 'bank', title: 'Ответ банка по лимиту', horizon: 'week', stage: 'waiting',
    priority: 'p1', area: 'biz', estimate: 10, due: d(-1, 12), dueKind: 'hard', createdAgo: 7,
  })
  await card({
    key: 'designer', title: 'Макет лендинга от дизайнера', horizon: 'week', stage: 'waiting',
    priority: 'p1', area: 'biz', estimate: 15, due: d(2, 12), createdAgo: 9,
  })

  // ── входящие ─────────────────────────────────────────────────
  await card({
    key: 'yt', title: 'Посмотреть про позиционирование B2B',
    type: 'research', researchKind: 'video',
    researchUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    why: 'Понять, как формулировать оффер для среднего бизнеса.', createdAgo: 3,
  })
  await card({
    key: 'habr', title: 'Статья про pgvector для поиска по заметкам',
    type: 'research', researchKind: 'article',
    researchUrl: 'https://habr.com/ru/companies/otus/articles/746384/',
    why: 'Решить, хватит ли pgvector вместо отдельной векторной базы.', createdAgo: 2,
  })
  await card({ key: 'tax', title: 'Позвонить в налоговую', createdAgo: 4 })
  await card({ key: 'voice', title: 'Идея: голосовой ввод в приложение', createdAgo: 1 })
  await card({ key: 'lamp', title: 'Купить лампу в кабинет', createdAgo: 5 })

  // ── когда-нибудь ─────────────────────────────────────────────
  await card({
    key: 'tbilisi', title: 'Съездить в Тбилиси на конференцию', horizon: 'someday',
    priority: 'p3', area: 'mind', createdAgo: 30,
  })
  await card({
    key: 'retro', title: 'Сделать ретро-доску для команды', horizon: 'someday',
    priority: 'p3', area: 'biz', createdAgo: 26,
  })
  await card({
    key: 'rust', title: 'Выучить Rust', type: 'research', horizon: 'someday',
    priority: 'p3', area: 'mind', researchKind: 'topic',
    why: 'Для pet-проекта с обработкой видео.', createdAgo: 45,
  })

  // ── готово ───────────────────────────────────────────────────
  await card({
    key: 'budget', title: 'Согласовать бюджет на декабрь', horizon: 'today', stage: 'done',
    priority: 'p1', area: 'biz', completedAt: d(-1, 17), createdAgo: 10,
  })
  await card({
    key: 'dentist', title: 'Записаться к стоматологу', horizon: 'today', stage: 'done',
    priority: 'p2', area: 'health', completedAt: d(0, 10), createdAgo: 3,
  })
  await card({
    key: 'backups', title: 'Настроить бэкапы ноутбука', stage: 'done', priority: 'p1',
    area: 'home', completedAt: d(-2, 21), createdAgo: 15,
  })

  // ── не буду ──────────────────────────────────────────────────
  await card({
    key: 'tiktok', title: 'Завести TikTok для бренда', state: 'dropped', priority: 'p3',
    area: 'biz', droppedAt: d(-6, 15), droppedReason: 'Не наш канал, аудитория не там.',
    createdAgo: 20,
  })

  // ── чек-листы ────────────────────────────────────────────────
  await checklist('contract', [
    ['Собрать правки юриста', true],
    ['Отправить финальную версию в Альфу', false],
    ['Получить подпись', false],
  ])
  await checklist('report', [
    ['Выгрузить данные из CRM', true],
    ['Сверить с бухгалтером', false],
    ['Собрать таблицу', false],
    ['Отправить в налоговую', false],
  ])
  await checklist('metrics', [
    ['Выручка по месяцам', false],
    ['Когорты', false],
    ['Средний чек', false],
    ['Отток', false],
  ])

  // ── заметки ──────────────────────────────────────────────────
  const contractNote = await note('contract', 'me', 'note',
    'Юрист ждёт правки по п.4 — ответственность за хранение. Файл с правками на рабочем столе.', 9)
  await note('contract', 'agent', 'suggestion',
    'В правках юриста п.4.2 противоречит п.7 из твоего же шаблона: там ответственность ограничена суммой договора. Стоит свести к одной формулировке.', 1, contractNote)

  const acquiringNote = await note('acquiring', 'me', 'note',
    'Юрист сказал: для приёма оплаты нужен договор-оферта. Шаблон в почте от 12 ноября.', 13)
  await note('acquiring', 'agent', 'research',
    '**Вердикт:** для запуска хватит Тинькофф — 2,4% и подключение за день.\n\n' +
    '**Что решило:**\n' +
    '1. Тебе нужны платежи по ссылке без готового сайта — у Тинькофф это из коробки.\n' +
    '2. ЮKassa даёт 2,8% и просит больше документов на старте.\n' +
    '3. Stripe не работает с российскими картами, его откладываем.\n\n' +
    '**Следующий шаг:** 15 минут — заполнить заявку, ИНН уже есть в заметке про ООО.', 2)
  await note('acquiring', 'agent', 'suggestion',
    'В заметке про ООО указан старый ИНН — он сменился в марте. Проверь перед заявкой.', 1, acquiringNote)

  await note('shapeup', 'me', 'note',
    'Главная мысль: фиксируем время, а не объём. Для нас — цикл в две недели.', 11)
  await note('crm', 'me', 'note',
    'Смотрел Bitrix24 — тяжёлый. AmoCRM — дорого. Надо ещё раз посмотреть на оба.', 16)
  await note('yt', 'me', 'note',
    'С 8-й минуты про то, что в B2B покупают не фичу, а снижение риска.', 2)
  await note('voice', 'me', 'note',
    'Если делать — начать с диктофона в Telegram, потом распознавание.', 1)

  // ── ссылки ───────────────────────────────────────────────────
  const links: [string, string, string, string][] = [
    ['yt', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'Позиционирование B2B: что реально покупают', 'youtube.com'],
    ['habr', 'https://habr.com/ru/companies/otus/articles/746384/', 'pgvector: поиск по эмбеддингам в Postgres', 'habr.com'],
  ]
  for (const [key, url, title, site] of links) {
    await q(
      `insert into attachments (card_id, kind, url, title, site, created_at)
       values ($1,'link',$2,$3,$4,$5)`,
      [ids[key], url, title, site, d(-2)],
    )
  }

  // ── история ──────────────────────────────────────────────────
  for (const [key, input] of Object.entries({
    contract: 9, acquiring: 14, report: 21, walk: 4, investors: 8, metrics: 6,
    laptop: 5, shapeup: 12, crm: 18, lock: 11, bank: 7, designer: 9, yt: 3, habr: 2,
    tax: 4, voice: 1, lamp: 5, tbilisi: 30, retro: 26, rust: 45,
  })) {
    await event(key, 'me', 'created', {}, input as number)
  }

  await event('acquiring', 'me', 'postponed',
    { from: 'today', to: 'week', reason: 'time', count: 1 }, 9)
  await event('acquiring', 'me', 'postponed',
    { from: 'today', to: 'week', reason: 'dont_want', count: 2 }, 5)
  await event('acquiring', 'me', 'postponed',
    { from: 'today', to: 'week', reason: 'dont_know', count: 3 }, 2)
  await event('crm', 'me', 'postponed',
    { from: 'today', to: 'week', reason: 'dont_know', count: 1 }, 6)
  await event('crm', 'me', 'postponed',
    { from: 'today', to: 'week', reason: 'dont_know', count: 2 }, 3)

  await event('bank', 'me', 'moved', { group: 'stage', from: 'todo', to: 'waiting' }, 5)
  await event('designer', 'me', 'moved', { group: 'stage', from: 'todo', to: 'waiting' }, 4)

  await event('budget', 'me', 'completed', {}, 1)
  await event('dentist', 'me', 'completed', {}, 0)
  await event('backups', 'me', 'completed', {}, 2)
  await event('tiktok', 'me', 'dropped', { reason: 'Не наш канал, аудитория не там.' }, 6)
  await event('acquiring', 'agent', 'agent_research', { trigger: 'schedule' }, 2)

  // ── настройки ────────────────────────────────────────────────
  await q(
    `insert into settings (user_id, key, value) values
       ($1, 'day_budget', '3'), ($1, 'wip_limit', '4'), ($1, 'timezone', '"Asia/Yekaterinburg"'),
       ($1, 'user_name', '"Влад"')
     on conflict (user_id, key) do update set value = excluded.value`,
    [userId],
  )

  // эмбеддинги + первый прогон агента и бриф
  const all = await q<{ id: string }>('select id from cards')
  for (const c of all) await refreshCardEmbedding(c.id, userId)
  const run = await runAgent(userId, 'manual')
  console.log('seed ok:', Object.keys(ids).length, 'сущностей ·', run.summary)
  await pool.end()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
