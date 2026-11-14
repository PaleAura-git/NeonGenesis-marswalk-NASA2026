import type { CSSProperties } from 'react'

interface Props {
  id: string
  field: string
  label: string
  value: string
  min: number
  max: number
  step: number
  /** Formats the current number for display and for screen readers. */
  format: (value: number) => string
  error?: string
  onChange: (value: string) => void
  onBlur: () => void
}

/** Labelled slider with its value on the right and a filled track. */
export function RangeField({ id, field, label, value, min, max, step, format, error, onChange, onBlur }: Props) {
  const number = value.trim() === '' ? NaN : Number(value)
  const valid = Number.isFinite(number)
  const position = valid ? Math.min(max, Math.max(min, number)) : min
  const fill = `${((position - min) / (max - min)) * 100}%`
  return (
    <div className="ws-range">
      <div className="ws-range-head">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{valid ? format(number) : '—'}</output>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={position} data-setting-field={field}
        style={{ '--fill': fill } as CSSProperties} aria-valuetext={valid ? format(number) : 'not set'}
        aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined}
        onChange={event => onChange(event.target.value)} onBlur={onBlur} />
      {error && <p className="field-error" id={`${id}-error`}>{error}</p>}
    </div>
  )
}
