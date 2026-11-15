"""Mission, routes and slope overlay in the frontend's shared/api.md format.

Positions are local ground metres: x east, y north, origin at the habitat (Three Forks).
Usage: python scripts/export_for_map.py <demo_grid.tif> <sites.csv> [speed_kmh=3.3] [max_slope_deg=15] [hours=6]
"""
import json
import math
import sys
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import rasterio
from matplotlib.path import Path as Polygon

from plan_routes import DEFAULT_HOURS, DEFAULT_MAX_SLOPE, MAX_SPEED_KMH, STOP_SECONDS, lonlat_to_map, load_context, plan

OUT = Path("exports")
DATASET_ID = "jezero-three-forks-hirise-v1"
FRAME_ID = "three-forks-local-v1"
MODE_NAMES = {"fastest": "time-focused", "safest": "conservative"}
OBJECTIVES = {
    "cape-nukshak": "Delta-front basal layers: how river sediment entered the lake.",
    "hawksbill-gap": "Exposed delta stack and the way up the scarp: layering, contacts, sample targets.",
    "kodiak-butte": "Isolated delta remnant viewed from its foot: inclined layers record lake-level changes.",
}


class Frame:
    """Converts between map metres / grid cells and local ground metres around the habitat."""

    def __init__(self, ctx):
        self.ctx = ctx
        habitat = next(s for s in ctx.sites if s["id"] == ctx.base)
        self.ox, self.oy = lonlat_to_map(float(habitat["lon_deg"]), float(habitat["lat_deg"]))

    def local(self, x, y):
        return {"xMeters": round((x - self.ox) * self.ctx.x_scale, 1), "yMeters": round(y - self.oy, 1)}

    def cell(self, row, col):
        return self.local(*rasterio.transform.xy(self.ctx.transform, row, col))

    def ring(self, ring):
        return [self.local(*(self.ctx.transform * (c + 0.5, r + 0.5))) for r, c in ring]

    def site(self, s):
        return self.local(*lonlat_to_map(float(s["lon_deg"]), float(s["lat_deg"])))

    def bounds(self):
        rows, cols = self.ctx.bands["slope_mean_deg"].shape
        left, top = self.ctx.transform * (0, 0)
        right, bottom = self.ctx.transform * (cols, rows)
        return {"min": self.local(left, bottom), "max": self.local(right, top)}

    def polygon_mask(self, vertices):
        """Cells whose centre lies inside a polygon given as [{xMeters, yMeters}, ...]."""
        rows, cols = self.ctx.bands["slope_mean_deg"].shape
        r, c = np.mgrid[0:rows, 0:cols]
        x, y = rasterio.transform.xy(self.ctx.transform, r.ravel(), c.ravel())
        lx = (np.asarray(x) - self.ox) * self.ctx.x_scale
        ly = np.asarray(y) - self.oy
        poly = Polygon([(v["xMeters"], v["yMeters"]) for v in vertices])
        return poly.contains_points(np.column_stack([lx, ly])).reshape(rows, cols)


def mission_json(ctx, frame):
    habitat = next(s for s in ctx.sites if s["id"] == ctx.base)
    bounds = frame.bounds()
    return {
        "schemaVersion": "1.1",
        "datasetId": DATASET_ID,
        "dataMode": "real",
        "notice": "Terrain from NASA MRO HiRISE (1 m, averaged to 10 m cells). Positions from NASA's "
                  "Perseverance position file, except Kodiak (team-read, to be re-checked in Mars Trek).",
        "coordinateSystem": {
            "id": FRAME_ID,
            "kind": "local-cartesian",
            "units": "metres",
            "axes": {"x": "east", "y": "north"},
            "origin": "Three Forks sample depot (18.4529 N, 77.4083 E) at (0, 0); "
                      "Mars equirectangular, R = 3,396,190 m, east-west corrected to ground metres.",
        },
        "geographicReference": {
            "latitudeDegrees": float(habitat["lat_deg"]),
            "longitudeDegrees": float(habitat["lon_deg"]),
            "status": "verified",
            "notice": habitat["position_source"],
        },
        "base": {"id": habitat["id"], "name": habitat["name"], "position": frame.site(habitat)},
        "bounds": bounds,
        "stops": [{
            "id": s["id"],
            "name": s["name"],
            "position": frame.site(s),
            "observationObjective": OBJECTIVES[s["id"]],
            "observationDurationSeconds": STOP_SECONDS[s["id"]],
        } for s in ctx.sites if s["id"] in ctx.stops],
        "layers": [*([{
            "id": "hirise-optical",
            "kind": "imagery",
            "url": "/data/optical.png",
            "bounds": bounds,
            "coordinateSystemId": FRAME_ID,
            "attribution": "NASA/JPL/University of Arizona, MRO HiRISE orthomosaic (25 cm, shown at 2 m) "
                           "via USGS Astrogeology",
            "illustrative": False,
        }] if (OUT / "optical.png").exists() else []), {
            "id": "slope-10m",
            "kind": "slope",
            "url": "/data/slope.png",
            "bounds": bounds,
            "coordinateSystemId": FRAME_ID,
            "attribution": "NASA/JPL/University of Arizona, MRO HiRISE DTM via USGS Astrogeology; "
                           "slope 0-30 degrees, 10 m cells",
            "illustrative": False,
        }, *([{
            "id": "terrain-10m",
            "kind": "terrain-classification",
            "url": "/data/terrain.png",
            "bounds": bounds,
            "coordinateSystemId": FRAME_ID,
            "attribution": "Random forest on HiRISE slope, roughness, brightness and texture + THEMIS night "
                           "IR; sand (yellow), bedrock (grey), rough (rust), steep (purple, measured "
                           "slope > 15 degrees); opacity = confidence",
            "illustrative": False,
        }] if ctx.terrain is not None and (OUT / "terrain.png").exists() else []), {
            "id": "themis-night-ir",
            "kind": "thermal",
            "url": "/data/thermal.png",
            "bounds": bounds,
            "coordinateSystemId": FRAME_ID,
            "attribution": "NASA Mars Odyssey THEMIS Night IR Controlled Mosaic v2 (USGS Astrogeology), 100 m. "
                           "Relative night-time warmth: brighter = stays warm (rockier), darker = cools fast (sandier)",
            "illustrative": False,
        }],
        "validation": {name: json.loads((OUT / f"{file}.json").read_text())
                       for name, file in (("classifier", "classifier_metrics"), ("routes", "route_validation"))
                       if (OUT / f"{file}.json").exists()},
        "sources": [{"layer": k, **v} for k, v in ctx.sources.get("layers", {}).items()],
    }


def route_json(ctx, frame, mode, r, result):
    if "error" in r:
        return {"id": f"{mode}-1", "mode": MODE_NAMES[mode], "status": "infeasible",
                "geometry": [], "visitingOrder": [], "excludedStops": [], "explanations": [r["error"]]}
    path, safety = r["path_rc"], r["safety"]
    names = {s["id"]: s["name"] for s in ctx.sites}
    back_from = max((int(i) for i in r["stop_index"]), default=0)
    ret_m = sum(ctx.cell_m * math.hypot(b[0] - a[0], (b[1] - a[1]) * ctx.x_scale)
                for a, b in zip(path[back_from:], path[back_from + 1:]))
    reserve = safety["reserve_s"]
    margin = safety["worst_margin_s"][safety["limiting_resource"]]
    when = {k: "at the start" if k == "start" else f"after {names[r['stop_index'][k.split('_')[1]]]}"
            for k in safety["boundaries"]}
    if safety["feasible"]:
        verdict = (f"Safe return possible at every point; {safety['limiting_resource']} is the limiting resource "
                   f"with {margin / 60:.0f} min to spare beyond the {reserve / 60:.0f} min reserve.")
    else:
        verdict = (f"No safe return: {safety['limiting_resource']} runs short by {-margin / 60:.0f} min "
                   f"part-way through. Drop a stop or extend the budget; the reserve is never relaxed.")
    limit, steepest = result["max_slope_deg"], r["steepest_section_deg"]
    access, moved = [], []
    for sid, a in r["access"].items():
        access.append({"id": sid, "reached": a["reached"], "reason": a["reason"],
                       "viewingPoint": frame.cell(*r["approach_rc"][sid]), "distanceMeters": round(a["moved_m"]),
                       "groundSlopeDegrees": round(a["ground_slope_deg"], 1)})
        if not a["reached"]:
            moved.append(f"{names[sid]} is not safely reachable: {a['reason']}. "
                         f"Viewed from the nearest safe point, {a['moved_m']:.0f} m away.")
    warning = (f"Passes sections up to {steepest:.1f}°, steeper than the {limit:g}° limit. "
               f"Time-focused checks each 10 m cell's average slope; Conservative avoids these sections."
               if steepest > limit else None)
    rule = ("each 10 m cell's average slope" if mode == "fastest"
            else "the steepest part of each 10 m cell (its steepest 10%)")
    return {
        "id": f"{mode}-1",
        "mode": MODE_NAMES[mode],
        "status": "feasible" if safety["feasible"] else "infeasible",
        "geometry": [frame.cell(rw, cl) for rw, cl in path],
        "visitingOrder": r["order"][1:-1],
        "excludedStops": [{"id": k, "reason": v} for k, v in r["excluded"].items()],
        "distanceMeters": round(r["distance_m"]),
        "returnDistanceMeters": round(ret_m),
        "walkingTimeSeconds": round(r["walk_s"]),
        "returnWalkingTimeSeconds": round(r["walk_s"] * ret_m / r["distance_m"]),
        "observationTimeSeconds": r["stop_s"],
        "restTimeSeconds": r["rest_s"],
        "restSpots": [{"position": frame.cell(*s["rc"]), "durationSeconds": s["seconds"],
                       "slopeDegrees": round(s["slope_deg"], 1), "roughnessDegrees": round(s["roughness_deg"], 1)}
                      for s in r["rest_spots"]],
        "reserveSeconds": round(reserve),
        "reserveMarginSeconds": round(margin),
        "energyWh": round(r["energy_wh"]),
        "oxygenKg": round(r["oxygen_kg"], 2),
        "slopeLimitDegrees": limit,
        "steepestSectionDegrees": round(steepest, 1),
        "slopeWarning": warning,
        "stopAccess": access,
        "limitingResource": safety["limiting_resource"],
        "spareSeconds": {k: round(v) for k, v in safety["worst_margin_s"].items()},
        "returnBoundary": frame.ring(safety["boundaries"]["start"]),
        "returnBoundaryCheckpoints": [{"when": when[k], "polygon": frame.ring(v)}
                                      for k, v in safety["boundaries"].items()],
        "explanations": [
            verdict,
            *([warning] if warning else []),
            *moved,
            f"Speed {result['speed_kmh']:g} km/h. Slope limit {limit:g}° applied to {rule}.",
            *(f"{names[k]} excluded: {v}." for k, v in r["excluded"].items()),
        ],
    }


def plan_json(ctx, frame, result):
    return {"schemaVersion": "1.0", "datasetId": DATASET_ID, "coordinateSystemId": FRAME_ID,
            "totalDurationSeconds": result["budget_s"],
            "routes": [route_json(ctx, frame, mode, r, result) for mode, r in result["routes"].items()]}


def save_thermal_png(ctx, path):
    thermal = ctx.bands["thermal"]
    lo, hi = np.nanpercentile(thermal, [2, 98])
    rgba = plt.get_cmap("inferno")(np.clip((np.nan_to_num(thermal, nan=lo) - lo) / (hi - lo), 0, 1))
    rgba[..., 3] = np.where(np.isfinite(thermal), 0.8, 0)
    plt.imsave(path, rgba)


def save_slope_png(ctx, path):
    slope = ctx.bands["slope_mean_deg"]
    rgba = plt.get_cmap("magma")(np.clip(np.nan_to_num(slope) / 30, 0, 1))
    rgba[..., 3] = np.where(np.isfinite(slope), 0.75, 0)
    plt.imsave(path, rgba)


if __name__ == "__main__":
    ctx = load_context(sys.argv[1], sys.argv[2])
    speed_kmh = float(sys.argv[3]) if len(sys.argv) > 3 else MAX_SPEED_KMH
    max_slope = float(sys.argv[4]) if len(sys.argv) > 4 else DEFAULT_MAX_SLOPE
    budget_s = (float(sys.argv[5]) if len(sys.argv) > 5 else DEFAULT_HOURS) * 3600
    frame = Frame(ctx)

    OUT.mkdir(exist_ok=True)
    mission = mission_json(ctx, frame)
    plan_out = plan_json(ctx, frame, plan(ctx, speed_kmh, max_slope, budget_s))
    (OUT / "mission.json").write_text(json.dumps(mission, indent=2))
    (OUT / "plan.json").write_text(json.dumps(plan_out, indent=2))
    save_slope_png(ctx, OUT / "slope.png")
    save_thermal_png(ctx, OUT / "thermal.png")

    print("Local frame: origin = Three Forks, x east, y north (ground metres)")
    for loc in [mission["base"], *mission["stops"]]:
        p = loc["position"]
        print(f"  {loc['id']:<18} x {p['xMeters']:>8.1f}  y {p['yMeters']:>8.1f}  "
              f"({math.hypot(p['xMeters'], p['yMeters']):.0f} m from base)")
    for r in plan_out["routes"]:
        print(f"{r['mode']:<13} {r['status']:<10} {r.get('distanceMeters', '-')} m, "
              f"spare {r.get('reserveMarginSeconds', 0) / 60:.0f} min ({r.get('limitingResource', '-')})")
    for name in ("mission.json", "plan.json", "slope.png"):
        print(f"Saved {OUT / name} ({(OUT / name).stat().st_size / 1024:.0f} KB)")
