"""Terrain classes: random forest for surface material (sand / bedrock / rough), spatially cross-validated.
"Steep" is not predicted: it is measured directly (cell mean slope over 15 degrees), as in the planner.

Usage: python scripts/train_classifier.py <demo_grid.tif> <ortho_25cm.tif> <labels.csv> [check_labels.csv ...]
Writes data/processed/terrain.tif (class + confidence) and exports/terrain.png.
"""
import csv
import json
import sys
from pathlib import Path

import matplotlib.pyplot as plt
import numpy as np
import rasterio
from matplotlib.colors import ListedColormap
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.model_selection import GroupKFold

CLASSES = ["sand", "bedrock", "rough", "steep"]
MATERIALS = CLASSES[:3]
STEEP_DEG = 15
COLOURS = ["#e3c16f", "#8c8c8c", "#b5562e", "#6a2c70"]
BLOCK_CELLS = 100
TERRAIN = ["slope_mean_deg", "slope_p90_deg", "roughness_deg", "thermal"]
OPTICAL = ["brightness", "texture"]
SEED = 2026


def optical_features(ortho_path, shape):
    with rasterio.open(ortho_path) as o:
        img = o.read(1).astype("float32")
    rows, cols = shape
    k = img.shape[0] // rows
    blocks = img[:rows * k, :cols * k].reshape(rows, k, cols, k).transpose(0, 2, 1, 3).reshape(rows, cols, -1)
    blocks[blocks == 0] = np.nan
    return {"brightness": np.nanmean(blocks, axis=2), "texture": np.nanstd(blocks, axis=2)}


def evaluate(X, y, groups, names):
    pred = np.empty_like(y)
    for train, test in GroupKFold(n_splits=4).split(X, y, groups):
        model = RandomForestClassifier(n_estimators=300, class_weight="balanced", random_state=SEED)
        model.fit(X[train], y[train])
        pred[test] = model.predict(X[test])
    present = [c for c in MATERIALS if c in set(y)]
    print(classification_report(y, pred, labels=present, zero_division=0, digits=2))
    cm = confusion_matrix(y, pred, labels=present)
    print("Confusion matrix (rows = label, columns = predicted):")
    print(" " * 10 + "".join(f"{c:>9}" for c in present))
    for c, row in zip(present, cm):
        print(f"{c:>10}" + "".join(f"{v:>9}" for v in row))
    off = cm - np.diag(np.diag(cm))
    pairs = sorted(((int(off[i, j] + off[j, i]), present[i], present[j])
                    for i in range(len(present)) for j in range(i + 1, len(present))), reverse=True)
    return float(np.mean(pred == y)), pairs


if __name__ == "__main__":
    grid_path, ortho_path, labels_path = sys.argv[1], sys.argv[2], sys.argv[3]
    check_paths = [p for p in sys.argv[4:] if Path(p).exists()]

    with rasterio.open(grid_path) as g:
        bands = {n: g.read(i + 1) for i, n in enumerate(g.descriptions)}
        profile = g.profile
    bands |= optical_features(ortho_path, bands["slope_mean_deg"].shape)

    with open(labels_path, newline="") as f:
        labels = [r for r in csv.DictReader(f) if r["label"] in MATERIALS]
    rows = np.array([int(r["row"]) for r in labels])
    cols = np.array([int(r["col"]) for r in labels])
    y = np.array([r["label"] for r in labels])
    groups = (rows // BLOCK_CELLS) * 10 + cols // BLOCK_CELLS
    print(f"Material labels used: {len(y)} | " + ", ".join(f"{c} {np.sum(y == c)}" for c in MATERIALS)
          + f" | spatial blocks: {len(set(groups))} of {BLOCK_CELLS * 10} m")

    mine = {r["cell_id"]: r["label"] for r in csv.DictReader(open(labels_path))}
    checked = agreed = 0
    for check_path in check_paths:
        theirs = {r["cell_id"]: r["label"] for r in csv.DictReader(open(check_path)) if r["label"]}
        both = [k for k in theirs if k in mine and mine[k] in MATERIALS and theirs[k] in MATERIALS]
        same = sum(mine[k] == theirs[k] for k in both)
        checked, agreed = checked + len(both), agreed + same
        print(f"\nBlind check {check_path}: {same}/{len(both)} material labels agree")
    if checked:
        print(f"Blind checks combined: {agreed}/{checked} = {agreed / checked * 100:.0f}%")

    results = {}
    for name, feats in (("terrain only", TERRAIN), ("terrain + optical", TERRAIN + OPTICAL)):
        X = np.column_stack([bands[f][rows, cols] for f in feats])
        print(f"\n=== {name}: {', '.join(feats)} (4-fold spatial cross-validation) ===")
        results[name] = (evaluate(X, y, groups, feats), feats)

    majority = max(np.mean(y == c) for c in MATERIALS)
    print(f"\nBaseline (always the most common class): {majority * 100:.0f}%")
    best = max(results, key=lambda k: results[k][0][0])
    feats = results[best][1]
    accuracy, confused = results[best][0]
    print(f"\nFinal model: {best} (spatial accuracy {accuracy * 100:.0f}%)")
    model = RandomForestClassifier(n_estimators=300, class_weight="balanced", random_state=SEED)
    model.fit(np.column_stack([bands[f][rows, cols] for f in feats]), y)
    for f, imp in sorted(zip(feats, model.feature_importances_), key=lambda t: -t[1]):
        print(f"  importance {f:<16} {imp:.2f}")

    shape = bands["slope_mean_deg"].shape
    X_all = np.column_stack([bands[f].ravel() for f in feats])
    ok = np.all(np.isfinite(X_all), axis=1)
    cls = np.full(X_all.shape[0], -1, dtype="int16")
    conf = np.full(X_all.shape[0], np.nan, dtype="float32")
    proba = model.predict_proba(X_all[ok])
    order = [CLASSES.index(c) for c in model.classes_]
    cls[ok] = np.array(order)[proba.argmax(axis=1)]
    conf[ok] = proba.max(axis=1)
    cls, conf = cls.reshape(shape), conf.reshape(shape)
    steep = bands["slope_mean_deg"] > STEEP_DEG
    cls[steep] = CLASSES.index("steep")
    conf[steep] = 1.0

    print("\nPredicted share of the demo box: " + ", ".join(
        f"{c} {np.mean(cls == i) * 100:.0f}%" for i, c in enumerate(CLASSES)))
    print(f"Confidence: median {np.nanmedian(conf):.2f} | cells under 0.5: {np.nanmean(conf < 0.5) * 100:.0f}%")

    profile.update(count=2, dtype="float32", nodata=np.nan)
    with rasterio.open("data/processed/terrain.tif", "w", **profile) as dst:
        dst.write(cls.astype("float32"), 1)
        dst.write(conf, 2)
        dst.set_band_description(1, "terrain_class")
        dst.set_band_description(2, "confidence")
        dst.update_tags(classes=",".join(CLASSES), model=best, features=",".join(feats),
                        spatial_accuracy=f"{accuracy:.3f}", labels=labels_path)

    rgba = ListedColormap(COLOURS)(np.clip(cls, 0, 3))
    rgba[..., 3] = np.where(cls >= 0, 0.35 + 0.45 * np.nan_to_num(conf), 0)
    plt.imsave("exports/terrain.png", rgba)

    extent = [0, shape[1] * 0.01, shape[0] * 0.01, 0]
    plt.figure(figsize=(9, 8))
    plt.imshow(np.ma.masked_less(cls, 0), cmap=ListedColormap(COLOURS), vmin=-0.5, vmax=3.5, extent=extent)
    cb = plt.colorbar(ticks=range(4))
    cb.ax.set_yticklabels(CLASSES)
    plt.scatter(cols * 0.01 + 0.005, rows * 0.01 + 0.005, c="white", s=6, edgecolors="black", linewidths=0.3,
                label="labelled cells")
    plt.legend(loc="lower left")
    plt.title(f"Terrain classes ({best}, random forest, 10 m cells)")
    plt.xlabel("km from demo box left edge")
    plt.ylabel("km from demo box top edge")
    plt.savefig("figures/terrain_classes.png", dpi=120)
    importance = sorted(zip(feats, model.feature_importances_), key=lambda t: -t[1])
    metrics = {
        "labelledCells": len(mine),
        "materialLabelsUsed": int(len(y)),
        "labelCounts": {c: int(np.sum(y == c)) for c in MATERIALS},
        "method": "Random forest, 4-fold spatial cross-validation over 1 km blocks",
        "spatialAccuracy": round(accuracy, 3),
        "terrainOnlyAccuracy": round(results["terrain only"][0][0], 3),
        "baselineAccuracy": round(float(majority), 3),
        "mostConfused": [{"classes": [a, b], "cells": n} for n, a, b in confused if n > 0][:2],
        "topFeatures": [{"feature": f, "importance": round(float(i), 2)} for f, i in importance[:3]],
        "labelAgreement": {"agreed": agreed, "checked": checked} if checked else None,
        "steepRule": f"Steep is measured, not predicted: cell mean slope over {STEEP_DEG} degrees",
        "limits": "Labels come from one AI-assisted labeller on HiRISE image patches, partly re-checked blind by "
                  "two teammates; sand and rough are often confused. Treat classes as a guide, not ground truth.",
    }
    Path("exports/classifier_metrics.json").write_text(json.dumps(metrics, indent=2))
    print("Saved data/processed/terrain.tif, exports/terrain.png, exports/classifier_metrics.json, "
          "figures/terrain_classes.png")
