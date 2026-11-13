interface Props {
  id: string
  field: string
  label: string
  value: string
  error?: string
  onChange: (value: string) => void
  onBlur: () => void
}

export function NumericField({ id, field, label, value, error, onChange, onBlur }: Props) {
  return (
    <div className="setting-field">
      <label htmlFor={id}>{label}</label>
      <input id={id} data-setting-field={field} type="number" inputMode="decimal" step="any"
        value={value} onChange={event => onChange(event.target.value)} onBlur={onBlur}
        aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} />
      {error && <p className="field-error" id={`${id}-error`}>{error}</p>}
    </div>
  )
}
