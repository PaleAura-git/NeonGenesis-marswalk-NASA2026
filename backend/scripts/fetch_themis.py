"""Save the THEMIS Night IR window around the demo box from USGS's global controlled mosaic (100 m).

Night IR brightness tracks thermal inertia: rock and coarse ground stay warm at night, fine sand cools fast.
The mosaic is 8-bit relative brightness, not calibrated temperature, so it is a stated proxy.
Usage: python scripts/fetch_themis.py <demo_grid.tif> [out=data/raw/themis/themis_nightir_jezero.tif] [margin_m=2000]
"""
import sys
from pathlib import Path

import rasterio
from rasterio.windows import from_bounds

URL = ("https://asc-pds-services.s3.us-west-2.amazonaws.com/mosaic/Mars/THEMIS_controlled_mosaics/"
       "AA_mosaics/THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018.tif")

grid_path = sys.argv[1]
out = Path(sys.argv[2] if len(sys.argv) > 2 else "data/raw/themis/themis_nightir_jezero.tif")
margin = float(sys.argv[3]) if len(sys.argv) > 3 else 2000

with rasterio.open(grid_path) as g:
    left, bottom, right, top = g.bounds
with rasterio.open("/vsicurl/" + URL) as src:
    window = from_bounds(left - margin, bottom - margin, right + margin, top + margin, src.transform)
    window = window.round_offsets().round_lengths()
    data = src.read(1, window=window)
    profile = src.profile | {"width": window.width, "height": window.height,
                             "transform": src.window_transform(window), "blockxsize": None, "blockysize": None}

out.parent.mkdir(parents=True, exist_ok=True)
profile.pop("blockxsize"), profile.pop("blockysize")
with rasterio.open(out, "w", **profile) as dst:
    dst.write(data, 1)
    dst.update_tags(quantity="night_ir_brightness", units="DN (8-bit, relative)",
                    mission="Mars Odyssey", instrument="THEMIS (band 9, 12.57 um)",
                    product="THEMIS Night IR Controlled Mosaic v2 (Oct 2018), USGS Astrogeology", source=URL)
valid = data > 0
print(f"Saved {out}: {window.width} x {window.height} px at 100 m | valid {valid.mean() * 100:.1f}% | "
      f"DN min {data[valid].min()}, median {int(sorted(data[valid].ravel())[valid.sum() // 2])}, max {data[valid].max()}")
