# Marswalk API — draft integration contract

This foundation implements the frontend mission client and synthetic local map. Neither endpoint exists here. Schema 1.1 adds dataset bounds and registered image-overlay metadata. Schema 1.0 responses with empty resources remain supported, with map bounds derived from their location positions.

## GET /api/mission

Return JSON matching `examples/mission.json` and `frontend/src/types/mission.ts`: `schemaVersion`, stable `datasetId`, `dataMode`, `notice`, `coordinateSystem`, separate `unverifiedGeographicReference`, `base`, `stops`, `layers`, and `sources`. Stop IDs must be unique across the base and stops. Observation durations must be finite and nonnegative. Malformed responses and non-2xx status codes produce a visible retryable error. API failures never fall back to mock data.

Schema 1.1 requires `bounds` with `min` and `max` positions, each `{ xMeters, yMeters }`. Extents must be finite, increasing on both axes, and contain all locations. App positions convert to Leaflet `[yMeters, xMeters]` in `CRS.Simple`, with positive x east and positive y north. Bounds are dataset metadata, independent of the unverified geographic reference.

`layers` may contain image overlays with unique `id`, `kind` (`imagery`, `slope`, or `terrain-classification`), `url` (root-relative or HTTP/S), `bounds`, matching `coordinateSystemId`, plain-text `attribution`, and boolean `illustrative`. Only imagery may be illustrative. A synthetic illustration must declare its local extent and attribution and is labeled Illustrative terrain. The current fixture has no imagery or scientific layers. Source arrays remain empty until their contract is agreed. Layer checkboxes become usable only when registered assets exist. Failed images show a visible error while markers and the grid remain usable.

### Backend handoff for real map data

Supply a stable dataset ID and a declared coordinate frame, verified base and observation positions, image or tile assets and coordinate bounds, spatial resolution, attribution/licence, and missing-data coverage or masks. Source rasters in another frame require an explicit transform or reprojection, including axis order, units, projection/datum and registration details. For raster image overlays, images must be north-up and registered to their declared rectangular bounds. Raster pixels, local metres, and geographic degrees require a verified relationship. Tiles and nonlocal projections need an agreed extension to the current image-overlay contract. Scientific layers also require units, a legend, interpretation, and missing-data semantics before scientific use. The current synthetic-only validator must be extended alongside types and backend fields when real data arrives.

The sample positions are synthetic `xMeters`/`yMeters` pairs, not geographic measurements. The provided 18.4446° N, 77.4509° E reference is an unverified placeholder, not the coordinate origin or a transform. The production coordinate frame, longitude convention, datum, imagery registration, and vertical reference require backend agreement.

## POST /api/plan — future draft

The frontend now builds a validated initial request for Review mission. No planning endpoint or mock adapter is implemented yet. The request schema version is independent of the mission-data schema version. This draft uses the following fields consistently with `frontend/src/types/planning.ts` and `features/mission/settings.ts`.

| Field | Meaning |
| --- | --- |
| `schemaVersion` | Initial planning request version `1.0` |
| `requestId` | UUID created by Review mission, retained while reviewing the current editable draft |
| `datasetId`, `coordinateSystemId` | Stable dataset and declared frame identification from the mission |
| `baseId` | Mission base ID |
| `includedStops` | Array of `{ id, priority, observationSeconds }`, preserving fixture IDs. Low=1, Medium=2, High=3 |
| `walkingSpeedMetersPerSecond` | Positive walking speed |
| `totalDurationSeconds` | Total budget, including reserve |
| `elapsedSeconds` | Already spent mission time, initially zero |
| `reserveSeconds` | Reserve contained within the total budget |
| `maxSlopeDegrees` | Greater than zero and less than 90, initially a provisional simulation assumption of 15 degrees |
| `currentPosition` | Copy of the configured base's `{ xMeters, yMeters }` for this initial flow |
| `completedStopIds` | Initially empty, finished observations in future replans |
| `blockedAreas` | Initially empty. Future `{ id, vertices: Position[] }` polygons in the declared frame, polygon semantics TBD |
| `requestedRouteModes` | Both `time-focused` and `conservative`, displayed as Time-focused and Conservative |

### Agreed route modes

- **Time-focused** (`time-focused`) minimizes estimated walking time using the planner's terrain costs.
- **Conservative** (`conservative`) assigns greater penalties to steep or uncertain terrain.
- Both modes respect mission duration, observation time, return requirements, reserve, and hard terrain constraints.
- Science priorities influence which feasible combinations of stops are preferred in both modes. Included-stop numeric priorities retain their Low=1, Medium=2, High=3 mapping.

The backend developer will define and implement the exact route-cost formulas, including terrain penalties and uncertainty handling. The frontend sends the agreed mode identifiers and displays backend-calculated results when the planning service is integrated.

This replaces earlier draft fields `totalMissionTimeSeconds` and `elapsedTimeSeconds` with `totalDurationSeconds` and `elapsedSeconds`. Earlier parallel `selectedStopIds`, `priorities`, and `observationDurationsSeconds` are consolidated into `includedStops`. Backend integration must adopt these names or introduce an explicit adapter. There are no existing planner callers to migrate in this repository.

The shared settings state stores editable strings in hours/minutes, metres per second, and degrees. Validation runs on blur and Review mission, preserving empty fields during edits. Conversion to finite seconds occurs in the request builder. Duration must be positive, reserve nonnegative and below duration, speed positive, all observation durations nonnegative, slope strictly between 0 and 90, and at least one science stop included. Maximum slope and priorities are simulation inputs. All stops initially have Medium priority and are included. Observation values initialize from fixture seconds. Initial defaults are 3 hours (10,800 seconds), 30 minutes reserve (1,800 seconds), and 0.6 m/s. The review has 150 minutes after reserve, which must still cover walking, return, and observations. Observations exceeding that budget produce a nonblocking warning. Backend feasibility and exclusion decisions remain authoritative.

Inspecting a location only changes the selected details/marker state. Inclusion, priorities, and observation edits share a separate mission-settings state across the setup panel and science card. Excluded stops remain inspectable. The request builder validates again before returning the typed request. Review summaries are derived from the current valid draft and become unavailable while it contains invalid edits. Review does not call a service or produce route geometry or feasibility results.

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

Durations are seconds, distances metres, speed metres per second, and slope degrees. Use stable dataset and stop IDs. Map layers and routes must share a declared coordinate system. Backend-calculated travel times and distances are authoritative; the frontend must not substitute straight-line estimates. Reserve is included within the total mission budget, not added on top. Elevation samples and their vertical reference will be supplied with route data in a later step. Route-mode names and behavior are agreed above. Planner validation, error envelope, exact route-cost formulas, and budget formulas remain to align with the backend developer.
