import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import type { Card } from '../types'
import { Capture } from '../components/Capture'
import { useToast } from '../components/Toast'
import { DueChip, PostponeChip, PriorityDot, EstimateChip } from '../components/bits'
import { ArrowRight, Sparkle } from '../components/Icons'

export function InboxPage({ onOpen }: { onOpen: (id: string) => void }) {
  const [params] = useSearchParams()
  const { data, isLoading } = useQuery({ queryKey: ['board'], queryFn: api.board })
  const qc = useQueryClient()
  const toast = useToast()
  const [busy, setBusy] = useState<string | null>(null)

  const inbox = (data?.cards ?? []).filter((c) => c.horizon === 'inbox' && c.stage !== 'done')

  const move = useMutation({
    mutationFn: ({ id, value }: { id: string; value: 'today' | 'week' }) =>
      api.moveCard(id, { group: 'horizon', value }),
    onSuccess: () => qc.invalidateQueries(),
  })
  const drop = useMutation({
    mutationFn: (id: string) => api.dropCard(id, 'не нужно'),
    onSuccess: () => {
      qc.invalidateQueries()
      toast.push('Убрано. Иногда это лучший вариант.')
    },
  })
  const agent = useMutation({
    mutationFn: () => api.runAgent(),
    onSuccess: (r) => { qc.invalidateQueries(); toast.push(r.summary) },
  })

  return (
    <div className="page">
      <div className="eyebrow">Разбор</div>
      <h1 className="display">Входящие.</h1>
      <div className="lede">
        <span><span className="num">{inbox.length}</span> карточек ждут решения</span>
        <span className="sep">·</span>
        <span>задачам — срок, материалу — карточка</span>
      </div>

      <div style={{ marginTop: 26, maxWidth: 760 }}>
        <Capture autoFocus={params.get('new') === '1'} />
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '26px 0 14px', maxWidth: 760 }}>
        <span className="sect" style={{ margin: 0 }}>В очереди</span>
        <span className="chip num">{inbox.length}</span>
        <span style={{ flex: 1 }} />
        <button className="btn tiny" onClick={() => agent.mutate()} disabled={agent.isPending}>
          <Sparkle size={12} /> Разобрать агентом
        </button>
      </div>

      <div className="list-page" style={{ maxWidth: 760 }}>
        {isLoading && [0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 64 }} />)}
        {!isLoading && inbox.length === 0 && (
          <div className="empty"><b>Пусто.</b> Входящие разобраны — можно жить.</div>
        )}
        {inbox.map((card) => (
          <InboxRow
            key={card.id}
            card={card}
            busy={busy === card.id}
            onOpen={() => onOpen(card.id)}
            onToday={() => { setBusy(card.id); move.mutate({ id: card.id, value: 'today' }) }}
            onWeek={() => { setBusy(card.id); move.mutate({ id: card.id, value: 'week' }) }}
            onDrop={() => { setBusy(card.id); drop.mutate(card.id) }}
          />
        ))}
      </div>
    </div>
  )
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return 'ссылка' }
}

function InboxRow({
  card, onOpen, onToday, onWeek, onDrop, busy,
}: {
  card: Card
  onOpen: () => void
  onToday: () => void
  onWeek: () => void
  onDrop: () => void
  busy: boolean
}) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'var(--raised)', border: '1px solid var(--line)',
        borderRadius: 12, padding: '12px 12px 12px 15px', opacity: busy ? 0.5 : 1,
      }}
    >
      <PriorityDot card={card} />
      <button
        onClick={onOpen}
        style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
      >
        <div style={{ fontSize: 13.8, fontWeight: 500, lineHeight: 1.35 }}>{card.title}</div>
        <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
          <span className="chip line">{card.type === 'research' ? 'материал' : 'задача'}</span>
          {card.researchUrl && <span className="chip">{hostOf(card.researchUrl)}</span>}
          {card.areaName && <span className="chip">{card.areaName}</span>}
          <DueChip card={card} />
          <EstimateChip card={card} />
          <PostponeChip card={card} />
        </div>
      </button>
      <div style={{ display: 'flex', gap: 5 }}>
        <button className="btn tiny" onClick={onToday}>Сегодня</button>
        <button className="btn tiny" onClick={onWeek}>Неделя</button>
        <button className="btn tiny ghost" onClick={onDrop} title="Не буду">✕</button>
      </div>
    </div>
  )
}
