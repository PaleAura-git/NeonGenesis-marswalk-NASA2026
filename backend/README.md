# Backend workspace

Owned by the backend developer: Python API, terrain processing, routing, and machine learning. No server or Python dependencies are implemented in this foundation.

Keep `data/raw/`, `data/processed/`, `figures/`, `scripts/`, `models/`, and `app/` here. Add your existing `scripts/inspect_dem.py`, `scripts/terrain_features.py`, `notes.md`, and `pyrightconfig.json` unchanged when ready. Real terrain datasets, models, and dependency declarations come from the backend developer.

Each developer creates their own environment; never copy or commit `venv/`.

Windows PowerShell:

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\Activate.ps1
# After the teammate supplies scripts and dependencies:
python scripts/inspect_dem.py
python scripts/terrain_features.py
```

macOS:

```sh
cd backend
python3 -m venv .venv
source .venv/bin/activate
# After the teammate supplies scripts and dependencies:
python scripts/inspect_dem.py
python scripts/terrain_features.py
```

Run scripts from `backend/` so relative data paths remain usable. Agree API fields and coordinate references against `../shared/api.md` before integration. The frontend dev proxy expects a future server at `127.0.0.1:8000`.
