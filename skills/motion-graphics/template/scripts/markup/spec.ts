// The markup page's audio strip: a log-frequency spectrogram of the render's audio (or a stem that is
// sample-aligned to it), plus the beat grid and the sung word onsets drawn at their real times.
// Pure functions of the samples and the files, so the same input always gives the same strip.
//
//   decode(file)            mono f32 PCM at SR via ffmpeg (the MP4's own track, or a WAV stem)
//   spectrogram(pcm)        STFT (Hann, N 1024, hop 128 = 5.8 ms) folded onto ROWS log bands, 80 Hz to 8 kHz,
//                           as bytes 0..255 over the top 80 dB; column c is centred on t0 + c * hop / sr
//   marks(audioJson, lyrics, zero)   beats, downbeats and words (null starts skipped) on the video's clock
//   lengthCheck(a, b)       how far a stem's length is from the video's audio
export const SR = 22050, NFFT = 1024, HOP = 128, ROWS = 160, FMIN = 80, FMAX = 8000, DB = 80;

export interface SpecMeta { sr: number; hop: number; nfft: number; rows: number; cols: number; fmin: number; fmax: number; db: number; t0: number; duration: number }
export interface Spec { meta: SpecMeta; data: Uint8Array }
export interface Word { text: string; start: number; end: number | null; line: string }
export interface Marks { beats: number[]; downbeats: number[]; words: Word[]; zero: number; warnings: string[] }

/** Mono PCM of a file's first audio stream, resampled to `sr` (null when it has no audio). */
export function decode(file: string, sr = SR): Float32Array | null {
  const r = Bun.spawnSync(['ffmpeg', '-v', 'error', '-i', file, '-map', '0:a:0', '-ac', '1', '-ar', String(sr), '-f', 'f32le', '-'], { stdout: 'pipe', stderr: 'pipe' });
  if (r.exitCode !== 0) {
    const err = r.stderr.toString();
    if (/matches no streams|does not contain any stream|Output file .* does not contain/i.test(err)) return null;
    throw new Error(`ffmpeg could not decode the audio of ${file}: ${err.split('\n')[0]}`);
  }
  const b = r.stdout;
  return b.byteLength ? new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + (b.byteLength & ~3))) : null;
}

/** Seconds from the video stream's start to the audio stream's start (0 for the template's renders). */
export function audioLead(file: string) {
  const r = Bun.spawnSync(['ffprobe', '-v', 'error', '-show_entries', 'stream=codec_type,start_time', '-of', 'json', file]);
  if (r.exitCode !== 0) return 0;
  const st = (JSON.parse(r.stdout.toString()).streams ?? []) as { codec_type: string; start_time?: string }[];
  const a = st.find((s) => s.codec_type === 'audio'), v = st.find((s) => s.codec_type === 'video');
  return a && v ? (+(a.start_time ?? 0) || 0) - (+(v.start_time ?? 0) || 0) : 0;
}

// ---------- FFT ----------
const tw = new Map<number, { cos: Float64Array; sin: Float64Array; rev: Uint32Array }>();
function tables(n: number) {
  let t = tw.get(n);
  if (!t) {
    const cos = new Float64Array(n / 2), sin = new Float64Array(n / 2), rev = new Uint32Array(n), bits = Math.log2(n);
    for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos((2 * Math.PI * i) / n); sin[i] = -Math.sin((2 * Math.PI * i) / n); }
    for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); rev[i] = r; }
    tw.set(n, (t = { cos, sin, rev }));
  }
  return t;
}
/** In-place iterative radix-2 FFT (n a power of two). */
export function fft(re: Float64Array, im: Float64Array) {
  const n = re.length, { cos, sin, rev } = tables(n);
  for (let i = 0; i < n; i++) { const j = rev[i]!; if (j > i) { let x = re[i]!; re[i] = re[j]!; re[j] = x; x = im[i]!; im[i] = im[j]!; im[j] = x; } }
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1, step = n / size;
    for (let s = 0; s < n; s += size) for (let k = 0; k < half; k++) {
      const a = s + k, b = a + half, c = cos[k * step]!, d = sin[k * step]!;
      const xr = re[b]! * c - im[b]! * d, xi = re[b]! * d + im[b]! * c;
      re[b] = re[a]! - xr; im[b] = im[a]! - xi; re[a] = re[a]! + xr; im[a] = im[a]! + xi;
    }
  }
}

/** Log-spaced band edges in FFT bins: row r spans [edge[r], edge[r+1]). */
export function bandEdges(rows = ROWS, fmin = FMIN, fmax = FMAX, sr = SR, nfft = NFFT) {
  const df = sr / nfft;
  return Float64Array.from({ length: rows + 1 }, (_, r) => (fmin * Math.pow(fmax / fmin, r / rows)) / df);
}
/** Centre frequency (Hz) of row r, row 0 the lowest. */
export const rowHz = (r: number, rows = ROWS, fmin = FMIN, fmax = FMAX) => fmin * Math.pow(fmax / fmin, (r + 0.5) / rows);

export function spectrogram(pcm: Float32Array, o: { sr?: number; t0?: number } = {}): Spec {
  const sr = o.sr ?? SR, n = NFFT, half = n / 2;
  const cols = Math.max(1, Math.ceil(pcm.length / HOP));
  const win = Float64Array.from({ length: n }, (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n));
  const edges = bandEdges(ROWS, FMIN, FMAX, sr, n);
  const db = new Float32Array(cols * ROWS);
  const re = new Float64Array(n), im = new Float64Array(n), mag = new Float64Array(half + 1);
  // frame c is centred on sample c * HOP (zeros outside the signal)
  const frame = (c: number, out: Float64Array) => {
    const s0 = c * HOP - half;
    for (let i = 0; i < n; i++) { const j = s0 + i; out[i] = j >= 0 && j < pcm.length ? pcm[j]! * win[i]! : 0; }
  };
  const bands = (c: number) => {
    for (let r = 0; r < ROWS; r++) {
      const lo = edges[r]!, hi = edges[r + 1]!;
      let v: number;
      if (hi - lo < 1) { const x = (lo + hi) / 2, i = Math.floor(x), f = x - i; v = mag[i]! * (1 - f) + mag[Math.min(half, i + 1)]! * f; }
      else { v = 0; for (let i = Math.ceil(lo); i < hi && i <= half; i++) v = Math.max(v, mag[i]!); }
      db[c * ROWS + r] = 20 * Math.log10(v + 1e-9);
    }
  };
  // two real frames per complex FFT: frame a in re, frame b in im, separated by symmetry
  const fa = new Float64Array(n), fb = new Float64Array(n);
  for (let c = 0; c < cols; c += 2) {
    frame(c, fa);
    if (c + 1 < cols) frame(c + 1, fb); else fb.fill(0);
    re.set(fa); im.set(fb);
    fft(re, im);
    for (let k = 0; k <= half; k++) {
      const j = (n - k) % n;
      mag[k] = Math.hypot((re[k]! + re[j]!) / 2, (im[k]! - im[j]!) / 2);
    }
    bands(c);
    if (c + 1 < cols) {
      for (let k = 0; k <= half; k++) {
        const j = (n - k) % n;
        mag[k] = Math.hypot((im[k]! + im[j]!) / 2, (re[j]! - re[k]!) / 2);
      }
      bands(c + 1);
    }
  }
  let top = -Infinity;
  for (const v of db) if (v > top) top = v;
  const data = new Uint8Array(db.length);
  for (let i = 0; i < db.length; i++) data[i] = Math.round(Math.max(0, Math.min(1, (db[i]! - top + DB) / DB)) * 255);
  return { meta: { sr, hop: HOP, nfft: n, rows: ROWS, cols, fmin: FMIN, fmax: FMAX, db: DB, t0: o.t0 ?? 0, duration: pcm.length / sr }, data };
}

// ---------- marks ----------
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
/**
 * Beats and downbeats from audio.json (already on the render's clock), words from lyrics.json in song
 * seconds shifted by `zero` (the song time of the video's first frame). Nothing is invented: a word
 * without a start is left out, and the count is reported.
 */
export function marks(audio: any, lyrics: any, zero = 0, duration = Infinity): Marks {
  const inside = (t: number) => t >= -1e-6 && t <= duration + 1e-6;
  const list = (a: unknown) => (Array.isArray(a) ? a.map(num).filter((t): t is number => t !== null && inside(t)) : []);
  const warnings: string[] = [];
  const words: Word[] = [];
  if (lyrics) {
    let skipped = 0;
    for (const l of Array.isArray(lyrics.lines) ? lyrics.lines : []) for (const w of Array.isArray(l?.words) ? l.words : []) {
      const s = num(w?.start);
      if (s === null) { skipped++; continue; }
      const e = num(w?.end), t = s - zero;
      if (!inside(t)) continue;
      words.push({ text: String(w.text ?? ''), start: +t.toFixed(4), end: e === null ? null : +(e - zero).toFixed(4), line: String(l.id ?? '') });
    }
    words.sort((a, b) => a.start - b.start);
    if (skipped) warnings.push(`${skipped} word${skipped > 1 ? 's' : ''} in the lyrics have no start time and are not drawn`);
    if (!words.length) warnings.push(`no lyric word falls inside the video (zero ${zero} s: the song time of its first frame)`);
  }
  return { beats: list(audio?.beats), downbeats: list(audio?.downbeats), words, zero, warnings };
}

/**
 * A stem must line up with the video's audio sample for sample: how far its length is off, and whether
 * that is worth a warning. An AAC track decodes up to one codec frame long (~21 ms at 48 kHz: end padding),
 * so a difference within 25 ms (or half a video frame, if longer) is reported but not flagged.
 */
export function lengthCheck(stem: number, video: number, sr: number, fps: number, name = 'the stem', ref = "the video's audio") {
  const d = (stem - video) / sr, ms = Math.abs(d * 1000);
  if (ms < 0.05) return null;
  const text = `${name} is ${ms.toFixed(1)} ms (${(Math.abs(d) * fps).toFixed(1)} frames) ${d > 0 ? 'longer' : 'shorter'} than ${ref}`;
  return ms <= Math.max(25, 500 / fps)
    ? { warn: false, text: `${text} (within an AAC track's end padding)` }
    : { warn: true, text: `${text}: it is drawn from the first frame, so check it is the same crop of the same master` };
}
