import { getDashboard } from './lib/dashboard.js'
import { pool } from './db.js'

/** Текстовый бриф для терминала, launchd или будущего Telegram-бота. */
const d = await getDashboard()
const now = new Date()
const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

const lines: string[] = []
lines.push(`Second Brain · ${now.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} · ${hm}`)
lines.push('')
const plural = (n: number, f: [string, string, string]) => {
  const a = Math.abs(n) % 100, b = a % 10
  if (a > 10 && a < 20) return f[2]
  if (b > 1 && b < 5) return f[1]
  if (b === 1) return f[0]
  return f[2]
}
lines.push(`Сегодня: ${d.today.length} ${plural(d.today.length, ['задача', 'задачи', 'задач'])} · ${Math.round(d.todayMinutes / 60 * 10) / 10} ч`)
for (const c of d.today) {
  lines.push(`  • ${c.title}${c.estimateMin ? ` — ${c.estimateMin} мин` : ''}`)
}
if (d.decisions.length) {
  lines.push('')
  lines.push('Требует решения:')
  for (const x of d.decisions) lines.push(`  ! ${x.card.title} — ${x.reason}`)
}
lines.push('')
lines.push(`Совет: ${d.advice.title}`)
lines.push(d.advice.body)
if (d.stats.inbox) lines.push(`\nВходящих: ${d.stats.inbox}`)

console.log(lines.join('\n'))
await pool.end()
