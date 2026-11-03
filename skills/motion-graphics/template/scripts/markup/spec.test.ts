// bun test scripts/markup: the audio strip's analysis, and the server end to end on a generated MP4.
import { test, expect, describe, afterAll } from 'bun:test';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { SR, HOP, ROWS, fft, spectrogram, rowHz, marks, lengthCheck, decode } from './spec';

const tone = (hz: number, from: number, to: number, len: number) =>
  Float32Array.from({ length: Math.round(len * SR) }, (_, i) => (i >= from * SR && i < to * SR ? 0.5 * Math.sin((2 * Math.PI * hz * i) / SR) : 0));
/** Where a steady tone starts: the first column within 6 dB of its level (half the Hann window covers it). */
function onsetCol(s: ReturnType<typeof spectrogram>) {
  const top = Math.max(...s.data), cut = top - (6 / s.meta.db) * 255;
  for (let c = 0; c < s.meta.cols; c++) for (let r = 0; r < ROWS; r++) if (s.data[c * ROWS + r]! >= cut) return c;
  return -1;
}
const peakRow = (s: ReturnType<typeof spectrogram>, c: number) => {
  let r0 = 0;
  for (let r = 1; r < ROWS; r++) if (s.data[c * ROWS + r]! > s.data[c * ROWS + r0]!) r0 = r;
  return r0;
};

describe('fft', () => {
  test('matches a direct DFT', () => {
    const n = 64, x = Array.from({ length: n }, (_, i) => Math.sin(i * 1.3) + 0.5 * Math.cos(i * 0.37) + (i % 5) / 7);
    const re = Float64Array.from(x), im = new Float64Array(n);
    fft(re, im);
    for (const k of [0, 1, 7, 31, 32, 50]) {
      let dr = 0, di = 0;
      for (let i = 0; i < n; i++) { dr += x[i]! * Math.cos((2 * Math.PI * k * i) / n); di -= x[i]! * Math.sin((2 * Math.PI * k * i) / n); }
      expect(re[k]!).toBeCloseTo(dr, 9); expect(im[k]!).toBeCloseTo(di, 9);
    }
  });
});

describe('spectrogram', () => {
  test('a tone lands on its row', () => {
    for (const hz of [220, 1000, 4000]) {
      const s = spectrogram(tone(hz, 0, 1, 1)), r = peakRow(s, Math.floor(s.meta.cols / 2));
      expect(Math.abs(Math.log2(rowHz(r) / hz))).toBeLessThan(2 / 24); // within two bands (24 a octave)
    }
  });
  test('an onset lands at its time, well inside a 30 fps frame', () => {
    for (const at of [0.5, 0.7731]) {
      const s = spectrogram(tone(1000, at, 2, 2)), t = onsetCol(s) * HOP / SR;
      expect(Math.abs(t - at)).toBeLessThan(2 * HOP / SR);
    }
  });
  test('even and odd columns (packed into one FFT) read the same', () => {
    const s = spectrogram(tone(660, 0, 1, 1)), c = 60;
    for (let r = 0; r < ROWS; r++) expect(Math.abs(s.data[c * ROWS + r]! - s.data[(c + 1) * ROWS + r]!)).toBeLessThanOrEqual(2);
  });
  test('the same samples give the same bytes', () => {
    const x = tone(330, 0.1, 0.4, 0.5);
    expect(spectrogram(x).data).toEqual(spectrogram(x).data);
  });
  test('silence is all zero, with its length and start kept', () => {
    const s = spectrogram(new Float32Array(SR), { t0: 0.25 });
    expect(s.meta.cols).toBe(Math.ceil(SR / HOP));
    expect(s.meta.t0).toBe(0.25);
    expect(s.data.every((v) => v === s.data[0])).toBe(true);
  });
});

describe('marks', () => {
  const lyrics = { lines: [
    { id: 'l1', words: [{ text: 'b', start: 11.2, end: 11.5 }, { text: 'a', start: 10.5, end: 10.9 }, { text: 'gap', start: null, end: null }] },
    { id: 'l2', words: [{ text: 'late', start: 99, end: 99.4 }, { text: 'open', start: 12, end: null }] },
  ] };
  test('words are shifted by the song time of the first frame, sorted, and never invented', () => {
    const m = marks(null, lyrics, 10, 5);
    expect(m.words).toEqual([
      { text: 'a', start: 0.5, end: 0.9, line: 'l1' }, { text: 'b', start: 1.2, end: 1.5, line: 'l1' }, { text: 'open', start: 2, end: null, line: 'l2' },
    ]);
    expect(m.warnings).toEqual(['1 word in the lyrics have no start time and are not drawn']);
  });
  test('beats and downbeats come through on the video clock, inside it', () => {
    const m = marks({ beats: [0, 0.5, 1, 1.5, 9], downbeats: [0, 2, 'x'] }, null, 0, 3);
    expect(m.beats).toEqual([0, 0.5, 1, 1.5]);
    expect(m.downbeats).toEqual([0, 2]);
    expect(m.words).toEqual([]);
    expect(m.warnings).toEqual([]);
  });
  test('lyrics that miss the video say so', () => {
    expect(marks(null, lyrics, 500, 5).warnings.at(-1)).toContain('no lyric word falls inside the video');
  });
});

test('length check: says by how much, and flags more than an AAC end padding', () => {
  expect(lengthCheck(SR * 10, SR * 10, SR, 30)).toBeNull();
  const pad = lengthCheck(SR * 10 + 441, SR * 10, SR, 30)!; // 20 ms
  expect(pad.warn).toBe(false); expect(pad.text).toContain('20.0 ms (0.6 frames) longer');
  const w = lengthCheck(SR * 10 + SR / 5, SR * 10, SR, 30, 'vocals.wav')!;
  expect(w.warn).toBe(true); expect(w.text).toContain('vocals.wav is 200.0 ms (6.0 frames) longer');
  expect(lengthCheck(SR * 9, SR * 10, SR, 30)!.text).toContain('1000.0 ms (30.0 frames) shorter');
});

// ---------- end to end: ffmpeg makes an MP4 with a tone at a known time, the server serves its strip ----------
const hasFfmpeg = Bun.spawnSync(['ffmpeg', '-version']).exitCode === 0;
describe.skipIf(!hasFfmpeg)('server', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'markup-spec-'));
  let proc: ReturnType<typeof Bun.spawn> | null = null;
  afterAll(() => { proc?.kill(); rmSync(dir, { recursive: true, force: true }); });
  const ff = (...a: string[]) => expect(Bun.spawnSync(['ffmpeg', '-v', 'error', '-y', ...a]).exitCode).toBe(0);
  const video = path.join(dir, 'clip.mp4'), stem = path.join(dir, 'stem.wav'), lyr = path.join(dir, 'lyrics.json');

  test('the MP4 track decodes onto the video clock (AAC priming removed)', () => {
    ff('-f', 'lavfi', '-i', 'color=c=gray:s=320x180:r=30:d=3', '-f', 'lavfi', '-i', "aevalsrc='if(gte(t,1.5),0.5*sin(2*PI*1000*t),0)':s=48000:d=3",
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', video);
    const s = spectrogram(decode(video)!), t = onsetCol(s) * HOP / SR;
    expect(Math.abs(t - 1.5)).toBeLessThan(1 / 30);
  });

  test('serves the strip, the words and a length warning for a stem that is off', async () => {
    ff('-f', 'lavfi', '-i', "aevalsrc='if(gte(t,1.5),0.5*sin(2*PI*440*t),0)':s=48000:d=3.2", stem);
    writeFileSync(lyr, JSON.stringify({ lines: [{ id: 'l1', words: [{ text: 'now', start: 21.5, end: 21.8 }, { text: 'gap', start: null, end: null }] }] }));
    proc = Bun.spawn([process.execPath, path.join(import.meta.dir, '..', 'markup.ts'), 'serve', '--video', video, '--port', '0', '--audio', stem, '--lyrics', lyr, '--zero', '20'],
      { stdout: 'pipe', stderr: 'pipe' });
    let out = '';
    const rd = (proc.stdout as ReadableStream<Uint8Array>).getReader();
    while (!/markup: http:\/\/127\.0\.0\.1:(\d+)/.test(out)) { const { value, done } = await rd.read(); if (done) break; out += new TextDecoder().decode(value); }
    const port = /127\.0\.0\.1:(\d+)/.exec(out)![1];
    const base = `http://127.0.0.1:${port}/__markup/api`;
    const a = await (await fetch(`${base}/audio`)).json();
    expect(a.sources.map((s: any) => s.id)).toEqual(['main', 'stem']);
    // 3.2 s against the AAC track's 3.0 s plus its end padding (< 25 ms)
    const off = +/is ([\d.]+) ms \(.+\) longer/.exec(a.sources[1].warn)![1]!;
    expect(off).toBeGreaterThan(175); expect(off).toBeLessThanOrEqual(200);
    expect(a.marks.words).toEqual([{ text: 'now', start: 1.5, end: 1.8, line: 'l1' }]);
    expect(a.marks.warnings[0]).toContain('1 word');
    const m = a.sources[0].meta, bytes = new Uint8Array(await (await fetch(`${base}/spec/main`)).arrayBuffer());
    expect(bytes.length).toBe(m.cols * m.rows);
    expect((await fetch(`${base}/spec/other`)).status).toBe(404);
    // the loopback guard still holds for the new routes
    expect((await fetch(`${base}/audio`, { headers: { host: 'evil.example' } })).status).toBe(403);
    expect((await (await fetch(`${base}/doc`)).json()).audioVersion).toBeGreaterThan(0);
  }, 30000);
});
