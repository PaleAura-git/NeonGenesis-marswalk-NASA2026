import type { LatLngTuple } from 'leaflet'
import type { Mission, Position } from '../../types/mission'
import { toLatLon } from './geoFrame'

/** Margin around the stops and base for the drawn mission area, in metres. */
const AREA_MARGIN_METRES = 100

/** Local metres → Leaflet [latitude, longitude] on Mars (see geoFrame.ts). */
export function toMapPosition(position: Position): LatLngTuple {
  return toLatLon(position)
}

/** Mission area in local metres: the base and stops plus a margin. */
export function missionAreaMetres(mission: Mission): { min: Position; max: Position } {
  const positions = [mission.base, ...mission.stops].map(location => location.position)
  const xs = positions.map(position => position.xMeters)
  const ys = positions.map(position => position.yMeters)
  return {
    min: { xMeters: Math.min(...xs) - AREA_MARGIN_METRES, yMeters: Math.min(...ys) - AREA_MARGIN_METRES },
    max: { xMeters: Math.max(...xs) + AREA_MARGIN_METRES, yMeters: Math.max(...ys) + AREA_MARGIN_METRES },
  }
}

/** Mission area as Leaflet bounds, [[south, west], [north, east]]. */
export function missionBounds(mission: Mission): [LatLngTuple, LatLngTuple] {
  const { min, max } = missionAreaMetres(mission)
  return [toMapPosition(min), toMapPosition(max)]
}
