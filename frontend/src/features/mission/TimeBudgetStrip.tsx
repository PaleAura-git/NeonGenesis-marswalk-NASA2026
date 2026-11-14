import type { Mission } from '../../types/mission'
import type { MissionSettings } from '../../types/planning'
import { formatDuration, parseSetting as parse } from './format'

/**
 * Mission time budget from the current settings. The only calculation is
 * walking = duration − reserve − sum of included observation times.
 */
export function TimeBudgetStrip({ mission, settings }: { mission: Mission; settings: MissionSettings }) {
  const total = parse(settings.durationHours) * 60 + parse(settings.durationMinutes)
  const reserve = parse(settings.reserveMinutes)
  const science = mission.stops.filter(stop => settings.stops[stop.id]?.included)
    .reduce((sum, stop) => sum + parse(settings.stops[stop.id].observationMinutes), 0)
  const valid = [total, reserve, science].every(Number.isFinite) && total > 0 && reserve >= 0 && science >= 0
  const walking = valid ? total - reserve - science : NaN
  const over = valid && walking < 0

  const minutes = (value: number) => Number.isFinite(value) ? `${Math.round(value)} min` : '—'
  // Segments grow in proportion to their minutes; together they fill the bar (2 px gaps between them).
  const share = (value: number) => ({ flex: `${Math.max(0, value)} 1 0` })
  const label = valid
    ? `Mission time budget: walking and return ${over ? `over budget by ${Math.round(-walking)} minutes` : `${Math.round(walking)} minutes`}, science ${Math.round(science)} minutes, reserve ${Math.round(reserve)} minutes, of ${Math.round(total)} minutes total.`
    : 'Mission time budget unavailable until the duration, reserve and observation times are valid.'

  return (
    <section className="ws-budget" aria-labelledby="budget-title">
      <div className="ws-budget-title">
        <h2 id="budget-title">Mission time budget</h2>
        <p className="ws-panel-note">{formatDuration(total)} total · updates as you edit</p>
      </div>
      <div className="ws-budget-bar" role="img" aria-label={label}>
        {valid && walking > 0 && <span className="ws-budget-walk" style={share(walking)} />}
        {valid && science > 0 && <span className="ws-budget-science" style={share(science)} />}
        {valid && reserve > 0 && <span className="ws-budget-reserve" style={share(reserve)} />}
      </div>
      <div className="ws-budget-values">
        <ul className="ws-budget-legend" aria-hidden="true">
          <li><span className="ws-swatch ws-budget-walk" />Walking & return <strong className={over ? 'is-over' : undefined}>{over ? `−${Math.round(-walking)} min` : minutes(walking)}</strong></li>
          <li><span className="ws-swatch ws-budget-science" />Science <strong>{minutes(science)}</strong></li>
          <li><span className="ws-swatch ws-budget-reserve" />Reserve <strong>{minutes(reserve)}</strong></li>
        </ul>
        <p className={over ? 'ws-budget-headline is-over' : 'ws-budget-headline'} aria-live="polite">
          {!valid ? 'Check mission settings' : over ? `Over budget by ${Math.round(-walking)} min` : `${Math.round(walking)} min available for walking`}
        </p>
      </div>
    </section>
  )
}
