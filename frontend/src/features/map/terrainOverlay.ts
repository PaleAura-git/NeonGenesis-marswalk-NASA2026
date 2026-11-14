import type { MapBounds } from '../../types/mission'

/**
 * Illustrative terrain: the offline fallback when NASA Mars Trek tiles cannot load, and the
 * "Illustrative terrain" choice in Layers. Bounds are local metres from Three Forks Base (x east, y north).
 * The image (1440 × 900) is stretched to these bounds, so keep their ratio close to 1.6 : 1.
 * They are larger than the stops need so the image fills the default view even on wide screens.
 */
export const terrainOverlay: { url: string; bounds: MapBounds } = {
  url: `${import.meta.env.BASE_URL}images/terrain-illustrative.jpg`,
  // 8.0 × 5.0 km centred on the stops (x −387…79, y −763…349).
  bounds: { min: { xMeters: -4154, yMeters: -2707 }, max: { xMeters: 3846, yMeters: 2293 } },
}
