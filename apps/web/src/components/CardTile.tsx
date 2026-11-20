import { useDraggable } from '@dnd-kit/core'
import type { Card } from '../types'
import { AreaTag, ChecklistChip, DueChip, PostponeChip, SlotChip } from './bits'
import { Book } from './Icons'

export function CardTile({ card, onOpen }: { card: Card; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: card.id })
  return (
    <article
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={`tile prio-${card.priority} ${isDragging ? 'dragging' : ''}`}
      onClick={() => onOpen(card.id)}
    >
      <TileContent card={card} />
    </article>
  )
}

export function CardTileStatic({ card }: { card: Card }) {
  return (
    <article className={`tile tile-overlay prio-${card.priority}`}>
      <TileContent card={card} />
    </article>
  )
}

function TileContent({ card }: { card: Card }) {
  const research = card.type === 'research'
  return (
    <>
      <h4 className="tile-title">{card.title}</h4>
      {research && card.why && <p className="tile-why">{card.why}</p>}
      <div className="tile-meta">
        <AreaTag hue={card.areaHue} name={card.areaName} />
        <DueChip card={card} />
        <SlotChip card={card} />
        <ChecklistChip card={card} />
        <PostponeChip card={card} />
        {card.stage === 'waiting' && <span className="chip line">ждёт</span>}
        {research && (
          <span className="chip blue">
            <Book size={10} />
            {card.researchKind === 'video' ? 'видео' : card.researchKind === 'book' ? 'книга' : 'изучить'}
          </span>
        )}
      </div>
    </>
  )
}
