import type {
  Bootstrap, Card, CardDetail, ChecklistItem, Dashboard, Note,
} from './types'

export function getToken(): string {
  return localStorage.getItem('sb.token') ?? ''
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem('sb.token', token)
  else localStorage.removeItem('sb.token')
}

export class ApiError extends Error {
  status: number
  body: Record<string, unknown>
  constructor(status: number, body: Record<string, unknown>) {
    super(`${status}: ${body.message ?? body.error ?? 'error'}`)
    this.status = status
    this.body = body
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken()
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  })
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
    if (res.status === 401) window.dispatchEvent(new Event('sb:unauthorized'))
    throw new ApiError(res.status, data)
  }
  return res.json() as Promise<T>
}

export const api = {
  bootstrap: () => request<Bootstrap>('/bootstrap'),
  dashboard: () => request<Dashboard>('/dashboard'),
  board: () => request<{ cards: Card[]; areas: Bootstrap['areas']; projects: Bootstrap['projects'] }>('/board'),
  card: (id: string) => request<CardDetail>(`/cards/${id}`),

  createCard: (body: Partial<Card> & { title: string; checklist?: string[] }) =>
    request<{ card: Card }>('/cards', { method: 'POST', body: JSON.stringify(body) }),
  patchCard: (id: string, body: Record<string, unknown>) =>
    request<{ card: Card }>(`/cards/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  moveCard: (id: string, body: { group: 'horizon' | 'stage'; value: string; position?: number }) =>
    request<{ card: Card }>(`/cards/${id}/move`, { method: 'POST', body: JSON.stringify(body) }),
  completeCard: (id: string) => request<{ card: Card }>(`/cards/${id}/complete`, { method: 'POST' }),
  dropCard: (id: string, reason?: string) =>
    request<{ card: Card }>(`/cards/${id}/drop`, { method: 'POST', body: JSON.stringify({ reason }) }),
  restoreCard: (id: string) => request<{ card: Card }>(`/cards/${id}/restore`, { method: 'POST' }),
  postponeCard: (id: string, to: 'week' | 'someday', reason?: string, force?: boolean) =>
    request<{ card: Card }>(`/cards/${id}/postpone`, {
      method: 'POST', body: JSON.stringify({ to, reason, force }),
    }),

  addChecklist: (cardId: string, title: string) =>
    request<{ item: ChecklistItem }>(`/cards/${cardId}/checklist`, {
      method: 'POST', body: JSON.stringify({ title }),
    }),
  patchChecklist: (id: string, body: { title?: string; done?: boolean }) =>
    request(`/checklist/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteChecklist: (id: string) => request(`/checklist/${id}`, { method: 'DELETE' }),

  addNote: (cardId: string, body: { body: string; author?: 'me' | 'agent'; kind?: string; anchorNoteId?: string }) =>
    request<{ note: Note }>(`/cards/${cardId}/notes`, { method: 'POST', body: JSON.stringify(body) }),
  patchNote: (id: string, body: { body?: string; status?: string }) =>
    request<{ note: Note }>(`/notes/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
  deleteNote: (id: string) => request(`/notes/${id}`, { method: 'DELETE' }),

  researchCard: (id: string) => request<{ note: Note | null }>(`/cards/${id}/research`, { method: 'POST' }),

  addAttachment: (cardId: string, body: { kind: string; url?: string; title?: string; site?: string }) =>
    request(`/cards/${cardId}/attachments`, { method: 'POST', body: JSON.stringify(body) }),

  probeAuth: async (token: string) => {
    const res = await fetch('/api/bootstrap', { headers: { authorization: `Bearer ${token}` } })
    return res.ok
  },

  capture: (text: string) =>
    request<{ cardId: string; kind: string; title: string }>('/capture', {
      method: 'POST', body: JSON.stringify({ text }),
    }),

  runAgent: () => request<{ summary: string }>('/agent/run', { method: 'POST' }),
  runs: () => request<{ runs: unknown[] }>('/agent/runs'),
}
