// Sung lyrics as data: public/lyrics.json from scripts/lyrics_align.py (each word's start and end from
// a local ASR model; provisional, not verified phonetic sync). Times in the file are song seconds; a
// part of a longer piece loads them shifted by its editZero (the part's start in the song), so they
// share the clock of the part's audio.json. Plus the timing helpers lyric typography is built from.
import { clamp, ease, lerp } from './util';

export interface LyricWord {
  text: string;
  start: number;
  end: number;
  /** asr (both passes agree or one matched), soundalike (timing of a mis-heard word), interpolated. */
  status: string;
  spread?: number;
}
export interface LyricLine {
  id: string;
  text: string;
  /** Who sings it, from the lyrics file's voice column. */
  voice?: string;
  words: LyricWord[];
}

export class Lyrics {
  readonly byId: Record<string, LyricLine>;
  constructor(public lines: LyricLine[]) { this.byId = Object.fromEntries(lines.map((l) => [l.id, l])); }

  static async load(url = 'lyrics.json', editZero = 0) {
    const d = await (await fetch(url)).json();
    return new Lyrics(d.lines.map((l: LyricLine) => ({
      id: l.id, text: l.text, ...(l.voice ? { voice: l.voice } : {}),
      words: l.words.map((w) => ({ ...w, start: w.start - editZero, end: w.end - editZero })),
    })));
  }
  line(id: string) {
    const l = this.byId[id];
    if (!l) throw new Error(`no lyric line ${id}`);
    return l;
  }
  /** First sung onset and last word's end of a line. */
  span(id: string): [number, number] { const w = this.line(id).words; return [w[0]!.start, w[w.length - 1]!.end]; }
}

/** Entrance progress (0..1) of glyph i of a word sung at `start`: each letter rises in on the onset,
 *  staggered left to right. `steps` > 0 quantizes it into hard steps (rigid, mechanical type). */
export function glyphIn(t: number, start: number, i: number, o: { lead?: number; stagger?: number; dur?: number; steps?: number } = {}) {
  const { lead = 0.03, stagger = 0.022, dur = 0.32, steps = 0 } = o;
  const x = clamp((t - start + lead - i * stagger) / dur);
  return steps ? Math.floor(x * steps) / steps : ease.outExpo(x);
}

/** How many characters of a word typed across its sung duration are showing (a machine voice). */
export const typedChars = (t: number, start: number, end: number, n: number) =>
  Math.ceil(n * clamp((t - start) / clamp(end - start, 0.12, 0.4)) - 1e-6);

/** Exit with an afterglow after `off`: `tint` goes 0..1 over 0.2 s (mix the ink toward the accent), the
 *  alpha decays exponentially and is cut to zero by `hold + cut` s, so no ghost lingers into the next line. */
export function afterglow(t: number, off: number, o: { rate?: number; hold?: number; cut?: number; tintIn?: number } = {}) {
  const { rate = 4.6, hold = 0.45, cut = 0.4, tintIn = 0.2 } = o;
  if (t < off) return { a: 1, tint: 0 };
  const d = t - off;
  return { a: Math.exp(-d * rate) * (1 - clamp((d - hold) / cut)), tint: clamp(d / tintIn) };
}

/** Left x of each word in a row that stays centred on `cx` as the words arrive: the row's width eases
 *  from the words sung so far to the next word's, over `dur` from each onset. */
export function recentredRow(widths: number[], starts: number[], t: number, cx: number, gap: number, dur = 0.25) {
  const xs: number[] = [];
  let acc = 0, w = 0;
  widths.forEach((wi, i) => {
    xs.push(acc);
    w += (wi + (i ? gap : 0)) * ease.outCubic(clamp((t - starts[i]!) / dur));
    acc += wi + gap;
  });
  return xs.map((x) => x + cx - w / 2);
}

/** An envelope's value at time t (audio.json env.rms at envFps, say): drives an oscilloscope of the song. */
export const envAt = (env: number[], fps: number, t: number) => env[clamp(Math.round(t * fps), 0, env.length - 1)] ?? 0;

/** Mix two sRGB triplets (0..255) for Canvas2D fills, e.g. ink to accent by afterglow().tint. */
export const mixRGB = (a: number[], b: number[], k: number) => a.map((x, i) => Math.round(lerp(x, b[i]!, k)));
