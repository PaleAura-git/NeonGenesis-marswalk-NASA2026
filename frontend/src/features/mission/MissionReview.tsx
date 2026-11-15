import type { ReactNode } from 'react'
import type { Mission } from '../../types/mission'
import { routeModeLabels, type InitialPlanningRequest } from '../../types/planning'

export function MissionReview({ mission, request, status }: { mission: Mission; request: InitialPlanningRequest; status?: ReactNode }) {
  const priorities = ['Low', 'Medium', 'High']
  return (
    <section className="mission-review" aria-labelledby="review-title" tabIndex={-1}>
      <h3 id="review-title">Mission review</h3>
      {status ?? <p className="hint">Route calculation is the next development step.</p>}
      <dl className="review-settings">
        <div><dt>Duration</dt><dd>{request.totalDurationSeconds / 60} min</dd></div>
        <div><dt>Reserve</dt><dd>{request.reserveSeconds / 60} min</dd></div>
        <div><dt>Available after reserve</dt><dd>{(request.totalDurationSeconds - request.reserveSeconds) / 60} min</dd></div>
        <div><dt>Walking speed</dt><dd>{(request.walkingSpeedMetersPerSecond * 3.6).toFixed(1)} km/h</dd></div>
        <div><dt>Max slope</dt><dd>{request.maxSlopeDegrees}&deg;</dd></div>
        <div><dt>Route modes</dt><dd>{request.requestedRouteModes.map(mode => routeModeLabels[mode]).join(', ')}</dd></div>
      </dl>
      <ul>{request.includedStops.map(stop => <li key={stop.id}>{mission.stops.find(item => item.id === stop.id)?.name} / {priorities[stop.priority - 1]} / {stop.observationSeconds / 60} min</li>)}</ul>
    </section>
  )
}
