import { useEffect, useState } from 'react'
import { api, ApiError } from '../api'
import { useAuth } from '../auth/AuthProvider'
import { useTheme } from '../lib/theme'
import { Moon, Sun } from '../components/Icons'

type Mode = 'login' | 'register'

export function LoginPage() {
  const { login, register } = useAuth()
  const [theme, setTheme] = useTheme()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [checked, setChecked] = useState(false)

  // первый запуск: показываем регистрацию, а не вход в пустоту
  useEffect(() => {
    api.auth
      .status()
      .then((s) => {
        if (!s.hasUsers) setMode('register')
      })
      .catch(() => {})
      .finally(() => setChecked(true))
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (mode === 'register' && password.length < 10) {
      setError('Пароль — минимум 10 символов')
      return
    }
    setBusy(true)
    try {
      if (mode === 'login') await login(email.trim(), password)
      else await register(email.trim(), password, name.trim() || undefined)
    } catch (err) {
      const e = err as ApiError
      const message = typeof e.body?.message === 'string' ? e.body.message : null
      setError(message ?? 'Не получилось. Попробуйте ещё раз.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="gate">
      <button
        className="icon-btn gate-theme"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        aria-label="Сменить тему"
      >
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>
      <div className="gate-card auth-card">
        <div className="wordmark" style={{ marginBottom: 20 }}>
          <div className="wordmark-mark">S</div>
          <div className="wordmark-text">second <em>brain</em></div>
        </div>

        <div className="auth-tabs" role="tablist">
          <button
            className={mode === 'login' ? 'active' : ''}
            onClick={() => { setMode('login'); setError('') }}
            type="button"
          >
            Вход
          </button>
          <button
            className={mode === 'register' ? 'active' : ''}
            onClick={() => { setMode('register'); setError('') }}
            type="button"
          >
            Регистрация
          </button>
        </div>

        <h1 className="gate-title">
          {mode === 'login' ? 'С возвращением.' : 'Первая карточка.'}
        </h1>
        <p className="gate-lede">
          {mode === 'login'
            ? 'Личный трекер. Войдите, чтобы вернуться к своим задачам.'
            : checked
              ? 'Аккаунт создаётся на этом сервере. Данные видите только вы.'
              : 'Секунду…'}
        </p>

        <form className="auth-form" onSubmit={submit}>
          {mode === 'register' && (
            <label className="field">
              <span className="field-label">Как вас зовут</span>
              <input
                className="field-control"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Влад"
                autoComplete="name"
              />
            </label>
          )}

          <label className="field">
            <span className="field-label">Почта</span>
            <input
              className="field-control"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoFocus
            />
          </label>

          <label className="field">
            <span className="field-label">Пароль</span>
            <input
              className="field-control"
              type="password"
              required
              minLength={mode === 'register' ? 10 : 1}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'register' ? 'Минимум 10 символов, буквы и цифры' : '••••••••••'}
            />
          </label>

          {error && <div className="auth-error">{error}</div>}

          <button className="btn primary gate-submit" disabled={busy || !email.trim() || !password}>
            {busy ? 'Проверяю…' : mode === 'login' ? 'Войти' : 'Создать аккаунт'}
          </button>
        </form>

        <div className="gate-hint">
          {mode === 'register'
            ? 'Пароль хранится только в виде scrypt-хеша. Сессия — httpOnly-кука, токен доступа живёт 15 минут.'
            : 'Пять неудачных попыток — и вход временно блокируется.'}
        </div>
      </div>
    </div>
  )
}
