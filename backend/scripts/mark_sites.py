"""Place each site from sites.csv on the HiRISE DTM and check it lands on real data."""
import csv
import math
import sys

import rasterio
from rasterio.windows import Window

MARS_RADIUS_M = 3_396_190  # Mars sphere radius used by the HiRISE DTM

csv_path, dtm_path = sys.argv[1], sys.argv[2]

# Read the sites table (one dict per row, keyed by column name)
with open(csv_path, newline="") as f:
    sites = list(csv.DictReader(f))

with rasterio.open(dtm_path) as src:
    # Safety check: our lat/lon formula only fits this exact projection
    crs = src.crs.to_dict()
    print("DTM:", dtm_path)
    print("CRS:", crs.get("proj"), "| standard parallel:", crs.get("lat_ts", 0),
          "| radius:", crs.get("R"))
    if crs.get("proj") != "eqc" or crs.get("lat_ts", 0) != 0 or crs.get("R") != MARS_RADIUS_M:
        sys.exit("Projection is not equirectangular, parallel 0, R=3396190: formula would be wrong")

    b = src.bounds
    print(f"\n{'site':<18}{'km across':>10}{'km down':>9}{'inside':>8}"
          f"{'DTM elev':>10}{'rover elev':>11}{'diff':>7}")

    for s in sites:
        # Lat/lon (degrees) -> map metres: arc length on the sphere
        x = MARS_RADIUS_M * math.radians(float(s["lon_deg"]))
        y = MARS_RADIUS_M * math.radians(float(s["lat_deg"]))

        # Map metres -> km from the DTM's left and top edges (same axes as overview.py)
        km_across = (x - b.left) / 1000
        km_down = (b.top - y) / 1000
        inside = b.left <= x <= b.right and b.bottom <= y <= b.top

        # Read just the one pixel under the site (never the whole file)
        dtm_elev = None
        if inside:
            row, col = src.index(x, y)
            pixel = src.read(1, window=Window(col, row, 1, 1), masked=True)
            if not pixel.mask.any():
                dtm_elev = float(pixel[0, 0])

        # Compare with the rover's own elevation, where we have one
        rover = float(s["elev_m"]) if s["elev_m"] else None
        dtm_txt = f"{dtm_elev:.1f}" if dtm_elev is not None else "NO DATA"
        rover_txt = f"{rover:.1f}" if rover is not None else "-"
        diff_txt = (f"{dtm_elev - rover:+.1f}"
                    if dtm_elev is not None and rover is not None else "-")
        print(f"{s['id']:<18}{km_across:>10.2f}{km_down:>9.2f}{'yes' if inside else 'NO':>8}"
              f"{dtm_txt:>10}{rover_txt:>11}{diff_txt:>7}")

# Quality summary: every site must sit on valid data before we plan routes
print("\nAll sites must show inside = yes and a DTM elevation (not NO DATA).")
