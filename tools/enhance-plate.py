#!/usr/bin/env python3
"""Recover detail the source artwork lost, before anything is animated.

Two things on this card are painted so faintly they disappear:

  * the hummingbird just above the bottom-right one. Its head is a flat teal
    smudge and its beak has no edge at all, so the bird looks swallowed by the
    blossom behind it;
  * the butterflies drifting around Nala, which are barely a pale wash.

The bird is repaired by borrowing from a neighbour. The card has four
hummingbirds along the bottom: two green ones with red gorgets, and two pale
teal ones. The swallowed bird is teal, so the donor is the other teal bird at
the bottom left — mirrored, since it faces the other way. Borrowing from the
crisp green bird instead gives a red throat that does not belong to him.

The graft is colour-corrected into place rather than pasted flat: the donor's
detail is kept while its colour leans toward the local palette. How far it
leans matters. Match fully and a piece landing on blossom is bleached to
blossom; do not match at all and it arrives as an obvious patch.

The butterflies only need their existing paint brought up. Pushing each pixel
away from its local average sharpens the edges that are already there without
inventing any. They are found by colour, not position: they are the only cool
blue-violet marks on an entirely warm card, so a coolness mask catches them
wherever they sit and leaves the paws, blossoms and Nala's fur alone.

Writes assets/nala-card-plate.png and the upscaled WebP the animation loads.
"""

import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "assets" / "nala-card-source.png"
PLATE = ROOT / "assets" / "nala-card-plate.png"
WEBP = ROOT / "assets" / "nala-card-2160.webp"

# Rebuilding the swallowed bird, piece by piece, from the other teal hummingbird
# at the bottom left. All coordinates are source pixels; the shapes that select
# what to lift are given in patch pixels, relative to the square cut around the
# donor. Head and body carry their own scale and rotation rather than sharing
# one transform: the two birds are posed differently, and this one holds its
# body tucked up under its chin.

# Blemishes dissolved into the blossom before anything is grafted on top.
# (cx, cy, rx, ry, blur)
HEALS = [
    # The faint bird's original face was a dark smear. Once a real head sits
    # over it, the leftover reads as a bruise under the new beak.
    (601, 962, 14, 12, 18),
    # A dark blue-grey blob directly above his head. It is not part of the
    # bird — not his tail, which would sit down and to the right behind his
    # body — and it reads as a bruise hanging over him.
    (626, 915, 17, 13, 20),
    # The whole of the shapeless blob he originally had for a head. Clearing
    # only the parts that stuck out from behind the graft was whack-a-mole —
    # every pass left another edge showing. The entire blob goes, and the
    # grafted head below is then the only head in the frame, sitting on
    # blossom with nothing of the old one left to peek around it.
    (617, 949, 22, 20, 14),
]

# Cleared *after* the grafts, for marks the grafts themselves bring in.
POST_HEALS = [
    # A red speck on his belly. This one is not on the card underneath — the
    # source is warm tan there — it rides in on the body graft, lifted from a
    # red flower lying beside the donor's belly. Cheaper to take off afterwards
    # than to shrink the donor patch and lose the bird with it.
    (612, 985, 10, 9, 9),
]

GRAFTS = [
    dict(
        name="head",
        donor=(204, 1186),   # the pale teal bird's skull, bottom left
        target=(612, 951),   # the faint bird's skull
        half=70,
        mirror=True,         # the donor faces right, the faint bird faces left
        # Sized from the skulls themselves — both birds have a head about 22px
        # across. Sizing from the head-to-body distance instead gives a much
        # smaller number and a head that sits wrong, because the two birds are
        # posed differently: this one holds its body tucked up under its chin.
        scale=1.00,
        # Barely turned: the smear the faint bird had for a face runs almost
        # level, so the donor's own slight upward tilt is nearly enough.
        rotation=-3.0,
        # Tight to the skull. A wider ellipse drags the donor's background in
        # with it and lands as a pale halo around the new head.
        ellipses=[(70, 70, 14.5, 15.0)],        # cx, cy, rx, ry
        capsules=[((80, 69), (127, 61), 3.4)],  # base, tip, half-width — the beak
        feather=3.5,
        match_radius=9,
        # Only a light lean toward the local colour. The old blob used to sit
        # here and gave the match something teal to aim at; now that it has been
        # cleared, matching fully would bleach the new head to blossom.
        match_strength=0.35,
    ),
    dict(
        name="body",
        donor=(187, 1219),   # the same bird's breast and belly
        target=(631, 971),
        half=55,
        mirror=True,
        # Smaller than the head graft on purpose: only the front of this bird's
        # breast is showing, the rest is behind its own wing. Reaching a little
        # further up his back than feels necessary, because otherwise blossom
        # shows through between his shoulders and the wing root.
        scale=1.00,
        rotation=-10.0,
        ellipses=[(55, 55, 28, 32)],
        capsules=[],
        feather=6.5,
        match_radius=13,
        # Held low: the ground under his back is peach blossom, and leaning
        # harder toward it puts that peach straight onto his shoulders.
        match_strength=0.26,
    ),
    dict(
        name="tail",
        # He is a teal bird, so the teal one at bottom left should have been the
        # donor here too — but its tail is painted loosely and half buried in
        # blossom at the very bottom edge of the card, and lifting that region
        # brings up leaves rather than feathers. The green bird at bottom right
        # has the only clean tail on the card, so this borrows its shape and
        # then tints the result onto his colouring, rather than letting it
        # arrive as a green bird's tail.
        donor=(645, 1153),
        # Set well back from the body. Tucked in closer, the tail appeared to
        # start at his belly and left no bird between the two.
        target=(665, 1005),
        half=42,
        mirror=False,        # that bird already faces the same way
        scale=0.60,
        rotation=-12.0,      # swings the tail down to trail his body
        ellipses=[(42, 42, 24, 25)],
        capsules=[],
        feather=6.0,
        match_radius=12,
        match_strength=0.45,
        tint=((132, 150, 142), 0.34),   # his slate-teal, and how far to pull
    ),
    dict(
        name="far-wing",
        # The wing on the far side of his body. Placed high enough that its
        # outline clears the near wing — sat directly behind it, the two just
        # merge into one thick wing rather than reading as a pair.
        donor=(145, 1193),   # the teal bird's wing, bottom left
        target=(666, 932),
        half=40,
        mirror=True,
        scale=0.92,
        rotation=-10.0,
        ellipses=[(40, 40, 26, 24)],
        capsules=[],
        feather=6.0,
        match_radius=12,
        match_strength=0.35,
    ),
]

# Gentle clarity lifts, applied after the grafts. (cx, cy, rx, ry, clarity, saturation)
CLARITY_SPOTS = [
    # The other soft bird, at the bottom left — the donor for everything above.
    (208, 1199, 68, 54, 1.55, 1.08),
]

# Softened after everything else. Clarity is the wrong tool on his body: it
# amplifies the speckle the graft and the blossom beneath leave behind, so the
# feathers end up mottled rather than defined. Easing that back gives the same
# smooth, even body the other teal bird has.
# (cx, cy, rx, ry, amount, radius)
SMOOTH_SPOTS = [
    (632, 974, 27, 30, 0.55, 3),
]

# Where to look for butterflies: the open background around Nala, clear of the
# letter panel and the dense borders.
BUTTERFLY_BAND = (0.14, 0.15, 0.92, 0.54)
BUTTERFLY_CLARITY = 2.85
BUTTERFLY_SATURATION = 1.18   # kept low; these should read, not glow
BUTTERFLY_DARKEN = 0.20       # deepens the wing veining so the shape holds
# How cool a pixel must be, relative to its surroundings, to count as wing. The
# lower bound is deliberately near zero: the pale outer wings barely tip cool at
# all, and those were the parts still washing out.
BUTTERFLY_COOL = (0.008, 0.055)
BUTTERFLY_TONE = (0.30, 0.42, 0.88, 0.99)  # dark rolloff, then bright rolloff


def box_mean(img: np.ndarray, r: int) -> np.ndarray:
    """Mean over a (2r+1) square window, per channel, via a summed-area table."""
    squeeze = img.ndim == 2
    if squeeze:
        img = img[:, :, None]
    out = np.empty_like(img)
    h, w = img.shape[:2]
    yy = np.arange(h)[:, None]
    xx = np.arange(w)[None, :]
    for c in range(img.shape[2]):
        pad = np.pad(img[:, :, c], r + 1, mode="edge")
        integral = pad.cumsum(0).cumsum(1)
        out[:, :, c] = (
            integral[yy + 2 * r + 1, xx + 2 * r + 1]
            - integral[yy, xx + 2 * r + 1]
            - integral[yy + 2 * r + 1, xx]
            + integral[yy, xx]
        ) / ((2 * r + 1) ** 2)
    return out[:, :, 0] if squeeze else out


def smoothstep(x, a, b):
    t = np.clip((x - a) / (b - a + 1e-9), 0, 1)
    return t * t * (3 - 2 * t)


def apply_masked(img, mask, clarity, saturation, darken=0.0, radius=9):
    """Blend a clarity/saturation boost into `img` wherever `mask` is non-zero."""
    if mask.max() <= 0:
        return img
    m = mask[:, :, None]
    local = box_mean(img, radius)
    boosted = local + (img - local) * clarity
    grey = boosted.mean(axis=2, keepdims=True)
    boosted = grey + (boosted - grey) * saturation
    if darken:
        shade = np.clip(local - boosted, 0, None).mean(axis=2, keepdims=True) / 255.0
        boosted = boosted - shade * darken * 255.0
    return np.clip(img * (1 - m) + boosted * m, 0, 255)


def heal_region(im: Image.Image, cx, cy, rx, ry, blur) -> Image.Image:
    """Paint a small blemish out, using the paint that surrounds it.

    Blurring the area alone does not work: the blemish is inside the window
    being averaged, so it survives as a softer version of itself. Instead the
    ellipse is first overwritten with the average of a ring drawn just outside
    it — the blemish contributes nothing to that — and only then blurred, so the
    flat fill picks up the surrounding gradient and settles in unnoticed.
    """
    pad = int(max(rx, ry) * 3 + blur * 2)
    box = (int(cx - pad), int(cy - pad), int(cx + pad), int(cy + pad))
    crop = im.crop(box)
    arr = np.asarray(crop, np.float32)

    h, w = arr.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.sqrt(((xx - w / 2) / rx) ** 2 + ((yy - h / 2) / ry) ** 2)

    ring = (d > 1.30) & (d < 2.60)
    if not ring.any():
        return im
    fill = arr[ring].mean(axis=0)

    covered = arr.copy()
    covered[d <= 1.30] = fill
    filled = np.asarray(
        Image.fromarray(covered.astype(np.uint8)).filter(ImageFilter.GaussianBlur(blur)),
        np.float32,
    )

    # A flat fill is smoother than anything around it, and that smoothness reads
    # as a blemish in its own right against painted blossom. Measure how much
    # fine detail the surrounding ring carries and put back the same amount, so
    # the repair sits at the card's own level of texture.
    detail = arr - np.asarray(
        Image.fromarray(arr.astype(np.uint8)).filter(ImageFilter.GaussianBlur(2.2)), np.float32
    )
    amplitude = float(detail[ring].std())
    rng = np.random.default_rng(int(cx) * 7919 + int(cy))
    grain = rng.normal(0.0, 1.0, size=arr.shape[:2]).astype(np.float32)
    grain = np.asarray(
        Image.fromarray(np.clip(grain * 40 + 128, 0, 255).astype(np.uint8)).filter(
            ImageFilter.GaussianBlur(1.4)
        ),
        np.float32,
    )
    grain = (grain - grain.mean()) / (grain.std() + 1e-6)
    filled = np.clip(filled + grain[:, :, None] * amplitude, 0, 255)
    filled = Image.fromarray(filled.astype(np.uint8))

    mask = Image.new("L", crop.size, 0)
    ImageDraw.Draw(mask).ellipse(
        [w / 2 - rx * 1.25, h / 2 - ry * 1.25, w / 2 + rx * 1.25, h / 2 + ry * 1.25], fill=255
    )
    mask = mask.filter(ImageFilter.GaussianBlur(max(2.5, min(rx, ry) * 0.6)))

    out = im.copy()
    out.paste(Image.composite(filled, crop, mask), box)
    return out


def graft_head(im: Image.Image, cfg: dict) -> Image.Image:
    """Lift one bird's head and beak and set it down on another."""
    half = cfg["half"]
    dx, dy = cfg["donor"]

    # Lift a square centred on the donor's head, so the head stays at the
    # centre through the rotation and scale that follow.
    patch = im.crop((dx - half, dy - half, dx + half, dy + half))

    mask = Image.new("L", (half * 2, half * 2), 0)
    d = ImageDraw.Draw(mask)
    for hx, hy, hrx, hry in cfg["ellipses"]:
        d.ellipse([hx - hrx, hy - hry, hx + hrx, hy + hry], fill=255)
    for (bx0, by0), (bx1, by1), br in cfg["capsules"]:
        d.line([bx0, by0, bx1, by1], fill=255, width=int(br * 2))
        d.ellipse([bx1 - br, by1 - br, bx1 + br, by1 + br], fill=255)
    mask = mask.filter(ImageFilter.GaussianBlur(cfg["feather"]))

    # The donors face right and the bird being repaired faces left, so the
    # lifted piece is flipped before it is turned into place.
    if cfg.get("mirror"):
        patch = patch.transpose(Image.FLIP_LEFT_RIGHT)
        mask = mask.transpose(Image.FLIP_LEFT_RIGHT)

    rot = cfg["rotation"]
    patch = patch.rotate(rot, resample=Image.BICUBIC)
    mask = mask.rotate(rot, resample=Image.BICUBIC)

    side = max(2, int(round(half * 2 * cfg["scale"])))
    patch = patch.resize((side, side), Image.LANCZOS)
    mask = mask.resize((side, side), Image.LANCZOS)

    tx, ty = cfg["target"]
    x0, y0 = tx - side // 2, ty - side // 2
    box = (x0, y0, x0 + side, y0 + side)
    dest = im.crop(box)

    # Shift the donor onto the destination's colour: keep its detail, adopt the
    # surrounding hue and brightness. Without this the graft arrives as a green
    # patch on a teal bird.
    #
    # How far to go is per-piece. The head lands on ground that is already the
    # right teal, so it can match fully. The body lands half on pale blossom,
    # and matching fully there bleaches the bird's own colouring straight out of
    # it — so that one only leans partway.
    r = cfg["match_radius"]
    strength = cfg.get("match_strength", 1.0)
    pa = np.asarray(patch, np.float32)
    da = np.asarray(dest, np.float32)
    pb = np.asarray(patch.filter(ImageFilter.GaussianBlur(r)), np.float32)
    db = np.asarray(dest.filter(ImageFilter.GaussianBlur(r)), np.float32)
    corrected = np.clip(pa + (db - pb) * strength, 0, 255)

    # An optional explicit pull toward a colour, for pieces borrowed from a bird
    # of a different colouring. Applied to the mid-tones only, so feather
    # highlights and the dark shafts between them are left alone and the piece
    # keeps its structure while changing hue.
    tint = cfg.get("tint")
    if tint:
        rgb, amount = tint
        weight = 1.0 - np.abs(corrected.mean(axis=2, keepdims=True) / 255.0 - 0.5) * 2.0
        corrected = np.clip(
            corrected + (np.array(rgb, np.float32) - corrected) * amount * weight, 0, 255
        )

    m = np.asarray(mask, np.float32)[:, :, None] / 255.0
    blended = da * (1 - m) + corrected * m

    out = im.copy()
    out.paste(Image.fromarray(blended.astype(np.uint8)), box)
    return out


def main() -> int:
    if not SRC.exists():
        print(f"missing source plate: {SRC}", file=sys.stderr)
        return 1

    original = Image.open(SRC).convert("RGB")
    im = original
    for cx, cy, rx, ry, blur in HEALS:
        im = heal_region(im, cx, cy, rx, ry, blur)
    for cfg in GRAFTS:
        im = graft_head(im, cfg)

    for cx, cy, rx, ry, blur in POST_HEALS:
        im = heal_region(im, cx, cy, rx, ry, blur)

    W, H = im.size
    img = np.asarray(im, dtype=np.float32)
    yy = np.arange(H)[:, None].astype(np.float32)
    xx = np.arange(W)[None, :].astype(np.float32)

    # --- the other soft bird ---------------------------------------------
    for cx, cy, rx, ry, clarity, sat in CLARITY_SPOTS:
        d = np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2)
        img = apply_masked(img, 1.0 - smoothstep(d, 0.62, 1.0), clarity, sat, radius=8)

    # --- the butterflies, found by their cool tint ------------------------
    warmth = (img[:, :, 0] - img[:, :, 2]) / 255.0
    coolness = box_mean(warmth, 40) - warmth
    lum = img.mean(axis=2) / 255.0

    band = np.zeros((H, W), dtype=np.float32)
    bx0, by0, bx1, by1 = BUTTERFLY_BAND
    band[int(by0 * H):int(by1 * H), int(bx0 * W):int(bx1 * W)] = 1.0
    band = box_mean(band, 24)

    t0, t1, t2, t3 = BUTTERFLY_TONE
    mask = (
        smoothstep(coolness, *BUTTERFLY_COOL)
        * smoothstep(lum, t0, t1)
        * (1.0 - smoothstep(lum, t2, t3))
        * band
    )
    img = apply_masked(img, box_mean(mask, 3), BUTTERFLY_CLARITY,
                       BUTTERFLY_SATURATION, darken=BUTTERFLY_DARKEN, radius=7)

    # Even out the repaired body.
    for cx, cy, rx, ry, amount, radius in SMOOTH_SPOTS:
        d = np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2)
        m = (1.0 - smoothstep(d, 0.55, 1.0))[:, :, None] * amount
        img = img * (1 - m) + box_mean(img, radius) * m

    out = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))
    out.save(PLATE)
    print(f"enhanced plate -> {PLATE}")

    subprocess.run(
        ["ffmpeg", "-y", "-v", "error", "-i", str(PLATE),
         "-vf", "hqdn3d=3:2:4:4,unsharp=5:5:0.7:5:5:0.0,scale=1620:2880:flags=lanczos",
         "-c:v", "libwebp", "-quality", "94", "-compression_level", "6", str(WEBP)],
        check=True,
    )
    print(f"render plate  -> {WEBP}")

    if "--preview" in sys.argv:
        dest_dir = Path(sys.argv[sys.argv.index("--preview") + 1])
        dest_dir.mkdir(parents=True, exist_ok=True)
        for name, crop_box in {
            "bird_right": (555, 890, 700, 1000),
            "bird_bottom": (140, 1140, 285, 1265),
            "butterflies": (200, 260, 600, 580),
        }.items():
            for tag, source in (("before", original), ("after", out)):
                crop = source.crop(crop_box)
                k = max(1, 900 // max(1, crop.width))
                crop.resize((crop.width * k, crop.height * k), Image.LANCZOS).save(
                    dest_dir / f"{name}_{tag}.png"
                )
        print(f"preview crops -> {dest_dir}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
