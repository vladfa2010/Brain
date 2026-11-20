/**
 * Создание пользователя из терминала (админская операция, без регистрации).
 * Пример: pnpm --filter @sb/api user:create -- --email=me@example.com --password='...' --name='Влад'
 */
import { pool, one, q } from './db.js'
import { hashPassword } from './auth/password.js'

const args: Record<string, string> = {}
for (const raw of process.argv.slice(2)) {
  const [key, ...rest] = raw.replace(/^--/, '').split('=')
  args[key] = rest.join('=')
}

const email = (args.email ?? process.env.USER_EMAIL ?? '').trim()
const password = args.password ?? process.env.USER_PASSWORD ?? ''
const name = args.name ?? process.env.USER_NAME ?? null

if (!email || !password) {
  console.error("Нужно: --email=... --password='...' [--name=...]")
  process.exit(1)
}
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Почта выглядит некорректно:', email)
  process.exit(1)
}

const existing = await one<{ id: string }>('select id from users where lower(email) = lower($1)', [email])
if (existing) {
  console.error('Пользователь с такой почтой уже есть. Пароль не меняю.')
  await pool.end()
  process.exit(1)
}

const user = await one<{ id: string; email: string }>(
  `insert into users (email, password_hash, name) values ($1,$2,$3) returning id, email`,
  [email, await hashPassword(password), name],
)

const DEFAULT_AREAS: [string, string, string][] = [
  ['Бизнес', '◆', 'oxide'],
  ['Здоровье', '◐', 'sage'],
  ['Дом', '⌂', 'sand'],
  ['Знания', '✦', 'blue'],
]
let i = 0
for (const [areaName, glyph, hue] of DEFAULT_AREAS) {
  await q('insert into areas (user_id, name, glyph, hue, sort_order) values ($1,$2,$3,$4,$5)', [
    user!.id, areaName, glyph, hue, i++ * 1024,
  ])
}
await q(
  `insert into settings (user_id, key, value) values
     ($1,'day_budget','3'), ($1,'wip_limit','4'), ($1,'user_name',$2)
   on conflict (user_id, key) do nothing`,
  [user!.id, JSON.stringify(name ?? '')],
)

console.log(`Создан: ${user!.email} (id ${user!.id})`)
if (password.length < 10 || !/[a-zа-яё]/i.test(password) || !/\d/.test(password)) {
  console.warn('Внимание: пароль не проходит политику регистрации (нужно 10+ символов, буквы и цифры).')
}
await pool.end()
