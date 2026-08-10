// The tribute itself: one unbroken camera move across Nala's card, with each
// effect timed to where the camera is looking.
//
// The whole piece is written in normalised time — every beat in config.js is a
// fraction of the run, never a number of seconds — so the same sequence fits a
// sixty-second cut for messaging or the full length of a song, and nothing has
// to be re-timed by hand.
//
// `renderAt(t)` draws a complete frame from nothing. It keeps no state between
// calls, which is what lets the renderer ask for frames in any order and still
// get an identical result every time.

import {
  CAMERA_KEYS, BEATS, TEXT_LINES, DEFAULTS, PALETTE, ANCHORS,
} from './config.js';
import {
  clamp, lerp, norm, smoothstep, smootherstep, easeInOutCubic, easeOutCubic,
  sampleKeys, fbm1, bump, TAU, withCtx,
} from './util.js';
import { Paper } from './paper.js';
import { Trail } from './trail.js';
import { Air } from './air.js';
import { Grade } from './grade.js';

export class Tribute {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {CanvasImageSource} plate the card artwork
   * @param {object} opts { duration, pawPrints }
   */
  constructor(canvas, plate, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.plate = plate;
    this.duration = opts.duration ?? DEFAULTS.duration;

    // The card's own pixel grid. Every anchor in config.js is normalised
    // against this, so the layout is independent of the plate's resolution.
    this.cw = plate.naturalWidth || plate.width;
    this.ch = plate.naturalHeight || plate.height;

    this.paper = new Paper(plate, this.cw, this.ch, opts.pawPrints || []);
    this.trail = new Trail(this.cw, this.ch);
    this.air = new Air(canvas.width, canvas.height);
    this.grade = new Grade(canvas.width, canvas.height);

    this.textSchedule = this.buildTextSchedule();
  }

  /**
   * When each line of the letter is written. Lines are given time in proportion
   * to their length, and a pause afterwards where the writing would naturally
   * rest — after the greeting, at the end of the message, after the signature.
   */
  buildTextSchedule() {
    const total = TEXT_LINES.reduce((s, l) => s + l.weight + l.hold, 0);
    const [t0, t1] = BEATS.textReveal;
    let acc = 0;
    return TEXT_LINES.map((l) => {
      const start = t0 + (acc / total) * (t1 - t0);
      acc += l.weight;
      const end = t0 + (acc / total) * (t1 - t0);
      acc += l.hold;
      return { start, end };
    });
  }

  // --- camera --------------------------------------------------------------

  /**
   * Where the camera is at progress `p`. Keyframes carry the move; on top of
   * them sits a slow drift, so even the held shots breathe slightly and the
   * frame never looks locked off.
   */
  camera(p) {
    const k = sampleKeys(CAMERA_KEYS, p, ['s', 'x', 'y'], easeInOutCubic);
    const t = p * this.duration;

    const breathe = 1 + Math.sin(t * 0.09) * 0.006;
    const s = k.s * breathe;
    let x = k.x + fbm1(t * 0.045, 3) * 0.0055;
    let y = k.y + fbm1(t * 0.038, 8) * 0.0055;

    // Never let the frame run off the edge of the card.
    const halfW = 0.5 / s;
    const halfH = 0.5 / s;
    x = s <= 1 ? 0.5 : clamp(x, halfW, 1 - halfW);
    y = s <= 1 ? 0.5 : clamp(y, halfH, 1 - halfH);
    return { s, x, y };
  }

  applyCamera(ctx, cam) {
    const { width: W, height: H } = this.canvas;
    ctx.translate(W / 2, H / 2);
    ctx.scale((cam.s * W) / this.cw, (cam.s * H) / this.ch);
    ctx.translate(-cam.x * this.cw, -cam.y * this.ch);
  }

  // --- timing helpers ------------------------------------------------------

  /** How shut Nala's eyes are at progress `p`: 0 open, 1 closed. */
  blinkAmount(p) {
    const shut = 0.9 / this.duration * 2.6; // a slow, affectionate blink
    let amount = 0;
    for (const at of BEATS.blinks) {
      const local = (p - at) / shut;
      if (local < 0 || local > 1) continue;
      // Down quickly, a moment held, then back up slowly.
      const close = smoothstep(norm(local, 0, 0.34));
      const open = 1 - smoothstep(norm(local, 0.52, 1));
      amount = Math.max(amount, Math.min(close, open));
    }
    // Never all the way shut. Taken to full closure the lid erases her eyes
    // into a patch of blank fur, which is unsettling rather than affectionate;
    // held short of that it reads as the slow, soft blink it should be.
    return amount * 0.62;
  }

  /** The heart's beat: a strong thump, a softer echo, then rest. */
  heartBeat(p) {
    if (p < BEATS.heartStart) return { beat: 0, strength: 0 };
    const t = (p - BEATS.heartStart) * this.duration;
    const period = 2.15;
    const u = (t % period) / period;
    const thump = Math.exp(-Math.pow((u - 0.00) / 0.075, 2));
    const echo = Math.exp(-Math.pow((u - 0.20) / 0.090, 2)) * 0.55;
    // Fades up over the first couple of beats rather than starting mid-pulse.
    const strength = smoothstep(norm(p, BEATS.heartStart, BEATS.heartStart + 0.035));
    return { beat: Math.min(1, thump + echo), strength };
  }

  /** One gilt sweep per entry in BEATS.frameSweeps; 0 when none is running. */
  frameSweep(p) {
    for (const s of BEATS.frameSweeps) {
      const u = norm(p, s.at, s.at + s.dur);
      if (u > 0 && u < 1) return u;
    }
    return 0;
  }

  /** A gleam that runs along each line shortly after it is written. */
  textShimmer(p) {
    return this.textSchedule.map((s) => {
      const span = (s.end - s.start) * 0.9;
      return norm(p, s.end - span * 0.15, s.end + span * 0.85);
    });
  }

  // --- the frame -----------------------------------------------------------

  renderAt(t, frameIndex = 0) {
    const ctx = this.ctx;
    const { width: W, height: H } = this.canvas;
    const p = clamp(t / this.duration);
    const cam = this.camera(p);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#140d0b';
    ctx.fillRect(0, 0, W, H);

    // --- everything anchored to the card, under the camera ---------------
    withCtx(ctx, () => {
      this.applyCamera(ctx, cam);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(this.plate, 0, 0, this.cw, this.ch);

      this.paper.drawCloudBreath(ctx, t);
      this.paper.drawBlink(ctx, this.blinkAmount(p));

      // The background prints glow strongest while the invisible walk is
      // happening, and idle faintly the rest of the time.
      const walkGlow = smoothstep(norm(p, BEATS.pawTrail[0] - 0.05, BEATS.pawTrail[0] + 0.06));
      this.paper.drawPawStars(ctx, t, 0.42 + 0.58 * walkGlow);

      const reveal = this.textSchedule.map((s) => smootherstep(norm(p, s.start, s.end)));
      const note = smootherstep(norm(p, BEATS.closingNote[0], BEATS.closingNote[1]));
      this.paper.drawTextReveal(ctx, reveal, note);
      this.paper.drawTextShimmer(ctx, this.textShimmer(p));

      const walk = norm(p, BEATS.pawTrail[0], BEATS.pawTrail[1]);
      // Holds on screen once laid, then eases off over the final pull-back.
      const trailFade = 1 - smoothstep(norm(p, 0.965, 1.0)) * 0.55;
      this.trail.draw(ctx, walk, trailFade);

      const { beat, strength } = this.heartBeat(p);
      this.paper.drawHeart(ctx, beat, strength);

      this.paper.drawAngelSparkle(
        ctx, t,
        smoothstep(norm(p, BEATS.angelSparkle[0], BEATS.angelSparkle[0] + 0.012)) *
        (1 - smoothstep(norm(p, BEATS.angelSparkle[1] - 0.015, BEATS.angelSparkle[1]))),
      );

      this.paper.drawFrameSweep(ctx, this.frameSweep(p));
    });

    // --- everything drifting in front, in screen space --------------------
    this.grade.drawLightShaft(ctx, t, 1);
    this.air.drawPetals(ctx, t, cam, 1);
    this.air.drawButterflies(ctx, t, cam, 1);
    this.air.drawHummingbirds(ctx, t, cam, 1);
    this.air.drawDust(ctx, t, cam, 1);

    this.grade.drawVignette(ctx, 1);
    this.grade.drawGrain(ctx, frameIndex, 1);
    this.grade.drawFade(ctx, p, BEATS.fadeIn, BEATS.fadeOut);
  }
}

/** Loads an image and resolves once it is decoded and safe to draw. */
export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${src}`));
    img.src = src;
  });
}
