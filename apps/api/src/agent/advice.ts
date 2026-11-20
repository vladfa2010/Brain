export type AdviceAction = {
  type: 'split' | 'review' | 'open' | 'triage'
  label: string
  cardId?: string
}

export type Advice = {
  title: string
  body: string
  action?: AdviceAction
  tone: 'push' | 'calm'
}

type Stats = {
  todayCount: number
  todayMinutes: number
  postponedHeavy: { id: string; title: string; count: number; reason: string | null }[]
  research: { id: string; title: string; ready: boolean }[]
  reasons: Record<string, number>
  inboxCount: number
  waitingOverdue: number
}

const REASON_LABEL: Record<string, string> = {
  time: 'нет времени',
  dont_want: 'не хочу',
  dont_know: 'не знаю как',
  wait: 'жду другого',
}

export function buildAdvice(s: Stats): Advice {
  const overload = s.todayMinutes > 240 || s.todayCount > 5

  if (overload) {
    return {
      title: 'Сегодня перегруз',
      body: `На сегодня ${s.todayCount} задач и ${Math.round(s.todayMinutes / 60 * 10) / 10} ч работы при реальных двух-трёх. Две стоит вернуть на неделю — иначе день закончится чувством, что ничего не успел.`,
      action: { type: 'review', label: 'Показать, что убрать' },
      tone: 'push',
    }
  }

  const heavy = s.postponedHeavy[0]
  if (heavy && heavy.count >= 3) {
    const reason = heavy.reason ? REASON_LABEL[heavy.reason] ?? heavy.reason : null
    return {
      title: 'Разбей, а не переноси',
      body: `«${heavy.title}» ты переносил ${heavy.count} раза.${reason ? ` Последняя причина — «${reason}».` : ''} Это не лень, это неопределённость. Давай разрежем на первый шаг в 15 минут.`,
      action: { type: 'split', label: 'Разбить на шаг', cardId: heavy.id },
      tone: 'push',
    }
  }

  const ready = s.research.filter((r) => r.ready)
  if (ready.length > 0) {
    return {
      title: 'Я уже посмотрел',
      body: `«${ready[0].title}» — ресерч готов, там вывод на пять строк. Прочитай и поставь вердикт: согласен или нет. Это две минуты, и карточка закроется.`,
      action: { type: 'open', label: 'Открыть вывод', cardId: ready[0].id },
      tone: 'push',
    }
  }

  if (s.research.length >= 4) {
    return {
      title: 'Изучить ≠ посмотреть',
      body: `У тебя ${s.research.length} карточек «изучить», и ни одна не закрыта. Проблема не в том, что ты не смотрел, а в том, что не решал. Начни с одной — прочитай мой вывод и ответь «да» или «нет».`,
      action: { type: 'open', label: 'Открыть первую', cardId: s.research[0].id },
      tone: 'push',
    }
  }

  const totalReasons = Object.values(s.reasons).reduce((a, b) => a + b, 0)
  const dontKnow = s.reasons['dont_know'] ?? 0
  if (totalReasons >= 4 && dontKnow / totalReasons >= 0.5) {
    return {
      title: 'Дело не в дисциплине',
      body: `${Math.round((dontKnow / totalReasons) * 100)}% твоих переносов — «не знаю как». Ты не откладываешь дело, ты избегаешь неопределённости. Разбиваем первое же на шаг, который понятен без подготовки.`,
      action: { type: 'review', label: 'Выбрать, что разбить' },
      tone: 'push',
    }
  }

  if (s.inboxCount >= 8) {
    return {
      title: 'Входящие — это долг',
      body: `${s.inboxCount} карточек лежат в «Входящих». Это не очередь, это долг перед собой. Я разберу их ночью и утром покажу: что стало задачей, что материалом, а что можно просто выбросить.`,
      action: { type: 'triage', label: 'Разобрать сейчас' },
      tone: 'calm',
    }
  }

  if (s.todayCount === 0) {
    return {
      title: 'День пустой',
      body: 'На сегодня ничего не выбрано. Возьми одну вещь из «На неделе» — не три, одну. Дальше решишь.',
      action: { type: 'review', label: 'Открыть неделю' },
      tone: 'calm',
    }
  }

  return {
    title: 'День под контролем',
    body: `${s.todayCount} задачи и ${s.todayMinutes} минут работы. Ничего не горит. Хороший момент, чтобы сделать одну скучную вещь заранее — пока она не стала срочной.`,
    tone: 'calm',
  }
}
