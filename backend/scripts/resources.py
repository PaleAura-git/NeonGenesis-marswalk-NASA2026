"""Return boundary and limiting resource: can the astronaut always get home with reserves intact?"""
import math

import numpy as np
from scipy.ndimage import binary_fill_holes
from skimage.measure import approximate_polygon, find_contours

from walk_cost import ENERGY_CAPACITY_WH, OXYGEN_KG, OXYGEN_KG_PER_KWH, POWER_W

DEFAULT_HOURS = 6.0


def reserve_seconds(walk_s):
    """Apollo-style reserve: 30 min + 20% of planned walking, capped at 60 min."""
    return min(30 * 60 + 0.2 * walk_s, 60 * 60)


def timeline(path, seconds, x_scale, stop_at, rest_at=None):
    """Elapsed seconds and Wh used on arrival at every path point (stop and rest time counted on leaving)."""
    rest_at = rest_at or {}
    elapsed = np.zeros(len(path))
    energy = np.zeros(len(path))
    t = e = 0.0
    for i in range(1, len(path)):
        (r1, c1), (r2, c2) = path[i - 1], path[i]
        t += stop_at.get(i - 1, 0) + rest_at.get(i - 1, 0)
        e += (POWER_W["stop"] * stop_at.get(i - 1, 0) + POWER_W["rest"] * rest_at.get(i - 1, 0)) / 3600
        step_s = math.hypot(r2 - r1, (c2 - c1) * x_scale) * (seconds[r1, c1] + seconds[r2, c2]) / 2
        t += step_s
        e += POWER_W["walking"] * step_s / 3600
        elapsed[i], energy[i] = t, e
    return elapsed, energy


def margins(elapsed, energy, home_s, budget_s, reserve_s):
    """Spare walk-back seconds per resource after getting home and keeping the reserve."""
    walkback_w = POWER_W["walkback"]
    time_left = budget_s - elapsed - home_s - reserve_s
    wh_left = ENERGY_CAPACITY_WH - energy - (home_s + reserve_s) * walkback_w / 3600
    o2_left = OXYGEN_KG - energy / 1000 * OXYGEN_KG_PER_KWH - (home_s + reserve_s) * walkback_w / 3600 / 1000 * OXYGEN_KG_PER_KWH
    return {
        "time": time_left,
        "energy": wh_left * 3600 / walkback_w,
        "oxygen": o2_left / OXYGEN_KG_PER_KWH * 1000 * 3600 / walkback_w,
    }


def boundary_mask(home_map, elapsed_s, energy_wh, budget_s, reserve_s):
    """Cells you could still walk home from, with all reserves, given what's already used."""
    m = margins(np.array([elapsed_s]), np.array([energy_wh]), 0.0, budget_s, reserve_s)
    allowance = min(v[0] for v in m.values())
    return np.isfinite(home_map) & (home_map <= allowance)


def outline(mask):
    """Outer outline of the mask (holes filled, simplified to ~1 cell) as closed (row, col) points."""
    contours = find_contours(np.pad(binary_fill_holes(mask).astype(float), 1), 0.5)
    if not contours:
        return []
    ring = approximate_polygon(max(contours, key=len) - 1, tolerance=1.0)
    return [[round(float(r), 2), round(float(c), 2)] for r, c in ring]


def assess(path, seconds, x_scale, stop_at, home_map, budget_s, walk_s, reserve_floor_s=0.0, rest_at=None):
    reserve_s = max(reserve_seconds(walk_s), reserve_floor_s)
    elapsed, energy = timeline(path, seconds, x_scale, stop_at, rest_at)
    rows, cols = zip(*path)
    home_s = home_map[rows, cols]
    m = margins(elapsed, energy, home_s, budget_s, reserve_s)
    worst = {k: float(v.min()) for k, v in m.items()}
    limiting = min(worst, key=worst.get)
    first_fail = int(np.argmax(m[limiting] < 0)) if worst[limiting] < 0 else None
    checkpoints = {"start": (0.0, 0.0)}
    for idx in sorted(stop_at):
        checkpoints[f"leave_{idx}"] = (elapsed[idx] + stop_at[idx],
                                       energy[idx] + POWER_W["stop"] * stop_at[idx] / 3600)
    return {
        "budget_s": budget_s,
        "reserve_s": reserve_s,
        "end_elapsed_s": float(elapsed[-1]),
        "end_energy_wh": float(energy[-1]),
        "worst_margin_s": worst,
        "limiting_resource": limiting,
        "feasible": worst[limiting] >= 0,
        "first_unsafe_index": first_fail,
        "boundaries": {k: outline(boundary_mask(home_map, t, e, budget_s, reserve_s))
                       for k, (t, e) in checkpoints.items()},
    }
