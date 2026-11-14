import type { Priority } from '../../types/planning'

/** Display helpers for the Plan workspace. Parsing matches settings.ts: an empty string is not a number. */
export const parseSetting = (value: string) => value.trim() === '' ? NaN : Number(value)

export const priorityNames: Record<Priority, string> = { '1': 'Low', '2': 'Medium', '3': 'High' }

/** Two-digit, 1-based stop number in list order, e.g. "01". */
export const stopNumber = (index: number) => String(index + 1).padStart(2, '0')

/** "3 h 00 m", or "—" when the value is not usable. */
export function formatDuration(totalMinutes: number): string {
  if (!Number.isFinite(totalMinutes) || totalMinutes < 0) return '—'
  const rounded = Math.round(totalMinutes)
  return `${Math.floor(rounded / 60)} h ${String(rounded % 60).padStart(2, '0')} m`
}

/** "10 min", or "—" when the value is not a number. */
export function formatMinutes(value: string): string {
  const minutes = parseSetting(value)
  return Number.isFinite(minutes) ? `${minutes} min` : '—'
}
