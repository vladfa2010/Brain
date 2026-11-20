// Локальные эмбеддинги: хеширование слов и триграмм в 1024 измерения.
// Работают без сети и ключей, дают устойчивое лексическое сходство.
// При появлении внешнего провайдера заменяется одна функция embed().

export const EMBED_DIM = 1024

function fnv1a(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

const STOP = new Set(
  ('и в во не что он на я с со как а то все она так его но да ты к у же вы за бы по только ее мне ' +
    'было вот от меня еще нет о из ему теперь когда даже ну вдруг ли если уже или ни быть был него до ' +
    'вас нибудь опять уж вам ведь там потом себя ничего ей может они тут где есть надо ней для мы тебя ' +
    'их чем была сам чтоб без будто чего раз тоже себе под будет ж тогда кто этот того потому этого ' +
    'какой совсем ним здесь этом один почти мой тем чтобы нее сейчас были куда зачем всех никогда можно ' +
    'при наконец два об другой хоть после над больше тот через эти нас про всего них какая много разве ' +
    'три эту моя впрочем хорошо свою этой перед иногда лучше чуть том нельзя такой им более всегда ' +
    'конечно всю между это')
    .split(' '),
)

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[ё]/g, 'е')
    .split(/[^a-zа-я0-9]+/i)
    .filter((t) => t.length > 2 && !STOP.has(t))
}

export function embed(text: string): number[] {
  const vec = new Array<number>(EMBED_DIM).fill(0)
  const words = tokens(text ?? '')
  for (const w of words) {
    // слово целиком весит больше, триграммы дают устойчивость к формам
    vec[fnv1a('w:' + w) % EMBED_DIM] += 1
    const padded = `_${w}_`
    for (let i = 0; i < padded.length - 2; i++) {
      vec[fnv1a('g:' + padded.slice(i, i + 3)) % EMBED_DIM] += 0.35
    }
  }
  let norm = 0
  for (const v of vec) norm += v * v
  norm = Math.sqrt(norm)
  if (norm > 0) for (let i = 0; i < vec.length; i++) vec[i] = vec[i] / norm
  return vec
}

export function toVectorLiteral(vec: number[]): string {
  return `[${vec.map((v) => v.toFixed(6)).join(',')}]`
}
