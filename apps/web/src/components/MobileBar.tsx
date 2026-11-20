import { Menu, Moon, Sun } from './Icons'
import { useTheme } from '../lib/theme'

/** Верхняя панель для узких экранов: без неё на телефоне некуда идти. */
export function MobileBar({ onMenu }: { onMenu: () => void }) {
  const [theme, setTheme] = useTheme()
  return (
    <div className="mobile-bar">
      <button className="icon-btn" onClick={onMenu} aria-label="Меню">
        <Menu size={18} />
      </button>
      <div className="mobile-wordmark">second <em>brain</em></div>
      <div style={{ flex: 1 }} />
      <button
        className="icon-btn"
        onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
        aria-label="Сменить тему"
      >
        {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
      </button>
    </div>
  )
}
