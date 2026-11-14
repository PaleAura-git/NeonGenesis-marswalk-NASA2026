"""Crop the demo box from the HiRISE DTM, compute slope, and check it at each site.

Usage: python scripts/build_grid.py <hirise_dtm> <sites.csv> <x0_km> <y0_km> <size_km>
x0/y0 are km from the DTM's left/top edge (same axes as overview.py).
"""
import csv
import math
import sys

import matplotlib.pyplot as plt
import numpy as np
import rasterio
from rasterio.windows import from_bounds

MARS_RADIUS_M = 3_396_190
SITE_BOX_M = 10  # judge each site's slope over +/- 10 m, not one noisy pixel

dtm_path, sites_path = sys.argv[1], sys.argv[2]
x0_km, y0_km, size_km = float(sys.argv[3]), float(sys.argv[4]), float(sys.argv[5])

# --- 1. Read only the demo box (windowed read, never the whole 1.7 GB file) ---
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

# --- 2. Slope from elevation (res matters: height change per metre) ---
dy, dx = np.gradient(elev, res)
slope = np.degrees(np.arctan(np.hypot(dx, dy)))

# --- 3. Quality report ---
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

# --- 4. Slope around each site (median of a 21 x 21 m patch) ---
with open(sites_path, newline="") as f:
    sites = list(csv.DictReader(f))

print(f"\n{'site':<18}{'median slope':>13}{'p90 slope':>11}")
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
    print(f"{s['id']:<18}{np.nanmedian(patch):>12.1f}°{np.nanpercentile(patch, 90):>10.1f}°")
    site_px.append((s["name"], col, row))

# --- 5. Quick-look figures, km axes from the DTM edges ---
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

plt.show()
