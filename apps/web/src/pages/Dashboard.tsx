import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { fmtDue, fmtMinutes, fmtToday, greeting, plural } from '../lib/format'
import { TaskRow } from '../components/TaskRow'
import { Capture } from '../components/Capture'
import { useToast } from '../components/Toast'
import { ArrowRight, ArrowUpRight, Sparkle } from '../components/Icons'

export function DashboardPage({ onOpen }: { onOpen: (id: string) => void }) {
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: api.dashboard })
  const { data: boot } = useQuery({ queryKey: ['bootstrap'], queryFn: api.bootstrap })
  const qc = useQueryClient()
  const toast = useToast()
  const navigate = useNavigate()

  const complete = useMutation({
    mutationFn: (id: string) => api.completeCard(id),
    onSuccess: (res) => {
      qc.invalidateQueries()
      toast.push(`Закрыто: ${res.card.title.slice(0, 48)}`)
    },
  })

  if (isLoading || !data) return <DashboardSkeleton />

  const name = boot?.settings?.name
  const capacity = 240
  const pct = Math.min(100, Math.round((data.todayMinutes / capacity) * 100))
  const over = data.todayMinutes > capacity

  return (
    <div className="page">
      <div className="eyebrow">{fmtToday()}</div>
      <h1 className="display">
        {greeting()}
        {name ? <>, <em>{name}</em></> : ''}.
      </h1>

      <div className="lede">
        <span><span className="num">{data.today.length}</span> {plural(data.today.length, ['задача', 'задачи', 'задач'])} на сегодня</span>
        {data.todayMinutes > 0 && <><span className="sep">·</span><span className="num">{fmtMinutes(data.todayMinutes)}</span></>}
        {data.stats.doneToday > 0 && <><span className="sep">·</span><span>закрыто {data.stats.doneToday}</span></>}
        {data.stats.rolledOver > 0 && <><span className="sep">·</span><span style={{ color: 'var(--ink-3)' }}>{data.stats.rolledOver} осталось с вчера</span></>}
        {data.stats.overdue > 0 && <><span className="sep">·</span><span style={{ color: 'var(--accent)' }}>{data.stats.overdue} просрочено</span></>}
      </div>

      <div className="dash-grid">
        <div>
          <div className="sect">
            Сейчас
            <span className="count">— план на день</span>
            <span className="sect-rule" />
            <button className="btn ghost tiny" onClick={() => navigate('/board')}>
              с доски <ArrowUpRight size={12} />
            </button>
          </div>

          {data.today.length > 0 && (
            <div className="capacity">
              <div className="capacity-track">
                <div className={`capacity-fill ${over ? 'over' : ''}`} style={{ width: `${pct}%` }} />
              </div>
              <span className="capacity-label">
                {fmtMinutes(data.todayMinutes)} из ~4 ч
                {over ? ' · перегруз' : ''}
              </span>
            </div>
          )}

          {data.today.length === 0 ? (
            <div className="empty">
              <b>На сегодня пусто.</b><br />
              Возьмите одну вещь с доски — не три, одну.
            </div>
          ) : (
            <div className="tasks">
              {data.today.map((card) => (
                <TaskRow key={card.id} card={card} onOpen={onOpen} onComplete={(id) => complete.mutate(id)} />
              ))}
            </div>
          )}

          <Capture />

          {data.week.length > 0 && (
            <div style={{ marginTop: 30 }}>
              <div className="sect">
                Дальше на неделе
                <span className="sect-rule" />
                <button className="btn ghost tiny" onClick={() => navigate('/board')}>вся доска</button>
              </div>
              <div>
                {data.week.map((card) => (
                  <button key={card.id} className="week-row" onClick={() => onOpen(card.id)}>
                    <span className={`dot ${card.areaHue ?? 'ink'}`} />
                    <span className="t">{card.title}</span>
                    <span className="when">{card.dueAt ? fmtDue(card.dueAt).label : ''}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div>
          <div className="side-block">
            <div className="sect">
              Требует решения
              <span className="count">{data.decisions.length || ''}</span>
            </div>
            {data.decisions.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--ink-3)', padding: '2px 0 0' }}>
                Ничего не висит. Хороший день.
              </div>
            ) : (
              <div className="decisions">
                {data.decisions.map(({ card, reason }) => (
                  <button key={card.id} className="decision" onClick={() => onOpen(card.id)}>
                    <span className="decision-reason">{reason}</span>
                    <span className="decision-title">{card.title}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="side-block">
            <div className="sect">Совет дня</div>
            <div className="advice">
              <div className="advice-head"><span className="star">✦</span> агент</div>
              <h3 className="advice-title">{data.advice.title}</h3>
              <p className="advice-body">{data.advice.body}</p>
              {data.advice.action && (
                <button
                  className="advice-action"
                  onClick={() => {
                    const a = data.advice.action!
                    if (a.type === 'triage') navigate('/inbox')
                    else if (a.cardId) onOpen(a.cardId)
                    else navigate('/board')
                  }}
                >
                  {data.advice.action.label} <ArrowRight size={13} />
                </button>
              )}
              <div className="advice-foot">
                <span className="agent-dot" />
                пересчитывается утром · {boot?.lastAgentRun?.finished_at ? 'сегодня' : 'первый прогон'}
              </div>
            </div>
          </div>

          {data.waiting.length > 0 && (
            <div className="side-block">
              <div className="sect">Ждут тебя</div>
              <div className="waiting-list">
                {data.waiting.map((card) => {
                  const late = card.dueAt && new Date(card.dueAt) < new Date()
                  return (
                    <button key={card.id} className="waiting-row" onClick={() => onOpen(card.id)}>
                      <span className={`dot ${card.areaHue ?? 'ink'}`} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {card.title}
                      </span>
                      {card.dueAt && (
                        <span className={`when ${late ? 'late' : ''}`}>
                          {late ? 'срок прошёл' : 'ответа нет'}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function DashboardSkeleton() {
  return (
    <div className="page">
      <div className="skeleton" style={{ width: 190, height: 12 }} />
      <div className="skeleton" style={{ width: 420, height: 48, margin: '16px 0 12px' }} />
      <div className="dash-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[0, 1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 72 }} />)}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="skeleton" style={{ height: 190 }} />
          <div className="skeleton" style={{ height: 150 }} />
        </div>
      </div>
    </div>
  )
}
