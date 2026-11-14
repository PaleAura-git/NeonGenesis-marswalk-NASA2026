import type { Position } from '../../types/mission'

/**
 * Geographic frame for the mission's local metres.
 *
 * The planner keeps working in local metres (xMeters east, yMeters north of Three Forks Base).
 * This file places that frame on Mars: change `origin` to move the whole frame, and see
 * `researchBriefPositions` for where the stop positions come from. The mock mission data
 * (shared/examples/mission.json) carries the same metre values; keep the two in step.
 *
 * Conversion is a local tangent-plane approximation on the Mars 2000 sphere, which is accurate to
 * well under a metre over the few kilometres the expedition covers.
 */

/** Mars mean radius in metres (IAU Mars 2000 sphere, as used by NASA Mars Trek tiles). */
export const MARS_RADIUS_M = 3_396_190

/** Three Forks Base, the (0, 0) of the local frame. Degrees north / east (planetocentric, east-positive). */
export const origin = { latitude: 18.4529, longitude: 77.4083 }

const DEG = Math.PI / 180
const metresPerDegreeLat = MARS_RADIUS_M * DEG
const metresPerDegreeLon = MARS_RADIUS_M * DEG * Math.cos(origin.latitude * DEG)

/** Local metres → [latitude, longitude] in degrees. */
export function toLatLon(position: Position): [number, number] {
  return [
    origin.latitude + position.yMeters / metresPerDegreeLat,
    origin.longitude + position.xMeters / metresPerDegreeLon,
  ]
}

/** [latitude, longitude] in degrees → local metres. */
export function toLocalMetres(latitude: number, longitude: number): Position {
  return {
    xMeters: (longitude - origin.longitude) * metresPerDegreeLon,
    yMeters: (latitude - origin.latitude) * metresPerDegreeLat,
  }
}

/**
 * Positions from the team's research brief (provisional: rover position file / HiRISE).
 * Local metres from Three Forks Base, with the brief's own coordinates for reference.
 */
export const researchBriefPositions: Record<string, Position & { latitude: number; longitude: number; note?: string }> = {
  'three-forks-base': { xMeters: 0, yMeters: 0, latitude: 18.4529, longitude: 77.4083 },
  'hawksbill-gap': { xMeters: -129, yMeters: 349, latitude: 18.4588, longitude: 77.4060 },
  'cape-nukshak': { xMeters: -387, yMeters: -130, latitude: 18.4507, longitude: 77.4014 },
  'kodiak-butte': { xMeters: 79, yMeters: -763, latitude: 18.4400, longitude: 77.4097, note: 'viewpoint, approximate' },
}

/** Shown in the inspector's Position row. */
export const positionStatus = 'Provisional · from rover position file / HiRISE'
