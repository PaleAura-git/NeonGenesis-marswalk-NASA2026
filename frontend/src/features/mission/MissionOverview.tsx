import type { Mission } from '../../types/mission'
import type { InitialPlanningRequest, MissionSettings, SettingsErrors, StopSettings } from '../../types/planning'
import { Button } from '../../components/ui/Button'
import { Icon } from '../../components/ui/Icon'
import { NumericField } from '../../components/ui/NumericField'
import { StopSettingsControls } from './StopSettingsControls'
import { MissionReview } from './MissionReview'
import { observationBudgetWarning } from './settings'
import './mission.css'

interface Props {
  mission: Mission
  selectedId: string | null
  onSelect: (id: string) => void
  settings: MissionSettings
  errors: SettingsErrors
  onSettingChange: (field: Exclude<keyof MissionSettings, 'stops'>, value: string) => void
  onStopChange: (id: string, patch: Partial<StopSettings>) => void
  onBlur: (field: string) => void
  onReview: (form: HTMLFormElement) => void
  review: InitialPlanningRequest | null
  reviewRequested: boolean
}

export function MissionOverview({ mission, selectedId, onSelect, settings, errors, onSettingChange, onStopChange, onBlur, onReview, review, reviewRequested }: Props) {
  const fields = [
    { field: 'reserveMinutes', label: 'Reserve (min)' },
    { field: 'walkingSpeed', label: 'Walking speed (m/s)' },
  ] as const

  return (
    <form className="mission-form" noValidate onSubmit={event => { event.preventDefault(); onReview(event.currentTarget) }}>
      <div className="mission-form-body">
        <div className="base">
          <p className="eyebrow">Departure & return</p>
          <h3><button type="button" className="base-select" aria-pressed={selectedId === mission.base.id} onClick={() => onSelect(mission.base.id)}><Icon name="home" /> {mission.base.name}</button></h3>
        </div>
        <p className="hint">Adjustable simulation assumptions</p>
        <fieldset className="duration-controls">
          <legend>Mission duration</legend>
          <div className="stop-setting-fields">
            <NumericField id="mission-hours" field="durationHours" label="Hours" value={settings.durationHours} error={errors.durationHours}
              onChange={value => onSettingChange('durationHours', value)} onBlur={() => onBlur('durationHours')} />
            <NumericField id="mission-minutes" field="durationMinutes" label="Minutes" value={settings.durationMinutes} error={errors.durationMinutes}
              onChange={value => onSettingChange('durationMinutes', value)} onBlur={() => onBlur('durationMinutes')} />
          </div>
        </fieldset>
        {fields.map(({ field, label }) => <NumericField key={field} id={`mission-${field}`} field={field} label={label}
          value={settings[field]} error={errors[field]} onChange={value => onSettingChange(field, value)} onBlur={() => onBlur(field)} />)}
        <details className="advanced-settings">
          <summary>Advanced</summary>
          <p className="hint">Maximum slope is a provisional demonstration assumption.</p>
          <NumericField id="mission-slope" field="maxSlopeDegrees" label="Maximum slope (degrees)" value={settings.maxSlopeDegrees} error={errors.maxSlopeDegrees}
            onChange={value => onSettingChange('maxSlopeDegrees', value)} onBlur={() => onBlur('maxSlopeDegrees')} />
        </details>
        <h3 className="list-heading">Science stops <span>({mission.stops.length})</span></h3>
        <ul className="stop-list">
          {mission.stops.map(stop => (
            <li key={stop.id} className="configured-stop">
              <button type="button" className="stop-button" aria-pressed={selectedId === stop.id} onClick={() => onSelect(stop.id)}>
                <span className="stop-name">{stop.name}</span><Icon name="chevronRight" />
              </button>
              <StopSettingsControls id={stop.id} name={stop.name} prefix="setup" settings={settings.stops[stop.id]} errors={errors}
                onChange={patch => onStopChange(stop.id, patch)} onBlur={onBlur} />
            </li>
          ))}
        </ul>
        {observationBudgetWarning(settings, mission) && <p className="budget-warning" role="status">Selected observations exceed the time available after reserve. The planner may exclude some stops when calculating a feasible combination.</p>}
        <details className="data-details">
          <summary>Coordinate & data notes</summary><p>{mission.notice}</p>
          <p>Positions use synthetic xMeters / yMeters. No mapping to imagery has been established.</p>
          <p>Unverified placeholder: {mission.unverifiedGeographicReference.latitudeDegrees}&deg; N, {mission.unverifiedGeographicReference.longitudeDegrees}&deg; E. Exact placement and datum pending.</p>
        </details>
        {reviewRequested && (review ? <MissionReview mission={mission} request={review} /> : <p className="hint" role="status">Correct the settings to update the mission review.</p>)}
      </div>
      <div className="mission-form-action">
        {Object.values(errors).some(Boolean) && <p className="field-error" role="status">Check the highlighted mission settings.</p>}
        <Button type="submit" className="full-width">Review mission</Button>
      </div>
    </form>
  )
}
