// Boots the engine. Two modes:
//  - preview (default): plays with the music, scrub and step with the keyboard, ?t=3.2 to start there.
//  - export (?export=1): no UI; exposes window.__mg for scripts/render.ts (stills, sheets, video frames).
import { Engine, type Sampling } from './engine/engine';
import { Audio } from './engine/audio';
import { loadFonts } from './engine/type';
import { FORMAT_NAME, FPS, PW, PH, W, H, SAFE, SCALE } from './engine/format';
import { brand } from './brand';
import { project } from './project';
import { makeTimeline } from './timeline';
import { loadVoice, type VoCue } from './engine/voice';
import { Captions } from './engine/captions';

const q = new URLSearchParams(location.search);
const exportMode = q.has('export');
const only = q.get('only')?.split(',').filter(Boolean);

const api: Record<string, any> = { ready: false, error: null, errors: [] as string[] };
(window as any).__mg = api;

async function boot() {
  document.body.classList.toggle('export', exportMode);
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  const engine = new Engine(canvas);
  const [audio] = await Promise.all([
    // silent pieces skip the fetch and get a steady grid from project.bpm
    Audio.load(project.music ? 'audio.json' : '', { bpm: project.bpm, duration: project.duration, beatsPerBar: project.beatsPerBar }),
    loadFonts([brand.fonts.display, brand.fonts.body, brand.fonts.mono]),
  ]);
  const timeline = makeTimeline(audio);
  await engine.init(audio, timeline, only);
  // the voice-over, placed on the grid; captions are an overlay over the finished frame
  let cues: VoCue[] = [];
  try {
    const vo = await loadVoice(project.voice, audio);
    cues = vo?.cues ?? [];
    if (cues.length && project.captions) { const cap = new Captions(cues, typeof project.captions === 'object' ? project.captions : {}); engine.overlay = (t) => cap.draw(t); }
  } catch (e) { engine.errors.push(`[voice] ${(e as Error)?.message ?? e}`); }
  const duration = Math.min(project.duration, engine.duration || project.duration);

  if (exportMode) {
    canvas.style.width = `${PW}px`;
    canvas.style.height = `${PH}px`;
  }

  Object.assign(api, {
    engine, width: PW, height: PH, logical: [W, H], scale: SCALE, format: FORMAT_NAME, fps: FPS, duration,
    safe: SAFE, music: project.music, title: project.title, errors: engine.errors,
    voice: cues.map((c) => ({ id: c.id, file: c.file, t: c.t, gain: c.gain, duration: c.duration })), mix: project.mix,
    timeline: timeline.map((e) => ({ id: e.id, start: e.start, end: e.end })),
    /** Render one frame at t to the canvas. */
    still(t: number, samples: Sampling = 1, shutter = 0.5) { return engine.render(t, 1 / FPS, true, samples, shutter); },
    /** The canvas as a PNG (base64), full physical resolution. */
    png() { return canvas.toDataURL('image/png').split(',')[1]; },
    /** Stream raw RGBA frames [from, to) to a WebSocket; the server acks each frame so memory stays bounded. */
    async stream(o: { from: number; to: number; ws: string; samples: Sampling; shutter: number; inflight?: number }) {
      const sock = new WebSocket(o.ws);
      sock.binaryType = 'arraybuffer';
      await new Promise((res, rej) => { sock.onopen = res; sock.onerror = rej; });
      let acked = 0;
      sock.onmessage = (e) => { acked = +e.data; };
      const f0 = Math.round(o.from * FPS), n = Math.round(o.to * FPS) - f0;
      const buf = new Uint8Array(PW * PH * 4);
      const used: Record<number, number> = {};
      for (let i = 0; i < n; i++) {
        const k = engine.render((f0 + i) / FPS, 1 / FPS, false, o.samples, o.shutter);
        used[k] = (used[k] ?? 0) + 1;
        await engine.readPixelsAsync(buf);
        while (i - acked >= (o.inflight ?? 3)) await new Promise((r) => setTimeout(r, 1));
        sock.send(buf.slice());
      }
      while (acked < n) await new Promise((r) => setTimeout(r, 5));
      sock.close();
      return used;
    },
  });
  api.ready = true;
  if (!exportMode) preview(engine, canvas, duration, cues);
}

function preview(engine: Engine, canvas: HTMLCanvasElement, duration: number, cues: VoCue[]) {
  const timeEl = document.getElementById('time')!, sceneEl = document.getElementById('scene')!;
  const scrub = document.getElementById('scrub') as HTMLInputElement;
  const safeEl = document.getElementById('safe')!;
  const music = project.music ? new window.Audio(project.music) : null;
  let t = +(q.get('t') ?? 0), playing = false, clock0 = 0, t0 = 0;
  const entries = engine.timeline;

  const seek = (x: number) => {
    t = Math.min(Math.max(0, x), duration - 1e-3);
    if (music) music.currentTime = t;
    t0 = t; clock0 = performance.now();
  };
  const toggle = () => {
    playing = !playing;
    seek(t);
    if (music) { if (playing) void music.play(); else music.pause(); }
  };
  addEventListener('keydown', (e) => {
    const k = e.key;
    if (k === ' ') { e.preventDefault(); toggle(); }
    else if (k === 'ArrowRight') seek(t + (e.shiftKey ? 5 : 1));
    else if (k === 'ArrowLeft') seek(t - (e.shiftKey ? 5 : 1));
    else if (k === '.') seek(t + 1 / FPS);
    else if (k === ',') seek(t - 1 / FPS);
    else if (k === ']') seek(entries.find((x) => x.start > t + 1e-3)?.start ?? t);
    else if (k === '[') seek([...entries].reverse().find((x) => x.start < t - 0.05)?.start ?? 0);
    else if (k === 's') document.body.classList.toggle('showsafe');
    else if (k === 'h') document.body.classList.toggle('clean');
  });
  scrub.oninput = () => seek(+scrub.value * duration);

  // the voice-over in the preview: each line plays from its cue, in step with the music clock
  const lines = cues.map((c) => ({ c, el: new window.Audio(c.file) }));
  const syncVoice = () => {
    for (const { c, el } of lines) {
      const inside = playing && t >= c.t && t < c.t + c.duration;
      if (inside && el.paused) { el.currentTime = t - c.t; void el.play(); }
      else if (!inside && !el.paused) el.pause();
    }
  };
  const frame = () => {
    if (playing) {
      t = music && !music.paused ? music.currentTime : t0 + (performance.now() - clock0) / 1000;
      if (t >= duration) { seek(0); }
    }
    syncVoice();
    engine.render(t, 1 / FPS);
    timeEl.textContent = `${t.toFixed(2)}s  f${Math.round(t * FPS)}  ${FORMAT_NAME}`;
    sceneEl.textContent = engine.entryAt(t)?.id ?? '';
    scrub.value = String(t / duration);
    // safe-area overlay in screen px
    const r = canvas.getBoundingClientRect(), k = r.width / W;
    Object.assign(safeEl.style, { left: `${r.left + SAFE.x * k}px`, top: `${r.top + SAFE.y * k}px`, width: `${SAFE.w * k}px`, height: `${SAFE.h * k}px` });
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

boot().catch((e) => { api.error = String(e?.stack ?? e); console.error(e); });
