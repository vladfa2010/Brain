import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { CardDrawer } from './components/CardDrawer'
import { ToastProvider } from './components/Toast'
import { MobileBar } from './components/MobileBar'
import { useAuth } from './auth/AuthProvider'
import { applyTheme } from './lib/theme'
import { DashboardPage } from './pages/Dashboard'
import { BoardPage } from './pages/Board'
import { InboxPage } from './pages/Inbox'
import { LoginPage } from './pages/Login'

export default function App() {
  const { status } = useAuth()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [menuOpen, setMenuOpen] = useState(false)

  const openCard = params.get('card')

  const open = (id: string | null) => {
    const next = new URLSearchParams(params)
    if (id) {
      next.set('card', id)
      setParams(next, { state: { sbCard: id } })
      return
    }
    const state = window.history.state as { sbCard?: string; usr?: { sbCard?: string } } | null
    if (state?.sbCard || state?.usr?.sbCard) {
      navigate(-1)
      return
    }
    next.delete('card')
    setParams(next, { replace: true })
  }

  useEffect(() => {
    const t = params.get('theme')
    if (t === 'dark' || t === 'light') applyTheme(t)
  }, [params])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        open('new')
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  if (status === 'loading') {
    return (
      <div className="splash">
        <div className="wordmark-mark">S</div>
      </div>
    )
  }

  if (status === 'guest') return <LoginPage />

  return (
    <ToastProvider>
      <div className="shell">
        <Sidebar open={menuOpen} onNavigate={() => setMenuOpen(false)} />
        {menuOpen && <div className="sidebar-scrim" onClick={() => setMenuOpen(false)} />}
        <main className="main">
          <MobileBar onMenu={() => setMenuOpen(true)} />
          <Routes>
            <Route path="/" element={<DashboardPage onOpen={open} />} />
            <Route path="/board" element={<BoardPage onOpen={open} />} />
            <Route path="/inbox" element={<InboxPage onOpen={open} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
      {openCard && (
        <CardDrawer cardId={openCard} onClose={() => open(null)} onOpen={open} />
      )}
    </ToastProvider>
  )
}
