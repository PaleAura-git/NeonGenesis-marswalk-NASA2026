import type { Mission } from '../../types/mission'
import { routeModeLabels, type PlanResponse, type RouteMode } from '../../types/planning'
import { kilometres, minutes, stopName } from './routeFormat'
import './routes.css'

interface Props {
  mission: Mission
  plan: PlanResponse
  selected: RouteMode
  onSelect: (mode: RouteMode) => void
  stale: boolean
  notes?: Partial<Record<RouteMode, string[]>>
}

/** Both planned routes side by side; the selected one is highlighted on the map. */
export function RouteCompare({ mission, plan, selected, onSelect, stale, notes }: Props) {
  return (
    <div className="rc">
      {stale && <p className="rc-stale" role="status">Settings changed since this plan. Use Plan routes again to update it.</p>}
      <ul className="rc-list">
        {plan.routes.map(route => {
          const isSelected = route.mode === selected
          const total = (route.walkingTimeSeconds ?? 0) + (route.observationTimeSeconds ?? 0) + (route.restTimeSeconds ?? 0)
          const [verdict, ...details] = route.explanations
          return (
            <li key={route.id}>
              <button type="button" className={`rc-card rc-card--${route.mode}${isSelected ? ' is-selected' : ''}`}
                aria-pressed={isSelected} onClick={() => onSelect(route.mode)}>
                <span className="rc-head">
                  <span className="rc-swatch" aria-hidden="true" />
                  <span className="rc-title">{routeModeLabels[route.mode]}</span>
                  <span className={`rc-status rc-status--${route.status}`}>{route.status === 'feasible' ? 'Safe return' : 'No safe return'}</span>
                </span>
                {route.geometry.length > 0 && <dl className="rc-stats">
                  <div><dt>Distance</dt><dd>{kilometres(route.distanceMeters)}</dd></div>
                  <div><dt>Total time</dt><dd>{minutes(total)}</dd></div>
                  <div><dt>Spare</dt><dd>{minutes(route.reserveMarginSeconds)}</dd></div>
                  <div><dt>Limits first</dt><dd>{route.limitingResource ?? '–'}</dd></div>
                  <div><dt>Energy</dt><dd>{route.energyWh ?? '–'} Wh</dd></div>
                  <div><dt>Oxygen</dt><dd>{route.oxygenKg ?? '–'} kg</dd></div>
                </dl>}
                {route.visitingOrder.length > 0 && <span className="rc-order">
                  Base → {route.visitingOrder.map(id => stopName(mission, id)).join(' → ')} → Base
                </span>}
                {verdict && <span className="rc-verdict">{verdict}</span>}
              </button>
              {isSelected && (notes?.[route.mode]?.length || details.length > 0) && <ul className="rc-notes">
                {notes?.[route.mode]?.map(line => <li key={`n-${line}`} className="rc-note--change">{line}</li>)}
                {details.map(line => <li key={line}>{line}</li>)}
              </ul>}
            </li>
          )
        })}
      </ul>
      <p className="ws-panel-note">Reserve: 30 min + 20% of walking time, never relaxed. Rest: 5 min after every 30 min of walking.</p>
    </div>
  )
}
