export type Priority = 'p0' | 'p1' | 'p2' | 'p3'
export type Horizon = 'inbox' | 'today' | 'week' | 'someday'
export type Stage = 'todo' | 'doing' | 'waiting' | 'done'
export type CardType = 'task' | 'research' | 'decision'
export type CardState = 'active' | 'postponed' | 'dropped'

export interface Card {
  id: string
  title: string
  type: CardType
  stage: Stage
  horizon: Horizon
  state: CardState
  areaId: string | null
  areaName: string | null
  areaHue: string | null
  areaGlyph: string | null
  projectId: string | null
  projectName: string | null
  priority: Priority
  dueAt: string | null
  dueKind: 'hard' | 'intent'
  scheduledAt: string | null
  estimateMin: number | null
  why: string | null
  researchKind: string | null
  researchUrl: string | null
  researchStatus: 'new' | 'seen' | 'concluded' | 'applied' | null
  verdict: string | null
  myTake: string | null
  postponeCount: number
  lastPostponedAt: string | null
  completedAt: string | null
  droppedAt: string | null
  droppedReason: string | null
  sortOrder: number
  checklistTotal: number
  checklistDone: number
  agentNotes: number
  updatedAt: string
  createdAt: string
}

export interface Area {
  id: string
  name: string
  glyph: string
  hue: string
  sortOrder: number
  count?: number
}

export interface Project {
  id: string
  name: string
  areaId: string | null
  status: string
}

export interface ChecklistItem {
  id: string
  title: string
  done: boolean
  position: number
}

export interface Note {
  id: string
  cardId: string
  author: 'me' | 'agent'
  kind: 'note' | 'research' | 'suggestion' | 'system'
  body: string
  anchorNoteId: string | null
  status: 'active' | 'accepted' | 'dismissed'
  createdAt: string
  updatedAt: string
}

export interface Attachment {
  id: string
  card_id: string
  kind: 'link' | 'file' | 'image' | 'document'
  url: string | null
  title: string | null
  site: string | null
  created_at: string
}

export interface EventRow {
  id: number
  card_id: string
  actor: 'me' | 'agent' | 'system'
  type: string
  payload: Record<string, unknown>
  created_at: string
}

export interface CardDetail {
  card: Card
  checklist: ChecklistItem[]
  notes: Note[]
  attachments: Attachment[]
  events: EventRow[]
  children: Card[]
  similar: { id: string; title: string; type: string; score: number }[]
}

export interface Advice {
  title: string
  body: string
  tone: 'push' | 'calm'
  action?: { type: string; label: string; cardId?: string }
}

export interface Dashboard {
  today: Card[]
  todayMinutes: number
  decisions: { card: Card; reason: string }[]
  waiting: Card[]
  week: Card[]
  advice: Advice
  stats: { inbox: number; doneToday: number; doneWeek: number; overdue: number; rolledOver: number }
  researchCount: number
  brief: { id: string; day: string; payload: Record<string, unknown> } | null
}

export interface Bootstrap {
  areas: Area[]
  projects: Project[]
  counts: { inbox: number; today: number; week: number; waiting: number; overdue: number; doneWeek: number }
  lastAgentRun: { id: string; started_at: string; finished_at: string | null; status: string; summary: string | null } | null
  settings?: { name: string | null; wipLimit: number; dayBudget: number }
}
