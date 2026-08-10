// The finish: the pass that makes the frame look photographed rather than
// assembled. Light falling through from off-frame, a vignette to hold the eye
// in the middle, a warm lift, and just enough grain to keep the wide gradients
// from banding on a phone screen.

import { PALETTE } from './config.js';
import { TAU, clamp, lerp, norm, hash2, rgba, withCtx } from './util.js';

export class Grade {
  constructor(w, h) {
    this.resize(w, h);
  }

  resize(w, h) {
    this.w = w;
    this.h = h;

    // One tile of monochrome noise, reused every frame at a shifting offset.
    // Generating it once keeps the render deterministic and cheap.
    const size = 256;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const g = c.getContext('2d');
    const img = g.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      const v = 118 + hash2(i, 9161) * 74;
      img.data[i * 4] = v;
      img.data[i * 4 + 1] = v;
      img.data[i * 4 + 2] = v;
      img.data[i * 4 + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    this.grain = c;
    this.grainSize = size;
  }

  /**
   * A shaft of warm light drifting across the frame. Slow enough that it reads
   * as the sun moving rather than an effect firing.
   */
  drawLightShaft(ctx, t, strength = 1) {
    if (strength <= 0.002) return;
    const drift = Math.sin(t * 0.055) * 0.5 + 0.5;
    const x0 = lerp(-0.35, 0.55, drift) * this.w;
    const y0 = -0.12 * this.h;
    const x1 = x0 + this.w * 0.78;
    const y1 = this.h * 1.05;

    withCtx(ctx, () => {
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createLinearGradient(x0, y0, x1, y1);
      const a = 0.070 * strength * (0.62 + 0.38 * Math.sin(t * 0.13));
      g.addColorStop(0.00, rgba(PALETTE.goldBright, 0));
      g.addColorStop(0.34, rgba(PALETTE.goldBright, a));
      g.addColorStop(0.52, rgba(PALETTE.gold, a * 0.55));
      g.addColorStop(1.00, rgba(PALETTE.gold, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.w, this.h);
    });
  }

  /** Corners eased down, and a little warmth lifted into the whole frame. */
  drawVignette(ctx, strength = 1) {
    withCtx(ctx, () => {
      const cx = this.w / 2;
      const cy = this.h * 0.47;
      const r = Math.hypot(this.w, this.h) * 0.60;
      const g = ctx.createRadialGradient(cx, cy, r * 0.36, cx, cy, r);
      g.addColorStop(0, 'rgba(28,16,12,0)');
      g.addColorStop(0.68, `rgba(28,16,12,${0.10 * strength})`);
      g.addColorStop(1, `rgba(24,12,10,${0.36 * strength})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.w, this.h);

      // A breath of warmth, so the whole thing sits in candlelight.
      ctx.globalCompositeOperation = 'overlay';
      ctx.fillStyle = `rgba(255,206,150,${0.055 * strength})`;
      ctx.fillRect(0, 0, this.w, this.h);
    });
  }

  /** Film grain, offset per frame so it moves rather than sitting still. */
  drawGrain(ctx, frame, strength = 1) {
    if (strength <= 0.002) return;
    const s = this.grainSize;
    const ox = -Math.floor(hash2(frame, 17) * s);
    const oy = -Math.floor(hash2(frame, 29) * s);
    withCtx(ctx, () => {
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = 0.055 * strength;
      for (let y = oy; y < this.h; y += s) {
        for (let x = ox; x < this.w; x += s) {
          ctx.drawImage(this.grain, x, y);
        }
      }
    });
  }

  /**
   * Opens from and closes to a warm black, rather than a hard cut. `p` is
   * progress through the whole piece.
   */
  drawFade(ctx, p, fadeIn, fadeOut) {
    let a = 0;
    if (p < fadeIn[1]) a = 1 - norm(p, fadeIn[0], fadeIn[1]);
    else if (p > fadeOut[0]) a = norm(p, fadeOut[0], fadeOut[1]);
    if (a <= 0.001) return;
    ctx.save();
    ctx.fillStyle = `rgba(14,9,8,${clamp(a)})`;
    ctx.fillRect(0, 0, this.w, this.h);
    ctx.restore();
  }
}
