// The Marauder's Map trail: paw prints appearing one by one, as though an
// invisible cat were walking up the card.
//
// She sets off from the heart, keeps to the left margin so she never treads on
// the letter, and curves in to the cloud where Nala is sitting. Each print
// flares as it lands and then settles to a low ember, so at any moment there is
// a bright head to the trail and a fading tail behind it.

import { PAW_PATH, PAW_COUNT, PALETTE } from './config.js';
import {
  TAU, clamp, lerp, norm, splineAt, splineAngle, easeOutCubic,
  hash1, rgba, withCtx,
} from './util.js';

/**
 * Draws one paw print at the origin, pointing along +y, sized to `r`.
 * A cat's print: a broad rear pad with four toes fanned above it.
 */
function pawPath(ctx, r) {
  ctx.beginPath();
  // Rear pad — wider than it is tall, with a slight trefoil hint.
  ctx.ellipse(0, r * 0.30, r * 0.46, r * 0.36, 0, 0, TAU);
  // Toes, fanned across the front.
  const toes = [
    { a: -0.62, d: 0.62, rx: 0.17, ry: 0.22 },
    { a: -0.22, d: 0.72, rx: 0.18, ry: 0.24 },
    { a: 0.22, d: 0.72, rx: 0.18, ry: 0.24 },
    { a: 0.62, d: 0.62, rx: 0.17, ry: 0.22 },
  ];
  for (const t of toes) {
    const tx = Math.sin(t.a) * r * t.d;
    const ty = -Math.cos(t.a) * r * t.d + r * 0.18;
    ctx.moveTo(tx + r * t.rx, ty);
    ctx.ellipse(tx, ty, r * t.rx, r * t.ry, t.a * 0.8, 0, TAU);
  }
}

export class Trail {
  constructor(cw, ch) {
    this.cw = cw;
    this.ch = ch;
    this.pts = PAW_PATH.map((p) => ({ x: p.x * cw, y: p.y * ch }));

    // Lay the prints out along the walk. Left and right feet alternate either
    // side of the line, and each step is nudged slightly off the beat so the
    // gait reads as an animal's rather than a metronome's.
    this.prints = [];
    for (let i = 0; i < PAW_COUNT; i++) {
      const u = i / (PAW_COUNT - 1);
      const p = splineAt(this.pts, u);
      const ang = splineAngle(this.pts, u);
      const side = i % 2 === 0 ? 1 : -1;
      const stride = cw * 0.026 * side;
      // Perpendicular to the direction of travel.
      const nx = Math.cos(ang + Math.PI / 2) * stride;
      const ny = Math.sin(ang + Math.PI / 2) * stride;
      this.prints.push({
        x: p.x + nx,
        y: p.y + ny,
        // The print faces the way she is walking; +y is "forward" in pawPath.
        rot: ang - Math.PI / 2,
        r: cw * 0.0165 * (0.92 + hash1(i * 17 + 4) * 0.16),
        at: u + (hash1(i * 11 + 7) - 0.5) * 0.012,
      });
    }
  }

  /**
   * @param {number} p progress through the walk, 0 before it starts, 1 at the end
   * @param {number} fade global opacity for the whole trail
   */
  draw(ctx, p, fade = 1) {
    if (fade <= 0.002) return;

    // Each print takes this share of the walk to land and flare.
    const landing = 0.055;

    withCtx(ctx, () => {
      for (const s of this.prints) {
        const age = (p - s.at) / landing;
        if (age < 0) continue;

        // Fresh prints flare bright, then settle to a steady ember. The oldest
        // ones dim further so the eye follows the head of the trail.
        const arrive = easeOutCubic(clamp(age));
        const flare = Math.exp(-Math.pow(clamp(age, 0, 6) - 0.35, 2) * 3.2);
        const settle = lerp(1, 0.72, clamp((age - 1) / 7));
        const alpha = fade * arrive * settle;
        if (alpha < 0.005) continue;

        const scale = lerp(1.22, 1.0, arrive);

        withCtx(ctx, () => {
          ctx.translate(s.x, s.y);
          ctx.rotate(s.rot);
          ctx.scale(scale, scale);

          // The glow it casts on the paper.
          ctx.globalCompositeOperation = 'lighter';
          const gr = s.r * 3.4;
          const g = ctx.createRadialGradient(0, 0, 0, 0, 0, gr);
          const ga = alpha * (0.34 + 0.55 * flare);
          g.addColorStop(0, rgba(PALETTE.goldBright, ga));
          g.addColorStop(0.35, rgba(PALETTE.gold, ga * 0.45));
          g.addColorStop(1, rgba(PALETTE.gold, 0));
          ctx.fillStyle = g;
          ctx.fillRect(-gr, -gr, gr * 2, gr * 2);

          // The print itself, warm ink over the paper.
          ctx.globalCompositeOperation = 'source-over';
          pawPath(ctx, s.r);
          ctx.fillStyle = rgba(PALETTE.ink, alpha * 0.62);
          ctx.fill();

          // A gilt edge catching the light, brightest as it lands.
          ctx.globalCompositeOperation = 'lighter';
          pawPath(ctx, s.r);
          ctx.fillStyle = rgba(PALETTE.goldBright, alpha * (0.42 + 0.55 * flare));
          ctx.fill();
        });
      }
    });
  }

  /** Where the head of the trail is, in card pixels — the camera follows it. */
  headAt(p) {
    return splineAt(this.pts, clamp(p));
  }
}
