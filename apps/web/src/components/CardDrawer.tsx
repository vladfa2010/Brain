import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import type { Card, CardDetail, ChecklistItem, EventRow, Note } from '../types'
import { dayDiff, fmtDayLabel, fmtMinutes } from '../lib/format'
import { useToast } from './Toast'
import { ArrowLeft, ArrowRight, Check, Close, Link as LinkIcon, Plus, Sparkle, Trash } from './Icons'
import { EscalationDialog } from './EscalationDialog'

const STATUS: { key: NonNullable<Card['researchStatus']>; label: string }[] = [
  { key: 'new', label: 'не смотрел' },
  { key: 'seen', label: 'посмотрел' },
  { key: 'concluded', label: 'есть вывод' },
  { key: 'applied', label: 'применено' },
]

const REASON_LABEL: Record<string, string> = {
  time: 'нет времени', dont_want: 'не хочу', dont_know: 'не знаю как', wait: 'жду другого',
}

const HORIZON_LABEL: Record<string, string> = {
  inbox: 'Входящие', today: 'Сегодня', week: 'На неделе', someday: 'Когда-нибудь',
}

const STAGE_LABEL: Record<string, string> = {
  todo: 'не начато', doing: 'в работе', waiting: 'ждёт', done: 'готово',
}

export function CardDrawer({
  cardId, onClose, onOpen,
}: {
  cardId: string
  onClose: () => void
  onOpen: (id: string) => void
}) {
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

  return (
    <>
      <div className="overlay" onClick={onClose} />
      <div className="drawer" role="dialog" aria-modal="true">
        {cardId === 'new'
          ? <NewCard onClose={onClose} onOpen={onOpen} />
          : <CardBody cardId={cardId} onClose={onClose} onOpen={onOpen} />}
      </div>
    </>
  )
}

function CardBody({ cardId, onClose, onOpen }: { cardId: string; onClose: () => void; onOpen: (id: string) => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const { data, isLoading } = useQuery({ queryKey: ['card', cardId], queryFn: () => api.card(cardId) })
  const [tab, setTab] = useState<'all' | 'me' | 'agent'>('all')
  const [escalate, setEscalate] = useState(false)
  const composerRef = useRef<HTMLTextAreaElement>(null)
  const titleRef = useRef<HTMLTextAreaElement>(null)
  const narrow = typeof window !== 'undefined' && window.matchMedia('(max-width: 560px)').matches

  useEffect(() => {
    if (titleRef.current) autosize(titleRef.current)
  }, [data?.card.id, data?.card.title])

  const invalidate = () => qc.invalidateQueries()

  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patchCard(cardId, body),
    onSuccess: invalidate,
    onError: () => toast.push('Не сохранилось'),
  })
  const complete = useMutation({
    mutationFn: () => api.completeCard(cardId),
    onSuccess: () => { invalidate(); toast.push('Закрыто'); onClose() },
  })
  const postpone = useMutation({
    mutationFn: () => api.postponeCard(cardId, 'week'),
    onSuccess: (res) => {
      invalidate()
      toast.push(res.card.postponeCount >= 3
        ? `Перенос №${res.card.postponeCount}. Давай разобьём?`
        : 'Отложено до недели')
    },
  })
  const drop = useMutation({
    mutationFn: () => api.dropCard(cardId, 'решил не делать'),
    onSuccess: () => { invalidate(); toast.push('Закрыто без действия'); onClose() },
  })
  const addItem = useMutation({
    mutationFn: (title: string) => api.addChecklist(cardId, title),
    onSuccess: invalidate,
  })
  const toggleItem = useMutation({
    mutationFn: (item: ChecklistItem) => api.patchChecklist(item.id, { done: !item.done }),
    onSuccess: invalidate,
  })
  const delItem = useMutation({
    mutationFn: (id: string) => api.deleteChecklist(id),
    onSuccess: invalidate,
  })
  const addNote = useMutation({
    mutationFn: (body: string) => api.addNote(cardId, { body, author: 'me' }),
    onSuccess: () => { invalidate(); if (composerRef.current) composerRef.current.value = '' },
  })
  const noteStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.patchNote(id, { status }),
    onSuccess: invalidate,
  })
  const requestResearch = useMutation({
    mutationFn: () => api.researchCard(cardId),
    onSuccess: (r) => {
      invalidate()
      toast.push(r.note ? 'Агент изучил — вывод ниже' : 'Нужен DEEPSEEK_API_KEY в .env')
    },
  })

  if (isLoading || !data) {
    return (
      <div className="drawer-inner">
        <div className="skeleton" style={{ width: 90, height: 12 }} />
        <div className="skeleton" style={{ width: '80%', height: 34, margin: '18px 0' }} />
        <div className="skeleton" style={{ height: 120 }} />
      </div>
    )
  }

  const { card, checklist, notes, attachments, events, similar, children } = data
  const doneCount = checklist.filter((i) => i.done).length
  const agentResearch = notes.find((n) => n.author === 'agent' && n.kind === 'research' && n.status === 'active')
  const visibleNotes = notes.filter((n) => (tab === 'all' ? true : n.author === tab))
  const reviewNote = notes.find((n) => n.author === 'agent' && n.kind === 'suggestion' && n.status === 'active')

  return (
    <>
      <div className="drawer-inner">
        <div className="drawer-top">
          <button className="icon-btn only-sm" onClick={onClose} aria-label="Назад"><ArrowLeft size={17} /></button>
          <span className={`chip ${card.type === 'research' ? 'blue' : ''}`}>
            {card.type === 'research' ? 'изучить' : card.type === 'decision' ? 'решение' : 'задача'}
          </span>
          {card.state === 'dropped' && <span className="chip accent">не буду</span>}
          {card.postponeCount > 0 && <span className="chip accent">перенос {card.postponeCount}</span>}
          <div style={{ flex: 1 }} />
          <button className="icon-btn close" onClick={onClose} aria-label="Закрыть"><Close size={16} /></button>
        </div>

        <textarea
          ref={titleRef}
          key={card.id + card.updatedAt}
          className="drawer-title"
          defaultValue={card.title}
          rows={1}
          onInput={(e) => autosize(e.currentTarget)}
          onBlur={(e) => {
            const t = e.currentTarget.value.trim()
            if (t && t !== card.title) patch.mutate({ title: t })
          }}
        />

        <div className="field-grid">
          <Field label="Область">
            <AreaSelect value={card.areaId} onChange={(v) => patch.mutate({ areaId: v })} />
          </Field>
          <Field label="Срок">
            <input
              type="datetime-local"
              className="field-control"
              defaultValue={toLocal(card.dueAt)}
              onChange={(e) => patch.mutate({ dueAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
            />
          </Field>
          <Field label="Слот — когда сяду">
            <input
              type="datetime-local"
              className="field-control"
              defaultValue={toLocal(card.scheduledAt)}
              onChange={(e) => patch.mutate({ scheduledAt: e.target.value ? new Date(e.target.value).toISOString() : null })}
            />
          </Field>
          <Field label="Приоритет">
            <div className="prio-group">
              {(['p0', 'p1', 'p2', 'p3'] as const).map((p) => (
                <button
                  key={p}
                  className={`prio-btn ${card.priority === p ? 'active' : ''}`}
                  onClick={() => patch.mutate({ priority: p })}
                >
                  {p.toUpperCase()}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Оценка">
            <select
              className="field-control"
              value={card.estimateMin ?? ''}
              onChange={(e) => patch.mutate({ estimateMin: e.target.value ? Number(e.target.value) : null })}
            >
              <option value="">—</option>
              {[15, 30, 45, 60, 90, 120, 180].map((m) => (
                <option key={m} value={m}>{fmtMinutes(m)}</option>
              ))}
            </select>
          </Field>
        </div>

        {card.type === 'research' && (
          <>
            <hr className="divider" />
            <div className="block-head">
              <span className="block-title">Изучить</span>
              <span style={{ flex: 1 }} />
              <span className="muted small">{card.researchKind === 'video' ? 'видео' : card.researchKind === 'book' ? 'книга' : card.researchKind === 'topic' ? 'тема' : 'статья'}</span>
            </div>

            <div className="research-panel">
              <Field label="Зачем — какое решение это разблокирует">
                <textarea
                  key={card.id + 'why'}
                  defaultValue={card.why ?? ''}
                  placeholder="Пока не понятно, зачем — это не задача, а тревога."
                  onInput={(e) => autosize(e.currentTarget)}
                  onBlur={(e) => {
                    const v = e.currentTarget.value.trim()
                    if (v !== (card.why ?? '')) patch.mutate({ why: v || null })
                  }}
                />
              </Field>
              {card.researchUrl && (
                <a className="link-chip" href={card.researchUrl} target="_blank" rel="noreferrer" style={{ marginTop: 8 }}>
                  <LinkIcon size={12} />
                  <span className="name">Источник</span>
                  <span className="site">{safeHost(card.researchUrl)}</span>
                </a>
              )}
            </div>

            <div style={{ display: 'flex', gap: 5, marginTop: 10, flexWrap: 'wrap' }}>
              {STATUS.map((s) => (
                <button
                  key={s.key}
                  className={`btn tiny ${card.researchStatus === s.key ? '' : 'ghost'}`}
                  style={card.researchStatus === s.key ? { background: 'var(--sage-soft)', borderColor: '#d5ddca', color: 'var(--sage)' } : undefined}
                  onClick={() => patch.mutate({ researchStatus: s.key })}
                >
                  {card.researchStatus === s.key && <Check size={11} />} {s.label}
                </button>
              ))}
            </div>

            {agentResearch ? (
              <div className="research-verdict">
                <div className="verdict-mark"><Sparkle size={12} /> агент изучил</div>
                <div className="note-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{agentResearch.body}</ReactMarkdown>
                </div>
                <div className="verdict-actions">
                  <button
                    className="btn tiny"
                    onClick={() => {
                      patch.mutate({ researchStatus: 'concluded' })
                      noteStatus.mutate({ id: agentResearch.id, status: 'accepted' })
                      toast.push('Вывод зафиксирован')
                    }}
                  >
                    Согласен
                  </button>
                  <button
                    className="btn tiny ghost"
                    onClick={() => noteStatus.mutate({ id: agentResearch.id, status: 'dismissed' })}
                  >
                    Не согласен
                  </button>
                  <button className="btn tiny ghost" onClick={() => composerRef.current?.focus()}>
                    Уточнить
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="btn"
                style={{ marginTop: 12 }}
                onClick={() => requestResearch.mutate()}
                disabled={requestResearch.isPending}
              >
                <Sparkle size={13} /> {requestResearch.isPending ? 'Изучаю…' : 'Попросить агента изучить'}
              </button>
            )}

            <Field label="Мой вывод" >
              <textarea
                key={card.id + 'take'}
                className="field-control"
                style={{ height: 'auto', minHeight: 70, padding: 10, lineHeight: 1.55, resize: 'vertical' }}
                defaultValue={card.myTake ?? ''}
                placeholder="Одно предложение: что я понял и что с этим делать."
                onBlur={(e) => {
                  const v = e.currentTarget.value.trim()
                  if (v !== (card.myTake ?? '')) patch.mutate({ myTake: v || null })
                }}
              />
            </Field>
          </>
        )}

        <hr className="divider" />

        <div className="block-head">
          <span className="block-title">Чек-лист</span>
          <span style={{ flex: 1 }} />
          {checklist.length > 0 && <span className="progress-label">{doneCount}/{checklist.length}</span>}
        </div>
        {checklist.length > 0 && (
          <div className="progress">
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${(doneCount / checklist.length) * 100}%` }} />
            </div>
          </div>
        )}
        <div className="checklist">
          {checklist.map((item) => (
            <div className="check-row" key={item.id}>
              <button
                className={`check-box ${item.done ? 'done' : ''}`}
                onClick={() => toggleItem.mutate(item)}
                aria-label={item.done ? 'Снять' : 'Отметить'}
              >
                <Check size={10} stroke={2.4} />
              </button>
              <span className={`check-text ${item.done ? 'done' : ''}`}>{item.title}</span>
              <button className="icon-btn check-del" onClick={() => delItem.mutate(item.id)} aria-label="Удалить">
                <Trash size={13} />
              </button>
            </div>
          ))}
          <ChecklistAdd onAdd={(t) => addItem.mutate(t)} />
        </div>

        {reviewNote && (
          <div className="note suggestion" style={{ marginTop: 16 }}>
            <div className="note-head">
              <span className="note-author">предложение агента</span>
            </div>
            <div className="note-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{reviewNote.body}</ReactMarkdown>
            </div>
            <div className="note-actions">
              <button className="note-action accent" onClick={() => noteStatus.mutate({ id: reviewNote.id, status: 'accepted' })}>
                Принять
              </button>
              <button className="note-action" onClick={() => noteStatus.mutate({ id: reviewNote.id, status: 'dismissed' })}>
                Убрать
              </button>
            </div>
          </div>
        )}

        <hr className="divider" />

        <div className="block-head">
          <span className="block-title">Заметки</span>
          <span style={{ flex: 1 }} />
          <div className="segmented">
            {([['all', 'все'], ['me', 'мои'], ['agent', 'агента']] as const).map(([k, label]) => (
              <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{label}</button>
            ))}
          </div>
        </div>

        <div className="notes">
          {visibleNotes.map((n) => <NoteView key={n.id} note={n} onStatus={(s) => noteStatus.mutate({ id: n.id, status: s })} />)}
          {visibleNotes.length === 0 && <div className="muted small">Пока тихо.</div>}
        </div>

        {attachments.length > 0 && (
          <>
            <div className="block-head" style={{ marginTop: 18 }}>
              <span className="block-title">Ссылки</span>
            </div>
            <div className="links">
              {attachments.map((a) => (
                <a key={a.id} className="link-chip" href={a.url ?? '#'} target="_blank" rel="noreferrer">
                  <LinkIcon size={12} />
                  <span className="name">{a.title ?? a.url}</span>
                  <span className="site">{a.site}</span>
                </a>
              ))}
            </div>
          </>
        )}

        <div className="composer">
          <textarea
            ref={composerRef}
            placeholder={narrow ? 'Что я понял? Что дальше?' : 'Что я понял? Что дальше? (⌘↵ — сохранить)'}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault()
                const v = e.currentTarget.value.trim()
                if (v) addNote.mutate(v)
              }
            }}
          />
          <div className="composer-foot">
            <span className="composer-hint">агент увидит и учтёт</span>
            <button
              className="btn tiny primary"
              onClick={() => {
                const v = composerRef.current?.value.trim()
                if (v) addNote.mutate(v)
              }}
            >
              Добавить
            </button>
          </div>
        </div>

        {similar.length > 0 && (
          <>
            <hr className="divider" />
            <div className="block-head">
              <span className="block-title">Похожие</span>
            </div>
            <div className="links">
              {similar.map((s) => (
                <button key={s.id} className="link-chip" onClick={() => onOpen(s.id)}>
                  <span className="name">{s.title}</span>
                </button>
              ))}
            </div>
          </>
        )}

        <hr className="divider" />
        <div className="block-head">
          <span className="block-title">История</span>
        </div>
        <div className="history">
          {events.slice(0, 10).map((e) => (
            <div className="hist-row" key={e.id}>
              <span className="t">{fmtDayLabel(e.created_at)}</span>
              <span className="what">{eventLabel(e)}</span>
            </div>
          ))}
        </div>

        {children.length > 0 && (
          <>
            <hr className="divider" />
            <div className="block-head"><span className="block-title">Подзадачи</span></div>
            {children.map((c) => (
              <button key={c.id} className="waiting-row" onClick={() => onOpen(c.id)}>
                <span className="dot ink" /> {c.title}
              </button>
            ))}
          </>
        )}
      </div>

      <div className="drawer-foot">
        <button className="btn primary" onClick={() => complete.mutate()}>
          <Check size={14} /> Закрыть<span className="hide-sm"> задачу</span>
        </button>
        <button
          className="btn"
          onClick={() => (card.postponeCount >= 2 ? setEscalate(true) : postpone.mutate())}
        >
          Отложить
        </button>
        <button className="btn ghost" onClick={() => drop.mutate()}>Не буду</button>
        <div style={{ flex: 1 }} />
        {card.dueAt && (
          <span className="muted small hide-sm">
            {dayDiff(card.dueAt) < 0 ? 'срок прошёл' : `срок ${fmtDayLabel(card.dueAt)}`}
          </span>
        )}
      </div>
      {escalate && <EscalationDialog card={card} onClose={() => setEscalate(false)} />}
    </>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  )
}

function AreaSelect({ value, onChange }: { value: string | null; onChange: (v: string | null) => void }) {
  const { data } = useQuery({ queryKey: ['bootstrap'], queryFn: api.bootstrap })
  return (
    <select className="field-control" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">Без области</option>
      {data?.areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
    </select>
  )
}

function ChecklistAdd({ onAdd }: { onAdd: (title: string) => void }) {
  const [value, setValue] = useState('')
  return (
    <form
      className="check-add"
      onSubmit={(e) => {
        e.preventDefault()
        const v = value.trim()
        if (v) { onAdd(v); setValue('') }
      }}
    >
      <span style={{ width: 17, textAlign: 'center', color: 'var(--ink-4)' }}><Plus size={13} /></span>
      <input value={value} onChange={(e) => setValue(e.target.value)} placeholder="Первый шаг — не длиннее 15 минут" />
    </form>
  )
}

function NoteView({ note, onStatus }: { note: Note; onStatus: (s: string) => void }) {
  const agent = note.author === 'agent'
  return (
    <div className={`note ${agent ? 'agent' : 'me'} ${note.kind === 'suggestion' ? 'suggestion' : ''}`}>
      <div className="note-head">
        <span className="note-author">{agent ? 'агент' : 'я'}</span>
        <span className="note-time">{fmtDayLabel(note.createdAt)}</span>
        {note.kind === 'research' && <span className="chip blue" style={{ height: 17 }}>ресерч</span>}
      </div>
      <div className="note-body">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{note.body}</ReactMarkdown>
      </div>
      {note.kind === 'suggestion' && note.status === 'active' && (
        <div className="note-actions">
          <button className="note-action accent" onClick={() => onStatus('accepted')}>Принять</button>
          <button className="note-action" onClick={() => onStatus('dismissed')}>Убрать</button>
        </div>
      )}
    </div>
  )
}

function NewCard({ onClose, onOpen }: { onClose: () => void; onOpen: (id: string) => void }) {
  const qc = useQueryClient()
  const toast = useToast()
  const { data } = useQuery({ queryKey: ['bootstrap'], queryFn: api.bootstrap })
  const [title, setTitle] = useState('')
  const [type, setType] = useState<'task' | 'research'>('task')
  const [area, setArea] = useState<string | null>(null)
  const [horizon, setHorizon] = useState<'inbox' | 'today' | 'week'>('inbox')
  const [estimate, setEstimate] = useState<number | null>(30)

  const create = useMutation({
    mutationFn: () => api.createCard({ title, type, areaId: area, horizon, estimateMin: estimate }),
    onSuccess: (res) => {
      qc.invalidateQueries()
      toast.push('Создано')
      onOpen(res.card.id)
    },
  })

  return (
    <div className="drawer-inner" style={{ paddingTop: 34 }}>
      <div className="drawer-top">
        <span className="chip">новая карточка</span>
        <div style={{ flex: 1 }} />
        <button className="icon-btn" onClick={onClose}><Close size={16} /></button>
      </div>
      <textarea
        autoFocus
        className="drawer-title"
        placeholder="Что нужно сделать?"
        rows={1}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onInput={(e) => autosize(e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (title.trim()) create.mutate() }
        }}
      />
      <div className="segmented" style={{ marginBottom: 18 }}>
        <button className={type === 'task' ? 'active' : ''} onClick={() => setType('task')}>Задача</button>
        <button className={type === 'research' ? 'active' : ''} onClick={() => setType('research')}>Изучить</button>
      </div>
      <div className="field-grid">
        <Field label="Область">
          <select className="field-control" value={area ?? ''} onChange={(e) => setArea(e.target.value || null)}>
            <option value="">Без области</option>
            {data?.areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Куда">
          <select className="field-control" value={horizon} onChange={(e) => setHorizon(e.target.value as typeof horizon)}>
            <option value="inbox">Входящие</option>
            <option value="today">Сегодня</option>
            <option value="week">На неделе</option>
          </select>
        </Field>
        <Field label="Оценка">
          <select className="field-control" value={estimate ?? ''} onChange={(e) => setEstimate(e.target.value ? Number(e.target.value) : null)}>
            <option value="">—</option>
            {[15, 30, 45, 60, 90, 120].map((m) => <option key={m} value={m}>{fmtMinutes(m)}</option>)}
          </select>
        </Field>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 22, alignItems: 'center' }}>
        <button className="btn primary" disabled={!title.trim() || create.isPending} onClick={() => create.mutate()}>
          Создать <ArrowRight size={14} />
        </button>
        <span className="muted small">Enter — создать, Shift+Enter — перенос строки</span>
      </div>
    </div>
  )
}

function eventLabel(e: EventRow): string {
  const p = e.payload as Record<string, any>
  switch (e.type) {
    case 'created': return 'создана'
    case 'moved':
      return p.group === 'horizon'
        ? `перенесена → ${HORIZON_LABEL[p.to] ?? p.to}`
        : `этап → ${STAGE_LABEL[p.to] ?? p.to}`
    case 'postponed':
      return `перенос №${p.count ?? ''}${p.reason ? ` · ${REASON_LABEL[p.reason] ?? p.reason}` : ''}`
    case 'completed': return 'закрыта'
    case 'dropped': return 'решено не делать'
    case 'rollover': return 'осталась с вчера'
    case 'agent_research': return 'агент изучил'
    case 'agent_note': return 'заметка агента'
    case 'note_added': return 'добавлена заметка'
    case 'attachment': return 'прикреплён материал'
    case 'restored': return 'возвращена'
    default: return e.type
  }
}

function autosize(el: HTMLTextAreaElement) {
  el.style.height = 'auto'
  el.style.height = `${el.scrollHeight}px`
}

function toLocal(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function safeHost(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, '') } catch { return '' }
}
