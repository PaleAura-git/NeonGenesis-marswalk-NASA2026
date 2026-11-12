# Marswalk API — draft integration contract

This foundation implements only the frontend mission client. Neither endpoint exists here. Schema 1.0 supports synthetic local coordinates with empty resources; agree a versioned extension before adding real data, map layers, sources, or geographic coordinates.

## GET /api/mission

Return JSON matching `examples/mission.json` and `frontend/src/types/mission.ts`: `schemaVersion`, stable `datasetId`, `dataMode`, `notice`, `coordinateSystem`, separate `unverifiedGeographicReference`, `base`, `stops`, `layers`, and `sources`. Stop IDs must be unique across the base and stops. Observation durations must be finite and nonnegative. Malformed responses and non-2xx status codes produce a visible retryable error. API failures never fall back to mock data.

The sample positions are synthetic `xMeters`/`yMeters` pairs, not geographic measurements. The provided 18.4446° N, 77.4509° E reference is an unverified placeholder, not the coordinate origin or a transform. The production coordinate frame, longitude convention, datum, imagery registration, and vertical reference require backend agreement.

## POST /api/plan — future draft

Proposed request:

| Field | Meaning |
| --- | --- |
| `schemaVersion`, `datasetId`, `coordinateSystemId` | Contract and dataset/frame identification |
| `selectedStopIds` | Stable IDs to consider |
| `priorities` | Stop-ID to priority mapping; scale and semantics TBD |
| `observationDurationsSeconds` | Stop-ID to nonnegative duration mapping |
| `walkingSpeedMetersPerSecond` | Positive walking speed |
| `totalMissionTimeSeconds` | Total budget, including reserve |
| `elapsedTimeSeconds` | Already spent mission time |
| `reserveSeconds` | Reserve contained within the total budget |
| `currentPosition` | `{ xMeters, yMeters }` in the declared frame |
| `completedStopIds` | Finished observations; not to repeat |
| `blockedAreas` | Stable area IDs and polygon vertices in the same frame; polygon semantics TBD |
| `requestedRouteModes` | Modes to calculate; supported names TBD |

Proposed response envelope: `schemaVersion`, `datasetId`, `coordinateSystemId`, and `routes`. Each route includes:

- `id`, `mode`, and `status` (`feasible` or `infeasible`). Infeasible is a valid planning outcome, not a transport error.
- `geometry`: ordered `{ xMeters, yMeters }` route vertices, including return to base.
- `visitingOrder`: stable stop IDs.
- `excludedStops`: stop IDs and reasons.
- `distanceMeters`, `returnDistanceMeters`, and optionally segment distances.
- `walkingTimeSeconds`: all remaining walking, including return; `returnWalkingTimeSeconds` for its return component.
- `remainingObservationTimeSeconds`: available observation time after elapsed time, remaining walking, and reserve.
- `reserveMarginSeconds`: proposed slack after elapsed time, remaining walking, scheduled observations, and reserve. Negative values indicate a budget shortfall; agree final semantics before implementation.
- `explanations`: reasons for selections, exclusions, and infeasibility.
- Optional `returnBoundary`: reachable-return polygon in the declared frame, with budget assumptions; omission means unavailable, never unlimited range.

## Conventions

Durations are seconds, distances metres, speed metres per second, and slope degrees. Use stable dataset and stop IDs. Map layers and routes must share a declared coordinate system. Backend-calculated travel times and distances are authoritative; the frontend must not substitute straight-line estimates. Reserve is included within the total mission budget, not added on top. Elevation samples and their vertical reference will be supplied with route data in a later step. Planner validation, error envelope, mode definitions, and budget formulas remain drafts to align with the backend developer.
