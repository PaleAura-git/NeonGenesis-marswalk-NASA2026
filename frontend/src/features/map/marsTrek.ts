import L from 'leaflet'
import { MARS_RADIUS_M } from './geoFrame'

/**
 * Mars CRS: Leaflet's equirectangular EPSG:4326 grid (z0 = 2 × 1 tiles from −180°, 90°), which matches the
 * NASA Mars Trek "default028mm" tile matrix, but with the Mars radius so distances and the scale bar are Mars metres.
 */
export const MarsCRS: L.CRS = L.Util.extend({}, L.CRS.EPSG4326, {
  code: 'IAU2000:49900',
  R: MARS_RADIUS_M,
})

const trekTiles = (layer: string, extension: string) =>
  `https://trek.nasa.gov/tiles/Mars/EQ/${layer}/1.0.0/default/default028mm/{z}/{y}/{x}.${extension}`

/**
 * NASA Mars Trek layers, confirmed from each layer's WMTSCapabilities.xml (November 2026).
 * Bounds are [south, west], [north, east] in degrees.
 */
export const marsTrek = {
  attribution: 'NASA/JPL-Caltech/University of Arizona · USGS · NASA Mars Trek',
  /** Jezero CTX orthomosaic, 6 m/px. PNG, tile matrices 0–13. Shown at every zoom, stretched above 13. */
  context: {
    id: 'JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0',
    url: trekTiles('JEZ_ctx_B_soc_008_orthoMosaic_6m_Eqc_latTs0_lon0', 'png'),
    maxNativeZoom: 13,
    bounds: [[18.2110274, 77.1604655], [18.7211945, 77.6991776]] as L.LatLngBoundsLiteral,
  },
  /** Mars 2020 landing-site HiRISE orthomosaic, 25 cm/px. PNG, tile matrices 0–17 (z17 ≈ 0.30 m/px here). */
  detail: {
    id: 'JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd',
    url: trekTiles('JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first_dd', 'png'),
    minZoom: 13,
    maxNativeZoom: 17,
    bounds: [[18.3067994, 77.2229331], [18.669315, 77.583964]] as L.LatLngBoundsLiteral,
  },
  /** About 10 m/px: roughly 6–7 km across the map area, context layer only. */
  minZoom: 12,
  maxZoom: 17,
  /** Panning limit around Three Forks Base, in metres. */
  panLimitMetres: 3000,
} as const

/** URL of one HiRISE tile, for small previews outside the map. */
export function hiriseTileUrl(z: number, x: number, y: number): string {
  return marsTrek.detail.url.replace('{z}', String(z)).replace('{y}', String(y)).replace('{x}', String(x))
}

/** Fractional tile coordinates of a point in the Trek tile matrix at zoom z. */
export function tileCoordinates(latitude: number, longitude: number, z: number): { x: number; y: number } {
  return { x: (longitude + 180) / 360 * 2 ** (z + 1), y: (90 - latitude) / 180 * 2 ** z }
}
