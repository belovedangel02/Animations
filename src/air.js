// Everything drifting in front of the card: petals, butterflies, hummingbirds
// and motes of light.
//
// These are drawn in screen space rather than card space, so they keep a
// constant size however far the camera has pushed in — a petal should look like
// a petal near the lens, not swell to the size of the cloud. They take a
// fraction of the camera's movement as parallax so they still feel joined to
// the scene rather than pasted on the glass.
//
// Every position is a pure function of time. Nothing accumulates frame to
// frame, so a frame rendered on its own is identical to the same frame rendered
// in sequence — which is what lets the renderer jump around and still match.

import { AMBIENT, PALETTE } from './config.js';
import { TAU, clamp, lerp, fract, hash1, hash2, rnd, fbm1, rgba, withCtx } from './util.js';

/** One wing of a butterfly, drawn from the body outward. */
function wing(ctx, span, chord, sweep) {
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(span * 0.25, -chord * 0.95, span * 0.86, -chord * 0.82 * sweep,
                    span, -chord * 0.12);
  ctx.bezierCurveTo(span * 0.90, chord * 0.42, span * 0.44, chord * 0.52,
                    0, chord * 0.16);
  ctx.closePath();
}

export class Air {
  constructor(w, h) {
    this.resize(w, h);
  }

  resize(w, h) {
    this.w = w;
    this.h = h;
    this.s = Math.min(w, h); // a size unit that behaves at any aspect
  }

  /** Camera-driven parallax offset for a layer at the given depth. */
  offset(cam, depth) {
    return {
      x: (0.5 - cam.x) * this.w * depth,
      y: (0.5 - cam.y) * this.h * depth,
    };
  }

  // --- petals ------------------------------------------------------------

  /**
   * Blossom drifting from the top left to the bottom right, turning as it
   * falls. Each petal owns a lane and a speed, and wraps when it leaves frame.
   */
  drawPetals(ctx, t, cam, strength = 1) {
    if (strength <= 0.002) return;
    const n = AMBIENT.petals;
    const { x: ox, y: oy } = this.offset(cam, 0.045);

    withCtx(ctx, () => {
      for (let i = 0; i < n; i++) {
        const depth = 0.45 + hash1(i * 3 + 1) * 0.55;   // near petals fall faster
        const life = lerp(22, 11, depth);
        const phase = fract(t / life + hash1(i * 7 + 2));

        // A diagonal drift, plus a slow sway so it never falls in a straight line.
        const driftX = -0.16 + phase * 1.34;
        const driftY = -0.14 + phase * 1.32;
        const sway = fbm1(t * 0.28 + i * 2.3, i) * 0.055;

        const x = (driftX + sway) * this.w + ox * depth;
        const y = driftY * this.h + oy * depth;
        if (x < -0.12 * this.w || x > 1.12 * this.w) continue;

        const r = this.s * lerp(0.011, 0.026, depth);
        const spin = t * lerp(0.5, 1.25, hash1(i * 11 + 5)) + hash1(i * 13) * TAU;
        // Petals turn edge-on as they tumble, which reads as thickness.
        const edge = Math.abs(Math.cos(spin * 0.8));
        const a = strength * lerp(0.30, 0.62, depth) * clamp(Math.sin(phase * Math.PI) * 2.2);
        if (a < 0.006) continue;

        withCtx(ctx, () => {
          ctx.translate(x, y);
          ctx.rotate(spin);
          ctx.scale(lerp(0.28, 1, edge), 1);
          const g = ctx.createLinearGradient(0, -r, 0, r);
          g.addColorStop(0, rgba(PALETTE.petal, a));
          g.addColorStop(1, rgba(PALETTE.roseDeep, a * 0.72));
          ctx.fillStyle = g;
          ctx.beginPath();
          // A rounded petal, narrower at the stem end.
          ctx.moveTo(0, -r);
          ctx.bezierCurveTo(r * 0.95, -r * 0.55, r * 0.80, r * 0.62, 0, r);
          ctx.bezierCurveTo(-r * 0.80, r * 0.62, -r * 0.95, -r * 0.55, 0, -r);
          ctx.fill();
        });
      }
    });
  }

  // --- butterflies --------------------------------------------------------

  /**
   * Butterflies wandering the frame on a slow, erratic path, looping through
   * the middle where Nala is. Drawn solidly rather than as a faint wash — the
   * ones painted into the card are barely there, and these are meant to be
   * seen.
   */
  drawButterflies(ctx, t, cam, strength = 1) {
    if (strength <= 0.002) return;
    const n = AMBIENT.butterflies;
    const { x: ox, y: oy } = this.offset(cam, 0.075);

    for (let i = 0; i < n; i++) {
      const depth = 0.55 + hash1(i * 5 + 3) * 0.45;
      const speed = lerp(0.030, 0.052, hash1(i * 9 + 1));
      const seed = i * 37;

      // A wandering path: two slow noise walks, biased to circle the centre.
      const u = t * speed + hash1(i * 3 + 6);
      const loop = u * TAU * 0.42;
      const cx = 0.50 + Math.cos(loop) * lerp(0.20, 0.34, hash1(seed + 2));
      const cy = 0.44 + Math.sin(loop * 1.31) * lerp(0.16, 0.28, hash1(seed + 3));
      const x = (cx + fbm1(t * 0.21 + i * 3.1, seed) * 0.085) * this.w + ox * depth;
      const y = (cy + fbm1(t * 0.19 + i * 5.7, seed + 11) * 0.075) * this.h + oy * depth;

      // Face the way it is travelling, with a lazy roll.
      const ahead = 0.06;
      const lx = (0.50 + Math.cos(loop + ahead) * 0.27) * this.w;
      const ly = (0.44 + Math.sin((loop + ahead) * 1.31) * 0.22) * this.h;
      const heading = Math.atan2(ly - y, lx - x);

      const r = this.s * lerp(0.030, 0.052, depth);
      // Wingbeat: fast, with a pause at the top of each stroke.
      const beat = Math.pow(Math.abs(Math.sin(t * lerp(3.4, 4.6, hash1(seed + 7)) + i)), 0.65);
      const open = lerp(0.20, 1.0, beat);
      const a = strength * lerp(0.62, 0.92, depth);

      const hue = hash1(seed + 13);
      const upper = hue < 0.5 ? [178, 196, 232] : [236, 186, 206];
      const lower = hue < 0.5 ? [140, 158, 210] : [214, 152, 182];

      withCtx(ctx, () => {
        ctx.translate(x, y);
        ctx.rotate(heading + Math.PI / 2);
        ctx.rotate(Math.sin(t * 0.7 + i) * 0.16);

        // A whisper of shadow so it separates from the busy card behind it.
        ctx.shadowColor = 'rgba(96,64,52,0.34)';
        ctx.shadowBlur = r * 0.42;

        for (const side of [-1, 1]) {
          withCtx(ctx, () => {
            ctx.scale(side * open, 1);

            const g = ctx.createLinearGradient(0, -r * 0.6, r, r * 0.4);
            g.addColorStop(0, rgba(upper, a));
            g.addColorStop(1, rgba(lower, a * 0.9));
            ctx.fillStyle = g;

            wing(ctx, r, r * 0.62, 1);          // forewing
            ctx.fill();
            withCtx(ctx, () => {
              ctx.translate(0, r * 0.20);
              ctx.rotate(0.42);
              wing(ctx, r * 0.66, r * 0.50, 0.7); // hindwing
              ctx.fill();
            });

            // Veining, which is what makes it read as a wing at a glance.
            ctx.shadowBlur = 0;
            ctx.strokeStyle = rgba([92, 74, 92], a * 0.42);
            ctx.lineWidth = Math.max(0.6, r * 0.022);
            wing(ctx, r, r * 0.62, 1);
            ctx.stroke();
          });
        }

        ctx.shadowBlur = 0;
        // Body and antennae.
        ctx.fillStyle = rgba([84, 66, 62], a * 0.85);
        ctx.beginPath();
        ctx.ellipse(0, r * 0.06, r * 0.052, r * 0.30, 0, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = rgba([84, 66, 62], a * 0.55);
        ctx.lineWidth = Math.max(0.5, r * 0.018);
        for (const side of [-1, 1]) {
          ctx.beginPath();
          ctx.moveTo(0, -r * 0.22);
          ctx.quadraticCurveTo(side * r * 0.14, -r * 0.40, side * r * 0.20, -r * 0.46);
          ctx.stroke();
        }
      });
    }
  }

  // --- hummingbirds -------------------------------------------------------

  /**
   * Hummingbirds holding a hover then darting off. Kept small, soft and few:
   * the card already has four painted ones, and drawn birds competing with
   * those at full strength would cheapen them.
   */
  drawHummingbirds(ctx, t, cam, strength = 1) {
    if (strength <= 0.002) return;
    const n = AMBIENT.hummingbirds;
    const { x: ox, y: oy } = this.offset(cam, 0.10);

    for (let i = 0; i < n; i++) {
      const cycle = 7.5 + hash1(i * 7 + 2) * 4.5;
      const u = fract((t + hash1(i * 5 + 9) * cycle) / cycle);

      // Hover, then a quick linear dart, then hover again somewhere new.
      const dart = clamp((u - 0.62) / 0.14);
      const legA = { x: rnd(i, 1, 0.14, 0.86), y: rnd(i, 2, 0.16, 0.72) };
      const legB = { x: rnd(i, 3, 0.14, 0.86), y: rnd(i, 4, 0.16, 0.72) };
      const ease = dart * dart * (3 - 2 * dart);
      const bx = lerp(legA.x, legB.x, ease);
      const by = lerp(legA.y, legB.y, ease);

      // The little bob a hovering bird never quite loses.
      const hover = Math.sin(t * 2.3 + i * 1.7) * 0.006;
      const x = bx * this.w + ox * 0.8;
      const y = (by + hover) * this.h + oy * 0.8;

      const r = this.s * 0.030;
      const a = strength * 0.50 * Math.sin(clamp(u / 0.06)) ** 0.5 *
                (1 - clamp((u - 0.90) / 0.10));
      if (a < 0.01) continue;

      const facing = legB.x >= legA.x ? 1 : -1;

      withCtx(ctx, () => {
        ctx.translate(x, y);
        ctx.scale(facing, 1);
        ctx.rotate(-0.12 + ease * 0.06);

        // Wings, beating far too fast to resolve — a blurred fan is the honest
        // way to draw them.
        const blur = Math.sin(t * 34 + i) * 0.5 + 0.5;
        ctx.globalAlpha = a * 0.55;
        ctx.fillStyle = rgba([206, 214, 208], 1);
        for (const dir of [-1, 1]) {
          withCtx(ctx, () => {
            ctx.rotate(dir * (0.5 + blur * 0.5));
            ctx.beginPath();
            ctx.ellipse(r * 0.55, -r * 0.10, r * 0.72, r * 0.20, 0, 0, TAU);
            ctx.fill();
          });
        }

        ctx.globalAlpha = a;
        const g = ctx.createLinearGradient(-r * 0.4, 0, r * 0.5, r * 0.3);
        g.addColorStop(0, 'rgb(122,150,124)');
        g.addColorStop(1, 'rgb(168,178,150)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(0, 0, r * 0.42, r * 0.24, 0.1, 0, TAU);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(-r * 0.34, -r * 0.10, r * 0.17, r * 0.15, 0, 0, TAU);
        ctx.fill();

        ctx.strokeStyle = rgba([70, 62, 56], a);
        ctx.lineWidth = Math.max(0.7, r * 0.055);
        ctx.beginPath();
        ctx.moveTo(-r * 0.46, -r * 0.13);
        ctx.lineTo(-r * 0.95, -r * 0.20);
        ctx.stroke();
      });
    }
  }

  // --- motes --------------------------------------------------------------

  /** Warm specks of light hanging in the air, some of them well out of focus. */
  drawDust(ctx, t, cam, strength = 1) {
    if (strength <= 0.002) return;
    const n = AMBIENT.dust;
    const { x: ox, y: oy } = this.offset(cam, 0.14);

    withCtx(ctx, () => {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < n; i++) {
        const depth = hash1(i * 3 + 2);
        const life = lerp(26, 15, depth);
        const u = fract(t / life + hash1(i * 5 + 1));
        const x = (hash1(i * 11 + 3) + fbm1(t * 0.10 + i, i) * 0.045) * this.w + ox * depth;
        const y = (1.10 - u * 1.22) * this.h + oy * depth;
        const r = this.s * lerp(0.0016, 0.0090, depth);
        const a = strength * lerp(0.22, 0.55, depth) * Math.sin(u * Math.PI) ** 0.7 *
                  (0.55 + 0.45 * Math.sin(t * 1.4 + i * 2.1));
        if (a < 0.004) continue;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3.6);
        g.addColorStop(0, rgba(PALETTE.goldBright, a));
        g.addColorStop(0.35, rgba(PALETTE.gold, a * 0.42));
        g.addColorStop(1, rgba(PALETTE.gold, 0));
        ctx.fillStyle = g;
        ctx.fillRect(x - r * 3.6, y - r * 3.6, r * 7.2, r * 7.2);
      }
    });
  }
}
