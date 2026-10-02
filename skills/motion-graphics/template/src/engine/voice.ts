// Voice-over as data: the script (public/vo/vo.json, written by the agent), one rendered take per line
// (public/vo/<id>.json + audio, written by scripts/voice.ts), and the lines placed on the music's grid.
// Placement is pure, so the browser (captions, preview playback) and scripts/render.ts (the mix) resolve
// the same times from the same files.
import type { Audio } from './audio';

/** A spoken word, in seconds from the start of its take's audio. */
export interface VoWord { w: string; s: number; e: number }

/** One rendered line (public/vo/<id>.json). */
export interface VoTake {
  id: string;
  /** What was sent to the model (direction tags included). */
  sent: string;
  /** Audio file under public/ (e.g. "vo/l1.wav"). */
  file: string;
  duration: number;
  words: VoWord[];
}

/**
 * One line of the script. Place it with exactly one of:
 *  - `at`: its start, in seconds or on the grid ("bar:4", "bar:4.5", "beat:17");
 *  - `land`: a word of it on a time (the line starts so that `word` begins at `at`), to put the key word on a beat;
 *  - `after`: the id of the line before it, plus `gap` seconds (default 0.25), for natural back-to-back reading.
 */
export interface VoLine {
  id: string;
  text: string;
  /** Performance direction for models that take inline tags, e.g. "[warm, unhurried]"; sent before the text. */
  direction?: string;
  at?: number | string;
  land?: { word: string; at: number | string };
  after?: string;
  gap?: number;
  /** dB applied in the mix. */
  gain?: number;
  /** Caption override: a string to show instead of the spoken words, or false for no caption. */
  caption?: string | false;
}

export interface VoScript {
  provider: string;
  model: string;
  voice: { id: string; name?: string };
  /** Provider voice settings, passed through (e.g. ElevenLabs stability, similarity_boost, style, speed). */
  settings?: Record<string, number | boolean>;
  language?: string;
  seed?: number;
  lines: VoLine[];
}

/** A take placed in the piece: starts at t (piece seconds). */
export interface VoCue extends VoTake { t: number; gain: number; caption: string | false }

/** Seconds, "bar:N" or "beat:N" (fractional allowed) on the piece's grid. */
export function timeOf(audio: Audio, x: number | string): number {
  if (typeof x === 'number') return x;
  const m = /^(bar|beat):\s*(-?[\d.]+)$/.exec(x.trim());
  if (!m) throw new Error(`voice: cannot place "${x}" (use seconds, "bar:N" or "beat:N")`);
  const n = +m[2]!;
  return m[1] === 'bar' ? audio.timeOfBar(n) : audio.timeOfBeat(n);
}

/** Audio tags ("[whispers]", "[warm, unhurried]") are direction, never caption text. */
export const stripTags = (s: string) => s.replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
const key = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');

/** Place every line of the script; throws on a missing take or an unplaceable line. */
export function resolveCues(script: VoScript, takes: Record<string, VoTake>, audio: Audio): VoCue[] {
  const out: VoCue[] = [];
  for (const line of script.lines) {
    const take = takes[line.id];
    if (!take) throw new Error(`voice: line "${line.id}" has no take yet (bun scripts/voice.ts render)`);
    let t: number;
    if (line.land) {
      const w = take.words.find((x) => key(x.w) === key(line.land!.word));
      if (!w) throw new Error(`voice: line "${line.id}" has no word "${line.land.word}" to land`);
      t = timeOf(audio, line.land.at) - w.s;
    } else if (line.after) {
      const prev = out.find((c) => c.id === line.after);
      if (!prev) throw new Error(`voice: line "${line.id}" follows "${line.after}", which is not before it in the script`);
      t = prev.t + prev.duration + (line.gap ?? 0.25);
    } else t = timeOf(audio, line.at ?? 0);
    out.push({ ...take, t, gain: line.gain ?? 0, caption: line.caption === false ? false : (line.caption ?? stripTags(line.text)) });
  }
  return out;
}

/** Pairs of lines that would talk over each other (speech intervals, ignoring the takes' silent edges). */
export function overlaps(cues: VoCue[]) {
  const span = (c: VoCue) => [c.t + (c.words[0]?.s ?? 0), c.t + (c.words.at(-1)?.e ?? c.duration)] as const;
  const out: [string, string][] = [];
  for (let i = 0; i < cues.length; i++) for (let j = i + 1; j < cues.length; j++) {
    const a = span(cues[i]!), b = span(cues[j]!);
    if (a[0] < b[1] && b[0] < a[1]) out.push([cues[i]!.id, cues[j]!.id]);
  }
  return out;
}

/** Caption phrases: at most `maxChars` per line and two lines, broken after sentence ends and long pauses. */
export interface Phrase { cue: VoCue; lines: VoWord[][]; s: number; e: number }
export function phrases(cues: VoCue[], maxChars = 32): Phrase[] {
  const out: Phrase[] = [];
  for (const cue of cues) {
    if (cue.caption === false) continue;
    // a caption override shows as one block over the line's speech
    const words = typeof cue.caption === 'string' && stripTags(cue.sent) !== cue.caption
      ? [{ w: cue.caption, s: cue.words[0]?.s ?? 0, e: cue.words.at(-1)?.e ?? cue.duration }]
      : cue.words.filter((w) => key(w.w));
    let cur: VoWord[] = [];
    const flush = () => {
      if (!cur.length) return;
      const lines: VoWord[][] = [[]];
      for (const w of cur) {
        const ln = lines.at(-1)!, len = ln.reduce((n, x) => n + x.w.length + 1, 0) + w.w.length;
        if (ln.length && len > maxChars) lines.push([w]); else ln.push(w);
      }
      out.push({ cue, lines, s: cue.t + cur[0]!.s, e: cue.t + cur.at(-1)!.e });
      cur = [];
    };
    words.forEach((w, i) => {
      const chars = cur.reduce((n, x) => n + x.w.length + 1, 0) + w.w.length;
      if (cur.length && chars > maxChars * 2) flush();
      cur.push(w);
      const next = words[i + 1];
      if (/[.!?…:;]$/.test(w.w) || (next && next.s - w.e > 0.6)) flush();
    });
    flush();
  }
  return out;
}

/** Browser: the script, its takes and their placement, or null when the piece has no voice. */
export async function loadVoice(url: string | null, audio: Audio): Promise<{ script: VoScript; cues: VoCue[] } | null> {
  if (!url) return null;
  const r = await fetch(url);
  if (!r.ok) throw new Error(`voice: ${url} not found`);
  const script = (await r.json()) as VoScript;
  const dir = url.slice(0, url.lastIndexOf('/') + 1);
  const takes: Record<string, VoTake> = {};
  await Promise.all(script.lines.map(async (l) => {
    const t = await fetch(`${dir}${l.id}.json`);
    if (t.ok && (t.headers.get('content-type') ?? '').includes('json')) takes[l.id] = await t.json();
  }));
  return { script, cues: resolveCues(script, takes, audio) };
}
