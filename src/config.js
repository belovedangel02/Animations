// Where things are on the card, and when things happen.
//
// Coordinates are normalised to the card itself: x and y both run 0..1 across
// the artwork's width and height. That keeps every anchor independent of the
// render resolution, so the same numbers drive a 720p preview and a 4K master.
//
// Timeline positions are normalised too (0 = first frame, 1 = last), so the
// whole sequence stretches to whatever duration the render is given — a 60
// second share cut and a full-length song cut use exactly these keyframes.

export const CARD_ASPECT = 720 / 1280; // the artwork is 9:16

/** Anchors for the features the animation reacts to. */
export const ANCHORS = {
  // Nala's eyes, for the slow blink.
  eyeL: { x: 0.4715, y: 0.2855, w: 0.043, h: 0.020 },
  eyeR: { x: 0.5440, y: 0.2855, w: 0.043, h: 0.020 },

  // The cloud she sits on — breathes gently.
  cloud: { x: 0.493, y: 0.538, w: 0.560, h: 0.115 },

  // The winged cat asleep in the top-right corner.
  angel: { x: 0.858, y: 0.076, w: 0.230, h: 0.105 },

  // The heart holding the handprints and her paw print.
  heart: { x: 0.508, y: 0.914, w: 0.275, h: 0.128 },

  // The gilt frame the light sweep travels along. Two nested rules; the
  // sweep rides the outer one.
  frameOuter: { x0: 0.150, y0: 0.096, x1: 0.850, y1: 0.940 },
  frameInner: { x0: 0.176, y0: 0.112, x1: 0.824, y1: 0.925 },
};

/**
 * The written message, line by line, in reading order. Each box is padded a
 * little beyond the glyphs so the reveal wash covers ascenders and descenders.
 * `hold` is how long the line rests before the next one starts, as a share of
 * the reveal window — commas and line breaks want a beat.
 */
export const TEXT_LINES = [
  { x0: 0.200, x1: 0.795, y0: 0.5940, y1: 0.6320, weight: 1.5, hold: 0.9 }, // En memoria de Nala 'Nalita'
  { x0: 0.360, x1: 0.640, y0: 0.6420, y1: 0.6690, weight: 0.7, hold: 0.5 }, // Mariana y Edith,
  { x0: 0.230, x1: 0.775, y0: 0.6650, y1: 0.6900, weight: 1.0, hold: 0.15 }, // Lamento muchisimo la partida de
  { x0: 0.235, x1: 0.770, y0: 0.6870, y1: 0.7120, weight: 1.0, hold: 0.15 }, // Nala. Tenia un espiritu tan bonito y
  { x0: 0.250, x1: 0.760, y0: 0.7100, y1: 0.7350, weight: 1.0, hold: 0.15 }, // lleno su hogar de mucho amor y
  { x0: 0.230, x1: 0.775, y0: 0.7330, y1: 0.7580, weight: 1.0, hold: 0.15 }, // alegria. Estoy pensando en ustedes y
  { x0: 0.275, x1: 0.730, y0: 0.7560, y1: 0.7820, weight: 0.9, hold: 0.9 }, // les mando mucho amor.
  { x0: 0.385, x1: 0.615, y0: 0.7990, y1: 0.8240, weight: 0.6, hold: 0.2 }, // Con carino,
  { x0: 0.410, x1: 0.575, y0: 0.8220, y1: 0.8480, weight: 0.5, hold: 0.6 }, // Tammy
];

/** The closing note in the bottom-right corner, revealed last. */
export const CLOSING_NOTE = { x0: 0.610, x1: 1.0, y0: 0.9330, y1: 0.9880 };

/**
 * The Marauder's Map trail: waypoints for an invisible cat walking up the card.
 * She sets off from the heart, keeps to the left margin so she never treads on
 * the letter, then curves in to the cloud where Nala is waiting.
 */
export const PAW_PATH = [
  { x: 0.545, y: 0.972 },
  { x: 0.470, y: 0.952 },
  { x: 0.385, y: 0.926 },
  { x: 0.305, y: 0.888 },
  { x: 0.245, y: 0.842 },
  { x: 0.208, y: 0.788 },
  { x: 0.196, y: 0.730 },
  { x: 0.203, y: 0.673 },
  { x: 0.228, y: 0.622 },
  { x: 0.272, y: 0.585 },
  { x: 0.332, y: 0.562 },
  { x: 0.400, y: 0.550 },
  { x: 0.462, y: 0.545 },
];

export const PAW_COUNT = 26; // prints laid along the trail

/** Warm, antique palette pulled from the card itself. */
export const PALETTE = {
  gold: [214, 166, 92],
  goldBright: [252, 233, 178],
  goldDeep: [166, 118, 48],
  rose: [232, 158, 168],
  roseDeep: [198, 108, 128],
  petal: [244, 186, 196],
  cream: [252, 240, 224],
  ink: [120, 82, 62],
};

/**
 * Camera path. `s` is scale (1 = the whole card fills the frame, 2 = half of
 * it), `x`/`y` are the card point held at screen centre. The move is a single
 * unbroken journey: meet her, read the letter, touch the heart, then follow her
 * paw prints home and pull back for the last look.
 */
export const CAMERA_KEYS = [
  { t: 0.000, s: 1.030, x: 0.500, y: 0.500 }, // the whole card, barely moving
  { t: 0.085, s: 1.115, x: 0.502, y: 0.462 },
  { t: 0.200, s: 1.880, x: 0.505, y: 0.297 }, // in to Nala
  { t: 0.290, s: 1.955, x: 0.512, y: 0.291 }, // hold — the slow blink
  { t: 0.400, s: 1.500, x: 0.500, y: 0.690 }, // back out, down to the letter
  { t: 0.560, s: 1.585, x: 0.500, y: 0.757 }, // reading
  { t: 0.660, s: 2.010, x: 0.508, y: 0.906 }, // the heart
  { t: 0.720, s: 2.055, x: 0.508, y: 0.912 }, // hold — the pulse
  { t: 0.800, s: 1.760, x: 0.330, y: 0.780 }, // pick up the trail
  { t: 0.878, s: 1.640, x: 0.300, y: 0.600 }, // follow it up the margin
  { t: 0.918, s: 1.700, x: 0.470, y: 0.400 }, // arrive at the cloud
  { t: 0.952, s: 2.080, x: 0.836, y: 0.098 }, // up to the sleeping angel
  { t: 1.000, s: 1.000, x: 0.500, y: 0.500 }, // pull back for the last look
];

/**
 * Beat map. Every value is a share of the total run time, so the whole
 * sequence re-times cleanly to any song length.
 */
export const BEATS = {
  fadeIn: [0.000, 0.030],
  fadeOut: [0.982, 1.000],

  // Nala's slow blinks, while the camera rests on her face.
  blinks: [0.232, 0.252, 0.276],

  // The letter writes itself while the camera drifts down the page.
  textReveal: [0.352, 0.585],
  closingNote: [0.600, 0.640],

  // The heart takes up its pulse when we reach it and never stops after.
  heartStart: 0.628,

  // The invisible walk home.
  pawTrail: [0.690, 0.905],

  // Stardust around the angel as she washes her paw.
  angelSparkle: [0.930, 0.985],

  // The gilt frame catches the light twice: once as the letter finishes, and
  // again over the final pull-back.
  frameSweeps: [
    { at: 0.588, dur: 0.055 },
    { at: 0.958, dur: 0.070 },
  ],
};

/** Ambient layers that run the whole way through, at absolute rates. */
export const AMBIENT = {
  petals: 26,
  butterflies: 4,
  hummingbirds: 3,
  dust: 40,
};

export const DEFAULTS = {
  width: 1080,
  height: 1920,
  fps: 30,
  duration: 275, // Sinatra's "My Way" runs about 4:35
};
