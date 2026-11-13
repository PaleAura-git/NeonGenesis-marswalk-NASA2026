import type { Mission } from '../../types/mission'

const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const position = (v: unknown): v is { xMeters: number; yMeters: number } => object(v) && finite(v.xMeters) && finite(v.yMeters)
const bounds = (v: unknown): boolean => object(v) && position(v.min) && position(v.max) && v.min.xMeters < v.max.xMeters && v.min.yMeters < v.max.yMeters
const assetUrl = (v: unknown): boolean => text(v) && (/^https?:\/\//.test(v) || (v.startsWith('/') && !v.startsWith('//')))
const location = (v: unknown): boolean => object(v) && text(v.id) && text(v.name) && object(v.position) && finite(v.position.xMeters) && finite(v.position.yMeters)

export function parseMission(value: unknown): Mission {
  const fail = (): never => { throw new Error('Malformed mission data: expected schema 1.0 or 1.1 with valid local coordinates, bounds, layer metadata, unique IDs, and observation durations.') }
  if (!object(value)) return fail()
  const c = value.coordinateSystem
  const g = value.unverifiedGeographicReference
  if (!['1.0', '1.1'].includes(String(value.schemaVersion)) || value.dataMode !== 'synthetic' || !text(value.datasetId) || !text(value.notice)
    || !object(c) || !text(c.id) || c.kind !== 'local-cartesian' || c.units !== 'metres' || !text(c.origin)
    || !object(c.axes) || !text(c.axes.x) || !text(c.axes.y)
    || !object(g) || !finite(g.latitudeDegrees) || Math.abs(g.latitudeDegrees) > 90
    || !finite(g.longitudeDegrees) || Math.abs(g.longitudeDegrees) > 180 || g.status !== 'unverified-placeholder' || !text(g.notice)
    || !location(value.base) || !Array.isArray(value.stops)
    || !value.stops.every(s => location(s) && object(s) && text(s.observationObjective) && finite(s.observationDurationSeconds) && s.observationDurationSeconds >= 0)
    || (value.schemaVersion === '1.1' && !bounds(value.bounds))
    || (value.bounds !== undefined && !bounds(value.bounds))
    || !Array.isArray(value.layers) || !value.layers.every(layer => object(layer)
      && text(layer.id) && ['imagery', 'slope', 'terrain-classification'].includes(String(layer.kind))
      && assetUrl(layer.url) && bounds(layer.bounds) && layer.coordinateSystemId === c.id
      && text(layer.attribution) && typeof layer.illustrative === 'boolean'
      && (!layer.illustrative || layer.kind === 'imagery'))
    || (value.schemaVersion === '1.0' && value.layers.length !== 0)
    || !Array.isArray(value.sources) || value.sources.length !== 0) return fail()
  const ids = [(value.base as Record<string, unknown>).id, ...value.stops.map(s => (s as Record<string, unknown>).id)]
  if (new Set(ids).size !== ids.length) return fail()
  if (new Set(value.layers.map(layer => layer.id)).size !== value.layers.length) return fail()
  if (object(value.bounds) && position(value.bounds.min) && position(value.bounds.max)) {
    const { min, max } = value.bounds
    const locations = [value.base, ...value.stops]
    if (!locations.every(item => object(item) && position(item.position)
      && item.position.xMeters >= min.xMeters && item.position.xMeters <= max.xMeters
      && item.position.yMeters >= min.yMeters && item.position.yMeters <= max.yMeters)) return fail()
  }
  return value as unknown as Mission
}

export async function getMission(signal?: AbortSignal): Promise<Mission> {
  const mode = import.meta.env.VITE_DATA_MODE
  if (mode === 'mock') {
    const fixture = await import('../../../../shared/examples/mission.json')
    return parseMission(fixture.default)
  }
  if (mode !== 'api') throw new Error('Choose VITE_DATA_MODE=mock or api in frontend/.env.local, then restart Vite.')
  const base = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '')
  let response: Response
  try { response = await fetch(`${base}/mission`, { signal, headers: { Accept: 'application/json' } }) }
  catch (error) {
    if (signal?.aborted) throw error
    throw new Error('Mission service could not be reached. Check the backend connection and try again.')
  }
  if (!response.ok) throw new Error(`Mission request failed (HTTP ${response.status}). Please try again.`)
  let data: unknown
  try { data = await response.json() }
  catch { throw new Error('Malformed mission data: the service did not return valid JSON.') }
  return parseMission(data)
}
