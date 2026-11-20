import { useState } from 'react'
import { api, setToken } from '../api'

export function AuthGate({ onDone }: { onDone: () => void }) {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const token = value.trim()
    if (!token) return
    setBusy(true)
    setError('')
    const ok = await api.probeAuth(token)
    setBusy(false)
    if (!ok) {
      setError('Токен не подошёл')
      return
    }
    setToken(token)
    onDone()
  }

  return (
    <div className="gate">
      <div className="gate-card">
        <div className="wordmark" style={{ marginBottom: 22 }}>
          <div className="wordmark-mark">S</div>
          <div className="wordmark-text">second <em>brain</em></div>
        </div>
        <h1 className="gate-title">Вход</h1>
        <p className="gate-lede">
          Это личный трекер. Вставьте токен доступа — тот, что задан в <code>AUTH_TOKEN</code> на сервере.
        </p>
        <form onSubmit={submit}>
          <input
            type="password"
            className="field-control"
            autoFocus
            placeholder="Токен доступа"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          {error && <div className="gate-error">{error}</div>}
          <button className="btn primary gate-submit" disabled={busy || !value.trim()}>
            {busy ? 'Проверяю…' : 'Войти'}
          </button>
        </form>
        <div className="gate-hint">
          Токен хранится только в этом браузере. Чтобы выйти — очистите его в настройках.
        </div>
      </div>
    </div>
  )
}
