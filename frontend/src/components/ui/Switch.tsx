interface Props {
  checked: boolean
  label: string
  onChange: (checked: boolean) => void
  onBlur?: () => void
  /** Setting key, so form review can find and focus this control. */
  field?: string
  invalid?: boolean
  describedBy?: string
  className?: string
}

/** On/off switch with a 44 px hit area. */
export function Switch({ checked, label, onChange, onBlur, field, invalid, describedBy, className = '' }: Props) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} className={`ws-switch ${className}`}
      data-setting-field={field} aria-invalid={invalid || undefined} aria-describedby={describedBy}
      onClick={() => onChange(!checked)} onBlur={onBlur}>
      <span className="ws-switch-track" aria-hidden="true"><span className="ws-switch-thumb" /></span>
    </button>
  )
}
