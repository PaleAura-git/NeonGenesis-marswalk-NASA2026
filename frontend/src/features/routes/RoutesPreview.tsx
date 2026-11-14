import { requestedRouteModes, routeModeLabels, type RouteMode } from '../../types/planning'

/** A calculated route summary for one mode. Nothing produces these yet; route calculation is the next step. */
export interface RoutePreviewResult {
  mode: RouteMode
  summary: string
}

/** Route comparison slots in the Plan bottom strip: one card per requested route mode. */
export function RoutesPreview({ results = [] }: { results?: RoutePreviewResult[] }) {
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
              <p>{result ? result.summary : 'Run Plan routes to compare'}</p>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
