import type { Priority, SettingsErrors, StopSettings } from '../../types/planning'
import { NumericField } from '../../components/ui/NumericField'
import { observationField } from './settings'

export interface StopEditorProps {
  settings: StopSettings
  errors: SettingsErrors
  onChange: (patch: Partial<StopSettings>) => void
  onBlur: (field: string) => void
}

export function StopSettingsControls({ id, name, prefix, settings, errors, onChange, onBlur }: StopEditorProps & { id: string; name: string; prefix: string }) {
  const priorityId = `${prefix}-priority-${id}`
  return (
    <div className="stop-settings" role="group" aria-label={`Settings for ${name}`}>
      <label className="include-control">
        <input type="checkbox" checked={settings.included} data-setting-field="includedStops"
          aria-invalid={Boolean(errors.includedStops)} aria-describedby={errors.includedStops ? `${prefix}-inclusion-${id}-error` : undefined}
          onChange={event => onChange({ included: event.target.checked })} onBlur={() => onBlur('includedStops')} />
        Include <span className="visually-hidden">{name}</span>
      </label>
      {errors.includedStops && <p className="field-error" id={`${prefix}-inclusion-${id}-error`}>{errors.includedStops}</p>}
      <div className="stop-setting-fields">
        <div className="setting-field">
          <label htmlFor={priorityId}>Priority <span className="visually-hidden">for {name}</span></label>
          <select id={priorityId} data-setting-field={`priority-${id}`} value={settings.priority}
            aria-invalid={Boolean(errors[`priority-${id}`])}
            onChange={event => onChange({ priority: event.target.value as Priority })} onBlur={() => onBlur(`priority-${id}`)}>
            <option value="1">Low</option><option value="2">Medium</option><option value="3">High</option>
          </select>
        </div>
        <NumericField id={`${prefix}-observation-${id}`} field={observationField(id)} label="Observation (min)"
          value={settings.observationMinutes} error={errors[observationField(id)]}
          onChange={observationMinutes => onChange({ observationMinutes })} onBlur={() => onBlur(observationField(id))} />
      </div>
    </div>
  )
}
