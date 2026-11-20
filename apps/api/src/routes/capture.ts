import type { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { one } from '../db.js'
import { logEvent } from '../lib/events.js'
import { refreshCardEmbedding } from '../lib/cards.js'

const RESEARCH_VERBS = /(изучить|посмотреть|прочитать|почитать|разобрать|разобраться|глянуть|прочесть|узнать)/i
const ACTION_VERBS = /(сделать|позвонить|написать|отправить|оплатить|купить|забрать|проверить|записаться|заказать|поручить|уточнить|съездить|встретиться)/i
const VIDEO_HOSTS = /(youtube\.com|youtu\.be|vimeo\.com|vk\.com\/video|rutube\.ru)/i

export function registerCaptureRoutes(app: FastifyInstance) {
  app.post('/api/capture', async (req, reply) => {
    const body = z.object({ text: z.string().min(1).max(4000) }).parse(req.body ?? {})
    const raw = body.text.trim()
    const url = raw.match(/https?:\/\/[^\s]+/)?.[0] ?? null
    const withoutUrl = url ? raw.replace(url, '').trim() : raw
    const isResearch = RESEARCH_VERBS.test(raw)
    const isAction = ACTION_VERBS.test(raw)

    let title = withoutUrl || raw
    let pageTitle: string | null = null
    let site: string | null = null

    if (url) {
      try {
        const host = new URL(url).hostname.replace(/^www\./, '')
        site = host
        const res = await fetch(url, {
          signal: AbortSignal.timeout(2500),
          headers: { 'user-agent': 'Mozilla/5.0 (compatible; SecondBrain/0.1)' },
        })
        if (res.ok) {
          const html = await res.text()
          pageTitle =
            html.match(/<title[^>]*>([^<]{2,200})<\/title>/i)?.[1]?.trim() ??
            html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']{2,200})["']/i)?.[1] ??
            null
        }
      } catch {
        // сеть не ответила — не страшно, живём без заголовка
      }
      if (!title) title = pageTitle || site || 'Ссылка'
    }

    if (!title) title = 'Без названия'

    const type = url || isResearch ? 'research' : 'task'
    if (!url && !isResearch && !isAction && title.split(' ').length > 12) {
      // длинная мысль без действия — это заметка-идея, но всё равно карточка
    }

    const researchKind = url
      ? VIDEO_HOSTS.test(url)
        ? 'video'
        : 'article'
      : isResearch
        ? 'topic'
        : null

    const row = await one<{ id: string }>(
      `insert into cards (user_id, title, type, horizon, priority, research_kind, research_url,
                          research_status, why)
       values ($1,$2,$3,'inbox','p2',$4,$5,$6,$7) returning id`,
      [
        req.userId,
        title.slice(0, 500),
        type,
        researchKind,
        url,
        type === 'research' ? 'new' : null,
        isResearch && !url ? raw : null,
      ],
    )
    if (!row) return reply.code(500).send({ error: 'insert_failed' })

    if (url) {
      await one(
        `insert into attachments (card_id, kind, url, title, site) values ($1,'link',$2,$3,$4)`,
        [row.id, url, pageTitle ?? title, site],
      )
    }
    await logEvent(row.id, 'me', 'created', { source: 'capture', url })
    await refreshCardEmbedding(row.id, req.userId)

    return reply.code(201).send({
      cardId: row.id,
      kind: type === 'research' ? (url ? 'material' : 'research') : 'task',
      title,
    })
  })
}
