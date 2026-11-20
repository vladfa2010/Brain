import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor,
  closestCorners, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, ApiError } from '../api'
import type { Card } from '../types'
import { CardTile, CardTileStatic } from '../components/CardTile'
import { useToast } from '../components/Toast'
import { EscalationDialog } from '../components/EscalationDialog'
import { Plus } from '../components/Icons'

type Mode = 'horizon' | 'stage'

type ColumnDef = {
  key: string
  title: string
  group: 'horizon' | 'stage'
  value: string
  test: (c: Card) => boolean
  wip?: number
  complete?: boolean
}

const HORIZON_COLS: ColumnDef[] = [
  { key: 'inbox', title: 'Входящие', group: 'horizon', value: 'inbox', test: (c) => c.stage !== 'done' && c.horizon === 'inbox' },
  { key: 'today', title: 'Сегодня', group: 'horizon', value: 'today', test: (c) => c.stage !== 'done' && c.horizon === 'today', wip: 4 },
  { key: 'week', title: 'На неделе', group: 'horizon', value: 'week', test: (c) => c.stage !== 'done' && c.horizon === 'week' },
  { key: 'someday', title: 'Когда-нибудь', group: 'horizon', value: 'someday', test: (c) => c.stage !== 'done' && c.horizon === 'someday' },
  { key: 'done', title: 'Готово', group: 'stage', value: 'done', test: (c) => c.stage === 'done', complete: true },
]

const STAGE_COLS: ColumnDef[] = [
  { key: 'todo', title: 'Не начато', group: 'stage', value: 'todo', test: (c) => c.stage === 'todo' },
  { key: 'doing', title: 'В работе', group: 'stage', value: 'doing', test: (c) => c.stage === 'doing', wip: 3 },
  { key: 'waiting', title: 'Ждёт', group: 'stage', value: 'waiting', test: (c) => c.stage === 'waiting' },
  { key: 'done', title: 'Готово', group: 'stage', value: 'done', test: (c) => c.stage === 'done', complete: true },
]

const PRIO_RANK: Record<string, number> = { p0: 0, p1: 1, p2: 2, p3: 3 }

export function BoardPage({ onOpen }: { onOpen: (id: string) => void }) {
  const [params] = useSearchParams()
  const area = params.get('area')
  const [mode, setMode] = useState<Mode>(() => {
    const fromUrl = params.get('mode')
    if (fromUrl === 'stage' || fromUrl === 'horizon') return fromUrl
    return (localStorage.getItem('sb.board.mode') as Mode) || 'horizon'
  })
  const [active, setActive] = useState<Card | null>(null)
  const [escalation, setEscalation] = useState<Card | null>(null)
  const qc = useQueryClient()
  const toast = useToast()

  const { data, isLoading } = useQuery({ queryKey: ['board'], queryFn: api.board })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  )

  const columns = mode === 'horizon' ? HORIZON_COLS : STAGE_COLS
  const visible = useMemo(() => {
    const cards = (data?.cards ?? []).filter((c) => !area || c.areaId === area)
    return cards.slice().sort((a, b) => PRIO_RANK[a.priority] - PRIO_RANK[b.priority] || a.sortOrder - b.sortOrder)
  }, [data, area])

  const move = useMutation({
    mutationFn: (args: { id: string; col: ColumnDef }) =>
      args.col.complete
        ? api.completeCard(args.id)
        : api.moveCard(args.id, { group: args.col.group, value: args.col.value }),
    onSuccess: () => qc.invalidateQueries(),
    onError: (err, vars) => {
      if (err instanceof ApiError && err.status === 409) {
        const card = visible.find((c) => c.id === vars.id)
        if (card) setEscalation(card)
        return
      }
      toast.push('Не получилось переместить')
    },
  })

  function onDragStart(e: DragStartEvent) {
    setActive(visible.find((c) => c.id === e.active.id) ?? null)
  }

  function onDragEnd(e: DragEndEvent) {
    setActive(null)
    const id = String(e.active.id)
    const overId = e.over?.id ? String(e.over.id) : null
    if (!overId || !overId.startsWith('col:')) return
    const col = columns.find((c) => `col:${c.key}` === overId)
    if (!col) return
    const card = visible.find((c) => c.id === id)
    if (!card) return
    if (card.stage === 'done' && col.complete) return
    if (!col.complete && col.test(card)) return
    move.mutate({ id, col })
  }

  const areaName = data?.areas.find((a) => a.id === area)?.name

  return (
    <div className="page page-wide">
      <div className="board-head">
        <div>
          <div className="eyebrow">{areaName ? `Область · ${areaName}` : 'Все области'}</div>
          <h1>Доска</h1>
        </div>
        <div className="board-tools">
          <div className="segmented" role="tablist">
            <button
              className={mode === 'horizon' ? 'active' : ''}
              onClick={() => { setMode('horizon'); localStorage.setItem('sb.board.mode', 'horizon') }}
            >
              Горизонты
            </button>
            <button
              className={mode === 'stage' ? 'active' : ''}
              onClick={() => { setMode('stage'); localStorage.setItem('sb.board.mode', 'stage') }}
            >
              Этапы
            </button>
          </div>
          <button className="btn" onClick={() => onOpen('new')}>
            <Plus size={14} /> Карточка
          </button>
        </div>
      </div>

      {isLoading ? (
        <div style={{ display: 'flex', gap: 16 }}>
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ width: 292, height: 340, flex: '0 0 292px' }} />)}
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActive(null)}
        >
          <div className="board">
            {columns.map((col) => (
              <Column
                key={col.key}
                col={col}
                cards={visible.filter(col.test)}
                onOpen={onOpen}
              />
            ))}
          </div>
          <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(.2,.8,.2,1)' }}>
            {active ? <CardTileStatic card={active} /> : null}
          </DragOverlay>
          {escalation && (
            <EscalationDialog card={escalation} onClose={() => setEscalation(null)} />
          )}
        </DndContext>
      )}

    </div>
  )
}

function Column({
  col, cards, onOpen,
}: {
  col: ColumnDef
  cards: Card[]
  onOpen: (id: string) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `col:${col.key}` })
  const overWip = col.wip !== undefined && cards.length > col.wip
  return (
    <section className={`col ${isOver ? 'drop-active' : ''}`} ref={setNodeRef}>
      <header className="col-head">
        <span className="col-name">{col.title}</span>
        <span className="col-count">{cards.length}</span>
        {col.wip !== undefined && (
          <span className={`col-wip ${overWip ? 'over' : ''}`}>лимит {col.wip}</span>
        )}
      </header>
      <div className="col-body">
        {cards.map((card) => <CardTile key={card.id} card={card} onOpen={onOpen} />)}
        {cards.length === 0 && col.key !== 'done' && (
          <div style={{ height: 44, border: '1px dashed var(--line)', borderRadius: 10, opacity: 0.6 }} />
        )}
      </div>
    </section>
  )
}
