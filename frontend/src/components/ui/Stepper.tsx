import { useEffect, useId, useRef, useState, type FocusEvent } from 'react'
import type { SettingsErrors } from '../../types/planning'
import { Icon } from './Icon'

export interface StepperField {
  /** Setting key: the value of data-setting-field and the key in errors. */
  field: string
  value: string
  /** Short unit shown after the input while typing, e.g. "h". */
  unit: string
  /** Accessible name of the input. */
  label: string
}

interface Props {
  label: string
  /** Formatted value shown between the buttons, e.g. "3 h 00 m". */
  display: string
  fields: StepperField[]
  onStep: (direction: 1 | -1) => void
  canDecrement: boolean
  stepLabel: string
  onFieldChange: (field: string, value: string) => void
  onBlur: (field: string) => void
  errors: SettingsErrors
  hideLabel?: boolean
  className?: string
}

/**
 * Minus / value / plus control. Tapping the value switches to number inputs for an exact entry.
 * Inputs also show whenever one of the fields has an error, so review can focus the field.
 */
export function Stepper({ label, display, fields, onStep, canDecrement, stepLabel, onFieldChange, onBlur, errors, hideLabel, className = '' }: Props) {
  const id = useId()
  const [editing, setEditing] = useState(false)
  const firstInput = useRef<HTMLInputElement>(null)
  const focusOnEdit = useRef(false)
  const fieldErrors = fields.map(item => ({ field: item.field, message: errors[item.field] })).filter(item => item.message)
  const showInputs = editing || fieldErrors.length > 0

  useEffect(() => {
    if (editing && focusOnEdit.current) {
      focusOnEdit.current = false
      firstInput.current?.select()
    }
  }, [editing])

  // Leave edit mode once focus moves outside the value area.
  function leaveEditing(event: FocusEvent<HTMLDivElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setEditing(false)
  }
  const validateAll = () => fields.forEach(item => onBlur(item.field))

  return (
    <div className={`ws-stepper ${className}`} role="group" aria-labelledby={`${id}-label`}>
      <span id={`${id}-label`} className={hideLabel ? 'visually-hidden' : 'ws-field-label'}>{label}</span>
      <div className={fieldErrors.length > 0 ? 'ws-stepper-box is-invalid' : 'ws-stepper-box'}>
        <button type="button" className="ws-stepper-button" aria-label={`Decrease ${label.toLowerCase()} by ${stepLabel}`}
          disabled={!canDecrement} onClick={() => onStep(-1)} onBlur={validateAll}><Icon name="minus" /></button>
        <div className="ws-stepper-value" onBlur={leaveEditing}>
          {showInputs ? fields.map((item, index) => (
            <span key={item.field} className="ws-stepper-input">
              <input ref={index === 0 ? firstInput : undefined} type="number" inputMode="decimal" step="any" min="0"
                data-setting-field={item.field} aria-label={item.label} value={item.value}
                aria-invalid={Boolean(errors[item.field])} aria-describedby={errors[item.field] ? `${id}-${item.field}-error` : undefined}
                onChange={event => onFieldChange(item.field, event.target.value)} onBlur={() => onBlur(item.field)}
                onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); setEditing(false) } }} />
              <span aria-hidden="true">{item.unit}</span>
            </span>
          )) : (
            <button type="button" className="ws-stepper-display" aria-label={`${label}: ${display}. Edit value`}
              onClick={() => { focusOnEdit.current = true; setEditing(true) }}>{display}</button>
          )}
        </div>
        <button type="button" className="ws-stepper-button" aria-label={`Increase ${label.toLowerCase()} by ${stepLabel}`}
          onClick={() => onStep(1)} onBlur={validateAll}><Icon name="plus" /></button>
      </div>
      {fieldErrors.map(item => <p key={item.field} className="field-error" id={`${id}-${item.field}-error`}>{item.message}</p>)}
    </div>
  )
}
