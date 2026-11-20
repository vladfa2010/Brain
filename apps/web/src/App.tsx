import { useEffect, useState } from 'react'
import { Navigate, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Sidebar } from './components/Sidebar'
import { CardDrawer } from './components/CardDrawer'
import { ToastProvider } from './components/Toast'
import { AuthGate } from './components/AuthGate'
import { MobileBar } from './components/MobileBar'
import { applyTheme } from './lib/theme'
import { DashboardPage } from './pages/Dashboard'
import { BoardPage } from './pages/Board'
import { InboxPage } from './pages/Inbox'

export default function App() {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [needAuth, setNeedAuth] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)

  // карточка — это часть адреса, поэтому «назад» в браузере её закрывает,
  // а «вперёд» — снова открывает
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
    const onUnauthorized = () => setNeedAuth(true)
    window.addEventListener('sb:unauthorized', onUnauthorized)
    return () => window.removeEventListener('sb:unauthorized', onUnauthorized)
  }, [])

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

  if (needAuth) {
    return (
      <AuthGate
        onDone={() => {
          setNeedAuth(false)
          queryClient.invalidateQueries()
        }}
      />
    )
  }

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
