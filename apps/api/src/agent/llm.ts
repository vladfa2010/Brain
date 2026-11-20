import { env } from '../env.js'

type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

/**
 * Тонкая обёртка над DeepSeek. Включается только при наличии ключа:
 * без него приложение остаётся полностью работоспособным, просто без LLM-шагов.
 */
export async function chat(messages: ChatMessage[], maxTokens = 1200): Promise<string | null> {
  if (!env.deepseekKey) return null
  try {
    const res = await fetch(`${env.llmBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.deepseekKey}`,
      },
      body: JSON.stringify({
        model: env.llmModel,
        messages,
        max_tokens: maxTokens,
        temperature: 0.3,
      }),
      signal: AbortSignal.timeout(90_000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    return data.choices?.[0]?.message?.content ?? null
  } catch {
    return null
  }
}

const RESEARCH_PROMPT = `Ты — исследовательский ассистент в личном трекере задач.
Тебе дают карточку «изучить»: что человек хочет понять и зачем.
Верни строго такую структуру, без вступлений:

**Вердикт:** одно предложение с конкретным ответом.
**Что решило:**
1. факт
2. факт
3. факт
**Следующий шаг:** одно действие не длиннее 15 минут.

Пиши по-русски, коротко, без воды. Не выдумывай цифры: если не уверен — скажи, что нужно проверить.`

export async function draftResearch(input: {
  title: string
  why: string | null
  existingNotes: string[]
}): Promise<string | null> {
  return chat([
    { role: 'system', content: RESEARCH_PROMPT },
    {
      role: 'user',
      content: [
        `Карточка: ${input.title}`,
        input.why ? `Зачем: ${input.why}` : '',
        input.existingNotes.length
          ? `Что человек уже написал:\n${input.existingNotes.join('\n---\n')}`
          : '',
        'Дай вердикт и следующий шаг.',
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ])
}
