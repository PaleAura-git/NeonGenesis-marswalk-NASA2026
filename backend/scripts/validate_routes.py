"""Check our terrain model and routes against where Perseverance actually drove.

Usage: python scripts/validate_routes.py <demo_grid.tif> <sites.csv> <M20_traverse.json>
"""
import json
import math
import sys
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import rasterio
from scipy.spatial import cKDTree

from plan_routes import lonlat_to_map, load_context, plan

DENSIFY_M = 2.0


def traverse_points(path, ctx):
    """Rover track inside the grid as dense map-metre points with sol and rover elevation."""
    rows, cols = ctx.bands["slope_mean_deg"].shape
    left, top = ctx.transform * (0, 0)
    right, bottom = ctx.transform * (cols, rows)
    pts = []
    for f in json.load(open(path))["features"]:
        coords = f["geometry"]["coordinates"]
        for (lon1, lat1, z1), (lon2, lat2, z2) in zip(coords, coords[1:]):
            x1, y1 = lonlat_to_map(lon1, lat1)
            x2, y2 = lonlat_to_map(lon2, lat2)
            n = max(int(math.hypot((x2 - x1) * ctx.x_scale, y2 - y1) / DENSIFY_M), 1)
            for k in range(n):
                t = k / n
                x, y = x1 + t * (x2 - x1), y1 + t * (y2 - y1)
                if left <= x < right and bottom < y <= top:
                    pts.append((x, y, z1 + t * (z2 - z1), f["properties"]["sol"]))
    return np.array(pts)


if __name__ == "__main__":
    ctx = load_context(sys.argv[1], sys.argv[2])
    track = traverse_points(sys.argv[3], ctx)
    rows, cols = rasterio.transform.rowcol(ctx.transform, track[:, 0], track[:, 1])
    rows, cols = np.asarray(rows), np.asarray(cols)
    slope = ctx.bands["slope_mean_deg"][rows, cols]
    p90 = ctx.bands["slope_p90_deg"][rows, cols]
    dtm = ctx.bands["elevation_m"][rows, cols]

    sols = track[:, 3]
    length_m = len(track) * DENSIFY_M
    print(f"Perseverance track inside the demo box: ~{length_m / 1000:.1f} km, "
          f"sols {int(sols.min())}-{int(sols.max())}, {len(np.unique(list(zip(rows, cols)), axis=0))} cells")

    print("\n1. Is the rover's path walkable by our rule?")
    print(f"   Cell mean slope on the track: median {np.nanmedian(slope):.1f}° | "
          f"p95 {np.nanpercentile(slope, 95):.1f}° | max {np.nanmax(slope):.1f}°")
    for limit in (15, 20):
        print(f"   Track on cells our model calls walkable at {limit}°: {np.nanmean(slope <= limit) * 100:.1f}%")
    print(f"   Whole demo box walkable at 15°: {np.nanmean(ctx.bands['slope_mean_deg'] <= 15) * 100:.1f}%")

    print("\n2. Do the rover's own elevations match our HiRISE grid?")
    diff = dtm - track[:, 2]
    print(f"   DTM 10 m cell minus rover elevation: median {np.nanmedian(diff):+.2f} m | "
          f"middle 90% {np.nanpercentile(diff, 5):+.2f} to {np.nanpercentile(diff, 95):+.2f} m")

    print("\n3. How close do our routes run to where the rover drove?")
    xy = np.column_stack([(track[:, 0]) * ctx.x_scale, track[:, 1]])
    tree = cKDTree(xy)
    result = plan(ctx)
    names = {s["id"]: s["name"] for s in ctx.sites}
    best_leg = None
    for mode, m in result["routes"].items():
        r, c = np.array(m["path_rc"]).T
        px, py = rasterio.transform.xy(ctx.transform, r, c)
        d, _ = tree.query(np.column_stack([np.asarray(px) * ctx.x_scale, py]))
        cuts = [0, *sorted(int(i) for i in m["stop_index"]), len(d) - 1]
        print(f"   {mode}: whole route median {np.median(d):.0f} m from the track")
        for (a, b), (s1, s2) in zip(zip(cuts, cuts[1:]), zip(m["order"], m["order"][1:])):
            leg = d[a:b + 1]
            if best_leg is None or np.median(leg) < best_leg["medianMeters"]:
                best_leg = {"from": names[s1], "to": names[s2], "medianMeters": round(float(np.median(leg)))}
            print(f"     {names[s1]:>26} -> {names[s2]:<26} median {np.median(leg):>4.0f} m | "
                  f"within 25 m: {np.mean(leg <= 25) * 100:>3.0f}%")

    Path("exports/route_validation.json").write_text(json.dumps({
        "source": "NASA Mars 2020 Perseverance traverse (M20_traverse.json)",
        "trackKilometres": round(length_m / 1000, 1),
        "trackWalkableShare": round(float(np.nanmean(slope <= 15)), 3),
        "areaWalkableShare": round(float(np.nanmean(ctx.bands["slope_mean_deg"] <= 15)), 3),
        "elevationMedianDifferenceMeters": round(float(np.nanmedian(diff)), 2),
        "closestSharedLeg": best_leg,
        "limits": "A rover is not an astronaut, and only legs the rover actually drove are a fair comparison.",
    }, indent=2))

    n_rows, n_cols = ctx.bands["slope_mean_deg"].shape
    extent = [0, n_cols * ctx.cell_m / 1000, n_rows * ctx.cell_m / 1000, 0]
    plt.figure(figsize=(9, 8))
    plt.imshow(ctx.bands["slope_mean_deg"], cmap="Greys", vmin=0, vmax=30, extent=extent)
    plt.colorbar(label="Cell mean slope (degrees)")
    blocked = ctx.bands["slope_mean_deg"] > 15
    plt.imshow(np.ma.masked_where(~blocked, np.ones(blocked.shape)), cmap="autumn", alpha=0.5, extent=extent)
    left, top = ctx.transform * (0, 0)
    plt.plot((track[:, 0] - left) / 1000, (top - track[:, 1]) / 1000, ".",
             color="orange", markersize=1, label="Perseverance (NASA traverse)")
    for mode, colour in (("fastest", "tab:blue"), ("safest", "tab:green")):
        r, c = np.array(result["routes"][mode]["path_rc"]).T
        plt.plot((c + 0.5) * ctx.cell_m / 1000, (r + 0.5) * ctx.cell_m / 1000, colour, lw=1.5, label=mode)
    plt.legend(loc="lower left", markerscale=8)
    plt.title("Our routes vs Perseverance's real track (red = over 15°, HiRISE 10 m)")
    plt.xlabel("km from demo box left edge")
    plt.ylabel("km from demo box top edge")
    plt.savefig("figures/validation.png", dpi=120)
    plt.show()
