# Marswalk

NASA Space Apps hackathon foundation: plan a science expedition in Jezero Crater, compare routes, then rehearse a blockage. Marswalk is a working title. This step contains a runnable frontend shell and a reserved backend workspace, not a routing or terrain engine.

## Setup

Use Node **22.12+ on the 22.x line, or 24+** and npm. Verified with Node 22.18.0 / npm 10.9.3; `frontend/.nvmrc` records the tested version. Vite's [Node requirements](https://vite.dev/guide/) were checked before installation. Use the checked-in `package-lock.json` with `npm ci` for reproducible installs.

Windows PowerShell, from this folder:

```powershell
cd frontend
npm ci
Copy-Item .env.example .env.local
npm run dev
```

macOS, from this folder:

```sh
cd frontend
npm ci
cp .env.example .env.local
npm run dev
```

Open the Local URL printed by Vite. Plan is the initial stage; Compare and Rehearse show their upcoming functionality.

The shared visual shell uses Barlow (Google Fonts, `display=swap`) with system sans-serif fallbacks. Leaflet 1.9.4 displays a synthetic local-metre grid and four labeled markers in `CRS.Simple`. No terrain image was present locally; the supplied screenshot is a design reference only. Side panels use native, keyboard-accessible disclosures, including on tablets. Narrow screens stack the map and panels. Select a stop in the map or list to review its fixture objective and duration in minutes. Select the home marker or base name for provisional base details. Clear selection with the labeled close button. Compare and Rehearse require future calculated planning state and currently offer return-to-Plan actions. Disabled planning actions explain their prerequisites.

Pan with mouse, touch, or focused-map arrow keys. Zoom with the controls, wheel, pinch gesture, or plus/minus keys. Reset view fits the dataset bounds around floating panels. Marker Enter or Space selects a location. Layer checkboxes are disabled with explanations until corresponding assets and local bounds exist. Image failures retain usable grid/markers and show an error. Dataset bounds and markers come from the shared fixture. The map persists across stage changes, observes container/panel resizing, and cleans up Leaflet and observers on unmount. Route cards, mission budget calculations, elevation samples, and playback remain dependent on the backend contract. See `shared/api.md` for imagery registration and backend handoff requirements.

See `frontend/DEPENDENCY_REVIEW.md` for the audit review. Manual browser verification: check all stages and return actions; select/clear each stop; collapse/reopen panels with keyboard; check visible focus and no horizontal overflow at 390px, 900px, and desktop widths. Throttle the network to inspect loading; temporarily select API mode without a backend to check the visible error and retry, then restore mock mode. Check the browser console for errors. Barlow failure should retain readable fallback text.

```sh
npm run typecheck
npm run lint
npm run build
npm run preview
```

## Data modes

Set `VITE_DATA_MODE=mock` in `frontend/.env.local` to load the single `shared/examples/mission.json` fixture. It is dynamically imported and bundled for production; TypeScript includes the JSON and Vite permits the parent workspace for development. No duplicate fixture is maintained. Copying `.env.example` explicitly selects mock mode. Missing or unsupported mode is a visible configuration error.

Set `VITE_DATA_MODE=api` and `VITE_API_BASE_URL=/api` to call `GET /api/mission`. The development proxy forwards `/api` to `http://127.0.0.1:8000`. Run your teammate's server there when available, or change `vite.config.ts`. For deployed builds, provide a same-origin `/api` reverse proxy or a public API URL with appropriate CORS. Vite's development proxy is not included in production or preview. Restart Vite after changing environment values; rebuild production assets for changes to take effect. Frontend environment values are public and must contain no secrets.

HTTP, network, invalid JSON, and schema failures show an error with Try again; API mode never silently substitutes demo data. The current contract accepts synthetic schemas 1.0 and 1.1. Version 1.1 adds explicit map bounds and image-overlay metadata. Legacy 1.0 responses derive bounds from positions. Extend the validator and shared types together when real resources arrive.

## Ownership and structure

```text
frontend/                 Frontend owner: React, TypeScript, Vite, plain CSS
  public/images/          Future terrain imagery
  src/
    app/                  State and application shell
    components/layout/    Stage navigation
    components/ui/        Shared error UI
    features/             map, mission, science, routes, rehearsal
    services/api/         Native fetch client and runtime validation
    types/                Shared frontend mission types
    styles/               Design tokens and responsive CSS
backend/                  Backend owner: Python API, terrain, routing, ML
  app/ data/raw/ data/processed/ figures/ scripts/ models/
shared/                   Joint ownership: align API fields before integration
  api.md                  Draft mission/planning endpoint contract
  examples/mission.json   Single synthetic sample data source
```

Backend scripts, dependency declarations, real terrain files, and models will come from the backend developer. See `backend/README.md` for per-developer environments and running scripts from `backend/`. Raw/processed datasets, local environments, and common model binaries are ignored; small shared fixtures remain eligible for version control.

All positions and observation durations are synthetic UI examples. The user-provided 18.4446° N, 77.4509° E base reference is an **unverified placeholder**. Exact placement, the production coordinate frame, and imagery mapping remain pending. Route computation, time calculations, elevation charts, and rehearsal simulation remain planned features.

Map verification checklist at desktop, tablet, and 390px widths

- Confirm four named markers and north-positive coordinate orientation.
- Select each marker and each list item, including reselection after panning away. Check marker highlight, matching list state, base status, and opening of a collapsed details panel.
- Clear selection and check the ring disappears. Check marker Enter/Space, map arrow keys, zoom buttons, wheel, touch/pinch, and Reset view.
- Collapse/reopen panels and resize. Selected markers should stay within the uncovered area. Switch stages repeatedly and confirm viewport preservation and a single map instance.
- Check unavailable layer explanations and the console. When registered imagery becomes available, check the overlay bounds, attribution, and visible failure handling by using a broken asset URL.
