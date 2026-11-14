import type { MapBounds } from '../../types/mission'

/**
 * Illustrative terrain shown under the mission map. Swap the image here, for example for a CTX hillshade,
 * by changing the URL and its bounds. Bounds are in the synthetic local metres used by the mission
 * (x east, y north). The image is stretched to these bounds, so keep its aspect ratio close to theirs.
 */
export const terrainOverlay: { url: string; bounds: MapBounds; label: string } = {
  url: `${import.meta.env.BASE_URL}images/terrain-illustrative.jpg`,
  // About three times the synthetic mission bounds (x −100…620, y −220…390), centred on them.
  bounds: { min: { xMeters: -900, yMeters: -800 }, max: { xMeters: 1420, yMeters: 970 } },
  label: 'Illustrative terrain · replace with CTX hillshade',
}
