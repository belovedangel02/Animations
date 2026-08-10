// Effects anchored to the card itself: things that happen *to* the artwork.
//
// The card is a flat painting, so anything that has to move within it — the
// cloud breathing, Nala blinking, the letter writing itself — works by lifting
// a soft-edged patch of the base image, altering it, and laying it back down.
// The masks are feathered generously; a hard edge would betray the trick
// instantly at the zoom levels the camera reaches.

import { ANCHORS, TEXT_LINES, CLOSING_NOTE, PALETTE } from './config.js';
import { TAU, clamp, lerp, norm, bump, smoothstep, easeOutCubic, hash1, hash2, rgba, withCtx } from './util.js';

const el = (w, h) => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  return c;
};

/** Feathered elliptical mask, applied to whatever is already on `c`. */
function featherEllipse(c, feather = 0.34) {
  const g = c.getContext('2d');
  const m = el(c.width, c.height);
  const mg = m.getContext('2d');
  const grad = mg.createRadialGradient(
    c.width / 2, c.height / 2, 0,
    c.width / 2, c.height / 2, Math.max(c.width, c.height) / 2,
  );
  grad.addColorStop(0, 'rgba(0,0,0,1)');
  grad.addColorStop(clamp(1 - feather), 'rgba(0,0,0,1)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  mg.fillStyle = grad;
  // Draw the gradient into an ellipse that fills the patch.
  mg.save();
  mg.translate(c.width / 2, c.height / 2);
  mg.scale(1, c.height / c.width);
  mg.beginPath();
  mg.arc(0, 0, c.width / 2, 0, TAU);
  mg.restore();
  mg.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = 'destination-in';
  g.drawImage(m, 0, 0);
  g.globalCompositeOperation = 'source-over';
}

export class Paper {
  /**
   * @param {CanvasImageSource} base the card artwork
   * @param {number} cw card width in its own pixels
   * @param {number} ch card height in its own pixels
   * @param {Array<{x:number,y:number,r:number}>} pawPrints background prints
   */
  constructor(base, cw, ch, pawPrints) {
    this.base = base;
    this.cw = cw;
    this.ch = ch;
    this.pawPrints = pawPrints || [];
    this.build();
  }

  build() {
    const { base, cw, ch } = this;

    // A readable copy of the artwork, for sampling paper colour.
    this.sampler = el(cw, ch);
    this.sampler.getContext('2d', { willReadFrequently: true }).drawImage(base, 0, 0, cw, ch);
    this.sctx = this.sampler.getContext('2d', { willReadFrequently: true });

    this.cloud = this.makeRegionPatch(ANCHORS.cloud, 1.18, 0.42);
    this.heart = this.makeRegionPatch(ANCHORS.heart, 1.30, 0.40);

    this.lids = [this.makeLid(ANCHORS.eyeL), this.makeLid(ANCHORS.eyeR)];

    this.washes = TEXT_LINES.map((l) => this.makeWash(l));
    this.noteWash = this.makeWash(CLOSING_NOTE);

    // Reusable scratch buffers, sized to the largest consumer, so the render
    // loop never allocates.
    const maxW = Math.max(...this.washes.map((w) => w.canvas.width), this.noteWash.canvas.width);
    const maxH = Math.max(...this.washes.map((w) => w.canvas.height), this.noteWash.canvas.height);
    this.scratch = el(maxW, maxH);
    this.lidScratch = el(this.lids[0].box.w * 2, this.lids[0].box.h * 3);

    this.framePaths = this.makeFramePaths();
  }

  /**
   * The colour of the paper inside a region, ignoring whatever is written on
   * it. Takes the mean of the brightest `keep` share of pixels: between the
   * glyphs the bare page shows through, so the bright end of a line of text is
   * the paper itself.
   *
   * A plain mean will not do. Sampling a strip near a line of text catches the
   * ink as well, and the wash mixed from it comes out grey — which lands on the
   * page as a visible grey box instead of disappearing into it.
   */
  samplePaper(x, y, w, h, keep = 0.3) {
    const d = this.sctx.getImageData(
      Math.max(0, Math.round(x)), Math.max(0, Math.round(y)),
      Math.max(1, Math.round(w)), Math.max(1, Math.round(h)),
    ).data;
    const px = [];
    for (let i = 0; i < d.length; i += 4) {
      px.push([d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114, i]);
    }
    px.sort((a, b) => b[0] - a[0]);
    const n = Math.max(1, Math.round(px.length * keep));
    let r = 0, g = 0, b = 0;
    for (let k = 0; k < n; k++) {
      const i = px[k][1];
      r += d[i]; g += d[i + 1]; b += d[i + 2];
    }
    return [r / n, g / n, b / n];
  }

  /** A soft-edged, liftable copy of a region — used for breathing and pulsing. */
  makeRegionPatch(anchor, grow, feather) {
    const w = anchor.w * this.cw * grow;
    const h = anchor.h * this.ch * grow;
    const x = anchor.x * this.cw - w / 2;
    const y = anchor.y * this.ch - h / 2;
    const c = el(w, h);
    c.getContext('2d').drawImage(this.base, x, y, w, h, 0, 0, c.width, c.height);
    featherEllipse(c, feather);
    return { canvas: c, x, y, w: c.width, h: c.height, cx: x + c.width / 2, cy: y + c.height / 2 };
  }

  /**
   * An eyelid: fur borrowed from just above the eye, which slides down over it.
   * Cheating, but it is what a 2D animator would do, and it reads as a blink.
   */
  makeLid(eye) {
    const w = eye.w * this.cw * 1.45;
    const h = eye.h * this.ch * 1.5;
    const cx = eye.x * this.cw;
    const cy = eye.y * this.ch;
    const box = { x: cx - w / 2, y: cy - h / 2, w, h, cx, cy };

    // Source the fur from a band above the eye, tall enough to cover it fully.
    const src = el(w, h * 1.35);
    const sg = src.getContext('2d');
    sg.drawImage(this.base, box.x, cy - h * 1.95, w, h * 1.35, 0, 0, src.width, src.height);
    sg.filter = 'blur(1.5px)';
    sg.drawImage(src, 0, 0);
    sg.filter = 'none';
    return { canvas: src, box };
  }

  /**
   * A patch that hides one line of the letter so it can be revealed as though
   * it were being written. Blurring the line dissolves the glyphs but leaves
   * the average too dark, so the blur is lifted back to the paper's own colour,
   * sampled from the clear space just above the line.
   */
  makeWash(line) {
    const pad = Math.round(this.ch * 0.006);
    const x = line.x0 * this.cw;
    const y = line.y0 * this.ch;
    const w = (line.x1 - line.x0) * this.cw;
    const h = (line.y1 - line.y0) * this.ch;
    // Blur wide enough that the glyphs dissolve completely. Anything less and
    // the covered line stays legible as a grey ghost of itself, which gives the
    // trick away long before the writing reaches it.
    const blur = Math.max(8, h * 0.6);

    // The blur has to happen on a canvas substantially larger than the patch,
    // and the patch cut from the middle of it. Blurring at the patch's own size
    // pulls transparency in from beyond its edges, and since the radius here is
    // a good fraction of a line's height, that bleed reaches the centre — the
    // patch tops out around 60% opaque and the letter reads straight through
    // it. With room to spare on every side, the middle stays fully opaque.
    const room = Math.ceil(blur * 2);
    const work = el(w + pad * 2 + room * 2, h + pad * 2 + room * 2);
    const wg = work.getContext('2d');
    wg.filter = `blur(${blur}px)`;
    wg.drawImage(
      this.base,
      x - pad - room, y - pad - room, work.width, work.height,
      0, 0, work.width, work.height,
    );
    wg.filter = 'none';

    const c = el(w + pad * 2, h + pad * 2);
    const g = c.getContext('2d');
    g.drawImage(work, -room, -room);

    // Blurring dark text into light paper leaves the patch too dark, so it is
    // lifted back to the paper's own colour — read from the line's own box, so
    // it matches the page exactly where the patch will sit.
    const paper = this.samplePaper(x, y, w, h);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = rgba(paper.map(Math.round), 0.88);
    g.fillRect(0, 0, c.width, c.height);
    g.globalCompositeOperation = 'source-over';

    // Soften the patch's own edges, or it reads as a pale rectangle lying on
    // the page rather than as blank paper.
    //
    // Eaten away with destination-out rather than masked with destination-in:
    // destination-in clears everything outside the shape being drawn, so four
    // separate edge gradients would each wipe the other three.
    const fx = pad * 0.9;
    const edge = (x0, y0, x1, y1) => {
      const grad = g.createLinearGradient(x0, y0, x1, y1);
      grad.addColorStop(0, 'rgba(0,0,0,1)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      return grad;
    };
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = edge(0, 0, 0, fx);
    g.fillRect(0, 0, c.width, fx);
    g.fillStyle = edge(0, c.height, 0, c.height - fx);
    g.fillRect(0, c.height - fx, c.width, fx);
    g.fillStyle = edge(0, 0, fx, 0);
    g.fillRect(0, 0, fx, c.height);
    g.fillStyle = edge(c.width, 0, c.width - fx, 0);
    g.fillRect(c.width - fx, 0, fx, c.height);
    g.globalCompositeOperation = 'source-over';

    return { canvas: c, pad, x, y, w, h, paper };
  }

  /**
   * The two halves of the gilt frame, as polylines with arc length, so a glint
   * can travel from the top centre down each side and meet at the bottom.
   */
  makeFramePaths() {
    const f = ANCHORS.frameOuter;
    const x0 = f.x0 * this.cw, x1 = f.x1 * this.cw;
    const y0 = f.y0 * this.ch, y1 = f.y1 * this.ch;
    const midX = (x0 + x1) / 2;
    const build = (corners) => {
      const pts = [];
      let total = 0;
      for (let i = 0; i < corners.length - 1; i++) {
        const a = corners[i], b = corners[i + 1];
        const seg = Math.hypot(b.x - a.x, b.y - a.y);
        const steps = Math.max(2, Math.round(seg / 6));
        for (let s = 0; s < steps; s++) {
          const t = s / steps;
          pts.push({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), d: total + seg * t });
        }
        total += seg;
      }
      const last = corners[corners.length - 1];
      pts.push({ x: last.x, y: last.y, d: total });
      return { pts, total };
    };
    return [
      build([{ x: midX, y: y0 }, { x: x0, y: y0 }, { x: x0, y: y1 }, { x: midX, y: y1 }]),
      build([{ x: midX, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: midX, y: y1 }]),
    ];
  }

  // --- per-frame layers ---------------------------------------------------

  /** The cloud swells and settles, as though it were breathing. */
  drawCloudBreath(ctx, t) {
    const k = 1 + Math.sin((t / 6.5) * TAU) * 0.014 + Math.sin((t / 2.9) * TAU) * 0.004;
    const p = this.cloud;
    withCtx(ctx, () => {
      ctx.globalAlpha = 0.92;
      ctx.translate(p.cx, p.cy + p.h * 0.06);
      ctx.scale(k, k * 1.006);
      ctx.drawImage(p.canvas, -p.w / 2, -p.h / 2);
    });
  }

  /**
   * A slow, affectionate blink. `amount` is 0 (open) to 1 (shut); the caller
   * schedules it, this only draws it.
   */
  drawBlink(ctx, amount) {
    if (amount <= 0.001) return;
    const a = clamp(amount);
    for (const lid of this.lids) {
      const { box, canvas } = lid;
      const s = this.lidScratch;
      const g = s.getContext('2d');
      g.clearRect(0, 0, s.width, s.height);

      // The lid travels from just above the eye to fully across it.
      const travel = lerp(-canvas.height, -canvas.height + box.h * 1.06, a);
      g.drawImage(canvas, 0, travel);

      // A soft crease where the lid edge falls.
      const edgeY = travel + canvas.height;
      const cg = g.createLinearGradient(0, edgeY - box.h * 0.22, 0, edgeY);
      cg.addColorStop(0, 'rgba(90,58,40,0)');
      cg.addColorStop(1, `rgba(90,58,40,${0.30 * a})`);
      g.fillStyle = cg;
      g.fillRect(0, edgeY - box.h * 0.22, s.width, box.h * 0.22);

      // Confine it to the eye with a feathered ellipse.
      g.globalCompositeOperation = 'destination-in';
      const m = g.createRadialGradient(box.w / 2, box.h / 2, 0, box.w / 2, box.h / 2, box.w * 0.56);
      m.addColorStop(0, 'rgba(0,0,0,1)');
      m.addColorStop(0.60, 'rgba(0,0,0,1)');
      m.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = m;
      withCtx(g, () => {
        g.translate(box.w / 2, box.h / 2);
        g.scale(1, (box.h / box.w) * 1.35);
        g.translate(-box.w / 2, -box.h / 2);
        g.fillRect(-box.w, -box.h, s.width + box.w * 2, s.height + box.h * 2);
      });
      g.globalCompositeOperation = 'source-over';

      ctx.drawImage(s, box.x, box.y);
    }
  }

  /** Background paw prints breathing in and out, like distant stars. */
  drawPawStars(ctx, t, strength = 1) {
    if (strength <= 0.002) return;
    withCtx(ctx, () => {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < this.pawPrints.length; i++) {
        const p = this.pawPrints[i];
        const phase = hash1(i * 7 + 3) * TAU;
        const rate = 0.055 + hash1(i * 13 + 5) * 0.045;
        const pulse = 0.5 + 0.5 * Math.sin(t * TAU * rate + phase);
        const a = (0.045 + 0.115 * Math.pow(pulse, 2.1)) * strength;
        const r = p.r * this.cw * 1.5;
        const g = ctx.createRadialGradient(p.x * this.cw, p.y * this.ch, 0, p.x * this.cw, p.y * this.ch, r);
        g.addColorStop(0, rgba(PALETTE.goldBright, a));
        g.addColorStop(0.45, rgba(PALETTE.gold, a * 0.45));
        g.addColorStop(1, rgba(PALETTE.gold, 0));
        ctx.fillStyle = g;
        ctx.fillRect(p.x * this.cw - r, p.y * this.ch - r, r * 2, r * 2);
      }
    });
  }

  /**
   * Hides the parts of the letter that have not been "written" yet.
   * `progress` is an array with one 0..1 value per line.
   */
  drawTextReveal(ctx, progress, noteProgress) {
    for (let i = 0; i < this.washes.length; i++) {
      this.drawOneWash(ctx, this.washes[i], progress[i]);
    }
    this.drawOneWash(ctx, this.noteWash, noteProgress);
  }

  drawOneWash(ctx, wash, revealed) {
    if (revealed >= 0.999) return;
    const { canvas, pad, x, y, w } = wash;

    if (revealed <= 0.001) {
      ctx.drawImage(canvas, x - pad, y - pad);
      return;
    }

    const s = this.scratch;
    const g = s.getContext('2d');
    g.clearRect(0, 0, canvas.width, canvas.height);
    g.drawImage(canvas, 0, 0);

    // Erase the written part, with a feathered nib-width edge.
    const feather = Math.max(8, w * 0.05);
    const head = pad + w * revealed;
    const grad = g.createLinearGradient(head - feather, 0, head + feather * 0.35, 0);
    grad.addColorStop(0, 'rgba(0,0,0,1)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'destination-out';
    g.fillStyle = grad;
    g.fillRect(0, 0, canvas.width, canvas.height);
    g.globalCompositeOperation = 'source-over';

    ctx.drawImage(s, 0, 0, canvas.width, canvas.height, x - pad, y - pad, canvas.width, canvas.height);

    // A warm gleam at the nib, so the line looks written rather than uncovered.
    withCtx(ctx, () => {
      ctx.globalCompositeOperation = 'lighter';
      const hx = x - pad + head;
      const hy = y + wash.h / 2;
      const r = wash.h * 1.5;
      const gg = ctx.createRadialGradient(hx, hy, 0, hx, hy, r);
      const a = 0.42 * Math.sin(clamp(revealed) * Math.PI) ** 0.5;
      gg.addColorStop(0, rgba(PALETTE.goldBright, a));
      gg.addColorStop(0.4, rgba(PALETTE.gold, a * 0.35));
      gg.addColorStop(1, rgba(PALETTE.gold, 0));
      ctx.fillStyle = gg;
      ctx.fillRect(hx - r, hy - r, r * 2, r * 2);
    });
  }

  /** A single gold glint travelling across a line just after it is written. */
  drawTextShimmer(ctx, shimmer) {
    withCtx(ctx, () => {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < TEXT_LINES.length; i++) {
        const u = shimmer[i];
        if (u <= 0 || u >= 1) continue;
        const l = TEXT_LINES[i];
        const x0 = l.x0 * this.cw, x1 = l.x1 * this.cw;
        const y0 = l.y0 * this.ch, y1 = l.y1 * this.ch;
        const cx = lerp(x0 - (x1 - x0) * 0.2, x1 + (x1 - x0) * 0.2, u);
        const band = (x1 - x0) * 0.22;
        const a = 0.30 * Math.sin(u * Math.PI);
        const g = ctx.createLinearGradient(cx - band, 0, cx + band, 0);
        g.addColorStop(0, rgba(PALETTE.gold, 0));
        g.addColorStop(0.5, rgba(PALETTE.goldBright, a));
        g.addColorStop(1, rgba(PALETTE.gold, 0));
        ctx.fillStyle = g;
        ctx.fillRect(x0 - band, y0, (x1 - x0) + band * 2, y1 - y0);
      }
    });
  }

  /**
   * The heart keeps a slow double beat. `phase` runs 0..1 over one full beat;
   * the prints inside brighten on the stronger of the two thumps.
   */
  drawHeart(ctx, beat, strength = 1) {
    if (strength <= 0.002) return;
    const p = this.heart;
    const k = 1 + beat * 0.030;

    withCtx(ctx, () => {
      ctx.globalAlpha = clamp(0.55 + 0.45 * strength);
      ctx.translate(p.cx, p.cy);
      ctx.scale(k, k);
      ctx.drawImage(p.canvas, -p.w / 2, -p.h / 2);
    });

    withCtx(ctx, () => {
      ctx.globalCompositeOperation = 'lighter';
      const r = p.w * 0.62;
      const a = (0.10 + 0.26 * beat) * strength;
      const g = ctx.createRadialGradient(p.cx, p.cy, r * 0.12, p.cx, p.cy, r);
      g.addColorStop(0, rgba(PALETTE.goldBright, a * 0.75));
      g.addColorStop(0.35, rgba(PALETTE.rose, a * 0.55));
      g.addColorStop(1, rgba(PALETTE.roseDeep, 0));
      ctx.fillStyle = g;
      ctx.fillRect(p.cx - r, p.cy - r, r * 2, r * 2);
    });
  }

  /** Stardust lifting off the sleeping angel as she washes her paw. */
  drawAngelSparkle(ctx, t, strength) {
    if (strength <= 0.002) return;
    const a0 = ANCHORS.angel;
    const ox = a0.x * this.cw;
    const oy = a0.y * this.ch;
    const spread = a0.w * this.cw;
    withCtx(ctx, () => {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 26; i++) {
        const life = 2.4 + hash1(i * 3 + 1) * 2.2;
        const born = hash1(i * 5 + 2) * life;
        const u = ((t + born) % life) / life;
        const dx = (hash2(i, 1) - 0.5) * spread * 0.85;
        const dy = -u * spread * 0.62 + (hash2(i, 2) - 0.5) * spread * 0.16;
        const sway = Math.sin(u * TAU * 1.4 + hash2(i, 3) * TAU) * spread * 0.07;
        const r = spread * (0.008 + hash2(i, 4) * 0.014) * (1 - u * 0.4);
        const a = strength * 0.75 * Math.sin(u * Math.PI) ** 1.3;
        const x = ox + dx + sway;
        const y = oy + a0.h * this.ch * 0.15 + dy;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2);
        g.addColorStop(0, rgba(PALETTE.goldBright, a));
        g.addColorStop(0.3, rgba(PALETTE.gold, a * 0.5));
        g.addColorStop(1, rgba(PALETTE.gold, 0));
        ctx.fillStyle = g;
        ctx.fillRect(x - r * 3.2, y - r * 3.2, r * 6.4, r * 6.4);
      }
    });
  }

  /**
   * A glint of light running down both sides of the gilt frame, meeting at the
   * bottom over the heart. `u` runs 0..1 for one sweep.
   */
  drawFrameSweep(ctx, u) {
    if (u <= 0 || u >= 1) return;
    const eased = smoothstep(u);
    const fade = Math.sin(u * Math.PI) ** 0.6;
    const thickness = this.cw * 0.011;

    withCtx(ctx, () => {
      ctx.globalCompositeOperation = 'lighter';
      ctx.lineCap = 'round';
      for (const path of this.framePaths) {
        const head = eased * path.total;
        const tail = path.total * 0.16;
        for (let i = 0; i < path.pts.length - 1; i++) {
          const a = path.pts[i];
          const b = path.pts[i + 1];
          const dist = head - a.d;
          if (dist < -tail * 0.25 || dist > tail) continue;
          // Bright at the head, trailing away behind it.
          const w = dist >= 0 ? 1 - dist / tail : 1 + (dist / (tail * 0.25));
          const alpha = 0.55 * Math.pow(clamp(w), 1.8) * fade;
          if (alpha < 0.004) continue;
          ctx.strokeStyle = rgba(
            dist < tail * 0.18 ? PALETTE.goldBright : PALETTE.gold,
            alpha,
          );
          ctx.lineWidth = thickness * (0.6 + 0.8 * clamp(w));
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    });
  }
}
