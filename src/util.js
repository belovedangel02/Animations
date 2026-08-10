// Small math helpers shared by every layer.
//
// Everything in this project is drawn as a pure function of time so that a
// frame can be rendered in isolation, in any order, and always come out
// identical. That rules out incremental particle simulation, so the random
// values a particle needs are drawn from a seeded hash of its index instead of
// a running generator.

export const TAU = Math.PI * 2;

export const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const mix = lerp;

/** Fractional part, always positive. */
export const fract = (v) => v - Math.floor(v);

/** Maps v from [a,b] to [0,1], clamped. */
export function norm(v, a, b) {
  if (b === a) return 0;
  return clamp((v - a) / (b - a));
}

// --- easing ------------------------------------------------------------

export const smoothstep = (t) => {
  const x = clamp(t);
  return x * x * (3 - 2 * x);
};

export const smootherstep = (t) => {
  const x = clamp(t);
  return x * x * x * (x * (x * 6 - 15) + 10);
};

export const easeInOutCubic = (t) => {
  const x = clamp(t);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t), 3);
export const easeInCubic = (t) => Math.pow(clamp(t), 3);
export const easeOutQuad = (t) => 1 - (1 - clamp(t)) * (1 - clamp(t));

/** Rises 0->1 then falls back to 0. Useful for one-shot pulses. */
export const bump = (t) => {
  const x = clamp(t);
  return Math.sin(x * Math.PI);
};

// --- deterministic pseudo-randomness ------------------------------------

/** Hash an integer to a float in [0,1). Stable across runs and platforms. */
export function hash1(n) {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** Hash two integers together — lets one particle draw many independent values. */
export const hash2 = (a, b) => hash1(a * 73856093 + b * 19349663);

/** A stable random value in [lo,hi) for stream `k` of particle `i`. */
export const rnd = (i, k, lo = 0, hi = 1) => lo + hash2(i, k) * (hi - lo);

/**
 * Cheap value noise over time. Smooth, periodic-free, deterministic.
 * Used for drifting motion that should not look like a plain sine wave.
 */
export function noise1(x, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  const a = hash2(i, seed);
  const b = hash2(i + 1, seed);
  return lerp(a, b, u) * 2 - 1;
}

/** Two octaves of value noise — a little more organic, still cheap. */
export function fbm1(x, seed = 0) {
  return noise1(x, seed) * 0.65 + noise1(x * 2.17 + 11.3, seed + 101) * 0.35;
}

// --- keyframe interpolation ---------------------------------------------

/**
 * Interpolates a list of keyframes `[{ t, ...values }]` at position `p`.
 * `keys` must be sorted by `t`. Each named field is eased independently with
 * `ease`, which defaults to a cubic in-out so camera moves settle rather than
 * arriving at constant speed.
 */
export function sampleKeys(keys, p, fields, ease = easeInOutCubic) {
  const out = {};
  if (!keys.length) return out;
  if (p <= keys[0].t) {
    for (const f of fields) out[f] = keys[0][f];
    return out;
  }
  const last = keys[keys.length - 1];
  if (p >= last.t) {
    for (const f of fields) out[f] = last[f];
    return out;
  }
  let i = 0;
  while (i < keys.length - 2 && p > keys[i + 1].t) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const local = ease(norm(p, a.t, b.t));
  for (const f of fields) out[f] = lerp(a[f], b[f], local);
  return out;
}

// --- geometry ------------------------------------------------------------

/**
 * Catmull-Rom spline through `pts` ({x,y} in card space) at parameter
 * u in [0,1]. Endpoints are duplicated so the curve starts and ends on them.
 */
export function splineAt(pts, u) {
  const n = pts.length;
  if (n === 0) return { x: 0, y: 0 };
  if (n === 1) return { ...pts[0] };
  const s = clamp(u) * (n - 1);
  const i = Math.min(Math.floor(s), n - 2);
  const t = s - i;
  const p0 = pts[Math.max(i - 1, 0)];
  const p1 = pts[i];
  const p2 = pts[i + 1];
  const p3 = pts[Math.min(i + 2, n - 1)];
  const t2 = t * t;
  const t3 = t2 * t;
  const f = (a, b, c, d) =>
    0.5 *
    (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
  return { x: f(p0.x, p1.x, p2.x, p3.x), y: f(p0.y, p1.y, p2.y, p3.y) };
}

/** Tangent angle of the spline at u, by finite difference. */
export function splineAngle(pts, u, eps = 0.004) {
  const a = splineAt(pts, clamp(u - eps));
  const b = splineAt(pts, clamp(u + eps));
  return Math.atan2(b.y - a.y, b.x - a.x);
}

// --- canvas helpers ------------------------------------------------------

export function withCtx(ctx, fn) {
  ctx.save();
  try {
    fn();
  } finally {
    ctx.restore();
  }
}

/** rgba() string from a [r,g,b] triple and alpha. */
export const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;
