import type { Mission } from '../../types/mission'

const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const location = (v: unknown): boolean => object(v) && text(v.id) && text(v.name) && object(v.position) && finite(v.position.xMeters) && finite(v.position.yMeters)

export function parseMission(value: unknown): Mission {
  const fail = (): never => { throw new Error('Malformed mission data: expected schema 1.0 with synthetic local coordinates, unique stop IDs, and valid observation durations.') }
  if (!object(value)) return fail()
  const c = value.coordinateSystem
  const g = value.unverifiedGeographicReference
  if (value.schemaVersion !== '1.0' || value.dataMode !== 'synthetic' || !text(value.datasetId) || !text(value.notice)
    || !object(c) || !text(c.id) || c.kind !== 'local-cartesian' || c.units !== 'metres' || !text(c.origin)
    || !object(c.axes) || !text(c.axes.x) || !text(c.axes.y)
    || !object(g) || !finite(g.latitudeDegrees) || Math.abs(g.latitudeDegrees) > 90
    || !finite(g.longitudeDegrees) || Math.abs(g.longitudeDegrees) > 180 || g.status !== 'unverified-placeholder' || !text(g.notice)
    || !location(value.base) || !Array.isArray(value.stops)
    || !value.stops.every(s => location(s) && object(s) && text(s.observationObjective) && finite(s.observationDurationSeconds) && s.observationDurationSeconds >= 0)
    || !Array.isArray(value.layers) || value.layers.length !== 0 || !Array.isArray(value.sources) || value.sources.length !== 0) return fail()
  const ids = [(value.base as Record<string, unknown>).id, ...value.stops.map(s => (s as Record<string, unknown>).id)]
  if (new Set(ids).size !== ids.length) return fail()
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
