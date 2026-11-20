import cron from 'node-cron'
import { env } from './env.js'
import { rolloverDay, runAgent } from './agent/run.js'

export function startJobs() {
  cron.schedule('5 0 * * *', async () => {
    try {
      const res = await rolloverDay()
      console.log(`[jobs] rollover: ${res.moved} карточек вернулось на неделю`)
    } catch (err) {
      console.error('[jobs] rollover failed', err)
    }
  }, { timezone: env.timezone })

  cron.schedule('30 7 * * *', async () => {
    try {
      const res = await runAgent('schedule')
      console.log(`[jobs] agent: ${res.summary}`)
    } catch (err) {
      console.error('[jobs] agent failed', err)
    }
  }, { timezone: env.timezone })

  console.log(`[jobs] расписание включено (${env.timezone}): 00:05 перенос дня, 07:30 агент`)
}
