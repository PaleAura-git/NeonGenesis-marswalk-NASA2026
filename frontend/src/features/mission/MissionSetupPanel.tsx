import { useState, type ReactNode } from 'react'
import type { Mission } from '../../types/mission'
import type { MissionSettings, SettingsErrors, StopSettings } from '../../types/planning'
import { Icon } from '../../components/ui/Icon'
import { RangeField } from '../../components/ui/RangeField'
import { Stepper } from '../../components/ui/Stepper'
import { Switch } from '../../components/ui/Switch'
import { useMediaQuery } from '../../components/ui/useMediaQuery'
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

// Short screens: sections collapse to one-line summaries, one open at a time.
const COMPACT_QUERY = '(max-height: 760px)'
type SectionId = 'time' | 'movement' | 'stops'

interface SectionProps {
  id: SectionId
  title: string
  /** One-line summary shown while collapsed, e.g. "3 h 00 m · reserve 30 min". */
  summary: string
  aside?: ReactNode
  compact: boolean
  open: boolean
  onToggle: (id: SectionId) => void
  children: ReactNode
}

/** A Mission setup section: a plain labelled group, or an accordion item in compact mode. */
function SetupSection({ id, title, summary, aside, compact, open, onToggle, children }: SectionProps) {
  const headingId = `setup-${id}`
  if (!compact) {
    return (
      <section className="ws-section" aria-labelledby={headingId}>
        <div className="ws-section-head"><h3 id={headingId} className="ws-label">{title}</h3>{aside}</div>
        {children}
      </section>
    )
  }
  return (
    <section className={open ? 'ws-section ws-section--compact is-open' : 'ws-section ws-section--compact'} aria-labelledby={headingId}>
      <h3 className="ws-section-heading">
        <button type="button" id={headingId} className="ws-section-toggle" aria-expanded={open} aria-controls={`${headingId}-content`} onClick={() => onToggle(id)}>
          <span className="ws-label">{title}</span>
          {!open && <span className="ws-section-summary">{summary}</span>}
          {open && aside}
          <Icon name="chevronDown" className="ws-section-chevron" />
        </button>
      </h3>
      {/* Collapsed content stays mounted but hidden, so its inputs keep their state. */}
      <div id={`${headingId}-content`} className="ws-section-content" hidden={!open}>{children}</div>
    </section>
  )
}

export function MissionSetupPanel({ mission, selectedId, onSelect, settings, errors, onSettingChange, onStopChange, onBlur, onReview }: Props) {
  const durationMinutes = parse(settings.durationHours) * 60 + parse(settings.durationMinutes)
  const reserve = parse(settings.reserveMinutes)
  const includedCount = mission.stops.filter(stop => settings.stops[stop.id]?.included).length
  const compact = useMediaQuery(COMPACT_QUERY)
  const [openSection, setOpenSection] = useState<SectionId>('stops')
  // A section holding an error stays open, so "Plan routes" can focus the field.
  const sectionErrors: Record<SectionId, boolean> = {
    time: Boolean(errors.durationHours || errors.durationMinutes || errors.reserveMinutes),
    movement: Boolean(errors.walkingSpeed || errors.maxSlopeDegrees),
    stops: Boolean(errors.includedStops),
  }
  const isOpen = (id: SectionId) => openSection === id || sectionErrors[id]
  const toggle = (id: SectionId) => setOpenSection(current => current === id ? current : id)
  const speed = parse(settings.walkingSpeed)
  const slope = parse(settings.maxSlopeDegrees)
  const sectionProps = (id: SectionId) => ({ id, compact, open: isOpen(id), onToggle: toggle })

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
            <span className="ws-base-note">Departure & return</span>
          </span>
        </button>

        <SetupSection {...sectionProps('time')} title="Time"
          summary={`${formatDuration(durationMinutes)} · reserve ${formatMinutes(settings.reserveMinutes)}`}>
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
        </SetupSection>

        <SetupSection {...sectionProps('movement')} title="Movement"
          summary={`${Number.isFinite(speed) ? speed.toFixed(2) : '—'} m/s · max ${Number.isFinite(slope) ? slope : '—'}°`}>
          <RangeField id="setup-speed" field="walkingSpeed" label="Walking speed" value={settings.walkingSpeed} {...SPEED}
            format={value => `${value.toFixed(2)} m/s`} error={errors.walkingSpeed}
            onChange={value => onSettingChange('walkingSpeed', value)} onBlur={() => onBlur('walkingSpeed')} />
          <RangeField id="setup-slope" field="maxSlopeDegrees" label="Max slope · provisional" value={settings.maxSlopeDegrees} {...SLOPE}
            format={value => `${value}°`} error={errors.maxSlopeDegrees}
            onChange={value => onSettingChange('maxSlopeDegrees', value)} onBlur={() => onBlur('maxSlopeDegrees')} />
        </SetupSection>

        <SetupSection {...sectionProps('stops')} title="Science stops" summary={`${includedCount} of ${mission.stops.length} included`}
          aside={<span className="ws-count">{includedCount} of {mission.stops.length} included</span>}>
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
        </SetupSection>
      </div>

      <div className="ws-setup-action">
        {Object.values(errors).some(Boolean) && <p className="field-error" role="status">Check the highlighted mission settings.</p>}
        <button type="submit" className="ws-primary">Plan routes <Icon name="arrowRight" /></button>
      </div>
    </form>
  )
}
