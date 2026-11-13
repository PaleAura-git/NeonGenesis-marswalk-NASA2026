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
