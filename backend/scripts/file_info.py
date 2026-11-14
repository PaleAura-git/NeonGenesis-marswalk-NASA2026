"""Print a raster's metadata without loading its pixels (safe for huge files)."""
import sys

import rasterio

for path in sys.argv[1:]:
    with rasterio.open(path) as src:
        # Basic facts from the file's "label" (no pixels are read)
        print("=" * 60)
        print("File:", path)
        print("Size (px):", src.width, "x", src.height)
        print("Pixel size (m):", src.res)
        print("Bands:", src.count, "| Data type:", src.dtypes[0])
        print("No-data value:", src.nodata)
        print("Bounds:", src.bounds)
        w_km = src.width * src.res[0] / 1000
        h_km = src.height * src.res[1] / 1000
        print(f"Area: {w_km:.1f} x {h_km:.1f} km")

        # Projection: compare these before combining any two layers
        crs = src.crs.to_dict()
        print("CRS name:", crs.get("proj", "?"),
              "| standard parallel:", crs.get("lat_ts", 0),
              "| radius (m):", crs.get("R", crs.get("a", "?")))

        # Self-check: pixel count x pixel size must equal the bounds' width
        bounds_w = src.bounds.right - src.bounds.left
        if abs(src.width * src.res[0] - bounds_w) < src.res[0]:
            print("Size check: OK")
        else:
            print("Size check: FAILED (pixel size and bounds disagree)")
