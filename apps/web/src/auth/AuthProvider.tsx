import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api, refreshSession, setAccessToken, type AuthUser } from '../api'

type Status = 'loading' | 'ready' | 'guest'

type AuthContextValue = {
  user: AuthUser | null
  status: Status
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string, name?: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [user, setUser] = useState<AuthUser | null>(null)
  const [status, setStatus] = useState<Status>('loading')

  useEffect(() => {
    let alive = true
    const onAuth = (e: Event) => {
      if (!alive) return
      setUser((e as CustomEvent<AuthUser>).detail)
      setStatus('ready')
    }
    const onUnauthorized = () => {
      if (!alive) return
      setUser(null)
      setStatus('guest')
    }
    window.addEventListener('sb:auth', onAuth)
    window.addEventListener('sb:unauthorized', onUnauthorized)

    refreshSession().then((ok) => {
      if (!alive) return
      if (!ok) setStatus('guest')
    })

    return () => {
      alive = false
      window.removeEventListener('sb:auth', onAuth)
      window.removeEventListener('sb:unauthorized', onUnauthorized)
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.auth.login({ email, password })
    setUser(data.user)
    setStatus('ready')
    queryClient.clear()
  }, [queryClient])

  const register = useCallback(async (email: string, password: string, name?: string) => {
    const data = await api.auth.register({ email, password, name })
    setUser(data.user)
    setStatus('ready')
    queryClient.clear()
  }, [queryClient])

  const logout = useCallback(async () => {
    await api.auth.logout()
    setAccessToken(null)
    setUser(null)
    setStatus('guest')
    queryClient.clear()
  }, [queryClient])

  return (
    <AuthContext.Provider value={{ user, status, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth вне AuthProvider')
  return ctx
}
