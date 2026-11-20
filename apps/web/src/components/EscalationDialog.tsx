import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { Card } from '../types'
import { api } from '../api'
import { useToast } from './Toast'
import { Clock, Close, Split, Trash } from './Icons'

/**
 * Третий перенос — точка, где система перестаёт двигать карточку молча.
 * Вместо «перенести» предлагается три осмысленных выхода.
 */
export function EscalationDialog({ card, onClose }: { card: Card; onClose: () => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const [step, setStep] = useState('')
  const [when, setWhen] = useState(defaultWhen())

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const done = (msg: string) => {
    qc.invalidateQueries()
    toast.push(msg)
    onClose()
  }

  const split = useMutation({
    mutationFn: async () => {
      await api.addChecklist(card.id, step.trim())
      await api.patchCard(card.id, { horizon: 'today', scheduledAt: null })
    },
    onSuccess: () => done('Шаг добавлен — карточка вернулась в «Сегодня»'),
    onError: () => toast.push('Не получилось разбить'),
  })

  const schedule = useMutation({
    mutationFn: () =>
      api.patchCard(card.id, {
        scheduledAt: new Date(when).toISOString(),
        horizon: 'today',
      }),
    onSuccess: () => done('Поставлено в конкретное время'),
    onError: () => toast.push('Не получилось поставить время'),
  })

  const drop = useMutation({
    mutationFn: () => api.dropCard(card.id, 'решил не делать после третьего переноса'),
    onSuccess: () => done('Убрано из планов'),
  })

  const force = useMutation({
    mutationFn: () => api.postponeCard(card.id, 'week', undefined, true),
    onSuccess: () => done('Всё-таки перенесено. Это записано в историю'),
  })

  return createPortal(
    <>
      <div className="overlay modal-overlay" onClick={onClose} />
      <div className="modal" role="dialog" aria-modal="true" aria-label="Третий перенос" onClick={(e) => e.stopPropagation()}>
        <div className="modal-top">
          <span className="chip accent">перенос {card.postponeCount + 1}</span>
          <span className="chip line">{card.areaName ?? 'без области'}</span>
          <div style={{ flex: 1 }} />
          <button className="icon-btn" onClick={onClose} aria-label="Закрыть"><Close size={16} /></button>
        </div>

        <h2 className="modal-title">{card.title}</h2>
        <p className="modal-lede">
          Это {card.postponeCount + 1}-й перенос. Молча двигать больше не буду — выбери,
          что сделать вместо. Отложенные в третий раз задачи почти никогда не делаются
          сами: им не хватает не времени, а определённости.
        </p>

        <div className="choices">
          <div className="choice">
            <div className="choice-head"><Split size={14} /> Разбить на первый шаг</div>
            <p className="choice-desc">То, что можно начать за 15 минут, без подготовки и поиска.</p>
            <div className="choice-row">
              <input
                className="field-control"
                placeholder="Открыть кабинет и посмотреть текущий тариф"
                value={step}
                onChange={(e) => setStep(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && step.trim()) split.mutate() }}
                autoFocus
              />
              <button className="btn primary" disabled={!step.trim() || split.isPending} onClick={() => split.mutate()}>
                Разбить
              </button>
            </div>
          </div>

          <div className="choice">
            <div className="choice-head"><Clock size={14} /> Поставить в конкретное время</div>
            <p className="choice-desc">Не «на неделе», а среда, 11:00. Слот, который жалко пропустить.</p>
            <div className="choice-row">
              <input
                type="datetime-local"
                className="field-control"
                value={when}
                onChange={(e) => setWhen(e.target.value)}
              />
              <button className="btn" disabled={!when || schedule.isPending} onClick={() => schedule.mutate()}>
                Поставить
              </button>
            </div>
          </div>

          <div className="choice choice-quiet">
            <div className="choice-head"><Trash size={14} /> Решено не делать</div>
            <p className="choice-desc">Самое частое правильное решение. Петля закроется, долг исчезнет.</p>
            <button className="btn tiny" disabled={drop.isPending} onClick={() => drop.mutate()}>
              Убрать из планов
            </button>
          </div>
        </div>

        <div className="modal-foot">
          <button className="btn ghost tiny" onClick={() => force.mutate()} disabled={force.isPending}>
            Всё равно перенести
          </button>
          <span className="muted small">попадёт в историю как есть</span>
        </div>
      </div>
    </>,
    document.body,
  )
}

function defaultWhen(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(11, 0, 0, 0)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
