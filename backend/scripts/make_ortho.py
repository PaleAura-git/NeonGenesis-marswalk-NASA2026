"""Turn the downloaded HiRISE orthomosaic rows into a demo-box GeoTIFF (25 cm) and a map overlay PNG.

The source is USGS's JEZ_hirise_soc_006_orthoMosaic_25cm (7.4 GB, uncompressed, one row per strip,
row r starts at byte 1032257 + r * 85600), so the demo box (rows 43200-59199) is one byte range:

    curl -r 3698952257-5068552256 -o data/raw/hirise_ortho/demo_rows.bin \
      https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first.tif

Usage: python scripts/make_ortho.py <demo_rows.bin> <demo_grid.tif>
"""
import json
import sys

import matplotlib.pyplot as plt
import numpy as np
import rasterio
from rasterio.transform import from_origin

SOURCE_WIDTH = 85600
SOURCE_LEFT, SOURCE_TOP = 4577366.0, 1106618.0
RES = 0.25
SOURCE = ("https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/mars2020_trn/HiRISE/"
          "JEZ_hirise_soc_006_orthoMosaic_25cm_Eqc_latTs0_lon0_first.tif")

rows_path, grid_path = sys.argv[1], sys.argv[2]
with rasterio.open(grid_path) as g:
    left, top = g.transform * (0, 0)
    right, bottom = g.transform * (g.width, g.height)
    crs = g.crs

col0 = round((left - SOURCE_LEFT) / RES)
ncols = round((right - left) / RES)
nrows = round((top - bottom) / RES)
rows = np.memmap(rows_path, dtype="uint8", mode="r", shape=(nrows, SOURCE_WIDTH))
img = np.ascontiguousarray(rows[:, col0:col0 + ncols])

valid = img > 0
lo, hi = np.percentile(img[valid], [1, 99])
print(f"Demo box image: {ncols} x {nrows} px at {RES} m | valid {valid.mean() * 100:.1f}% | "
      f"DN p1 {lo:.0f}, median {np.median(img[valid]):.0f}, p99 {hi:.0f}")

tif = "data/processed/ortho_25cm.tif"
with rasterio.open(tif, "w", driver="GTiff", width=ncols, height=nrows, count=1, dtype="uint8",
                   crs=crs, transform=from_origin(left, top, RES, RES), nodata=0,
                   tiled=True, compress="deflate") as dst:
    dst.write(img, 1)
    dst.update_tags(source=SOURCE, mission="MRO", instrument="HiRISE", stretch=json.dumps([float(lo), float(hi)]))
print("Saved", tif)

small = img.reshape(nrows // 8, 8, ncols // 8, 8).mean(axis=(1, 3))
shown = np.clip((small - lo) / (hi - lo), 0, 1)
rgba = plt.get_cmap("gray")(shown)
rgba[..., 3] = np.where(small > 0, 1.0, 0.0)
plt.imsave("exports/optical.png", rgba)
print(f"Saved exports/optical.png ({small.shape[1]} x {small.shape[0]} px, 2 m)")
