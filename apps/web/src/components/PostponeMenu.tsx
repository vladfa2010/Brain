import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import type { Card } from '../types'
import { useToast } from './Toast'
import { Refresh } from './Icons'
import { EscalationDialog } from './EscalationDialog'

const REASONS: { key: string; label: string }[] = [
  { key: 'dont_know', label: 'не знаю как' },
  { key: 'time', label: 'нет времени' },
  { key: 'dont_want', label: 'не хочу' },
  { key: 'wait', label: 'жду другого' },
]

export function PostponeMenu({ card }: { card: Card }) {
  const [open, setOpen] = useState(false)
  const [escalate, setEscalate] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const qc = useQueryClient()
  const toast = useToast()

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const mutate = useMutation({
    mutationFn: (reason: string) => api.postponeCard(card.id, 'week', reason),
    onSuccess: (res, reason) => {
      setOpen(false)
      qc.invalidateQueries()
      const label = REASONS.find((r) => r.key === reason)?.label ?? ''
      toast.push(`На неделю${label ? ` · ${label}` : ''} (перенос ${res.card.postponeCount})`)
    },
    onError: (err: unknown) => {
      const e = err as { status?: number }
      if (e.status === 409) {
        setOpen(false)
        setEscalate(true)
      } else {
        toast.push('Не получилось отложить')
      }
    },
  })

  const third = card.postponeCount >= 2

  return (
    <div className="menu" ref={ref}>
      <button
        className="icon-btn"
        title={third ? 'Третий перенос — нужно решение' : 'Отложить'}
        onClick={(e) => {
          e.stopPropagation()
          if (third) setEscalate(true)
          else setOpen((v) => !v)
        }}
      >
        <Refresh size={14} />
      </button>

      {open && (
        <div className="menu-list" onClick={(e) => e.stopPropagation()}>
          <div style={{ padding: '4px 9px 6px', fontSize: 10, letterSpacing: '.13em', textTransform: 'uppercase', color: 'var(--ink-4)' }}>
            Почему переносим?
          </div>
          {REASONS.map((r) => (
            <button key={r.key} className="menu-item" onClick={() => mutate.mutate(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
      )}

      {escalate && <EscalationDialog card={card} onClose={() => setEscalate(false)} />}
    </div>
  )
}
