import type { Card } from '../types'
import { fmtMinutes } from '../lib/format'
import { AreaTag, ChecklistChip, DueChip, PostponeChip, PriorityDot, SlotChip } from './bits'
import { PostponeMenu } from './PostponeMenu'
import { Check } from './Icons'

export function TaskRow({
  card, onOpen, onComplete,
}: {
  card: Card
  onOpen: (id: string) => void
  onComplete: (id: string) => void
}) {
  return (
    <article className="task" onClick={() => onOpen(card.id)}>
      <button
        className="task-check"
        title="Закрыть"
        onClick={(e) => { e.stopPropagation(); onComplete(card.id) }}
      >
        <Check size={11} stroke={2.2} />
      </button>
      <div style={{ minWidth: 0 }}>
        <h3 className="task-title">
          <PriorityDot card={card} />{' '}
          {card.title}
        </h3>
        <div className="task-meta">
          <AreaTag hue={card.areaHue} name={card.areaName} />
          <DueChip card={card} />
          <SlotChip card={card} />
          <ChecklistChip card={card} />
          <PostponeChip card={card} />
        </div>
      </div>
      <div className="task-side">
        <span className="estimate">{fmtMinutes(card.estimateMin)}</span>
        <PostponeMenu card={card} />
      </div>
    </article>
  )
}
