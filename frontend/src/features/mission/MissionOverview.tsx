import type { Mission } from '../../types/mission'

export function MissionOverview({ mission }: { mission: Mission }) {
  return <section className="panel mission-panel" aria-labelledby="mission-title">
    <p className="eyebrow">Expedition overview</p><h2 id="mission-title">Start with the science.</h2>
    <div className="base"><span className="location-mark" aria-hidden="true">⌂</span><div><p className="eyebrow">Departure & return</p><h3>{mission.base.name}</h3></div></div>
    <p className="eyebrow stops-label">Science stops / {mission.stops.length.toString().padStart(2, '0')}</p>
    <ol className="stop-list">{mission.stops.map((stop, index) => <li key={stop.id}>
      <span className="stop-number" aria-hidden="true">{(index + 1).toString().padStart(2, '0')}</span>
      <div><h3>{stop.name}</h3><p>{stop.observationObjective}</p><span className="duration">{stop.observationDurationSeconds} s observation · synthetic</span></div>
    </li>)}</ol>
    <details><summary>Coordinate & data notes</summary><p>{mission.notice}</p><p>All UI positions use synthetic xMeters / yMeters in {mission.coordinateSystem.id}.</p><p>Unverified placeholder: {mission.unverifiedGeographicReference.latitudeDegrees}° N, {mission.unverifiedGeographicReference.longitudeDegrees}° E. Exact placement and datum are pending.</p></details>
  </section>
}
