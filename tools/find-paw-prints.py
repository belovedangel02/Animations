#!/usr/bin/env python3
"""Locate the paw prints stamped into the card's background.

The animation gives each one a slow pulse, like a distant star, so it needs
their real positions rather than hand-guessed ones. The prints are simply
darker than the paper around them, so a difference-of-means filter finds them:
compare each pixel to the average of a much wider neighbourhood, keep what is
meaningfully darker, then take one peak per blob.

Prints inside the cat, the flower borders and the letter panel are discarded —
those areas are busy enough that the filter fires on petals and glyphs too.

Writes normalised (x, y, radius) triples as JSON for src/config.js.
"""

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

SRC = Path(__file__).resolve().parent.parent / "assets" / "nala-card-source.png"
OUT = Path(__file__).resolve().parent.parent / "src" / "paw-prints.json"

# Regions to ignore, as (x0, y0, x1, y1) in normalised card space: the flower
# borders, Nala and her cloud, the letter panel and the heart.
EXCLUDE = [
    (0.000, 0.000, 1.000, 0.022),   # top sliver
    (0.280, 0.185, 0.735, 0.590),   # Nala and her cloud
    (0.655, 0.000, 1.000, 0.160),   # the angel's cloud
    (0.000, 0.600, 1.000, 1.000),   # the letter, the heart, the lower border
    (0.000, 0.000, 0.175, 0.300),   # dense blossom, top left
    (0.790, 0.000, 1.000, 0.095),   # dense blossom, top right
]


def box_mean(img: np.ndarray, r: int) -> np.ndarray:
    """Mean over a (2r+1) square window, via a summed-area table."""
    pad = np.pad(img, r + 1, mode="edge")
    integral = pad.cumsum(0).cumsum(1)
    h, w = img.shape
    y0, x0 = np.arange(h), np.arange(w)
    yy = y0[:, None]
    xx = x0[None, :]
    a = integral[yy, xx]
    b = integral[yy, xx + 2 * r + 1]
    c = integral[yy + 2 * r + 1, xx]
    d = integral[yy + 2 * r + 1, xx + 2 * r + 1]
    return (d - b - c + a) / ((2 * r + 1) ** 2)


def main() -> int:
    if not SRC.exists():
        print(f"missing base plate: {SRC}", file=sys.stderr)
        return 1

    im = Image.open(SRC).convert("RGB")
    W, H = im.size
    arr = np.asarray(im, dtype=np.float32) / 255.0

    # Luminance, plus a "how mauve is this" term. The prints are a muted
    # red-brown, so red leads blue by a clear margin inside them.
    lum = arr @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    warmth = arr[:, :, 0] - arr[:, :, 2]

    # The prints sit in a narrow band of tone: clearly darker than the paper but
    # nowhere near as dark as a hummingbird's body or a shadowed leaf, and warm
    # without being the saturated pink of the blossoms. Anything outside that
    # band is not a paw print, whatever the contrast filter says about it.
    is_print_tone = (lum > 0.46) & (lum < 0.82) & (warmth > 0.045) & (warmth < 0.26)

    # Compare against a neighbourhood comfortably wider than one print so a
    # print reads as a dip rather than blending into its own average.
    local = box_mean(lum, 44)
    darker = np.clip(local - lum, 0, None)
    warmer = np.clip(warmth - box_mean(warmth, 44), 0, None)

    score = (darker + warmer * 0.4) * is_print_tone

    # Mask out the busy regions.
    keep = np.ones((H, W), dtype=bool)
    for x0, y0, x1, y1 in EXCLUDE:
        keep[int(y0 * H):int(y1 * H), int(x0 * W):int(x1 * W)] = False
    score = np.where(keep, score, 0.0)

    # Smooth at roughly the radius of a print, so each becomes a single hill
    # rather than a ring of edge responses.
    score = box_mean(score, 16)

    thresh = max(0.012, float(np.percentile(score[score > 0], 86.0)))

    # Greedy non-maximum suppression: brightest peak first, then clear a disc
    # around it so one print cannot yield several hits.
    min_sep = 34
    ys, xs = np.nonzero(score >= thresh)
    if len(ys) == 0:
        print("no prints found — is the threshold too high?", file=sys.stderr)
        return 1
    vals = score[ys, xs]
    order = np.argsort(-vals)
    taken: list[tuple[int, int, float]] = []
    claimed = np.zeros((H, W), dtype=bool)
    for idx in order:
        y, x = int(ys[idx]), int(xs[idx])
        if claimed[y, x]:
            continue
        taken.append((x, y, float(vals[idx])))
        y0, y1 = max(0, y - min_sep), min(H, y + min_sep + 1)
        x0, x1 = max(0, x - min_sep), min(W, x + min_sep + 1)
        claimed[y0:y1, x0:x1] = True
        if len(taken) >= 38:
            break

    strongest = max(v for _, _, v in taken)
    prints = [
        {
            "x": round(x / W, 5),
            "y": round(y / H, 5),
            # Stronger prints read as larger, so the glow follows suit.
            "r": round(0.020 + 0.016 * (v / strongest), 5),
        }
        for x, y, v in taken
    ]
    prints.sort(key=lambda p: (p["y"], p["x"]))

    OUT.write_text(json.dumps(prints, indent=0, separators=(",", ":")) + "\n")
    print(f"found {len(prints)} paw prints -> {OUT}")

    # A quick visual check: mark each hit on a copy of the card.
    if "--preview" in sys.argv:
        from PIL import ImageDraw

        prev = im.copy()
        draw = ImageDraw.Draw(prev)
        for p in prints:
            cx, cy = p["x"] * W, p["y"] * H
            rr = p["r"] * W
            draw.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], outline=(0, 255, 60), width=3)
        dest = Path(sys.argv[sys.argv.index("--preview") + 1])
        prev.save(dest)
        print(f"preview -> {dest}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
