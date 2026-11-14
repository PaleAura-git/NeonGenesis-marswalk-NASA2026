import type { CSSProperties } from 'react'
import type { Mission } from '../../types/mission'
import type { Priority, SettingsErrors, StopSettings } from '../../types/planning'
import { Icon } from '../../components/ui/Icon'
import { Stepper } from '../../components/ui/Stepper'
import { Switch } from '../../components/ui/Switch'
import { BaseDetails } from '../map/BaseDetails'
import { terrainOverlay } from '../map/terrainOverlay'
import { observationField } from '../mission/settings'
import { parseSetting, priorityNames, stopNumber } from '../mission/format'

interface Props {
  mission: Mission
  selectedId: string | null
  open: boolean
  onOpen: () => void
  onCollapse: () => void
  /** Mission settings for every stop, plus the existing change and validation handlers. */
  stopSettings: Record<string, StopSettings>
  errors: SettingsErrors
  onStopChange: (id: string, patch: Partial<StopSettings>) => void
  onBlur: (field: string) => void
}

const priorities: Priority[] = ['1', '2', '3']
// Width of terrain, in metres, shown across the header image.
const CROP_METRES = 420

/** Crop of the terrain overlay centred near a position, used until real stop imagery exists. */
function terrainCrop(xMeters: number, yMeters: number): CSSProperties {
  const { min, max } = terrainOverlay.bounds
  const width = max.xMeters - min.xMeters
  const x = (xMeters - min.xMeters) / width
  const y = (max.yMeters - yMeters) / (max.yMeters - min.yMeters)
  return {
    '--terrain-image': `url("${terrainOverlay.url}")`,
    '--terrain-size': `${(width / CROP_METRES) * 100}% auto`,
    '--terrain-position': `${(x * 100).toFixed(1)}% ${(y * 100).toFixed(1)}%`,
  } as CSSProperties
}

/** Right-hand inspector for the selected stop or base. Collapses to a slim tab on the right edge. */
export function ScienceStopPanel({ mission, selectedId, open, onOpen, onCollapse, stopSettings, errors, onStopChange, onBlur }: Props) {
  if (!open) {
    return (
      <button type="button" className="ws-inspector-tab" aria-expanded="false" aria-controls="inspector" onClick={onOpen}>
        <Icon name="science" /><span>Science stop</span>
      </button>
    )
  }

  const isBase = selectedId === mission.base.id
  const stopIndex = mission.stops.findIndex(stop => stop.id === selectedId)
  const stop = stopIndex >= 0 ? mission.stops[stopIndex] : undefined
  const settings = stop ? stopSettings[stop.id] : undefined
  const location = isBase ? mission.base : stop
  const collapse = (
    <button type="button" className="ws-icon-button ws-inspector-close" aria-label="Collapse science stop panel" onClick={onCollapse}>
      <Icon name="close" />
    </button>
  )

  if (!location) {
    return (
      <aside id="inspector" className="ws-panel ws-inspector" aria-label="Science stop">
        <div className="ws-inspector-empty">
          {collapse}
          <Icon name="science" className="empty-symbol" />
          <h2>Explore the science</h2>
          <p>Select a stop in Mission setup to see its objective and observation duration.</p>
        </div>
      </aside>
    )
  }

  const kicker = isBase ? 'Base · departure & return'
    : `Stop ${stopNumber(stopIndex)} · ${settings ? priorityNames[settings.priority] ?? 'Unset' : ''} priority`
  const observation = settings ? parseSetting(settings.observationMinutes) : NaN

  return (
    <aside id="inspector" className="ws-panel ws-inspector" aria-labelledby="inspector-title">
      <div className="ws-inspector-hero" style={terrainCrop(location.position.xMeters, location.position.yMeters)}>
        <span className="ws-pill ws-hero-pill">{isBase ? 'Base imagery pending' : 'Perseverance imagery pending'}</span>
        {collapse}
        <div className="ws-hero-text">
          <p className="ws-kicker">{kicker}</p>
          <h2 id="inspector-title">{location.name}</h2>
        </div>
      </div>

      <div className="ws-inspector-body">
        {isBase ? <BaseDetails mission={mission} /> : stop && settings && <>
          {stop.observationObjective.trim() && (
            <section className="ws-inspector-section">
              <h3 className="ws-label">Observation objective</h3>
              <p className="ws-objective">{stop.observationObjective}</p>
            </section>
          )}
          {/* "Why it matters" appears once stops carry that text; the current data has none. */}

          <div className="ws-inspector-controls">
            <div className="ws-control-row">
              <span id="inspector-include" className="ws-control-label">Include in expedition</span>
              <Switch checked={settings.included} label={`Include ${stop.name} in expedition`} field="includedStops"
                invalid={Boolean(errors.includedStops)} describedBy={errors.includedStops ? 'inspector-include-error' : undefined}
                onChange={included => onStopChange(stop.id, { included })} onBlur={() => onBlur('includedStops')} />
            </div>
            {errors.includedStops && <p className="field-error" id="inspector-include-error">{errors.includedStops}</p>}

            <div className="ws-control-block" role="group" aria-labelledby="inspector-priority">
              <span id="inspector-priority" className="ws-control-label">Priority</span>
              <div className="ws-segmented">
                {priorities.map(priority => (
                  <button key={priority} type="button" aria-pressed={settings.priority === priority}
                    data-setting-field={`priority-${stop.id}`} aria-invalid={Boolean(errors[`priority-${stop.id}`]) || undefined}
                    onClick={() => onStopChange(stop.id, { priority })} onBlur={() => onBlur(`priority-${stop.id}`)}>
                    {priorityNames[priority]}
                  </button>
                ))}
              </div>
              {errors[`priority-${stop.id}`] && <p className="field-error">{errors[`priority-${stop.id}`]}</p>}
            </div>

            <div className="ws-control-row ws-control-row--stepper">
              <span className="ws-control-label" aria-hidden="true">Observation time</span>
              <Stepper label="Observation time" hideLabel className="ws-stepper--compact"
                display={Number.isFinite(observation) ? `${observation} min` : '—'} stepLabel="1 minute"
                fields={[{ field: observationField(stop.id), value: settings.observationMinutes, unit: 'min', label: `Observation minutes for ${stop.name}` }]}
                canDecrement={Number.isFinite(observation) && observation > 0}
                onStep={direction => onStopChange(stop.id, { observationMinutes: String(Math.max(0, (Number.isFinite(observation) ? observation : 0) + direction)) })}
                onFieldChange={(_, observationMinutes) => onStopChange(stop.id, { observationMinutes })}
                onBlur={onBlur} errors={errors} />
            </div>
          </div>
        </>}
      </div>

      <dl className="ws-inspector-foot">
        <div><dt>Position</dt><dd>Synthetic · awaiting verified placement</dd></div>
      </dl>
    </aside>
  )
}
