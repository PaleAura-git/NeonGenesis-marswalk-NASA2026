import type { Mission } from '../../types/mission'
import { requestedRouteModes, type InitialPlanningRequest, type MissionSettings, type SettingsErrors } from '../../types/planning'

// Planner limits (backend/scripts/walk_cost.py). Walking speed is in km/h everywhere in the UI.
export const SPEED_KMH = { min: 1.5, max: 3.3, step: 0.1 }
export const SLOPE_DEG = { min: 5, max: 20, step: 1 }
/** Demo defaults: a 6 h Marswalk at Apollo walking pace with the 15 degree limit and every stop included. */
export const DEFAULTS = { durationHours: '6', durationMinutes: '0', reserveMinutes: '30', walkingSpeed: '3.3', maxSlopeDegrees: '15' }

export function observationField(id: string): string {
  return `observation-${id}`
}

export function createMissionSettings(mission: Mission): MissionSettings {
  return {
    ...DEFAULTS,
    stops: Object.fromEntries(mission.stops.map(stop => [stop.id, {
      included: true,
      priority: '2',
      observationMinutes: String(stop.observationDurationSeconds / 60),
    }])),
  }
}

function numeric(value: string): number {
  return value.trim() === '' ? NaN : Number(value)
}

export function validateMissionSettings(settings: MissionSettings, mission: Mission): SettingsErrors {
  const errors: SettingsErrors = {}
  const hours = numeric(settings.durationHours)
  const minutes = numeric(settings.durationMinutes)
  const totalSeconds = hours * 3600 + minutes * 60
  const reserve = numeric(settings.reserveMinutes) * 60
  const speed = numeric(settings.walkingSpeed)
  const slope = numeric(settings.maxSlopeDegrees)

  if (!Number.isFinite(hours) || hours < 0) errors.durationHours = 'Enter finite, nonnegative hours.'
  if (!Number.isFinite(minutes) || minutes < 0) errors.durationMinutes = 'Enter finite, nonnegative minutes.'
  if (!errors.durationHours && !errors.durationMinutes && (!Number.isFinite(totalSeconds) || totalSeconds <= 0)) {
    errors.durationHours = 'Mission duration must be greater than zero and finite.'
  }
  if (!Number.isFinite(reserve) || reserve < 0) errors.reserveMinutes = 'Enter finite reserve minutes, zero or greater.'
  else if (Number.isFinite(totalSeconds) && totalSeconds > 0 && reserve >= totalSeconds) errors.reserveMinutes = 'Reserve must be less than mission duration.'
  if (!Number.isFinite(speed) || speed < SPEED_KMH.min || speed > SPEED_KMH.max) errors.walkingSpeed = `Walking speed must be ${SPEED_KMH.min} to ${SPEED_KMH.max} km/h.`
  if (!Number.isFinite(slope) || slope < SLOPE_DEG.min || slope > SLOPE_DEG.max) errors.maxSlopeDegrees = `Maximum slope must be ${SLOPE_DEG.min} to ${SLOPE_DEG.max} degrees.`

  let included = 0
  mission.stops.forEach(stop => {
    const value = settings.stops[stop.id]
    const seconds = value ? numeric(value.observationMinutes) * 60 : NaN
    if (!Number.isFinite(seconds) || seconds < 0) errors[observationField(stop.id)] = 'Enter finite observation minutes, zero or greater.'
    if (value && !['1', '2', '3'].includes(value.priority)) errors[`priority-${stop.id}`] = 'Choose Low, Medium, or High.'
    if (value?.included) included += 1
  })
  if (included === 0) errors.includedStops = 'Include at least one science stop.'
  return errors
}

export function buildInitialPlanningRequest(mission: Mission, settings: MissionSettings, requestId: string): InitialPlanningRequest {
  if (Object.keys(validateMissionSettings(settings, mission)).length > 0) throw new Error('Mission settings must be valid before building a planning request.')
  if (!requestId.trim()) throw new Error('A request ID is required.')
  return {
    schemaVersion: '1.0',
    requestId,
    datasetId: mission.datasetId,
    coordinateSystemId: mission.coordinateSystem.id,
    baseId: mission.base.id,
    currentPosition: { ...mission.base.position },
    totalDurationSeconds: numeric(settings.durationHours) * 3600 + numeric(settings.durationMinutes) * 60,
    elapsedSeconds: 0,
    reserveSeconds: numeric(settings.reserveMinutes) * 60,
    walkingSpeedMetersPerSecond: numeric(settings.walkingSpeed) / 3.6,
    maxSlopeDegrees: numeric(settings.maxSlopeDegrees),
    includedStops: mission.stops.filter(stop => settings.stops[stop.id].included).map(stop => ({
      id: stop.id,
      priority: Number(settings.stops[stop.id].priority),
      observationSeconds: numeric(settings.stops[stop.id].observationMinutes) * 60,
    })),
    completedStopIds: [],
    blockedAreas: [],
    requestedRouteModes: [...requestedRouteModes],
  }
}

export function observationBudgetWarning(settings: MissionSettings, mission: Mission): boolean {
  const available = numeric(settings.durationHours) * 60 + numeric(settings.durationMinutes) - numeric(settings.reserveMinutes)
  const observations = mission.stops.filter(stop => settings.stops[stop.id]?.included)
    .map(stop => numeric(settings.stops[stop.id].observationMinutes))
  return Number.isFinite(available) && available >= 0 && observations.every(value => Number.isFinite(value) && value >= 0)
    && observations.reduce((total, value) => total + value, 0) > available
}
