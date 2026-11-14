import type { InitialPlanningRequest, PlanResponse } from '../../types/planning'

const object = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const position = (v: unknown): boolean => object(v) && Number.isFinite(v.xMeters) && Number.isFinite(v.yMeters)

export function parsePlan(value: unknown): PlanResponse {
  const fail = (): never => { throw new Error('Malformed plan data: expected routes with a mode, status, geometry and explanations.') }
  if (!object(value) || value.schemaVersion !== '1.0' || !Array.isArray(value.routes)) return fail()
  const ok = value.routes.every(r => object(r)
    && ['time-focused', 'conservative'].includes(String(r.mode))
    && ['feasible', 'infeasible'].includes(String(r.status))
    && Array.isArray(r.geometry) && r.geometry.every(position)
    && Array.isArray(r.explanations))
  return ok ? value as unknown as PlanResponse : fail()
}

/** POST /api/plan (backend/scripts/server.py). Infeasible routes are a valid answer, not an error. */
export async function requestPlan(request: InitialPlanningRequest, signal?: AbortSignal): Promise<PlanResponse> {
  if (import.meta.env.VITE_DATA_MODE !== 'api') throw new Error('Route planning needs the planner API: set VITE_DATA_MODE=api and run backend/scripts/server.py.')
  const base = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/+$/, '')
  let response: Response
  try {
    response = await fetch(`${base}/plan`, {
      method: 'POST', signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(request),
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new Error('Planner could not be reached. Check that backend/scripts/server.py is running and try again.')
  }
  let data: unknown
  try { data = await response.json() }
  catch { throw new Error(`Planner returned invalid JSON (HTTP ${response.status}).`) }
  if (!response.ok) {
    const message = object(data) && typeof data.error === 'string' ? data.error : `HTTP ${response.status}`
    throw new Error(`Planning request rejected: ${message}`)
  }
  return parsePlan(data)
}
