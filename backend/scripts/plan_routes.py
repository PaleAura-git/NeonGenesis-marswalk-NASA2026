"""Plan the fastest and safest Marswalk: base -> all stops -> base, on the 10 m grid.

Usage: python scripts/plan_routes.py <demo_grid.tif> <sites.csv> [speed_kmh=3.3] [max_slope_deg=15] [hours=6]
"""
import csv
import itertools
import json
import math
import sys
from dataclasses import dataclass
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import rasterio
from skimage.graph import MCP_Geometric

from resources import DEFAULT_HOURS, assess
from walk_cost import DEFAULT_MAX_SLOPE, MAX_SPEED_KMH, OXYGEN_KG_PER_KWH, POWER_W, cell_costs

MARS_RADIUS_M = 3_396_190
SNAP_RADIUS_M = 150
STOP_SECONDS = {"cape-nukshak": 2400, "hawksbill-gap": 2400, "kodiak-butte": 1800}
ROUGHNESS_SCALE_DEG = 5
REST_EVERY_S = 30 * 60
REST_S = 5 * 60
REST_SEARCH_POINTS = 10
TERRAIN_PATH = "data/processed/terrain.tif"
CLASS_SPEED = {"sand": 0.85, "bedrock": 1.0, "rough": 0.8, "steep": 1.0}
UNCERTAINTY_PENALTY = 0.5


@dataclass
class Context:
    bands: dict
    transform: rasterio.Affine
    cell_m: float
    x_scale: float
    sources: dict
    sites: list
    base: str
    stops: list
    site_cells: dict
    terrain: dict | None = None


def lonlat_to_map(lon, lat):
    return MARS_RADIUS_M * math.radians(lon), MARS_RADIUS_M * math.radians(lat)


def load_context(grid_path, sites_path):
    with rasterio.open(grid_path) as src:
        bands = {name: src.read(i + 1) for i, name in enumerate(src.descriptions)}
        tags = src.tags()
        transform, cell_m = src.transform, src.res[0]
    with open(sites_path, newline="") as f:
        sites = [s for s in csv.DictReader(f) if s["role"] in ("habitat", "stop")]
    terrain = None
    if Path(TERRAIN_PATH).exists():
        with rasterio.open(TERRAIN_PATH) as t:
            terrain = {"class": t.read(1), "confidence": t.read(2), "names": t.tags()["classes"].split(",")}
    site_cells = {s["id"]: rasterio.transform.rowcol(
        transform, *lonlat_to_map(float(s["lon_deg"]), float(s["lat_deg"]))) for s in sites}
    return Context(
        bands=bands, transform=transform, cell_m=cell_m,
        x_scale=float(tags.get("x_ground_scale", 1)), sources=json.loads(tags.get("sources", "{}")),
        sites=sites, base=next(s["id"] for s in sites if s["role"] == "habitat"),
        stops=[s["id"] for s in sites if s["role"] == "stop"], site_cells=site_cells, terrain=terrain,
    )


def cost_surfaces(bands, cell_m, speed_kmh, max_slope, terrain=None):
    seconds, _, _ = cell_costs(bands["slope_mean_deg"], cell_m, speed_kmh, max_slope)
    p90 = bands["slope_p90_deg"]
    penalty = 1 + p90 / max_slope + bands["roughness_deg"] / ROUGHNESS_SCALE_DEG
    if terrain is not None:
        speed = np.ones_like(seconds)
        for i, name in enumerate(terrain["names"]):
            speed[terrain["class"] == i] = CLASS_SPEED[name]
        seconds = seconds / speed
        penalty = penalty * (1 + UNCERTAINTY_PENALTY * (1 - np.nan_to_num(terrain["confidence"], nan=0.0)))
    safest = np.where(p90 <= max_slope, seconds * penalty, np.nan)
    return {"fastest": seconds, "safest": safest}, seconds


def snap_to(allowed, row, col, cell_m, x_scale):
    """Nearest allowed cell to (row, col) within SNAP_RADIUS_M, and how far it moved."""
    if allowed[row, col]:
        return (row, col), 0.0
    n = int(SNAP_RADIUS_M / cell_m)
    r0, c0 = max(row - n, 0), max(col - n, 0)
    window = allowed[r0:row + n + 1, c0:col + n + 1]
    cand = np.argwhere(window) + [r0, c0]
    if len(cand) == 0:
        return None, None
    d = np.hypot(cand[:, 0] - row, (cand[:, 1] - col) * x_scale)
    best = cand[np.argmin(d)]
    return (int(best[0]), int(best[1])), float(d.min() * cell_m)


def mcp(cost, x_scale):
    return MCP_Geometric(np.where(np.isfinite(cost), cost, np.inf),
                         fully_connected=True, sampling=(1, x_scale))


def leg_table(cost, points, x_scale):
    graph = mcp(cost, x_scale)
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


def rest_spots(path, seconds, bands, x_scale, stop_at):
    """A 5 min rest after every 30 min of walking, at the flattest, smoothest route cell nearby."""
    walked, last, rests = 0.0, 0.0, {}
    for i in range(1, len(path)):
        (r1, c1), (r2, c2) = path[i - 1], path[i]
        walked += math.hypot(r2 - r1, (c2 - c1) * x_scale) * (seconds[r1, c1] + seconds[r2, c2]) / 2
        if walked - last >= REST_EVERY_S and i < len(path) - 1:
            window = range(max(i - REST_SEARCH_POINTS, 1), min(i + REST_SEARCH_POINTS, len(path) - 1))
            score = [bands["slope_p90_deg"][path[j]] + bands["roughness_deg"][path[j]]
                     if j not in stop_at else np.inf for j in window]
            best = window[int(np.argmin(score))]
            rests[best] = REST_S
            last = walked
    return rests


def stop_access(ctx, mode, sid, moved, max_slope, blocked):
    """Whether a stop's own ground is walkable in this mode, and if not, why."""
    cell = ctx.site_cells[sid]
    mean, p90 = float(ctx.bands["slope_mean_deg"][cell]), float(ctx.bands["slope_p90_deg"][cell])
    if not moved:
        reason = None
    elif blocked is not None and blocked[cell]:
        reason = "the stop is inside the blocked area"
    elif mean > max_slope:
        reason = f"the ground at the stop averages {mean:.1f}° (limit {max_slope:g}°)"
    elif mode == "safest" and p90 > max_slope:
        reason = f"the steepest part of the stop's 10 m cell is {p90:.1f}° (limit {max_slope:g}°)"
    else:
        reason = "the stop is cut off from the base by ground over the limit"
    return {"reached": not moved, "moved_m": float(moved or 0), "reason": reason,
            "ground_slope_deg": mean, "ground_p90_deg": p90}


def path_metrics(path, seconds, bands, cell_m, x_scale, max_slope):
    dist = walk_s = 0.0
    for (r1, c1), (r2, c2) in zip(path, path[1:]):
        step = cell_m * math.hypot(r2 - r1, (c2 - c1) * x_scale)
        dist += step
        walk_s += step / cell_m * (seconds[r1, c1] + seconds[r2, c2]) / 2
    rows, cols = zip(*path)
    return {
        "distance_m": dist,
        "walk_s": walk_s,
        "max_slope_deg": float(np.max(bands["slope_mean_deg"][rows, cols])),
        "steepest_section_deg": float(np.max(bands["slope_p90_deg"][rows, cols])),
        "steep_spot_cells": int(np.sum(bands["slope_p90_deg"][rows, cols] > max_slope)),
        "mean_roughness_deg": float(np.mean(bands["roughness_deg"][rows, cols])),
    }


def plan(ctx, speed_kmh=MAX_SPEED_KMH, max_slope=DEFAULT_MAX_SLOPE, budget_s=DEFAULT_HOURS * 3600,
         stop_seconds=None, blocked=None, reserve_floor_s=0.0):
    """Both route modes for one set of settings. `blocked` = boolean cell mask that may not be entered."""
    stop_seconds = STOP_SECONDS if stop_seconds is None else stop_seconds
    costs, seconds = cost_surfaces(ctx.bands, ctx.cell_m, speed_kmh, max_slope, ctx.terrain)
    if blocked is not None:
        seconds = np.where(blocked, np.nan, seconds)
        costs = {k: np.where(blocked, np.nan, v) for k, v in costs.items()}
    wanted = [s for s in ctx.stops if s in stop_seconds]
    results = {}
    for mode, cost in costs.items():
        log, excluded, points, access, reachable = [], {}, {}, {}, None
        for sid in [ctx.base, *wanted]:
            allowed = np.isfinite(cost) if reachable is None else reachable
            cell, moved = snap_to(allowed, *ctx.site_cells[sid], ctx.cell_m, ctx.x_scale)
            if cell is None:
                if sid == ctx.base:
                    results[mode] = {"error": "The base itself is blocked or not walkable.", "log": log}
                    break
                excluded[sid] = f"not reachable on foot within {SNAP_RADIUS_M} m of the mapped position"
                log.append(f"{sid}: {excluded[sid]}, excluded")
                continue
            points[sid] = cell
            if reachable is None:
                reachable = np.isfinite(mcp(cost, ctx.x_scale).find_costs([cell])[0])
                home_map = mcp(seconds, ctx.x_scale).find_costs([cell])[0]
            if sid != ctx.base:
                access[sid] = stop_access(ctx, mode, sid, moved, max_slope, blocked)
                if moved:
                    log.append(f"{sid}: not safely reachable ({access[sid]['reason']}); "
                               f"nearest safe viewing point {moved:.0f} m away")
        if mode in results:
            continue

        legs = leg_table(cost, points, ctx.x_scale)
        seq = best_order(legs, ctx.base, [s for s in wanted if s in points])[1]
        path, stop_at = [legs[seq[0], seq[1]][1][0]], {}
        for a, b in zip(seq, seq[1:]):
            path += legs[a, b][1][1:]
            if b != ctx.base:
                stop_at[len(path) - 1] = stop_seconds[b]

        rest_at = rest_spots(path, seconds, ctx.bands, ctx.x_scale, stop_at)
        m = path_metrics(path, seconds, ctx.bands, ctx.cell_m, ctx.x_scale, max_slope)
        stop_s, rest_s = sum(stop_at.values()), sum(rest_at.values())
        energy_wh = (POWER_W["walking"] * m["walk_s"] + POWER_W["stop"] * stop_s
                     + POWER_W["rest"] * rest_s) / 3600
        m |= {
            "order": seq,
            "excluded": excluded,
            "access": access,
            "stop_s": stop_s,
            "rest_s": rest_s,
            "rest_spots": [{"index": i, "rc": list(map(int, path[i])), "seconds": s,
                            "slope_deg": float(ctx.bands["slope_mean_deg"][path[i]]),
                            "roughness_deg": float(ctx.bands["roughness_deg"][path[i]])}
                           for i, s in sorted(rest_at.items())],
            "total_s": m["walk_s"] + stop_s + rest_s,
            "energy_wh": energy_wh,
            "oxygen_kg": energy_wh / 1000 * OXYGEN_KG_PER_KWH,
            "path_rc": [list(map(int, p)) for p in path],
            "approach_rc": {k: list(map(int, v)) for k, v in points.items()},
            "stop_index": {str(i): s for i, s in zip(sorted(stop_at), seq[1:-1])},
            "safety": assess(path, seconds, ctx.x_scale, stop_at, home_map, budget_s,
                             m["walk_s"], reserve_floor_s, rest_at),
            "log": log,
        }
        results[mode] = m
    return {"speed_kmh": speed_kmh, "max_slope_deg": max_slope, "budget_s": budget_s, "routes": results}


def describe(mode, m):
    if "error" in m:
        return [f"=== {mode} ===", m["error"]]
    sa = m["safety"]
    lines = [f"=== {mode} ===", *m["log"], "Order: " + " -> ".join(m["order"]),
             f"Distance {m['distance_m']:.0f} m | walking {m['walk_s'] / 60:.0f} min | "
             f"stops {m['stop_s'] / 60:.0f} min | rest {m['rest_s'] / 60:.0f} min | total {m['total_s'] / 60:.0f} min",
             *(f"Rest spot {k + 1}: route point {r['index']}, slope {r['slope_deg']:.1f}°, "
               f"roughness {r['roughness_deg']:.1f}°" for k, r in enumerate(m["rest_spots"])),
             f"Energy {m['energy_wh']:.0f} Wh | oxygen {m['oxygen_kg']:.2f} kg | "
             f"steepest section {m['steepest_section_deg']:.1f}° | cells with parts over the limit {m['steep_spot_cells']} | "
             f"mean roughness {m['mean_roughness_deg']:.2f}°",
             f"Reserve {sa['reserve_s'] / 60:.0f} min | spare at the tightest point: "
             + ", ".join(f"{k} {v / 60:.0f} min" for k, v in sa["worst_margin_s"].items())]
    if sa["feasible"]:
        lines.append(f"Safe return all the way. Limiting resource: {sa['limiting_resource']}")
    else:
        lines.append(f"NO SAFE RETURN: {sa['limiting_resource']} runs short after {sa['first_unsafe_index']} "
                     f"of {len(m['path_rc'])} route points. The reserve is not relaxed; shorten the plan.")
    return lines


def draw(ctx, result, title, out_path, blocked=None):
    rows, cols = ctx.bands["slope_mean_deg"].shape
    extent = [0, cols * ctx.cell_m / 1000, rows * ctx.cell_m / 1000, 0]
    seconds, _, _ = cell_costs(ctx.bands["slope_mean_deg"], ctx.cell_m,
                               result["speed_kmh"], result["max_slope_deg"])
    plt.figure(figsize=(9, 8))
    plt.imshow(ctx.bands["slope_mean_deg"], cmap="Greys", vmin=0, vmax=30, extent=extent)
    plt.colorbar(label="Cell mean slope (degrees)")
    plt.imshow(np.ma.masked_where(np.isfinite(seconds), np.ones_like(seconds)),
               cmap="autumn", alpha=0.6, extent=extent)
    if blocked is not None:
        plt.imshow(np.ma.masked_where(~blocked, np.ones_like(seconds)), cmap="cool", alpha=0.7, extent=extent)
    for mode, colour in (("fastest", "tab:blue"), ("safest", "tab:green")):
        m = result["routes"].get(mode, {})
        if "path_rc" in m:
            r, c = np.array(m["path_rc"]).T
            plt.plot((c + 0.5) * ctx.cell_m / 1000, (r + 0.5) * ctx.cell_m / 1000, colour, lw=2,
                     label=f"{mode}: {m['distance_m']:.0f} m, {m['total_s'] / 60:.0f} min")
            for rest in m["rest_spots"]:
                rr, rc = rest["rc"]
                plt.plot((rc + 0.5) * ctx.cell_m / 1000, (rr + 0.5) * ctx.cell_m / 1000, "o",
                         color=colour, markersize=8, markeredgecolor="white")
    for s in ctx.sites:
        row, col = ctx.site_cells[s["id"]]
        px, py = (col + 0.5) * ctx.cell_m / 1000, (row + 0.5) * ctx.cell_m / 1000
        plt.plot(px, py, "m^", markersize=9)
        plt.annotate(s["name"], (px, py), xytext=(5, 5), textcoords="offset points", color="purple")
    plt.legend(loc="lower left")
    plt.title(title)
    plt.xlabel("km from demo box left edge")
    plt.ylabel("km from demo box top edge")
    plt.savefig(out_path, dpi=120)


if __name__ == "__main__":
    ctx = load_context(sys.argv[1], sys.argv[2])
    speed_kmh = float(sys.argv[3]) if len(sys.argv) > 3 else MAX_SPEED_KMH
    max_slope = float(sys.argv[4]) if len(sys.argv) > 4 else DEFAULT_MAX_SLOPE
    budget_s = (float(sys.argv[5]) if len(sys.argv) > 5 else DEFAULT_HOURS) * 3600

    result = plan(ctx, speed_kmh, max_slope, budget_s)
    print(f"Speed {speed_kmh} km/h | max slope {max_slope}° | budget {budget_s / 3600:g} h")
    for mode, m in result["routes"].items():
        print("\n" + "\n".join(describe(mode, m)))

    with open("data/processed/routes.json", "w") as f:
        json.dump(result, f)
    print("\nSaved data/processed/routes.json")
    draw(ctx, result, f"Marswalk routes at {speed_kmh} km/h, red = over {max_slope:.0f}° (HiRISE, 10 m)",
         "figures/routes.png")
    plt.show()
