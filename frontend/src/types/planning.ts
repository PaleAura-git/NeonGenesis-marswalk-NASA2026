import type { Position } from './mission'

export type Priority = '1' | '2' | '3'

export interface StopSettings {
  included: boolean
  priority: Priority
  observationMinutes: string
}

// Strings preserve empty fields and intermediate edits until validation.
export interface MissionSettings {
  durationHours: string
  durationMinutes: string
  reserveMinutes: string
  walkingSpeed: string
  maxSlopeDegrees: string
  stops: Record<string, StopSettings>
}

export type SettingsErrors = Record<string, string | undefined>
export const requestedRouteModes = ['time-focused', 'conservative'] as const
export type RouteMode = (typeof requestedRouteModes)[number]
export const routeModeLabels: Record<RouteMode, string> = {
  'time-focused': 'Time-focused',
  conservative: 'Conservative',
}

export interface InitialPlanningRequest {
  schemaVersion: '1.0'
  requestId: string
  datasetId: string
  coordinateSystemId: string
  baseId: string
  currentPosition: Position
  totalDurationSeconds: number
  elapsedSeconds: 0
  reserveSeconds: number
  walkingSpeedMetersPerSecond: number
  maxSlopeDegrees: number
  includedStops: { id: string; priority: number; observationSeconds: number }[]
  completedStopIds: string[]
  blockedAreas: { id: string; vertices: Position[] }[]
  requestedRouteModes: RouteMode[]
}

export type LimitingResource = 'time' | 'energy' | 'oxygen'

export interface RestSpot {
  position: Position
  durationSeconds: number
  slopeDegrees: number
  roughnessDegrees: number
}

export interface PlannedRoute {
  id: string
  mode: RouteMode
  status: 'feasible' | 'infeasible'
  geometry: Position[]
  visitingOrder: string[]
  excludedStops: { id: string; reason: string }[]
  distanceMeters?: number
  returnDistanceMeters?: number
  walkingTimeSeconds?: number
  returnWalkingTimeSeconds?: number
  observationTimeSeconds?: number
  restTimeSeconds?: number
  restSpots?: RestSpot[]
  reserveSeconds?: number
  reserveMarginSeconds?: number
  energyWh?: number
  oxygenKg?: number
  limitingResource?: LimitingResource
  spareSeconds?: Record<LimitingResource, number>
  returnBoundary?: Position[]
  returnBoundaryCheckpoints?: { when: string; polygon: Position[] }[]
  explanations: string[]
  // Present only when the request had blockedAreas: what the block changed versus no block.
  rehearsal?: string[]
}

export interface PlanResponse {
  schemaVersion: '1.0'
  datasetId: string
  coordinateSystemId: string
  totalDurationSeconds: number
  routes: PlannedRoute[]
}
