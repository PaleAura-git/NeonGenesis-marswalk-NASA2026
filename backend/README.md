# Backend: Marswalk data pipeline and planner

Turns NASA data for the base of the western delta in Jezero Crater into a 10 m terrain grid, plans safe
Marswalks from the Three Forks sample depot to three science stops, and serves them to the frontend.

## Setup

Python 3.12–3.14 (on macOS, use python.org's Python: Homebrew's has a broken `pyexpat` on macOS 26).

```sh
cd backend
python3 -m venv venv                               # Windows: py -m venv venv
venv/bin/python -m pip install -r requirements.txt  # Windows: venv\Scripts\python -m pip install -r requirements.txt
```

## Quick start: planner API only

```sh
venv/bin/python scripts/server.py                   # Windows: venv\Scripts\python scripts\server.py
```

This needs no downloads. The server uses `data/processed/` if `make all` has run, otherwise the bundled snapshot in
`data/demo/` (the 10 m grid and terrain classes from the same build, 5 MB). Then run the app with
`npm run dev:api` in `frontend/`.

## Full rebuild (macOS/Linux, needs `make` and `curl`)

```sh
make download   # once, needs internet: ~3.3 GB of NASA data into data/raw/
make all        # rebuild everything from data/raw/ (offline, ~30 s)
make serve      # planner API on http://127.0.0.1:8000
```

`make all` was tested from an empty `data/processed/` with the network blocked; it reproduces the committed
`exports/` byte for byte. If the HiRISE DTM is elsewhere: `make all DTM=/path/to/JEZ_hirise_..._blend40.tif`.

| Step | Script | Output |
|---|---|---|
| Terrain grid | `build_grid.py` | `data/processed/demo_grid.tif`: 400 × 400 cells of 10 m (elevation, slope mean and p90, roughness, thermal, valid fraction) + feature table + sources |
| Optical layer | `make_ortho.py` | `data/processed/ortho_25cm.tif`, `exports/optical.png` |
| Terrain classes | `train_classifier.py` | `data/processed/terrain.tif` (class + confidence), `exports/terrain.png`, `exports/classifier_metrics.json` |
| Routes | `plan_routes.py` | `data/processed/routes.json`, `figures/routes.png` |
| Map exports | `export_for_map.py` | `exports/mission.json`, `exports/plan.json`, `exports/slope.png` |
| Validation | `validate_routes.py` | Comparison with Perseverance's track, `figures/validation.png` |
| Rehearsal | `rehearse.py` | Block a passage, replan, explain what changed |
| API | `server.py` | `GET /api/mission`, `POST /api/plan`, `GET /data/*.png` |

Helpers: `file_info.py` (raster metadata, safe for huge files), `overview.py`, `mark_sites.py`, `walk_cost.py`,
`resources.py` (return boundary and limiting resource), `fetch_themis.py`, `label_tool.py`.
`exports/README.md` documents the JSON formats and the API for the frontend.

## Data (all NASA missions; files from USGS Astrogeology)

| Layer | Source | Resolution |
|---|---|---|
| Elevation | MRO HiRISE DTM `JEZ_hirise_soc_006` | 1 m |
| Optical | MRO HiRISE orthomosaic `JEZ_hirise_soc_006`, demo box only (one byte range) | 25 cm |
| Thermal | Mars Odyssey THEMIS Night IR Controlled Mosaic v2 (relative proxy for thermal inertia) | 100 m |
| Sites | NASA Perseverance position file, via the team's research brief (`sites.csv`) | – |
| Validation | NASA Mars 2020 traverse (`M20_traverse.json`) | – |

The DTM projection uses standard parallel 0°, so at Jezero (18.45° N) east-west map metres are scaled by
cos 18.45° = 0.9486 to get ground metres (slope, routing and exports all apply this).

## Method in short

- **Walking cost:** slope sets speed (< 5° ×1.0, 5–10° ×0.8, 10–15° ×0.6, over the limit blocked; default limit 15°,
  up to 20°); terrain class slows sand ×0.85 and rough ×0.8. Power 352 W walking, 308 W at stops, 205 W resting.
- **Routes:** minimum-cost paths (`skimage.graph.MCP_Geometric`) between base and stops, all stop orders tried.
  Time-focused = fastest, blocking cells whose *average* slope is over the limit. Conservative also blocks any cell
  whose steepest part (steepest 10% of its 1 m slopes) is over the limit, and penalises roughness and low
  classifier confidence. Each route reports its steepest section and is flagged when that exceeds the limit.
- **Stops:** a stop counts as reached only if its own 10 m cell is walkable. Otherwise it is reported as not safely
  reachable, with the reason, and the route goes to the nearest safe viewing point (within 150 m).
- **Rest:** 5 min after every 30 min of walking, at the flattest, smoothest route cell nearby.
- **Safety:** at every route point, time, energy (2.8 kWh) and oxygen (8.6 kg) left must each cover the walk home
  at 422 W plus a reserve (30 min + 20% of walking, max 60 min). Otherwise the plan is reported as infeasible,
  naming the resource that runs short. The reserve is never relaxed.
- **Terrain classes:** random forest for surface material (sand / bedrock / rough) from slope, roughness, thermal,
  image brightness and texture; "steep" is measured (mean slope > 15°), not predicted.

## Results (default: 3.3 km/h, 15°, 6 h)

| Check | Result |
|---|---|
| Site positions vs research brief | 409 / 373 / 769 m from base, exact |
| HiRISE elevation vs rover's own elevation | median +0.01 m, 90% within ±0.5 m |
| Rover track on cells we call walkable | 99.1% (whole area: 93.7%) |
| Our route vs rover track, Three Forks ↔ Hawksbill Gap | median 22 m apart |
| Classifier, spatial cross-validation (1 km blocks) | 67% (always "sand": 53%) |
| Label agreement, two blind checks by team members | 74% and 57%, 68% combined (25/37) |
| Routes | Both 2.9 km and 185 min on different lines (up to 128 m apart); steepest section 19.3° (time-focused, flagged) vs 14.9° (conservative); time is the limiting resource (~130 min spare) |
| Stops at the 15° limit | Hawksbill Gap (17.6° at the stop) and Kodiak butte (35.6°) are not safely reachable; viewed from 9 m and 99 m away. At 20° the time-focused route reaches Hawksbill Gap with a 27.3° section |

## Assumptions and limits

- Slope-to-speed factors, terrain slowdowns, rest rule, oxygen proportional to energy, and energy/oxygen reserves
  are assumptions based on Apollo and suit-study figures; they are constants at the top of `walk_cost.py`,
  `plan_routes.py` and `resources.py`.
- Slope has no direction: uphill and downhill cost the same.
- Kodiak butte's position was read off a map by the team; it sits on the butte's flank, so it is a viewing stop from ~100 m away.
- "Steepest section" is the steepest 10% of a 10 m cell, not a single 1 m pixel, to avoid DEM artifacts.
- Training labels were made from HiRISE image patches with AI assistance and checked blind by two team members.
- THEMIS night IR is 8-bit relative brightness at 100 m: regional context, not a per-cell measurement.
