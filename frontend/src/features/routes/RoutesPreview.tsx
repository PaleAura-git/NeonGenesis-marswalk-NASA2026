import { requestedRouteModes, routeModeLabels, type RouteMode } from '../../types/planning'

/** A calculated route summary for one mode. Nothing produces these yet; route calculation is the next step. */
export interface RoutePreviewResult {
  mode: RouteMode
  summary: string
}

/**
 * Route comparison in the Plan bottom strip. Until real results exist it is a single quiet line;
 * with results it shows one card per requested route mode.
 */
export function RoutesPreview({ results = [] }: { results?: RoutePreviewResult[] }) {
  if (results.length === 0) {
    return (
      <section className="ws-routes ws-routes--empty" aria-labelledby="routes-title">
        <h2 id="routes-title" className="ws-label">Routes</h2>
        <p className="ws-panel-note">Routes appear after Plan routes</p>
      </section>
    )
  }
  return (
    <section className="ws-routes" aria-labelledby="routes-title">
      <div className="ws-routes-head">
        <h2 id="routes-title">Routes</h2>
        <p className="ws-panel-note">Elevation profile appears with a route</p>
      </div>
      <ul className="ws-route-cards">
        {requestedRouteModes.map(mode => {
          const result = results.find(item => item.mode === mode)
          return (
            <li key={mode} className={result ? 'ws-route-card has-result' : 'ws-route-card'}>
              <h3>{routeModeLabels[mode]}</h3>
              <p>{result ? result.summary : 'Not calculated'}</p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
