// The music as data: beat grid, bars, envelopes and onsets from public/audio.json
// (written by scripts/analyze_audio.py). Without that file a steady grid is built from
// project.bpm, so silent pieces still cut and move on a rhythm.
import { clamp, pulse } from './util';

export interface AudioJson {
  duration: number;
  bpm: number;
  beats: number[];
  downbeats: number[];
  /** Envelopes sampled at envFps, each normalised to 0..1: rms, low, mid, high. */
  envFps: number;
  env: Record<string, number[]>;
  /** Onset times by kind: kick (low band), snare (mid), hat (high), any. */
  onsets: Record<string, number[]>;
  sections?: { name: string; start: number }[];
}

export interface AudioSample { rms: number; low: number; mid: number; high: number; kick: number; snare: number; hat: number }

export class Audio {
  constructor(public data: AudioJson, public beatsPerBar = 4) {}

  static async load(url: string, fallback: { bpm: number; duration: number; beatsPerBar: number }) {
    if (url) try {
      const r = await fetch(url);
      if (r.ok && (r.headers.get('content-type') ?? '').includes('json')) return new Audio(await r.json(), fallback.beatsPerBar);
    } catch { /* fall through to the synthetic grid */ }
    const period = 60 / fallback.bpm;
    const n = Math.ceil(fallback.duration / period) + 1;
    const beats = Array.from({ length: n }, (_, i) => i * period);
    return new Audio({
      duration: fallback.duration, bpm: fallback.bpm, beats,
      downbeats: beats.filter((_, i) => i % fallback.beatsPerBar === 0),
      envFps: 100, env: {}, onsets: { kick: beats.filter((_, i) => i % 2 === 0), snare: beats.filter((_, i) => i % 2 === 1), hat: [], any: beats },
    }, fallback.beatsPerBar);
  }

  get beats() { return this.data.beats; }
  get downbeats() { return this.data.downbeats; }
  get period() { return 60 / this.data.bpm; }

  /** Continuous beat index at t (3.5 = halfway between beats 3 and 4). Extrapolates outside the grid. */
  beatAt(t: number) {
    const b = this.data.beats;
    if (b.length < 2) return t / this.period;
    if (t <= b[0]!) return (t - b[0]!) / (b[1]! - b[0]!);
    const last = b.length - 1;
    if (t >= b[last]!) return last + (t - b[last]!) / (b[last]! - b[last - 1]!);
    let lo = 0, hi = last;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (b[m]! <= t) lo = m; else hi = m; }
    return lo + (t - b[lo]!) / (b[hi]! - b[lo]!);
  }

  /** Time of (continuous) beat index i. */
  timeOfBeat(i: number) {
    const b = this.data.beats;
    if (b.length < 2) return i * this.period;
    const last = b.length - 1;
    if (i <= 0) return b[0]! + i * (b[1]! - b[0]!);
    if (i >= last) return b[last]! + (i - last) * (b[last]! - b[last - 1]!);
    const k = Math.floor(i);
    return b[k]! + (i - k) * (b[k + 1]! - b[k]!);
  }

  /** Index of the first downbeat in the beat grid (bar 0 starts there). */
  private get barOffset() {
    const d0 = this.data.downbeats[0];
    return d0 === undefined ? 0 : Math.round(this.beatAt(d0));
  }
  barAt(t: number) { return (this.beatAt(t) - this.barOffset) / this.beatsPerBar; }
  timeOfBar(i: number) { return this.timeOfBeat(this.barOffset + i * this.beatsPerBar); }

  nearestBeat(t: number) { return this.timeOfBeat(Math.round(this.beatAt(t))); }
  nearestDownbeat(t: number) { return this.timeOfBar(Math.round(this.barAt(t))); }

  /** Envelope value at t (0..1), linearly interpolated; 0 when the piece has no analysed music. */
  env(name: string, t: number) {
    const e = this.data.env[name];
    if (!e || e.length === 0) return 0;
    const x = clamp(t * this.data.envFps, 0, e.length - 1);
    const i = Math.floor(x), f = x - i;
    return e[i]! * (1 - f) + (e[Math.min(i + 1, e.length - 1)] ?? 0) * f;
  }

  events(kind: string, t0: number, t1: number) {
    return (this.data.onsets[kind] ?? []).filter((x) => x >= t0 && x < t1);
  }

  /** Decaying pulse from the most recent onset of `kind` (1 on the hit, halving every `hl` s). */
  hit(kind: string, t: number, hl = 0.1) {
    const o = this.data.onsets[kind] ?? [];
    let lo = 0, hi = o.length;
    while (lo < hi) { const m = (lo + hi) >> 1; if (o[m]! <= t) lo = m + 1; else hi = m; }
    return lo > 0 ? pulse(t, o[lo - 1]!, hl) : 0;
  }

  sample(t: number): AudioSample {
    return {
      rms: this.env('rms', t), low: this.env('low', t), mid: this.env('mid', t), high: this.env('high', t),
      kick: this.hit('kick', t), snare: this.hit('snare', t), hat: this.hit('hat', t, 0.05),
    };
  }
}
