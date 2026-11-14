"""Walking time, energy and oxygen per 10 m cell, from slope and the mission parameters.

Usage: python scripts/walk_cost.py <demo_grid.tif> [speed_kmh=3.3] [max_slope_deg=15]
"""
import sys

import matplotlib.pyplot as plt
import numpy as np
import rasterio

MAX_SPEED_KMH = 3.3
DEFAULT_MAX_SLOPE = 15.0
SLOPE_LIMIT_CAP = 20.0
SPEED_FACTORS = [(5, 1.0), (10, 0.8), (15, 0.6), (20, 0.5)]
POWER_W = {"walking": 352, "stop": 308, "rest": 205, "walkback": 422}
ENERGY_CAPACITY_WH = 2800
OXYGEN_KG = 8.6
OXYGEN_KG_PER_KWH = OXYGEN_KG / (ENERGY_CAPACITY_WH / 1000)


def speed_factor(slope_deg, max_slope_deg=DEFAULT_MAX_SLOPE):
    """Fraction of full walking speed per cell; NaN where blocked or unknown."""
    if not 0 < max_slope_deg <= SLOPE_LIMIT_CAP:
        raise ValueError(f"max slope must be in (0, {SLOPE_LIMIT_CAP}] degrees")
    with np.errstate(invalid="ignore"):
        factor = np.select(
            [slope_deg < 5, slope_deg < 10, slope_deg <= 15, slope_deg <= 20],
            [f for _, f in SPEED_FACTORS],
            default=np.nan,
        )
        factor[~(slope_deg <= max_slope_deg)] = np.nan
    return factor


def cell_costs(slope_deg, cell_m, speed_kmh=MAX_SPEED_KMH,
               max_slope_deg=DEFAULT_MAX_SLOPE, power_w=POWER_W["walking"]):
    """Seconds, Wh and kg O2 to cross one cell straight; NaN = impassable."""
    if not 0 < speed_kmh <= MAX_SPEED_KMH:
        raise ValueError(f"speed must be in (0, {MAX_SPEED_KMH}] km/h")
    speed_ms = speed_kmh / 3.6 * speed_factor(slope_deg, max_slope_deg)
    seconds = cell_m / speed_ms
    energy_wh = power_w * seconds / 3600
    oxygen_kg = energy_wh / 1000 * OXYGEN_KG_PER_KWH
    return seconds, energy_wh, oxygen_kg


if __name__ == "__main__":
    grid_path = sys.argv[1]
    speed_kmh = float(sys.argv[2]) if len(sys.argv) > 2 else MAX_SPEED_KMH
    max_slope = float(sys.argv[3]) if len(sys.argv) > 3 else DEFAULT_MAX_SLOPE

    with rasterio.open(grid_path) as src:
        bands = {name: src.read(i + 1) for i, name in enumerate(src.descriptions)}
        cell_m = src.res[0]
        b = src.bounds

    slope = bands["slope_mean_deg"]
    seconds, energy_wh, oxygen_kg = cell_costs(slope, cell_m, speed_kmh, max_slope)
    factor = speed_factor(slope, max_slope)

    print("Grid:", grid_path, f"| {slope.shape[1]} x {slope.shape[0]} cells of {cell_m:.0f} m")
    print(f"Speed {speed_kmh} km/h | max slope {max_slope}° | walking power {POWER_W['walking']} W")
    print(f"Oxygen rule: {OXYGEN_KG} kg per {ENERGY_CAPACITY_WH / 1000} kWh "
          f"= {OXYGEN_KG_PER_KWH:.2f} kg/kWh")

    unknown = np.isnan(slope)
    blocked = ~unknown & np.isnan(factor)
    print(f"\nUnknown cells: {unknown.mean() * 100:.1f}% | blocked by slope: {blocked.mean() * 100:.1f}%")
    for f in sorted({f for _, f in SPEED_FACTORS}, reverse=True):
        share = np.mean(factor == f) * 100
        if share:
            print(f"  speed x{f}: {share:.1f}% of cells")

    s50, s95 = np.nanpercentile(seconds, [50, 95])
    print(f"Time per cell: median {s50:.1f} s | p95 {s95:.1f} s")

    flat_km_min = 1000 / (speed_kmh / 3.6) / 60
    flat_km_wh = POWER_W["walking"] * flat_km_min / 60
    print(f"Check, 1 km on flat ground: {flat_km_min:.1f} min, {flat_km_wh:.0f} Wh, "
          f"{flat_km_wh / 1000 * OXYGEN_KG_PER_KWH:.2f} kg O2")
    print(f"Check, worked example 55 min walking: {POWER_W['walking'] * 55 / 60:.0f} Wh")

    extent = [0, slope.shape[1] * cell_m / 1000, slope.shape[0] * cell_m / 1000, 0]
    shown = np.ma.masked_invalid(seconds)
    cmap = plt.get_cmap("viridis").with_extremes(bad="lightgrey")
    plt.figure(figsize=(8, 7))
    plt.imshow(shown, cmap=cmap, extent=extent)
    plt.colorbar(label=f"Seconds to cross a {cell_m:.0f} m cell")
    plt.title(f"Walking time per cell at {speed_kmh} km/h, grey = over {max_slope:.0f}° (HiRISE, 10 m)")
    plt.xlabel("km from demo box left edge")
    plt.ylabel("km from demo box top edge")
    plt.savefig("figures/demo_walk_time.png", dpi=120)
    plt.show()
