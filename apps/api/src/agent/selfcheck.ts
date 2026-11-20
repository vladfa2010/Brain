/**
 * Проверка LLM-проводки без реального ключа:
 * поднимает мок-эндпоинт DeepSeek и дергает настоящий код ресерча.
 * Запуск: pnpm --filter @sb/api exec tsx src/agent/selfcheck.ts
 */
import { createServer } from 'node:http'

const PORT = 4799
let receivedAuth = ''
const server = createServer((req, res) => {
  receivedAuth = String(req.headers.authorization ?? '')
  let body = ''
  req.on('data', (c) => (body += c))
  req.on('end', () => {
    const parsed = JSON.parse(body || '{}')
    if (!String(parsed.messages?.[0]?.content ?? '').includes('исследовательский')) {
      res.writeHead(400).end('{"error":"no system prompt"}')
      return
    }
    res.writeHead(200, { 'content-type': 'application/json' }).end(
      JSON.stringify({
        choices: [{
          message: {
            content:
              '**Вердикт:** мок-ответ, проводка работает.\n\n' +
              '**Что решило:**\n1. запрос дошёл до модели\n2. системный промпт на месте\n3. ключ передан\n\n' +
              '**Следующий шаг:** проверить на реальном ключе.',
          },
        }],
      }),
    )
  })
})

server.listen(PORT, async () => {
  process.env.DEEPSEEK_API_KEY = 'selfcheck-key'
  process.env.LLM_BASE_URL = `http://127.0.0.1:${PORT}`
  process.env.DATABASE_URL ??= 'postgres://localhost:5432/secondbrain'

  const { draftResearch } = await import('./llm.js')
  const out = await draftResearch({ title: 'Тест', why: 'Проверка', existingNotes: [] })
  console.log('ответ модели:', out?.split('\n')[0])
  console.log('authorization:', receivedAuth === 'Bearer selfcheck-key' ? 'передан верно' : `ОШИБКА (${receivedAuth})`)
  server.close()
  const ok = Boolean(out?.includes('Вердикт')) && receivedAuth === 'Bearer selfcheck-key'
  console.log(ok ? 'SELFCHECK OK' : 'SELFCHECK FAILED')
  process.exit(ok ? 0 : 1)
})
