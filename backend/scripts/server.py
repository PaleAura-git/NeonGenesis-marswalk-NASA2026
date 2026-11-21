"""Planner API for the frontend (shared/api.md): GET /api/mission, POST /api/plan.

Usage: python scripts/server.py [demo_grid.tif] [sites.csv] [port=8000]
Without a grid argument it uses data/processed/ if `make all` has run, else the bundled snapshot in data/demo/.
"""
import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from export_for_map import OUT, Frame, mission_json, plan_json, route_json
from plan_routes import STOP_SECONDS, load_context, plan
from rehearse import rehearse
from walk_cost import MAX_SPEED_KMH, SLOPE_LIMIT_CAP

BUILT_GRID = Path("data/processed/demo_grid.tif")
GRID = sys.argv[1] if len(sys.argv) > 1 else str(BUILT_GRID if BUILT_GRID.exists() else Path("data/demo/demo_grid.tif"))
SITES = sys.argv[2] if len(sys.argv) > 2 else "sites.csv"
PORT = int(sys.argv[3]) if len(sys.argv) > 3 else 8000

CTX = load_context(GRID, SITES)
FRAME = Frame(CTX)
MISSION = mission_json(CTX, FRAME)


class BadRequest(ValueError):
    pass


def number(body, key, low, high):
    v = body.get(key)
    if not isinstance(v, (int, float)) or not low <= v <= high:
        raise BadRequest(f"{key} must be a number between {low:g} and {high:.3g}")
    return float(v)


def handle_plan(body):
    speed_kmh = min(number(body, "walkingSpeedMetersPerSecond", 0.01, MAX_SPEED_KMH / 3.6 + 1e-6) * 3.6, MAX_SPEED_KMH)
    max_slope = number(body, "maxSlopeDegrees", 0.1, SLOPE_LIMIT_CAP)
    total_s = number(body, "totalDurationSeconds", 60, 24 * 3600)
    elapsed_s = number(body, "elapsedSeconds", 0, total_s) if "elapsedSeconds" in body else 0.0
    reserve_s = number(body, "reserveSeconds", 0, total_s) if "reserveSeconds" in body else 0.0

    included = body.get("includedStops")
    if not isinstance(included, list) or not included:
        raise BadRequest("includedStops must be a non-empty list")
    stop_seconds = {}
    for s in included:
        if not isinstance(s, dict) or s.get("id") not in STOP_SECONDS:
            raise BadRequest(f"unknown stop in includedStops: {s!r}")
        stop_seconds[s["id"]] = number(s, "observationSeconds", 0, total_s)

    polygons = []
    for area in body.get("blockedAreas") or []:
        vertices = area.get("vertices") if isinstance(area, dict) else None
        if not isinstance(vertices, list) or len(vertices) < 3:
            raise BadRequest("each blocked area needs at least 3 vertices")
        polygons.append(vertices)

    budget_s = total_s - elapsed_s
    if polygons:
        before, after, changes, _ = rehearse(CTX, FRAME, polygons, speed_kmh, max_slope, budget_s,
                                             stop_seconds, reserve_s)
        out = plan_json(CTX, FRAME, after)
        for route, mode in zip(out["routes"], after["routes"]):
            route["rehearsal"] = changes[mode]
        return out
    return plan_json(CTX, FRAME, plan(CTX, speed_kmh, max_slope, budget_s, stop_seconds, None, reserve_s))


class Handler(BaseHTTPRequestHandler):
    def send(self, status, payload, content_type="application/json"):
        data = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(data)

    def do_OPTIONS(self):
        self.send(204, b"", "text/plain")

    def do_GET(self):
        if self.path == "/api/mission":
            self.send(200, MISSION)
        elif self.path in ("/data/slope.png", "/data/optical.png", "/data/terrain.png", "/data/thermal.png") \
                and (OUT / self.path.split("/")[-1]).exists():
            self.send(200, (OUT / self.path.split("/")[-1]).read_bytes(), "image/png")
        else:
            self.send(404, {"error": "not found"})

    def do_POST(self):
        if self.path != "/api/plan":
            return self.send(404, {"error": "not found"})
        try:
            body = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
            if not isinstance(body, dict):
                raise BadRequest("request body must be a JSON object")
            self.send(200, handle_plan(body))
        except (BadRequest, json.JSONDecodeError) as e:
            self.send(400, {"error": str(e)})


if __name__ == "__main__":
    print(f"Planner API on http://127.0.0.1:{PORT}  (grid {GRID}, sites {SITES})")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
