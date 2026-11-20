import { q } from '../db.js'

export type Actor = 'me' | 'agent' | 'system'

export async function logEvent(
  cardId: string | null,
  actor: Actor,
  type: string,
  payload: Record<string, unknown> = {},
): Promise<void> {
  await q(
    'insert into events (card_id, actor, type, payload) values ($1, $2, $3, $4)',
    [cardId, actor, type, JSON.stringify(payload)],
  )
}
