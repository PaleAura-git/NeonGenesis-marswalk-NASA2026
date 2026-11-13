import type { LatLngTuple } from 'leaflet'
import type { Mission, Position } from '../../types/mission'

// CRS.Simple uses northing first. Positive y is north and positive x is east.
export function toMapPosition(position: Position): LatLngTuple {
  return [position.yMeters, position.xMeters]
}

export function missionBounds(mission: Mission): [LatLngTuple, LatLngTuple] {
  if (mission.bounds) return [toMapPosition(mission.bounds.min), toMapPosition(mission.bounds.max)]

  // Backwards compatibility for schema 1.0 datasets without explicit bounds.
  const positions = [mission.base, ...mission.stops].map(location => location.position)
  const xs = positions.map(position => position.xMeters)
  const ys = positions.map(position => position.yMeters)
  return [[Math.min(...ys) - 40, Math.min(...xs) - 40], [Math.max(...ys) + 40, Math.max(...xs) + 40]]
}
