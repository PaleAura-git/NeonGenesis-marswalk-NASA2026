import type { Mission } from '../../types/mission'
import type { PlannedRoute } from '../../types/planning'

export const minutes = (seconds: number | undefined) => seconds === undefined ? '–' : `${Math.round(seconds / 60)} min`
export const kilometres = (meters: number | undefined) => meters === undefined ? '–' : `${(meters / 1000).toFixed(2)} km`

export function stopName(mission: Mission, id: string): string {
  return mission.stops.find(stop => stop.id === id)?.name ?? (id === mission.base.id ? mission.base.name : id)
}

/** One-line card summary, also used in the Plan strip. */
export function routeSummary(route: PlannedRoute): string {
  if (route.status === 'infeasible') return 'No safe return'
  const total = (route.walkingTimeSeconds ?? 0) + (route.observationTimeSeconds ?? 0) + (route.restTimeSeconds ?? 0)
  return `${kilometres(route.distanceMeters)} · ${minutes(total)} · ${minutes(route.reserveMarginSeconds)} spare`
}
