"""Build the 10 m terrain grid for the demo box and save it as a feature stack.

HiRISE DTM -> slope and roughness at 1 m -> 10 m cells, plus a THEMIS thermal layer
inertia resampled onto the same cells. Writes a GeoTIFF stack, a CSV feature
table and a sources file to data/processed/.

Usage: python scripts/build_grid.py <hirise_dtm> <themis_thermal.tif> <sites.csv> <x0_km> <y0_km> <size_km>
The thermal file's tags (from fetch_themis.py) give its quantity and source.
x0/y0 are km from the DTM's left/top edge (same axes as overview.py).
"""
import csv
import json
import math
import sys
import warnings

import matplotlib.pyplot as plt
import numpy as np
import rasterio
from rasterio.warp import Resampling, reproject
from rasterio.windows import from_bounds
from scipy.ndimage import uniform_filter

MARS_RADIUS_M = 3_396_190
SITE_BOX_M = 10
ROUGH_WINDOW_PX = 5
CELL_M = 10
MIN_VALID = 0.5
CRS_KEYS = ("proj", "lat_ts", "lat_0", "lon_0", "R")
OUT_DIR = "data/processed"

dtm_path, themis_path, sites_path = sys.argv[1], sys.argv[2], sys.argv[3]
x0_km, y0_km, size_km = float(sys.argv[4]), float(sys.argv[5]), float(sys.argv[6])

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
    lat_c = math.degrees((top + bottom) / 2 / MARS_RADIUS_M)
    x_scale = math.cos(math.radians(lat_c))
    dtm_crs = src.crs

elev = dem.filled(np.nan)
print("Source:", dtm_path)
print("Instrument: MRO HiRISE DTM, 1 m")
print(f"East-west ground scale at {lat_c:.2f}° N: 1 map metre = {x_scale:.4f} m on the ground")
print(f"Demo box: x {x0_km}-{x0_km + size_km} km, y {y0_km}-{y0_km + size_km} km "
      f"-> {elev.shape[1]} x {elev.shape[0]} px")

dy, dx = np.gradient(elev, res, res * x_scale)
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

with rasterio.open(themis_path) as th:
    a = {key: dtm_crs.to_dict().get(key) for key in CRS_KEYS}
    b = {key: th.crs.to_dict().get(key) for key in CRS_KEYS}
    print("\nCRS HiRISE:", a)
    print("CRS THEMIS:", b)
    if a != b:
        sys.exit("Projections differ: reproject THEMIS before combining")
    th_window = from_bounds(*rasterio.transform.array_bounds(rows, cols, cell_transform), th.transform)
    th_window = th_window.round_offsets().round_lengths()
    th_window = rasterio.windows.Window(th_window.col_off - 2, th_window.row_off - 2,
                                        th_window.width + 4, th_window.height + 4)
    th_data = th.read(1, window=th_window, boundless=True, fill_value=th.nodata or 0)
    cell_thermal = np.full((rows, cols), np.nan, dtype="float32")
    reproject(
        source=th_data,
        destination=cell_thermal,
        src_transform=th.window_transform(th_window),
        src_crs=th.crs,
        src_nodata=th.nodata,
        dst_nodata=np.nan,
        dst_transform=cell_transform,
        dst_crs=th.crs,
        resampling=Resampling.bilinear,
    )
    th_res = th.res[0]
    th_tags = th.tags()
th_quantity = th_tags.get("quantity", "thermal_inertia")
th_units = th_tags.get("units", "J m⁻² K⁻¹ s⁻½")

cell_thermal[bad] = np.nan
t50, t5, t95 = np.nanpercentile(cell_thermal, [50, 5, 95])
print(f"Thermal ({th_quantity}, THEMIS {th_res:.0f} m -> {CELL_M} m cells): "
      f"median {t50:.0f} | p5 {t5:.0f} | p95 {t95:.0f} | "
      f"valid {np.isfinite(cell_thermal).mean() * 100:.1f}%")

with open(sites_path, newline="") as f:
    sites = list(csv.DictReader(f))

print(f"\n{'site':<18}{'median slope':>13}{'p90 slope':>11}"
      f"{'cell slope':>12}{'cell p90':>10}{'cell rough':>12}{'thermal':>9}")
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
          f"{cell_slope[r, c]:>11.1f}°{cell_slope_p90[r, c]:>9.1f}°{cell_rough[r, c]:>11.1f}°"
          f"{cell_thermal[r, c]:>9.0f}")
    site_px.append((s["name"], col, row))

layers = {
    "elevation_m": cell_elev,
    "slope_mean_deg": cell_slope,
    "slope_p90_deg": cell_slope_p90,
    "roughness_deg": cell_rough,
    "thermal": cell_thermal,
    "valid_fraction": valid_frac,
}
sources = {
    "demo_box_km": {"x0": x0_km, "y0": y0_km, "size": size_km},
    "cell_size_m": CELL_M,
    "x_ground_scale": x_scale,
    "crs": a,
    "layers": {
        "elevation_m, slope_mean_deg, slope_p90_deg, roughness_deg, valid_fraction": {
            "mission": "MRO", "instrument": "HiRISE DTM", "resolution_m": res,
            "file": dtm_path.split("/")[-1],
            "source": "USGS Astrogeology, Mars 2020 Jezero landing site products",
        },
        "thermal": {
            "mission": th_tags.get("mission", "Mars Odyssey"),
            "instrument": th_tags.get("instrument", "THEMIS"),
            "resolution_m": th_res,
            "file": themis_path.split("/")[-1],
            "source": th_tags.get("source", "Zenodo (non-NASA host): replace with fetch_themis.py"),
            "quantity": f"{th_quantity} ({th_units})",
            "note": f"Bilinear resample from {th_res:.0f} m; cannot resolve features within one THEMIS pixel"
                    + ("; night IR brightness is a relative proxy for thermal inertia, not calibrated"
                       if th_quantity == "night_ir_brightness" else ""),
        },
    },
}

tif_path = f"{OUT_DIR}/demo_grid.tif"
with rasterio.open(
    tif_path, "w", driver="GTiff", width=cols, height=rows, count=len(layers),
    dtype="float32", crs=dtm_crs, transform=cell_transform, nodata=np.nan,
) as dst:
    for i, (name, arr) in enumerate(layers.items(), start=1):
        dst.write(arr.astype("float32"), i)
        dst.set_band_description(i, name)
    dst.update_tags(sources=json.dumps(sources), x_ground_scale=str(x_scale))

r_idx, c_idx = np.indices((rows, cols))
xs, ys = rasterio.transform.xy(cell_transform, r_idx.ravel(), c_idx.ravel())
csv_path = f"{OUT_DIR}/demo_features.csv"
with open(csv_path, "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["row", "col", "x_m", "y_m", *layers])
    flat = [arr.ravel() for arr in layers.values()]
    for i in range(rows * cols):
        w.writerow([r_idx.flat[i], c_idx.flat[i], f"{xs[i]:.1f}", f"{ys[i]:.1f}",
                    *(f"{v[i]:.3f}" if np.isfinite(v[i]) else "" for v in flat)])

with open(f"{OUT_DIR}/demo_sources.json", "w") as f:
    json.dump(sources, f, indent=2)

print(f"\nSaved {tif_path} ({len(layers)} bands), {csv_path} ({rows * cols} rows), "
      f"{OUT_DIR}/demo_sources.json")

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

plt.figure(figsize=(8, 7))
plt.imshow(cell_thermal, cmap="inferno", extent=extent)
plt.colorbar(label=f"{th_quantity.replace('_', ' ')} ({th_units})")
plt.title(f"Demo box {th_quantity.replace('_', ' ')} (Mars Odyssey THEMIS, {th_res:.0f} m, on {CELL_M} m cells)")
plt.xlabel("km from DTM left edge")
plt.ylabel("km from DTM top edge")
plt.savefig("figures/demo_thermal.png", dpi=120)

plt.show()
