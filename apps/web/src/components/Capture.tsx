import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api'
import { useToast } from './Toast'
import { ArrowRight } from './Icons'

export function Capture({ autoFocus = false, compact = false }: { autoFocus?: boolean; compact?: boolean }) {
  const [value, setValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()
  const toast = useToast()

  const mutate = useMutation({
    mutationFn: (text: string) => api.capture(text),
    onSuccess: (res) => {
      setValue('')
      qc.invalidateQueries()
      const kind = res.kind === 'material' ? 'материал' : res.kind === 'research' ? 'карточка «изучить»' : 'задача'
      toast.push(`Во «Входящих»: ${kind} — ${res.title.slice(0, 46)}`)
      inputRef.current?.focus()
    },
    onError: () => toast.push('Не получилось сохранить'),
  })

  return (
    <form
      className="capture"
      style={compact ? { marginTop: 0 } : undefined}
      onSubmit={(e) => {
        e.preventDefault()
        const text = value.trim()
        if (text) mutate.mutate(text)
      }}
    >
      <input
        ref={inputRef}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Ссылка, задача или мысль — разберу сам"
        aria-label="Быстрый ввод"
      />
      <kbd>↵</kbd>
      <button className="btn primary" type="submit" disabled={!value.trim() || mutate.isPending}>
        <ArrowRight size={14} />
        <span className="btn-label">Добавить</span>
      </button>
    </form>
  )
}
