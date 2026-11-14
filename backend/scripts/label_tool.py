"""Pick cells to label, cut HiRISE image patches, and build contact sheets plus a blind-check page.

Usage: python scripts/label_tool.py <demo_grid.tif> <ortho_25cm.tif> [n_cells=160] [n_check=30] [round=1]
Writes to data/processed/labels/: cells.csv, sheets/sheet_XX.png, check.html (round 1) or check_round<N>.html.
Later rounds use new cells only, never ones from labels/check_labels*.csv.
"""
import base64
import csv
import io
import json
import sys
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import rasterio

SEED = 2026
PATCH_M = 50
MIN_GAP_CELLS = 5
SLOPE_BINS = [(0, 5), (5, 10), (10, 15), (15, 90)]
PER_SHEET = 16
OUT = Path("data/processed/labels")
CLASSES = ["sand", "bedrock", "rough", "steep", "unsure"]


def pick_cells(slope, n, rng):
    picked = []
    per_bin = n // len(SLOPE_BINS)
    for lo, hi in SLOPE_BINS:
        cand = np.argwhere((slope >= lo) & (slope < hi))
        rng.shuffle(cand)
        got = 0
        for r, c in cand:
            if 3 <= r < slope.shape[0] - 3 and 3 <= c < slope.shape[1] - 3 and all(
                    max(abs(r - pr), abs(c - pc)) >= MIN_GAP_CELLS for pr, pc, _ in picked):
                picked.append((int(r), int(c), f"{lo}-{hi}"))
                got += 1
                if got == per_bin:
                    break
    return picked


def patch(ortho, stretch, r, c, cell_px, half_px):
    cy, cx = int((r + 0.5) * cell_px), int((c + 0.5) * cell_px)
    a = ortho[cy - half_px:cy + half_px, cx - half_px:cx + half_px].astype(float)
    return np.clip((a - stretch[0]) / (stretch[1] - stretch[0]), 0, 1)


def png_bytes(arr, cell_px, half_px):
    fig = plt.figure(figsize=(3, 3), dpi=100)
    ax = fig.add_axes([0, 0, 1, 1])
    ax.imshow(arr, cmap="gray", vmin=0, vmax=1)
    h = cell_px / 2
    ax.add_patch(plt.Rectangle((half_px - h, half_px - h), cell_px, cell_px, fill=False, ec="red", lw=1.5))
    ax.axis("off")
    buf = io.BytesIO()
    fig.savefig(buf, format="png")
    plt.close(fig)
    return buf.getvalue()


CHECK_HTML = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Terrain Label Check</title>
<style>
:root { --bg: #f6f4f1; --fg: #1d1b19; --muted: #6b655f; --line: #d8d2ca; --accent: #b4462c; --card: #fff; }
@media (prefers-color-scheme: dark) { :root { --bg: #161412; --fg: #ece7e1; --muted: #a39b92; --line: #3a3530; --accent: #e07656; --card: #211e1b; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 16px/1.45 system-ui, sans-serif; }
main { max-width: 640px; margin: 0 auto; padding: 24px 16px 48px; }
h1 { font-size: 1.3rem; margin: 0 0 4px; }
p { color: var(--muted); margin: 0 0 16px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 16px; }
.top { display: flex; justify-content: space-between; color: var(--muted); font-size: .9rem; margin-bottom: 8px; }
img { width: 100%; max-width: 420px; display: block; margin: 0 auto 16px; border-radius: 8px; image-rendering: pixelated; }
.btns { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; }
button { font: inherit; padding: 12px 4px; border-radius: 8px; border: 1px solid var(--line); background: var(--bg); color: var(--fg); cursor: pointer; }
button:hover, button:focus-visible { border-color: var(--accent); outline: none; }
button kbd { display: block; font-size: .75rem; color: var(--muted); }
.nav { display: flex; justify-content: space-between; margin-top: 12px; }
.nav button { padding: 8px 14px; }
dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 12px; font-size: .9rem; margin: 16px 0 0; }
dt { font-weight: 600; } dd { margin: 0; color: var(--muted); }
#done { display: none; text-align: center; }
#save { background: var(--accent); color: #fff; border-color: var(--accent); padding: 12px 20px; }
@media (max-width: 420px) { .btns { grid-template-columns: repeat(3, 1fr); } }
</style></head><body><main>
<h1>Terrain label check</h1>
<p>Label the ground inside the red 10 m box. Pick what covers most of it. Unsure is fine.</p>
<div class="card" id="card">
  <div class="top"><span id="pos"></span><span id="cid"></span></div>
  <img id="img" alt="HiRISE image patch, 50 m across">
  <div class="btns" id="btns"></div>
  <div class="nav"><button id="back">Back</button><span></span></div>
</div>
<div class="card" id="done"><p>All done. Save the file and give it to Afan.</p><button id="save">Save labels CSV</button></div>
<dl>
  <dt>Sand</dt><dd>Smooth, often darker, ripples or small dunes</dd>
  <dt>Bedrock</dt><dd>Solid, often brighter, cracked or layered, few loose rocks</dd>
  <dt>Rough</dt><dd>Scattered boulders, rubble, bumpy broken ground</dd>
  <dt>Steep</dt><dd>Scarp or cliff face, strong shadows, layered wall</dd>
  <dt>Unsure</dt><dd>Can't tell</dd>
</dl>
</main>
<script>
const items = __ITEMS__, classes = __CLASSES__, answers = {};
let i = 0;
const $ = id => document.getElementById(id);
classes.forEach((c, k) => {
  const b = document.createElement("button");
  b.innerHTML = c[0].toUpperCase() + c.slice(1) + "<kbd>" + (k + 1) + "</kbd>";
  b.onclick = () => pick(c);
  $("btns").appendChild(b);
});
function show() {
  if (i >= items.length) { $("card").style.display = "none"; $("done").style.display = "block"; return; }
  $("card").style.display = "block"; $("done").style.display = "none";
  $("img").src = "data:image/png;base64," + items[i].img;
  $("pos").textContent = (i + 1) + " / " + items.length;
  $("cid").textContent = items[i].id + (answers[items[i].id] ? " · " + answers[items[i].id] : "");
}
function pick(c) { answers[items[i].id] = c; i++; show(); }
$("back").onclick = () => { if (i > 0) { i--; show(); } };
document.addEventListener("keydown", e => {
  const k = parseInt(e.key, 10);
  if (k >= 1 && k <= classes.length && i < items.length) pick(classes[k - 1]);
});
$("save").onclick = () => {
  const rows = ["cell_id,label,labeller"].concat(items.map(it => it.id + "," + (answers[it.id] || "") + ",omair"));
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([rows.join("\\n") + "\\n"], { type: "text/csv" }));
  a.download = "check_labels.csv";
  a.click();
};
show();
</script></body></html>
"""


def main():
    grid_path, ortho_path = sys.argv[1], sys.argv[2]
    n_cells = int(sys.argv[3]) if len(sys.argv) > 3 else 160
    n_check = int(sys.argv[4]) if len(sys.argv) > 4 else 30
    check_round = int(sys.argv[5]) if len(sys.argv) > 5 else 1
    rng = np.random.default_rng(SEED)

    with rasterio.open(grid_path) as g:
        slope = g.read(list(g.descriptions).index("slope_mean_deg") + 1)
        cell_m = g.res[0]
    with rasterio.open(ortho_path) as o:
        ortho = o.read(1)
        res = o.res[0]
        stretch = json.loads(o.tags()["stretch"])
    cell_px, half_px = int(cell_m / res), int(PATCH_M / 2 / res)

    cells = pick_cells(slope, n_cells, rng)
    order = rng.permutation(len(cells))
    cells = [cells[i] for i in order]
    (OUT / "sheets").mkdir(parents=True, exist_ok=True)
    with open(OUT / "cells.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["cell_id", "row", "col", "slope_bin"])
        for i, (r, c, b) in enumerate(cells):
            w.writerow([f"c{i:03d}", r, c, b])

    for s in range(0, len(cells), PER_SHEET):
        chunk = cells[s:s + PER_SHEET]
        fig, axes = plt.subplots(4, 4, figsize=(12, 12.6))
        for ax, (k, (r, c, _)) in zip(axes.flat, enumerate(chunk, start=s)):
            ax.imshow(patch(ortho, stretch, r, c, cell_px, half_px), cmap="gray", vmin=0, vmax=1)
            h = cell_px / 2
            ax.add_patch(plt.Rectangle((half_px - h, half_px - h), cell_px, cell_px, fill=False, ec="red", lw=1.2))
            ax.set_title(f"c{k:03d}", fontsize=11)
            ax.axis("off")
        for ax in list(axes.flat)[len(chunk):]:
            ax.axis("off")
        fig.suptitle(f"HiRISE 25 cm, {PATCH_M} m patches, red box = 10 m cell to label", fontsize=12)
        fig.tight_layout()
        fig.savefig(OUT / "sheets" / f"sheet_{s // PER_SHEET:02d}.png", dpi=80)
        plt.close(fig)

    check_idx = sorted(rng.choice(len(cells), n_check, replace=False))
    if check_round > 1:
        seen = {r["cell_id"] for f in Path("labels").glob("check_labels*.csv") for r in csv.DictReader(open(f))}
        free = [i for i in range(len(cells)) if f"c{i:03d}" not in seen]
        check_idx = sorted(np.random.default_rng(SEED + check_round).choice(free, n_check, replace=False))
    items = [{"id": f"c{i:03d}", "img": base64.b64encode(
        png_bytes(patch(ortho, stretch, cells[i][0], cells[i][1], cell_px, half_px), cell_px, half_px)).decode()}
        for i in check_idx]
    page = CHECK_HTML.replace("__ITEMS__", json.dumps(items)).replace("__CLASSES__", json.dumps(CLASSES))
    name = "check.html" if check_round == 1 else f"check_round{check_round}.html"
    if check_round > 1:
        page = page.replace("check_labels.csv", f"check_labels_round{check_round}.csv")
    (OUT / name).write_text(page)
    print(f"{len(cells)} cells ({', '.join(f'{lo}-{hi}°' for lo, hi in SLOPE_BINS)} slope bins), "
          f"{(len(cells) + PER_SHEET - 1) // PER_SHEET} sheets, blind check of {n_check} in {OUT / name}")


if __name__ == "__main__":
    main()
