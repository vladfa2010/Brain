import type { Card } from '../types'
import { fmtDue, fmtMinutes, fmtTime } from '../lib/format'
import { Check, Clock, Refresh, Book } from './Icons'

export function AreaTag({ hue, name }: { hue: string | null; name: string | null }) {
  if (!name) return null
  return (
    <span className="area">
      <i className={`dot ${hue ?? 'ink'}`} />
      {name}
    </span>
  )
}

export function DueChip({ card }: { card: Card }) {
  if (!card.dueAt) return null
  const { label, tone } = fmtDue(card.dueAt)
  return (
    <span className={`chip ${tone === 'late' ? 'accent' : tone === 'soon' ? 'amber' : ''}`}>
      <Clock size={11} />
      {label}
    </span>
  )
}

export function SlotChip({ card }: { card: Card }) {
  if (!card.scheduledAt) return null
  return (
    <span className="chip">
      <span style={{ color: 'var(--ink-4)', fontSize: 10 }}>слот</span>
      {fmtTime(card.scheduledAt)}
    </span>
  )
}

export function PostponeChip({ card }: { card: Card }) {
  if (!card.postponeCount) return null
  return (
    <span className="chip accent" title="Сколько раз переносили">
      <Refresh size={10} />
      {card.postponeCount}
    </span>
  )
}

export function EstimateChip({ card }: { card: Card }) {
  if (!card.estimateMin) return null
  return <span className="chip num">{fmtMinutes(card.estimateMin)}</span>
}

export function ChecklistChip({ card }: { card: Card }) {
  if (!card.checklistTotal) return null
  return (
    <span className="chip num">
      <Check size={10} />
      {card.checklistDone}/{card.checklistTotal}
    </span>
  )
}

export function PriorityDot({ card }: { card: Card }) {
  return <i className={`prio ${card.priority}`} title={`Приоритет ${card.priority.toUpperCase()}`} />
}

export function ResearchChip({ card }: { card: Card }) {
  if (card.type !== 'research') return null
  return (
    <span className="tile-research">
      <Book size={11} />
      {card.researchKind === 'video' ? 'видео' : card.researchKind === 'book' ? 'книга' : 'изучить'}
    </span>
  )
}
