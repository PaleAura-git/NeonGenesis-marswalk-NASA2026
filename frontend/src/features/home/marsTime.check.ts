/**
 * Sanity check for marsTime.ts. Run from frontend/: `node src/features/home/marsTime.check.ts`
 * (Node 22.18+ runs TypeScript directly). Throws on the first failure.
 */
import { JEZERO_EAST_LONGITUDE, coordinatedMarsTime, formatMarsClock, localMeanSolarTime, marsSolDate } from './marsTime.ts'

function expectClose(name: string, actual: number, expected: number, tolerance: number) {
  if (!(Math.abs(actual - expected) <= tolerance)) throw new Error(`${name}: expected ${expected} ± ${tolerance}, got ${actual}`)
  console.log(`ok  ${name}: ${actual}`)
}
function expectEqual(name: string, actual: string, expected: string) {
  if (actual !== expected) throw new Error(`${name}: expected ${expected}, got ${actual}`)
  console.log(`ok  ${name}: ${actual}`)
}

// Mars24 reference epoch: 2000-01-06T00:00:00Z is MSD ≈ 44795.9998 (Allison & McEwen 2000).
const epoch = Date.UTC(2000, 0, 6)
expectClose('MSD at 2000-01-06T00:00Z', marsSolDate(epoch), 44795.9998, 1e-4)

// Hand-computed with the brief's formulas for 2026-11-14T12:00:00Z.
const sample = Date.UTC(2026, 10, 14, 12, 0, 0)
expectClose('MSD at 2026-11-14T12:00Z', marsSolDate(sample), 54343.0397392, 1e-6)
expectClose('MTC at 2026-11-14T12:00Z (h)', coordinatedMarsTime(sample), 0.9537412, 1e-5)
expectClose('LMST Jezero at 2026-11-14T12:00Z (h)', localMeanSolarTime(sample, JEZERO_EAST_LONGITUDE), 6.1257412, 1e-5)
expectEqual('LMST Jezero clock at 2026-11-14T12:00Z', formatMarsClock(localMeanSolarTime(sample, JEZERO_EAST_LONGITUDE)), '06:07')

// Range and longitude offset over many sols.
for (let ms = epoch; ms < epoch + 1000 * 86_400_000; ms += 3_217_000) {
  const mtc = coordinatedMarsTime(ms)
  const lmst = localMeanSolarTime(ms, JEZERO_EAST_LONGITUDE)
  if (!(lmst >= 0 && lmst < 24 && mtc >= 0 && mtc < 24)) throw new Error(`out of range at ${ms}: ${mtc}, ${lmst}`)
  const offset = ((lmst - mtc) % 24 + 24) % 24
  if (Math.abs(offset - JEZERO_EAST_LONGITUDE / 15) > 1e-9) throw new Error(`offset wrong at ${ms}: ${offset}`)
}
console.log('ok  LMST in [0, 24) and LMST − MTC = 77.58° / 15 over 1000 days')

// Formatting edges.
expectEqual('format 23.9999 h', formatMarsClock(23.9999), '23:59')
expectEqual('format 0 h', formatMarsClock(0), '00:00')
expectEqual('format 24 h', formatMarsClock(24), '00:00')
expectEqual('format 14.54 h', formatMarsClock(14.54), '14:32')

// For reference, not asserted: Perseverance's landing signal reached Earth at about 20:55 UTC on 2021-02-18.
const landing = Date.UTC(2021, 1, 18, 20, 55)
console.log(`info LMST at Jezero, 2021-02-18T20:55Z: ${formatMarsClock(localMeanSolarTime(landing, JEZERO_EAST_LONGITUDE))}`)
console.log(`info LMST at Jezero now (${new Date().toISOString()}): ${formatMarsClock(localMeanSolarTime(Date.now(), JEZERO_EAST_LONGITUDE))}`)
console.log('All Mars time checks passed.')
