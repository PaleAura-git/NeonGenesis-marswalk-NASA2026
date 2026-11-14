"""Plan the fastest and safest Marswalk: base -> all stops -> base, on the 10 m grid.

Usage: python scripts/plan_routes.py <demo_grid.tif> <sites.csv> [speed_kmh=3.3] [max_slope_deg=15]
"""
import csv
import itertools
import json
import math
import sys

import matplotlib.pyplot as plt
import numpy as np
import rasterio
from skimage.graph import MCP_Geometric

from walk_cost import DEFAULT_MAX_SLOPE, MAX_SPEED_KMH, OXYGEN_KG_PER_KWH, POWER_W, cell_costs

MARS_RADIUS_M = 3_396_190
SNAP_RADIUS_M = 150
STOP_MINUTES = {"cape-nukshak": 40, "hawksbill-gap": 40, "kodiak-butte": 30}
ROUGHNESS_SCALE_DEG = 5


def load_grid(path):
    with rasterio.open(path) as src:
        bands = {name: src.read(i + 1) for i, name in enumerate(src.descriptions)}
        return bands, src.transform, src.res[0]


def cost_surfaces(bands, cell_m, speed_kmh, max_slope):
    seconds, _, _ = cell_costs(bands["slope_mean_deg"], cell_m, speed_kmh, max_slope)
    p90 = bands["slope_p90_deg"]
    penalty = 1 + p90 / max_slope + bands["roughness_deg"] / ROUGHNESS_SCALE_DEG
    safest = np.where(p90 <= max_slope + 5, seconds * penalty, np.nan)
    return {"fastest": seconds, "safest": safest}, seconds


def snap_to(allowed, row, col, cell_m):
    """Nearest allowed cell to (row, col) within SNAP_RADIUS_M, and how far it moved."""
    if allowed[row, col]:
        return (row, col), 0.0
    n = int(SNAP_RADIUS_M / cell_m)
    r0, c0 = max(row - n, 0), max(col - n, 0)
    window = allowed[r0:row + n + 1, c0:col + n + 1]
    cand = np.argwhere(window) + [r0, c0]
    if len(cand) == 0:
        return None, None
    d = np.hypot(cand[:, 0] - row, cand[:, 1] - col)
    best = cand[np.argmin(d)]
    return (int(best[0]), int(best[1])), float(d.min() * cell_m)


def mcp(cost):
    return MCP_Geometric(np.where(np.isfinite(cost), cost, np.inf), fully_connected=True)


def leg_table(cost, points):
    graph = mcp(cost)
    legs = {}
    for a, start in points.items():
        cum, _ = graph.find_costs([start])
        for b, end in points.items():
            if a != b and np.isfinite(cum[end]):
                legs[a, b] = (cum[end], graph.traceback(end))
    return legs


def best_order(legs, base, stops):
    best = None
    for order in itertools.permutations(stops):
        seq = [base, *order, base]
        pairs = list(zip(seq, seq[1:]))
        if all(p in legs for p in pairs):
            total = sum(legs[p][0] for p in pairs)
            if best is None or total < best[0]:
                best = (total, seq)
    return best


def path_metrics(path, seconds, bands, cell_m):
    dist = walk_s = 0.0
    for (r1, c1), (r2, c2) in zip(path, path[1:]):
        step = cell_m * math.hypot(r2 - r1, c2 - c1)
        dist += step
        walk_s += step / cell_m * (seconds[r1, c1] + seconds[r2, c2]) / 2
    rows, cols = zip(*path)
    return {
        "distance_m": dist,
        "walk_s": walk_s,
        "max_slope_deg": float(np.max(bands["slope_mean_deg"][rows, cols])),
        "steep_spot_cells": int(np.sum(bands["slope_p90_deg"][rows, cols] > DEFAULT_MAX_SLOPE)),
        "mean_roughness_deg": float(np.mean(bands["roughness_deg"][rows, cols])),
    }


if __name__ == "__main__":
    grid_path, sites_path = sys.argv[1], sys.argv[2]
    speed_kmh = float(sys.argv[3]) if len(sys.argv) > 3 else MAX_SPEED_KMH
    max_slope = float(sys.argv[4]) if len(sys.argv) > 4 else DEFAULT_MAX_SLOPE

    bands, transform, cell_m = load_grid(grid_path)
    costs, seconds = cost_surfaces(bands, cell_m, speed_kmh, max_slope)
    with open(sites_path, newline="") as f:
        sites = [s for s in csv.DictReader(f) if s["role"] in ("habitat", "stop")]
    base = next(s["id"] for s in sites if s["role"] == "habitat")
    stops = [s["id"] for s in sites if s["role"] == "stop"]

    print(f"Speed {speed_kmh} km/h | max slope {max_slope}° | grid {grid_path}")
    results = {}
    for mode, cost in costs.items():
        print(f"\n=== {mode} ===")
        points, reachable = {}, None
        for s in sorted(sites, key=lambda s: s["id"] != base):
            x = MARS_RADIUS_M * math.radians(float(s["lon_deg"]))
            y = MARS_RADIUS_M * math.radians(float(s["lat_deg"]))
            row, col = rasterio.transform.rowcol(transform, x, y)
            allowed = np.isfinite(cost) if reachable is None else reachable
            cell, moved = snap_to(allowed, row, col, cell_m)
            if cell is None:
                print(f"{s['id']}: nothing reachable within {SNAP_RADIUS_M} m, skipped")
                continue
            points[s["id"]] = cell
            if reachable is None:
                reachable = np.isfinite(mcp(cost).find_costs([cell])[0])
            if moved:
                print(f"{s['id']}: moved {moved:.0f} m to the nearest cell reachable on foot")

        legs = leg_table(cost, points)
        found = best_order(legs, base, [s for s in stops if s in points])
        if found is None:
            print("No route reaches every stop and returns to base.")
            continue
        seq = found[1]
        path = [legs[seq[0], seq[1]][1][0]]
        for a, b in zip(seq, seq[1:]):
            path += legs[a, b][1][1:]

        m = path_metrics(path, seconds, bands, cell_m)
        stop_s = sum(STOP_MINUTES.get(s, 0) * 60 for s in seq[1:-1])
        energy_wh = (POWER_W["walking"] * m["walk_s"] + POWER_W["stop"] * stop_s) / 3600
        m |= {
            "order": seq,
            "stop_s": stop_s,
            "total_s": m["walk_s"] + stop_s,
            "energy_wh": energy_wh,
            "oxygen_kg": energy_wh / 1000 * OXYGEN_KG_PER_KWH,
            "path_rc": [list(map(int, p)) for p in path],
        }
        results[mode] = m
        print("Order:", " -> ".join(seq))
        print(f"Distance {m['distance_m']:.0f} m | walking {m['walk_s'] / 60:.0f} min | "
              f"stops {stop_s / 60:.0f} min | total {m['total_s'] / 60:.0f} min")
        print(f"Energy {energy_wh:.0f} Wh | oxygen {m['oxygen_kg']:.2f} kg | "
              f"max cell slope {m['max_slope_deg']:.1f}° | cells with steep spots {m['steep_spot_cells']} | "
              f"mean roughness {m['mean_roughness_deg']:.2f}°")

    with open("data/processed/routes.json", "w") as f:
        json.dump({"speed_kmh": speed_kmh, "max_slope_deg": max_slope, "routes": results}, f)
    print("\nSaved data/processed/routes.json")

    rows, cols = bands["slope_mean_deg"].shape
    extent = [0, cols * cell_m / 1000, rows * cell_m / 1000, 0]
    plt.figure(figsize=(9, 8))
    plt.imshow(bands["slope_mean_deg"], cmap="Greys", vmin=0, vmax=30, extent=extent)
    plt.colorbar(label="Cell mean slope (degrees)")
    plt.imshow(np.ma.masked_where(np.isfinite(seconds), np.ones_like(seconds)),
               cmap="autumn", alpha=0.6, extent=extent)
    for mode, colour in (("fastest", "tab:blue"), ("safest", "tab:green")):
        if mode in results:
            r, c = np.array(results[mode]["path_rc"]).T
            plt.plot((c + 0.5) * cell_m / 1000, (r + 0.5) * cell_m / 1000, colour, lw=2,
                     label=f"{mode}: {results[mode]['distance_m']:.0f} m, "
                           f"{results[mode]['total_s'] / 60:.0f} min")
    for s in sites:
        x = MARS_RADIUS_M * math.radians(float(s["lon_deg"]))
        y = MARS_RADIUS_M * math.radians(float(s["lat_deg"]))
        row, col = rasterio.transform.rowcol(transform, x, y)
        px, py = (col + 0.5) * cell_m / 1000, (row + 0.5) * cell_m / 1000
        plt.plot(px, py, "m^", markersize=9)
        plt.annotate(s["name"], (px, py), xytext=(5, 5), textcoords="offset points", color="purple")
    plt.legend(loc="lower left")
    plt.title(f"Marswalk routes at {speed_kmh} km/h, red = over {max_slope:.0f}° (HiRISE, 10 m)")
    plt.xlabel("km from demo box left edge")
    plt.ylabel("km from demo box top edge")
    plt.savefig("figures/routes.png", dpi=120)
    plt.show()
