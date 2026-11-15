"""Rehearsal: block a passage, replan, and explain what changed.

Usage: python scripts/rehearse.py <demo_grid.tif> <sites.csv> <x_m> <y_m> <radius_m> [speed_kmh] [max_slope] [hours]
The blocked area is a circle in local ground metres (x east, y north from Three Forks).
"""
import math
import sys

import matplotlib.pyplot as plt

from export_for_map import Frame
from plan_routes import DEFAULT_HOURS, DEFAULT_MAX_SLOPE, MAX_SPEED_KMH, describe, draw, load_context, plan


def circle(x, y, radius, n=32):
    return [{"xMeters": x + radius * math.cos(2 * math.pi * i / n),
             "yMeters": y + radius * math.sin(2 * math.pi * i / n)} for i in range(n)]


def blocked_mask(frame, polygons):
    mask = None
    for vertices in polygons:
        m = frame.polygon_mask(vertices)
        mask = m if mask is None else mask | m
    return mask


def compare(before, after, names):
    """Plain-language list of what the block changed for one route mode."""
    if "error" in after:
        return [f"No route: {after['error']}"]
    notes = []
    if before["path_rc"] == after["path_rc"]:
        return ["The blocked area is not on this route; nothing changed."]
    if after["order"] != before["order"]:
        notes.append("Stop order changed: " + " -> ".join(names[s] for s in after["order"][1:-1])
                     + " (was " + " -> ".join(names[s] for s in before["order"][1:-1]) + ").")
    for sid, why in after["excluded"].items():
        notes.append(f"{names[sid]} dropped: {why}.")
    for sid, cell in after["approach_rc"].items():
        old = before["approach_rc"].get(sid)
        if old and old != cell:
            d = 10 * math.hypot(cell[0] - old[0], cell[1] - old[1])
            notes.append(f"{names[sid]} is now approached at a different point, about {d:.0f} m from before.")
    d_m = after["distance_m"] - before["distance_m"]
    d_s = after["total_s"] - before["total_s"]
    d_wh = after["energy_wh"] - before["energy_wh"]
    notes.append(f"Route change: {d_m:+.0f} m, {d_s / 60:+.0f} min, {d_wh:+.0f} Wh.")
    sb, sa = before["safety"], after["safety"]
    spare_b = sb["worst_margin_s"][sb["limiting_resource"]] / 60
    spare_a = sa["worst_margin_s"][sa["limiting_resource"]] / 60
    if sa["feasible"]:
        notes.append(f"Still a safe return: {sa['limiting_resource']} limits, "
                     f"{spare_a:.0f} min spare (was {spare_b:.0f}).")
    else:
        notes.append(f"NO SAFE RETURN with this block: {sa['limiting_resource']} runs short by "
                     f"{-spare_a:.0f} min. Reserves are not relaxed; drop a stop or turn back.")
    return notes


def rehearse(ctx, frame, polygons, speed_kmh, max_slope, budget_s, stop_seconds=None, reserve_floor_s=0.0):
    names = {s["id"]: s["name"] for s in ctx.sites}
    mask = blocked_mask(frame, polygons)
    before = plan(ctx, speed_kmh, max_slope, budget_s, stop_seconds, None, reserve_floor_s)
    after = plan(ctx, speed_kmh, max_slope, budget_s, stop_seconds, mask, reserve_floor_s)
    changes = {mode: compare(before["routes"][mode], after["routes"][mode], names)
               for mode in after["routes"]}
    return before, after, changes, mask


if __name__ == "__main__":
    ctx = load_context(sys.argv[1], sys.argv[2])
    x, y, radius = float(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5])
    speed_kmh = float(sys.argv[6]) if len(sys.argv) > 6 else MAX_SPEED_KMH
    max_slope = float(sys.argv[7]) if len(sys.argv) > 7 else DEFAULT_MAX_SLOPE
    budget_s = (float(sys.argv[8]) if len(sys.argv) > 8 else DEFAULT_HOURS) * 3600
    frame = Frame(ctx)

    before, after, changes, mask = rehearse(ctx, frame, [circle(x, y, radius)], speed_kmh, max_slope, budget_s)
    print(f"Blocked: circle of {radius:g} m at x {x:g}, y {y:g} ({int(mask.sum())} cells)")
    for mode in after["routes"]:
        print("\n" + "\n".join(describe(mode, after["routes"][mode])))
        print("What changed:")
        for line in changes[mode]:
            print("  - " + line)
    draw(ctx, after, f"Rehearsal: passage blocked at ({x:g}, {y:g}) m, r = {radius:g} m",
         "figures/rehearsal.png", blocked=mask)
    plt.show()
