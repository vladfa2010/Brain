import { NavLink, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../api'
import { fmtDayLabel } from '../lib/format'
import { Board, Inbox, Moon, Plus, Sun } from './Icons'
import { useTheme } from '../lib/theme'
import { useToast } from './Toast'

export function Sidebar({ open, onNavigate }: { open: boolean; onNavigate: () => void }) {
  const { data } = useQuery({ queryKey: ['bootstrap'], queryFn: api.bootstrap })
  const navigate = useNavigate()
  const toast = useToast()
  const [theme, setTheme] = useTheme()

  const run = data?.lastAgentRun
  const counts = data?.counts

  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="wordmark">
        <div className="wordmark-mark">S</div>
        <div className="wordmark-text">second <em>brain</em></div>
      </div>

      <nav className="nav">
        <NavLink to="/" end onClick={onNavigate} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <span className="nav-glyph"><Sun size={15} /></span>
          Сегодня
          {!!counts?.today && <span className="nav-count">{counts.today}</span>}
        </NavLink>
        <NavLink to="/board" onClick={onNavigate} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <span className="nav-glyph"><Board size={15} /></span>
          Доска
        </NavLink>
        <NavLink to="/inbox" onClick={onNavigate} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          <span className="nav-glyph"><Inbox size={15} /></span>
          Входящие
          {!!counts?.inbox && <span className="nav-count">{counts.inbox}</span>}
        </NavLink>
      </nav>

      <div className="side-label">Области</div>
      <div className="nav">
        {data?.areas.map((a) => (
          <button
            key={a.id}
            className="area-item"
            onClick={() => { onNavigate(); navigate(`/board?area=${a.id}`) }}
          >
            <span className="area-glyph"><i className={`dot ${a.hue}`} /></span>
            {a.name}
            {!!a.count && <span className="nav-count">{a.count}</span>}
          </button>
        ))}
      </div>

      <div className="side-bottom">
        <div className="theme-row">
          Тема
          <div className="theme-switch" role="group" aria-label="Тема оформления">
            <button
              className={theme === 'light' ? 'active' : ''}
              onClick={() => setTheme('light')}
              title="Светлая"
              aria-pressed={theme === 'light'}
            >
              <Sun size={13} />
            </button>
            <button
              className={theme === 'dark' ? 'active' : ''}
              onClick={() => setTheme('dark')}
              title="Тёмная"
              aria-pressed={theme === 'dark'}
            >
              <Moon size={13} />
            </button>
          </div>
        </div>
        <div className="agent-status">
          <span className="agent-dot" />
          <div>
            <b>Агент</b> · {run?.finished_at ? fmtDayLabel(run.finished_at) : 'ещё не просыпался'}
            {run?.summary && (
              <div style={{ marginTop: 3, fontSize: 10.5, color: 'var(--ink-4)', lineHeight: 1.4 }}>
                {run.summary}
              </div>
            )}
          </div>
        </div>
        <button
          className="btn side-cta"
          onClick={() => {
            onNavigate()
            navigate('/inbox?new=1')
            toast.push('Напишите в строку — разберу сам')
          }}
        >
          <Plus size={14} /> Новая карточка
        </button>
      </div>
    </aside>
  )
}
