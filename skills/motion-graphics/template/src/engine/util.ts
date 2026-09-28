// Math and animation helpers. Every frame must be a pure function of time (or of a seed),
// so these are all stateless. Adapted from mexicat/pdoom-video (MIT).
import { FPS } from './format';

export const clamp = (x: number, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const invLerp = (a: number, b: number, x: number) => (a === b ? 0 : (x - a) / (b - a));
export const remap = (x: number, a: number, b: number, c: number, d: number, clampIt = true) => {
  const t = invLerp(a, b, x);
  return lerp(c, d, clampIt ? clamp(t) : t);
};
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
export const fract = (x: number) => x - Math.floor(x);
export const TAU = Math.PI * 2;

/** 0 before a, ramps up over fadeIn, holds, ramps down over fadeOut ending at b. */
export const window01 = (x: number, a: number, b: number, fadeIn = 0.2, fadeOut = 0.2) =>
  Math.min(smoothstep(a, a + fadeIn, x), 1 - smoothstep(b - fadeOut, b, x));

// ---- easing (t in 0..1) ----
export type Ease = (t: number) => number;
export const ease = {
  linear: (t: number) => t,
  inQuad: (t: number) => t * t,
  outQuad: (t: number) => 1 - (1 - t) * (1 - t),
  inOutQuad: (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  inCubic: (t: number) => t * t * t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outQuart: (t: number) => 1 - Math.pow(1 - t, 4),
  inOutQuart: (t: number) => (t < 0.5 ? 8 * t * t * t * t : 1 - Math.pow(-2 * t + 2, 4) / 2),
  outQuint: (t: number) => 1 - Math.pow(1 - t, 5),
  inExpo: (t: number) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
  outExpo: (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
  inOutExpo: (t: number) =>
    t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? Math.pow(2, 20 * t - 10) / 2 : (2 - Math.pow(2, -20 * t + 10)) / 2,
  outBack: (t: number, s = 1.70158) => 1 + (s + 1) * Math.pow(t - 1, 3) + s * Math.pow(t - 1, 2),
  inBack: (t: number, s = 1.70158) => (s + 1) * t * t * t - s * t * t,
} satisfies Record<string, Ease>;

/** Clamped, eased progress of x through [a, b]. The workhorse: prog(t, start, start + 0.4, ease.outExpo). */
export const prog = (x: number, a: number, b: number, fn: Ease = ease.linear) => fn(clamp((x - a) / (b - a)));

/** Damped spring response to a step at t = 0: 0 -> 1 with overshoot. For pops, lands and settles. */
export const springStep = (t: number, freq = 3, damping = 0.4) => {
  if (t <= 0) return 0;
  const w = TAU * freq;
  return 1 - Math.exp(-damping * w * t) * Math.cos(w * Math.sqrt(1 - damping * damping) * t);
};

/** Decaying pulse after an event at t0: 1 at t0, halves every `hl` seconds. For hits and flashes. */
export const pulse = (t: number, t0: number, hl = 0.12) => (t < t0 ? 0 : Math.pow(0.5, (t - t0) / hl));

// ---- keyframes ----
export type Key = [time: number, value: number, easeFn?: Ease];
/** Piecewise interpolation through keyframes; the ease on key i shapes the segment that ends at key i. */
export function keys(t: number, ks: Key[]): number {
  if (ks.length === 0) return 0;
  if (t <= ks[0]![0]) return ks[0]![1];
  for (let i = 1; i < ks.length; i++) {
    const k = ks[i]!;
    if (t <= k[0]) {
      const p = ks[i - 1]!;
      return lerp(p[1], k[1], (k[2] ?? ease.inOutCubic)((t - p[0]) / (k[0] - p[0])));
    }
  }
  return ks[ks.length - 1]![1];
}

// ---- deterministic randomness ----
/** Seeded PRNG. Never use Math.random() for anything visible. */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stateless hash of numbers to [0, 1). */
export function hash(...xs: number[]) {
  let h = 2166136261 >>> 0;
  for (const x of xs) {
    h ^= Math.floor(x * 1000003) | 0;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
    h = Math.imul(h, 0x5bd1e995);
    h ^= h >>> 15;
  }
  return (h >>> 0) / 4294967296;
}

/**
 * Index of the output frame nearest t. Seed per-frame flicker and jitter with this, not with
 * Math.floor(t * fps): it is constant over a frame's whole motion-blur shutter, so each frame shows
 * one state instead of a double exposure of two.
 */
export const frameIdx = (t: number) => Math.round(t * FPS);

// ---- value noise, for organic CPU-side motion (drift, handheld camera) ----
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
export function noise1(x: number, seed = 0) {
  const i = Math.floor(x);
  return lerp(hash(i, seed) * 2 - 1, hash(i + 1, seed) * 2 - 1, fade(x - i));
}
export function fbm1(x: number, oct = 3, seed = 0) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += a * noise1(x * f, seed + i * 7); f *= 2; a *= 0.5; }
  return s;
}

// ---- colour ----
/** sRGB hex -> linear RGB (for shader uniforms and HDR tints). */
export function hexToLinear(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
}
/** CSS rgba() from a hex colour, for Canvas2D. */
export function rgba(hex: string, a = 1) {
  const n = parseInt(hex.replace('#', ''), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
