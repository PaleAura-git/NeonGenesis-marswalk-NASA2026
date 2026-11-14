/**
 * Mars time from NASA GISS Mars24 (Allison & McEwen 2000). Pure functions, no DOM.
 * Sanity check: `node src/features/home/marsTime.check.ts`.
 */

/** Jezero Crater, east longitude in degrees. */
export const JEZERO_EAST_LONGITUDE = 77.58

/** TT − UTC in seconds: 37 leap seconds + 32.184 s. */
const TT_MINUS_UTC = 37 + 32.184

const mod = (value: number, modulus: number) => ((value % modulus) + modulus) % modulus

/** Mars Sol Date for a Unix time in milliseconds. */
export function marsSolDate(unixMs: number): number {
  const jdUt = unixMs / 86_400_000 + 2_440_587.5
  const jdTt = jdUt + TT_MINUS_UTC / 86_400
  return (jdTt - 2_451_549.5) / 1.0274912517 + 44_796.0 - 0.0009626
}

/** Coordinated Mars Time (mean solar time at the prime meridian), hours in [0, 24). */
export function coordinatedMarsTime(unixMs: number): number {
  return mod(24 * marsSolDate(unixMs), 24)
}

/** Local Mean Solar Time at an east longitude in degrees, hours in [0, 24). */
export function localMeanSolarTime(unixMs: number, eastLongitude: number): number {
  return mod(coordinatedMarsTime(unixMs) + eastLongitude / 15, 24)
}

/** Formats hours as HH:MM, minutes rounded down. */
export function formatMarsClock(hours: number): string {
  const totalMinutes = Math.floor(mod(hours, 24) * 60) % (24 * 60)
  const hh = Math.floor(totalMinutes / 60)
  const mm = totalMinutes % 60
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}
