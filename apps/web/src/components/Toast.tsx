import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

type ToastCtx = { push: (msg: string) => void }
const Ctx = createContext<ToastCtx>({ push: () => {} })

export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null)
  const timer = useRef<number | null>(null)
  const push = useCallback((m: string) => {
    setMsg(m)
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setMsg(null), 2600)
  }, [])
  return (
    <Ctx.Provider value={{ push }}>
      {children}
      {msg && <div className="toast">{msg}</div>}
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx)
