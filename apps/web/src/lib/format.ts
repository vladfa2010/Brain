const MONTHS = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек']
const MONTHS_FULL = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря']
const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота']

export function startOfDay(d: Date) {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

export function dayDiff(iso: string): number {
  const a = startOfDay(new Date(iso)).getTime()
  const b = startOfDay(new Date()).getTime()
  return Math.round((a - b) / 86_400_000)
}

export function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

export function fmtDue(iso: string | null): { label: string; tone: 'late' | 'soon' | 'plain' } {
  if (!iso) return { label: '', tone: 'plain' }
  const diff = dayDiff(iso)
  const time = fmtTime(iso)
  const hasTime = new Date(iso).getHours() !== 0 || new Date(iso).getMinutes() !== 0
  const suffix = hasTime ? `, ${time}` : ''
  if (diff < 0) return { label: `просрочено · ${diff === -1 ? 'вчера' : `${Math.abs(diff)} дн`}`, tone: 'late' }
  if (diff === 0) return { label: `сегодня${suffix}`, tone: 'late' }
  if (diff === 1) return { label: `завтра${suffix}`, tone: 'soon' }
  if (diff < 7) {
    const wd = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][new Date(iso).getDay()]
    return { label: `${wd}${suffix}`, tone: 'soon' }
  }
  const d = new Date(iso)
  return { label: `${d.getDate()} ${MONTHS[d.getMonth()]}`, tone: 'plain' }
}

export function fmtMinutes(min: number | null): string {
  if (!min) return ''
  if (min < 60) return `${min} мин`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} ч ${m} м` : `${h} ч`
}

export function fmtDayLabel(iso: string): string {
  const diff = dayDiff(iso)
  if (diff === 0) return 'сегодня'
  if (diff === -1) return 'вчера'
  if (diff === -2) return 'позавчера'
  if (diff < 0) return `${Math.abs(diff)} дн назад`
  if (diff === 1) return 'завтра'
  return `${new Date(iso).getDate()} ${MONTHS[new Date(iso).getMonth()]}`
}

export function fmtToday(): string {
  const d = new Date()
  return `${WEEKDAYS[d.getDay()]} · ${d.getDate()} ${MONTHS_FULL[d.getMonth()]}`
}

export function greeting(): string {
  const h = new Date().getHours()
  if (h < 5) return 'Доброй ночи'
  if (h < 12) return 'Доброе утро'
  if (h < 18) return 'Добрый день'
  return 'Добрый вечер'
}

export function plural(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n) % 100
  const last = abs % 10
  if (abs > 10 && abs < 20) return forms[2]
  if (last > 1 && last < 5) return forms[1]
  if (last === 1) return forms[0]
  return forms[2]
}

export function daysAgo(n: number): string {
  if (n <= 0) return 'сегодня'
  if (n === 1) return 'вчера'
  return `${n} ${plural(n, ['день', 'дня', 'дней'])} назад`
}
