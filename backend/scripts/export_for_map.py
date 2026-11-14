"""Export the mission, routes and a slope overlay in the frontend's shared/api.md format.

Positions are local metres: x east, y north, origin at the habitat (Three Forks).
Usage: python scripts/export_for_map.py <demo_grid.tif> <sites.csv> <routes.json>
"""
import csv
import json
import math
import sys
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import rasterio

MARS_RADIUS_M = 3_396_190
OUT = Path("exports")
DATASET_ID = "jezero-three-forks-hirise-v1"
FRAME_ID = "three-forks-local-v1"
MODE_NAMES = {"fastest": "time-focused", "safest": "conservative"}
OBJECTIVES = {
    "cape-nukshak": "Delta-front basal layers: how river sediment entered the lake.",
    "hawksbill-gap": "Exposed delta stack and the way up the scarp: layering, contacts, sample targets.",
    "kodiak-butte": "Isolated delta remnant viewed from its foot: inclined layers record lake-level changes.",
}
STOP_SECONDS = {"cape-nukshak": 2400, "hawksbill-gap": 2400, "kodiak-butte": 1800}


def lonlat_to_map(lon, lat):
    return MARS_RADIUS_M * math.radians(lon), MARS_RADIUS_M * math.radians(lat)


grid_path, sites_path, routes_path = sys.argv[1], sys.argv[2], sys.argv[3]

with rasterio.open(grid_path) as src:
    slope = src.read(list(src.descriptions).index("slope_mean_deg") + 1)
    transform, gb = src.transform, src.bounds
    sources = json.loads(src.tags()["sources"])
    x_scale = float(src.tags()["x_ground_scale"])
with open(sites_path, newline="") as f:
    sites = list(csv.DictReader(f))
routes = json.load(open(routes_path))
total_s = routes["budget_s"]

habitat = next(s for s in sites if s["role"] == "habitat")
ox, oy = lonlat_to_map(float(habitat["lon_deg"]), float(habitat["lat_deg"]))


def local(x, y):
    return {"xMeters": round((x - ox) * x_scale, 1), "yMeters": round(y - oy, 1)}


def cell_local(row, col):
    x, y = rasterio.transform.xy(transform, row, col)
    return local(x, y)


def ring_local(ring):
    return [local(*(transform * (c + 0.5, r + 0.5))) for r, c in ring]


def site_local(s):
    return local(*lonlat_to_map(float(s["lon_deg"]), float(s["lat_deg"])))


bounds = {"min": local(gb.left, gb.bottom), "max": local(gb.right, gb.top)}
stops = [s for s in sites if s["role"] == "stop"]

OUT.mkdir(exist_ok=True)
rgba = plt.get_cmap("magma")(np.clip(np.nan_to_num(slope) / 30, 0, 1))
rgba[..., 3] = np.where(np.isfinite(slope), 0.75, 0)
plt.imsave(OUT / "slope.png", rgba)

mission = {
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
                  "Mars equirectangular, R = 3,396,190 m, standard parallel 0.",
    },
    "geographicReference": {
        "latitudeDegrees": float(habitat["lat_deg"]),
        "longitudeDegrees": float(habitat["lon_deg"]),
        "status": "verified",
        "notice": habitat["position_source"],
    },
    "base": {"id": habitat["id"], "name": habitat["name"], "position": site_local(habitat)},
    "bounds": bounds,
    "stops": [{
        "id": s["id"],
        "name": s["name"],
        "position": site_local(s),
        "observationObjective": OBJECTIVES[s["id"]],
        "observationDurationSeconds": STOP_SECONDS[s["id"]],
    } for s in stops],
    "layers": [{
        "id": "slope-10m",
        "kind": "slope",
        "url": "/data/slope.png",
        "bounds": bounds,
        "coordinateSystemId": FRAME_ID,
        "attribution": "NASA/JPL/University of Arizona, MRO HiRISE DTM via USGS Astrogeology; "
                       "slope 0-30 degrees, 10 m cells",
        "illustrative": False,
    }],
    "sources": [{"layer": k, **v} for k, v in sources["layers"].items()],
}

plan_routes = []
for mode, r in routes["routes"].items():
    path = r["path_rc"]
    approach = r["approach_rc"]
    safety = r["safety"]
    back_from = max(int(i) for i in r["stop_index"])
    ret_m = sum(10 * math.hypot(b[0] - a[0], (b[1] - a[1]) * x_scale) for a, b in zip(path[back_from:], path[back_from + 1:]))
    ret_s = r["walk_s"] * ret_m / r["distance_m"]
    reserve = safety["reserve_s"]
    margin = safety["worst_margin_s"][safety["limiting_resource"]]
    names = {str(i): next(st["name"] for st in stops if st["id"] == sid) for i, sid in r["stop_index"].items()}
    leave = {k: f"after {names[k.split('_')[1]]}" if k != "start" else "at the start"
             for k in safety["boundaries"]}
    if safety["feasible"]:
        verdict = (f"Safe return possible at every point; {safety['limiting_resource']} is the limiting resource "
                   f"with {margin / 60:.0f} min to spare beyond the {reserve / 60:.0f} min reserve.")
    else:
        verdict = (f"No safe return: {safety['limiting_resource']} runs short by {-margin / 60:.0f} min "
                   f"part-way through. Drop a stop or extend the budget; the reserve is never relaxed.")
    moved = []
    for s in stops:
        exact = site_local(s)
        near = cell_local(*approach[s["id"]])
        d = math.hypot(near["xMeters"] - exact["xMeters"], near["yMeters"] - exact["yMeters"])
        if d > 15:
            moved.append(f"{s['name']}: reached at the nearest walkable point, {d:.0f} m from the mapped position.")
    plan_routes.append({
        "id": f"{mode}-1",
        "mode": MODE_NAMES[mode],
        "status": "feasible" if safety["feasible"] else "infeasible",
        "geometry": [cell_local(rw, cl) for rw, cl in path],
        "visitingOrder": r["order"][1:-1],
        "excludedStops": [],
        "distanceMeters": round(r["distance_m"]),
        "returnDistanceMeters": round(ret_m),
        "walkingTimeSeconds": round(r["walk_s"]),
        "returnWalkingTimeSeconds": round(ret_s),
        "observationTimeSeconds": r["stop_s"],
        "reserveSeconds": round(reserve),
        "reserveMarginSeconds": round(margin),
        "energyWh": round(r["energy_wh"]),
        "oxygenKg": round(r["oxygen_kg"], 2),
        "limitingResource": safety["limiting_resource"],
        "spareSeconds": {k: round(v) for k, v in safety["worst_margin_s"].items()},
        "returnBoundary": ring_local(safety["boundaries"]["start"]),
        "returnBoundaryCheckpoints": [{"when": leave[k], "polygon": ring_local(v)}
                                      for k, v in safety["boundaries"].items()],
        "explanations": [
            verdict,
            f"Speed {routes['speed_kmh']} km/h, cells steeper than {routes['max_slope_deg']:.0f} degrees blocked.",
            *moved,
        ],
    })

plan = {"schemaVersion": "1.0", "datasetId": DATASET_ID, "coordinateSystemId": FRAME_ID,
        "totalDurationSeconds": total_s, "routes": plan_routes}

(OUT / "mission.json").write_text(json.dumps(mission, indent=2))
(OUT / "plan.json").write_text(json.dumps(plan, indent=2))

print("Local frame: origin = Three Forks, x east, y north (m)")
print(f"Bounds: x {bounds['min']['xMeters']} .. {bounds['max']['xMeters']}, "
      f"y {bounds['min']['yMeters']} .. {bounds['max']['yMeters']}")
for s in [habitat, *stops]:
    p = site_local(s)
    inside = (bounds["min"]["xMeters"] <= p["xMeters"] <= bounds["max"]["xMeters"]
              and bounds["min"]["yMeters"] <= p["yMeters"] <= bounds["max"]["yMeters"])
    print(f"  {s['id']:<18} x {p['xMeters']:>8.1f}  y {p['yMeters']:>8.1f}  inside: {inside}")
for r in plan_routes:
    print(f"{r['mode']:<13} {r['status']:<9} {r['distanceMeters']} m, walk {r['walkingTimeSeconds'] / 60:.0f} min, "
          f"return leg {r['returnDistanceMeters']} m, reserve {r['reserveSeconds'] / 60:.0f} min, "
          f"spare {r['reserveMarginSeconds'] / 60:.0f} min of {total_s / 3600:g} h ({r['limitingResource']}), "
          f"{len(r['geometry'])} points")
    for cp in r["returnBoundaryCheckpoints"]:
        ys = [p["yMeters"] for p in cp["polygon"]] or [0]
        xs = [p["xMeters"] for p in cp["polygon"]] or [0]
        print(f"    boundary {cp['when']:<22} x {min(xs):>7.0f}..{max(xs):<6.0f} y {min(ys):>7.0f}..{max(ys):<6.0f}")
for name in ("mission.json", "plan.json", "slope.png"):
    print(f"Saved {OUT / name} ({(OUT / name).stat().st_size / 1024:.0f} KB)")
