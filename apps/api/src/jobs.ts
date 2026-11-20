import cron from 'node-cron'
import { env } from './env.js'
import { q, run } from './db.js'
import { rolloverDay, runAgent } from './agent/run.js'

async function eachUser(task: (userId: string) => Promise<void>) {
  const users = await q<{ id: string }>('select id from users')
  for (const user of users) {
    try {
      await task(user.id)
    } catch (err) {
      console.error('[jobs] ошибка для пользователя', user.id, err)
    }
  }
}

export function startJobs() {
  cron.schedule('5 0 * * *', async () => {
    await eachUser(async (userId) => {
      const res = await rolloverDay(userId)
      console.log(`[jobs] rollover: ${res.moved} карточек вернулось на неделю`)
    })
  }, { timezone: env.timezone })

  cron.schedule('30 7 * * *', async () => {
    await eachUser(async (userId) => {
      const res = await runAgent(userId, 'schedule')
      console.log(`[jobs] agent: ${res.summary}`)
    })
  }, { timezone: env.timezone })

  // раз в сутки чистим просроченные refresh-токены и старый журнал входов
  cron.schedule('15 3 * * *', async () => {
    const tokens = await run(
      `delete from refresh_tokens
       where expires_at < now() - interval '7 days'
          or (revoked_at is not null and revoked_at < now() - interval '7 days')`,
    )
    const events = await run(`delete from auth_events where created_at < now() - interval '180 days'`)
    console.log(`[jobs] cleanup: сессий ${tokens}, событий входа ${events}`)
  }, { timezone: env.timezone })

  console.log(`[jobs] расписание включено (${env.timezone}): 00:05 перенос дня, 07:30 агент`)
}
