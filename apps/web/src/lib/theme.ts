import { useEffect, useState } from 'react'

export type Theme = 'light' | 'dark'
const KEY = 'sb.theme'

export function currentTheme(): Theme {
  const attr = document.documentElement.dataset.theme
  return attr === 'dark' ? 'dark' : 'light'
}

export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    /* приватный режим — переживём */
  }
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', theme === 'dark' ? '#141312' : '#f4f1ea')
  window.dispatchEvent(new CustomEvent('sb:theme', { detail: theme }))
}

/** Тема живёт на <html data-theme>: компонентам достаточно подписаться. */
export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(currentTheme)
  useEffect(() => {
    const onTheme = (e: Event) => setTheme((e as CustomEvent<Theme>).detail)
    window.addEventListener('sb:theme', onTheme)
    return () => window.removeEventListener('sb:theme', onTheme)
  }, [])
  return [theme, applyTheme]
}
