import { routeModeLabels, type PlannedRoute } from '../../types/planning'
import { minutes } from './routeFormat'
import './routes.css'

/** The selected route's time budget as one bar: walking, observation, rest, reserve and what is left. */
export function RouteTimeline({ route, budgetSeconds }: { route: PlannedRoute; budgetSeconds: number }) {
  const parts = [
    { key: 'walk', label: 'Walking', seconds: route.walkingTimeSeconds ?? 0 },
    { key: 'observe', label: 'Science stops', seconds: route.observationTimeSeconds ?? 0 },
    { key: 'rest', label: 'Rest', seconds: route.restTimeSeconds ?? 0 },
    { key: 'reserve', label: 'Reserve', seconds: route.reserveSeconds ?? 0 },
  ]
  const used = parts.reduce((total, part) => total + part.seconds, 0)
  const spare = budgetSeconds - used
  const scale = Math.max(budgetSeconds, used)
  return (
    <section className="panel rt" aria-labelledby="rt-title">
      <div className="rt-head">
        <p className="eyebrow" id="rt-title">Mission time · {routeModeLabels[route.mode]}</p>
        <p className={`rt-verdict${spare < 0 ? ' is-over' : ''}`}>
          {spare >= 0 ? `${minutes(spare)} spare of ${minutes(budgetSeconds)}` : `${minutes(-spare)} over the ${minutes(budgetSeconds)} budget`}
          {route.limitingResource && ` · ${route.limitingResource} limits first`}
        </p>
      </div>
      <div className="rt-bar" role="img" aria-label={parts.map(part => `${part.label} ${minutes(part.seconds)}`).join(', ')}>
        {parts.map(part => part.seconds > 0 && <span key={part.key} className={`rt-seg rt-seg--${part.key}`} style={{ width: `${part.seconds / scale * 100}%` }} />)}
        {spare > 0 && <span className="rt-seg rt-seg--spare" style={{ width: `${spare / scale * 100}%` }} />}
      </div>
      <ul className="rt-legend">
        {parts.map(part => <li key={part.key}><span className={`rt-dot rt-seg--${part.key}`} aria-hidden="true" />{part.label} <b>{minutes(part.seconds)}</b></li>)}
        <li><span className="rt-dot rt-seg--spare" aria-hidden="true" />Spare <b>{minutes(Math.max(spare, 0))}</b></li>
      </ul>
    </section>
  )
}
