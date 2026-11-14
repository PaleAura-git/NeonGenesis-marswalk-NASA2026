import type { Mission } from '../../types/mission'
import type { MissionSettings, SettingsErrors, StopSettings } from '../../types/planning'
import { Icon } from '../../components/ui/Icon'
import { RangeField } from '../../components/ui/RangeField'
import { Stepper } from '../../components/ui/Stepper'
import { Switch } from '../../components/ui/Switch'
import { observationBudgetWarning, observationField } from './settings'
import { formatDuration, formatMinutes, parseSetting as parse, priorityNames, stopNumber } from './format'
import './mission.css'

type SettingField = Exclude<keyof MissionSettings, 'stops'>

interface Props {
  mission: Mission
  selectedId: string | null
  onSelect: (id: string) => void
  settings: MissionSettings
  errors: SettingsErrors
  onSettingChange: (field: SettingField, value: string) => void
  onStopChange: (id: string, patch: Partial<StopSettings>) => void
  onBlur: (field: string) => void
  onReview: (form: HTMLFormElement) => void
}

// Slider ranges sit inside the validation limits in settings.ts (speed > 0, 0 < slope < 90).
const SPEED = { min: 0.1, max: 2, step: 0.05 }
const SLOPE = { min: 1, max: 89, step: 1 }
const DURATION_STEP = 15
const RESERVE_STEP = 5

const stepFrom = (value: number) => Number.isFinite(value) ? value : 0

export function MissionSetupPanel({ mission, selectedId, onSelect, settings, errors, onSettingChange, onStopChange, onBlur, onReview }: Props) {
  const durationMinutes = parse(settings.durationHours) * 60 + parse(settings.durationMinutes)
  const reserve = parse(settings.reserveMinutes)
  const includedCount = mission.stops.filter(stop => settings.stops[stop.id]?.included).length

  function stepDuration(direction: 1 | -1) {
    const next = Math.max(0, Math.round(stepFrom(durationMinutes)) + direction * DURATION_STEP)
    onSettingChange('durationHours', String(Math.floor(next / 60)))
    onSettingChange('durationMinutes', String(next % 60))
  }

  return (
    <form className="ws-panel ws-setup" aria-labelledby="setup-title" noValidate
      onSubmit={event => { event.preventDefault(); onReview(event.currentTarget) }}>
      <header className="ws-panel-head">
        <h2 id="setup-title">Mission setup</h2>
        <p className="ws-panel-note">Simulation assumptions</p>
      </header>

      <div className="ws-setup-body">
        <button type="button" className="ws-base-card" aria-pressed={selectedId === mission.base.id} onClick={() => onSelect(mission.base.id)}>
          <span className="ws-base-icon" aria-hidden="true"><Icon name="home" /></span>
          <span className="ws-base-text">
            <span className="ws-base-name">{mission.base.name}</span>
            <span className="ws-base-note">Departure & return · position unverified</span>
          </span>
        </button>

        <section className="ws-section" aria-labelledby="setup-time">
          <h3 id="setup-time" className="ws-label">Time</h3>
          <div className="ws-stepper-pair">
            <Stepper label="Duration" display={formatDuration(durationMinutes)} stepLabel={`${DURATION_STEP} minutes`}
              fields={[
                { field: 'durationHours', value: settings.durationHours, unit: 'h', label: 'Duration hours' },
                { field: 'durationMinutes', value: settings.durationMinutes, unit: 'm', label: 'Duration minutes' },
              ]}
              canDecrement={stepFrom(durationMinutes) > 0} onStep={stepDuration}
              onFieldChange={(field, value) => onSettingChange(field as SettingField, value)} onBlur={onBlur} errors={errors} />
            <Stepper label="Reserve" display={formatMinutes(settings.reserveMinutes)} stepLabel={`${RESERVE_STEP} minutes`}
              fields={[{ field: 'reserveMinutes', value: settings.reserveMinutes, unit: 'min', label: 'Reserve minutes' }]}
              canDecrement={stepFrom(reserve) > 0}
              onStep={direction => onSettingChange('reserveMinutes', String(Math.max(0, stepFrom(reserve) + direction * RESERVE_STEP)))}
              onFieldChange={(field, value) => onSettingChange(field as SettingField, value)} onBlur={onBlur} errors={errors} />
          </div>
        </section>

        <section className="ws-section" aria-labelledby="setup-movement">
          <h3 id="setup-movement" className="ws-label">Movement</h3>
          <RangeField id="setup-speed" field="walkingSpeed" label="Walking speed" value={settings.walkingSpeed} {...SPEED}
            format={value => `${value.toFixed(2)} m/s`} error={errors.walkingSpeed}
            onChange={value => onSettingChange('walkingSpeed', value)} onBlur={() => onBlur('walkingSpeed')} />
          <RangeField id="setup-slope" field="maxSlopeDegrees" label="Max slope · provisional" value={settings.maxSlopeDegrees} {...SLOPE}
            format={value => `${value}°`} error={errors.maxSlopeDegrees}
            onChange={value => onSettingChange('maxSlopeDegrees', value)} onBlur={() => onBlur('maxSlopeDegrees')} />
        </section>

        <section className="ws-section" aria-labelledby="setup-stops">
          <div className="ws-section-head">
            <h3 id="setup-stops" className="ws-label">Science stops</h3>
            <span className="ws-count">{includedCount} of {mission.stops.length} included</span>
          </div>
          <ul className="ws-stop-list">
            {mission.stops.map((stop, index) => {
              const stopSettings = settings.stops[stop.id]
              const selected = selectedId === stop.id
              const priority = priorityNames[stopSettings.priority] ?? 'Unset'
              const stopError = errors[observationField(stop.id)] ?? errors[`priority-${stop.id}`]
              return (
                <li key={stop.id} className={['ws-stop-row', selected && 'is-selected', !stopSettings.included && 'is-excluded'].filter(Boolean).join(' ')}>
                  <Switch checked={stopSettings.included} label={`Include ${stop.name}`} field="includedStops"
                    invalid={Boolean(errors.includedStops)} describedBy={errors.includedStops ? 'setup-stops-error' : undefined}
                    onChange={included => onStopChange(stop.id, { included })} onBlur={() => onBlur('includedStops')} />
                  <button type="button" className="ws-stop-select" aria-pressed={selected} onClick={() => onSelect(stop.id)}>
                    <span className="ws-stop-number">{stopNumber(index)}</span>
                    <span className="ws-stop-name">{stop.name}</span>
                    {stopError && <span className="ws-stop-warning" title={stopError}><Icon name="warning" /></span>}
                    <span className={`ws-priority-dot priority-${stopSettings.priority}`} aria-hidden="true" />
                    <span className="ws-stop-minutes">{formatMinutes(stopSettings.observationMinutes)}</span>
                    <span className="visually-hidden">, {priority} priority{stopSettings.included ? '' : ', excluded'}{stopError ? `, needs attention: ${stopError}` : ''}</span>
                  </button>
                </li>
              )
            })}
          </ul>
          {errors.includedStops && <p className="field-error" id="setup-stops-error">{errors.includedStops}</p>}
          {observationBudgetWarning(settings, mission) && <p className="ws-budget-warning" role="status">Selected observations exceed the time available after reserve. The planner may exclude some stops when calculating a feasible combination.</p>}
        </section>
      </div>

      <div className="ws-setup-action">
        {Object.values(errors).some(Boolean) && <p className="field-error" role="status">Check the highlighted mission settings.</p>}
        <button type="submit" className="ws-primary">Plan routes <Icon name="arrowRight" /></button>
      </div>
    </form>
  )
}
