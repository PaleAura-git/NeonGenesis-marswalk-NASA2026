"""Show a shrunken overview of a large raster, with km axes, to choose an area."""
import sys

import matplotlib.pyplot as plt
import numpy as np
import rasterio

path = sys.argv[1]
factor = int(sys.argv[2]) if len(sys.argv) > 2 else 20

with rasterio.open(path) as src:
    small = src.read(
        1,
        out_shape=(src.height // factor, src.width // factor),
        masked=True,
    )
    b = src.bounds

elev = small.filled(np.nan)
print(f"Overview: {small.shape[1]} x {small.shape[0]} px (every {factor}th pixel)")
print(f"Valid: {np.isfinite(elev).mean() * 100:.1f}%")

extent_km = [0, (b.right - b.left) / 1000, (b.top - b.bottom) / 1000, 0]
plt.figure(figsize=(9, 8))
plt.imshow(elev, cmap="terrain", extent=extent_km)
plt.colorbar(label="Elevation (m)")
plt.title(f"HiRISE DTM overview (1 m data, shown every {factor}th pixel)")
plt.xlabel("km from left edge")
plt.ylabel("km from top edge")
plt.grid(alpha=0.3)
plt.savefig("figures/hirise_overview.png", dpi=120)
plt.show()
