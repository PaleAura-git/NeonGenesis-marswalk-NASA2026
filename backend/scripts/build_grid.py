"""Crop the demo box from the HiRISE DTM, compute slope and roughness at 1 m,
average them into 10 m cells, and check the values at each site.

Usage: python scripts/build_grid.py <hirise_dtm> <sites.csv> <x0_km> <y0_km> <size_km>
x0/y0 are km from the DTM's left/top edge (same axes as overview.py).
"""
import csv
import math
import sys
import warnings

import matplotlib.pyplot as plt
import numpy as np
import rasterio
from rasterio.windows import from_bounds
from scipy.ndimage import uniform_filter

MARS_RADIUS_M = 3_396_190
SITE_BOX_M = 10
ROUGH_WINDOW_PX = 5
CELL_M = 10
MIN_VALID = 0.5

dtm_path, sites_path = sys.argv[1], sys.argv[2]
x0_km, y0_km, size_km = float(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5])

with rasterio.open(dtm_path) as src:
    b = src.bounds
    left = b.left + x0_km * 1000
    top = b.top - y0_km * 1000
    right, bottom = left + size_km * 1000, top - size_km * 1000
    window = from_bounds(left, bottom, right, top, src.transform)
    window = window.round_offsets().round_lengths()
    dem = src.read(1, window=window, masked=True)
    transform = src.window_transform(window)
    res = src.res[0]

elev = dem.filled(np.nan)
print("Source:", dtm_path)
print("Instrument: MRO HiRISE DTM, 1 m")
print(f"Demo box: x {x0_km}-{x0_km + size_km} km, y {y0_km}-{y0_km + size_km} km "
      f"-> {elev.shape[1]} x {elev.shape[0]} px")

dy, dx = np.gradient(elev, res)
slope = np.degrees(np.arctan(np.hypot(dx, dy)))

valid = np.isfinite(elev)
print(f"\nValid elevation pixels: {valid.mean() * 100:.1f}%")
e1, e50, e99 = np.nanpercentile(elev, [1, 50, 99])
print(f"Elevation p1 {e1:.0f} | median {e50:.0f} | p99 {e99:.0f} m "
      f"(min {np.nanmin(elev):.0f}, max {np.nanmax(elev):.0f})")
s50, s95, s99 = np.nanpercentile(slope, [50, 95, 99])
print(f"Slope median {s50:.1f} | p95 {s95:.1f} | p99 {s99:.1f} deg "
      f"(max {np.nanmax(slope):.1f})")
print(f"Steeper than 15 deg (walking limit): {np.nanmean(slope > 15) * 100:.1f}% of valid area")
print(f"Steeper than 45 deg (suspect): {int(np.nansum(slope > 45))} px")

ok = np.isfinite(slope)
s = np.where(ok, slope, 0.0)
share = uniform_filter(ok.astype(float), size=ROUGH_WINDOW_PX)
mean = uniform_filter(s, size=ROUGH_WINDOW_PX)
mean_sq = uniform_filter(s ** 2, size=ROUGH_WINDOW_PX)
with np.errstate(invalid="ignore", divide="ignore"):
    mean, mean_sq = mean / share, mean_sq / share
rough = np.sqrt(np.maximum(mean_sq - mean ** 2, 0))
rough[~ok] = np.nan
r50, r95, r99 = np.nanpercentile(rough, [50, 95, 99])
print(f"Roughness ({ROUGH_WINDOW_PX * res:.0f} m window) median {r50:.1f} | "
      f"p95 {r95:.1f} | p99 {r99:.1f} deg")

k = int(CELL_M / res)
rows, cols = slope.shape[0] // k, slope.shape[1] // k


def to_cells(a):
    """Reshape (rows*k, cols*k) into (rows, cols, k*k): one row of 100 pixels per cell."""
    a = a[:rows * k, :cols * k]
    return a.reshape(rows, k, cols, k).transpose(0, 2, 1, 3).reshape(rows, cols, k * k)


with warnings.catch_warnings():
    warnings.simplefilter("ignore", RuntimeWarning)  # all-NaN cells give NaN on purpose
    valid_frac = np.isfinite(to_cells(elev)).mean(axis=2)
    cell_elev = np.nanmean(to_cells(elev), axis=2)
    cell_slope = np.nanmean(to_cells(slope), axis=2)
    cell_slope_p90 = np.nanpercentile(to_cells(slope), 90, axis=2)
    cell_rough = np.nanmean(to_cells(rough), axis=2)

bad = valid_frac < MIN_VALID
for a in (cell_elev, cell_slope, cell_slope_p90, cell_rough):
    a[bad] = np.nan
cell_transform = transform * rasterio.Affine.scale(k)

print(f"\nGrid: {cols} x {rows} cells of {CELL_M} m")
print(f"Usable cells (>= {MIN_VALID:.0%} valid pixels): {(~bad).mean() * 100:.1f}%")
c50, c95 = np.nanpercentile(cell_slope, [50, 95])
p50, p95 = np.nanpercentile(cell_slope_p90, [50, 95])
print(f"Cell mean slope: median {c50:.1f} | p95 {c95:.1f} deg")
print(f"Cell p90 slope:  median {p50:.1f} | p95 {p95:.1f} deg")
print(f"Cells over 15 deg by mean: {np.nanmean(cell_slope > 15) * 100:.1f}% | "
      f"by p90: {np.nanmean(cell_slope_p90 > 15) * 100:.1f}%")

with open(sites_path, newline="") as f:
    sites = list(csv.DictReader(f))

print(f"\n{'site':<18}{'median slope':>13}{'p90 slope':>11}"
      f"{'cell slope':>12}{'cell p90':>10}{'cell rough':>12}")
site_px = []
for s in sites:
    x = MARS_RADIUS_M * math.radians(float(s["lon_deg"]))
    y = MARS_RADIUS_M * math.radians(float(s["lat_deg"]))
    row, col = rasterio.transform.rowcol(transform, x, y)
    if not (0 <= row < slope.shape[0] and 0 <= col < slope.shape[1]):
        print(f"{s['id']:<18}{'outside demo box':>24}")
        continue
    n = int(SITE_BOX_M / res)
    patch = slope[max(row - n, 0):row + n + 1, max(col - n, 0):col + n + 1]
    r, c = row // k, col // k
    print(f"{s['id']:<18}{np.nanmedian(patch):>12.1f}°{np.nanpercentile(patch, 90):>10.1f}°"
          f"{cell_slope[r, c]:>11.1f}°{cell_slope_p90[r, c]:>9.1f}°{cell_rough[r, c]:>11.1f}°")
    site_px.append((s["name"], col, row))

extent = [x0_km, x0_km + elev.shape[1] * res / 1000,
          y0_km + elev.shape[0] * res / 1000, y0_km]

plt.figure(figsize=(8, 7))
plt.imshow(elev, cmap="terrain", extent=extent)
plt.colorbar(label="Elevation (m)")
plt.title("Demo box elevation (MRO HiRISE DTM, 1 m)")
plt.xlabel("km from DTM left edge")
plt.ylabel("km from DTM top edge")
plt.savefig("figures/demo_elevation.png", dpi=120)

plt.figure(figsize=(8, 7))
plt.imshow(slope, cmap="magma", vmin=0, vmax=30, extent=extent)
plt.colorbar(label="Slope (degrees)")
for name, col, row in site_px:
    px, py = x0_km + col * res / 1000, y0_km + row * res / 1000
    plt.plot(px, py, "c^", markersize=8)
    plt.annotate(name, (px, py), xytext=(5, 5), textcoords="offset points", color="cyan")
plt.title("Demo box slope (MRO HiRISE DTM, 1 m), 15° = walking limit")
plt.xlabel("km from DTM left edge")
plt.ylabel("km from DTM top edge")
plt.savefig("figures/demo_slope.png", dpi=120)

plt.figure(figsize=(8, 7))
plt.imshow(rough, cmap="viridis", vmin=0, vmax=10, extent=extent)
plt.colorbar(label="Roughness (std of slope, degrees)")
plt.title(f"Demo box roughness (MRO HiRISE DTM, 1 m, {ROUGH_WINDOW_PX} m window)")
plt.xlabel("km from DTM left edge")
plt.ylabel("km from DTM top edge")
plt.savefig("figures/demo_roughness.png", dpi=120)

plt.figure(figsize=(8, 7))
plt.imshow(cell_slope_p90, cmap="magma", vmin=0, vmax=30, extent=extent)
plt.colorbar(label="p90 slope in cell (degrees)")
plt.title(f"Demo box, {CELL_M} m cells: p90 slope (from HiRISE 1 m)")
plt.xlabel("km from DTM left edge")
plt.ylabel("km from DTM top edge")
plt.savefig("figures/demo_cells_slope_p90.png", dpi=120)

plt.show()
