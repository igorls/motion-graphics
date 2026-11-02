#!/usr/bin/env bun
// Markup: the user points at exact frames, regions and ranges of a render; the agent reads the notes and fixes them.
//
//   serve   --video out/vertical.mp4 [--scenes <file>] [--fps N] [--author name] [--port 8790]
//           a page on http://127.0.0.1:<port>/ that plays the MP4 with its audio, steps frame by frame, and
//           takes pins, boxes, freehand strokes and in→out ranges, each with a note; every note is saved as it
//           is made to <video>.markup.json next to the video. Loopback only.
//   serve   --live [--format vertical] [--url http://127.0.0.1:5173] [--port 8790]
//           the same page on this project's live engine: each frame rendered as you scrub, the timeline's
//           entries as the scene track, reloaded when src/ changes; notes go to out/live-<format>.markup.json
//   export  <video.mp4 | notes.markup.json> [--all] [--context 0.5] [--out <dir>]
//           burns every open note into its frame (a range: 4 frames across it) and writes <stem>-markup/MARKUP.md
//           listing each note with its time, frame, scene and still. --all includes resolved notes; --context S
//           adds the frames S seconds before and after a single-frame note.
//   resolve <video.mp4 | notes.markup.json> n1,n3 [--note "what changed"] [--reopen]
//   revert  <live notes.markup.json> n4     undo a kept control change (public/tune.json back to the earlier values)
//   propose <live notes.markup.json> <block> --options '{"A": {...}, "B": {...}}' [--frame N] [--note "question"]
//           named sets of control values the user previews on the page and picks from
//
// Live mode also shows the controls each scene declares (static controls, src/engine/controls.ts) for the
// block under the playhead: moving one re-renders live; Keep writes public/tune.json and logs a change record.
//
// --scenes gives the page its scene track: a JSON list [{id, start, end}] (or {scenes: [...]}, or a parts
// manifest {parts: [{name, from, to}]}), or an ffmpeg concat list (file '...' lines) whose files' frame
// counts make the blocks (named after the part folder for <part>/out/<file>.mp4). A video under a project's
// out/ gets that project's timeline by default.
//
// Look at every still the export writes (open the PNGs): that is what the reviewer pointed at.
import { chromium, type Browser } from 'playwright-core';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, statSync, readdirSync, rmSync, watch } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const mode = argv[0] ?? 'serve';
const opt = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const flag = (k: string) => argv.includes(`--${k}`);
const APP = path.resolve(import.meta.dir, '..');
const UI = path.join(import.meta.dir, 'markup');

type Shape = { type: 'pin'; x: number; y: number } | { type: 'rect'; x: number; y: number; w: number; h: number } | { type: 'stroke'; paths: number[][][] };
interface Note {
  id: string; frame: number; t: number;
  range: { inFrame: number; outFrame: number; in: number; out: number } | null;
  shape: Shape | null; text: string; author: string; status: 'open' | 'resolved'; created: string;
  scene?: string | null; sceneT?: number; sceneFrame?: number; resolved?: string | null; resolution?: string;
  /** Live mode: the block (timeline entry id) the note is on, = scene; blockT/blockFrame = sceneT/sceneFrame. */
  block?: string | null; blockT?: number; blockFrame?: number;
  /** A change record: control values set in public/tune.json, with what they were before (and where that came from). */
  tune?: TuneChange;
  /** A proposal from the agent: named sets of control values for this block; the user previews and picks one. */
  variants?: { options: Record<string, Record<string, unknown>>; picked?: string; pickedIn?: string };
}
interface TuneChange { set: Record<string, unknown>; was: Record<string, unknown>; wasSource: Record<string, string>; file: string; reverted?: string }
interface Scene { id: string; start: number; end: number }
interface Doc {
  version: 1;
  source: { type: 'video'; file: string } | { type: 'live'; project: string; format: string; url?: string };
  fps: number; frames: number; duration: number; width: number; height: number;
  scenes: Scene[]; notes: Note[];
}

// ---------- files ----------
const docPathFor = (p: string) => (/\.json$/i.test(p) ? path.resolve(p) : path.resolve(p).replace(/\.[^.\\/]+$/, '') + '.markup.json');
const readDoc = (p: string): Doc => JSON.parse(readFileSync(p, 'utf8'));
/** Write via a temp file and rename, so a reader never sees half a file. */
function writeDoc(p: string, d: Doc) {
  const tmp = `${p}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(d, null, 2) + '\n');
  try { renameSync(tmp, p); } catch { writeFileSync(p, readFileSync(tmp)); rmSync(tmp, { force: true }); }
}

function probe(file: string) {
  const r = Bun.spawnSync(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,nb_frames:format=duration', '-of', 'json', file]);
  if (r.exitCode !== 0) throw new Error(`ffprobe failed on ${file}: ${r.stderr.toString()}`);
  const j = JSON.parse(r.stdout.toString());
  const s = j.streams?.[0];
  if (!s) throw new Error(`no video stream in ${file}`);
  const [a, b] = String(s.r_frame_rate).split('/').map(Number);
  const fps = b ? a! / b : a!, duration = +j.format.duration;
  return { width: +s.width, height: +s.height, fps, duration, frames: +s.nb_frames || Math.round(duration * fps) };
}

// ---------- scenes ----------
function partName(f: string) {
  const dir = path.dirname(f);
  return path.basename(dir) === 'out' ? path.basename(path.dirname(dir)) : path.basename(f).replace(/\.[^.]+$/, '');
}
function loadScenes(src: string): Scene[] {
  const text = readFileSync(src, 'utf8');
  if (/\.json$/i.test(src)) {
    const j = JSON.parse(text);
    if (j.parts) { const s0 = j.parts[0].from; return j.parts.map((p: any) => ({ id: String(p.name), start: p.from - s0, end: p.to - s0 })); }
    const list = Array.isArray(j) ? j : j.scenes ?? j.timeline;
    return list.map((s: any) => ({ id: String(s.id ?? s.name), start: +s.start, end: +s.end }));
  }
  // an ffmpeg concat list: the blocks follow the files' frame counts, on one frame grid
  const files = [...text.matchAll(/^\s*file\s+'(.+?)'\s*$/gm)].map((m) => path.resolve(path.dirname(src), m[1]!));
  let at = 0;
  return files.map((f) => {
    const p = probe(f), s = { id: partName(f), start: at / p.fps, end: (at + p.frames) / p.fps };
    at += p.frames;
    return s;
  });
}
/** The project folder a video was rendered from (<project>/out/<file>.mp4), if any. */
function projectOf(video: string) {
  const dir = path.dirname(path.resolve(video));
  const proj = path.dirname(dir);
  return path.basename(dir) === 'out' && existsSync(path.join(proj, 'src', 'timeline.ts')) ? proj : null;
}

// ---------- the project's engine (live mode, project timelines) ----------
async function reachable(url: string) {
  try { return (await fetch(url, { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; }
}
/** A private vite server for the project on loopback, without live reload (the page reloads on src/ changes). */
async function startVite(project: string) {
  const vite = path.join(project, 'node_modules', 'vite', 'bin', 'vite.js');
  if (!existsSync(vite)) throw new Error(`no vite in ${project}/node_modules: run bun install there, or pass --url`);
  const port = 5300 + Math.floor(Math.random() * 500);
  const proc = Bun.spawn([process.execPath, vite, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    cwd: project, stdout: 'ignore', stderr: 'inherit', env: { ...process.env, MG_NO_HMR: '1' },
  });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 200 && !(await reachable(url)); i++) await Bun.sleep(100);
  if (!(await reachable(url))) throw new Error('vite did not start');
  return { url, stop: () => proc.kill() };
}
const angleFlag = () => (process.platform === 'darwin' ? ['--use-angle=metal'] : process.platform === 'win32' ? ['--use-angle=d3d11'] : []);
const launch = (): Promise<Browser> => chromium.launch({ channel: 'chrome', headless: true, args: [...angleFlag(), '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] });

/** The project's timeline entries and fps, read from the engine (?export=1 exposes them as window.__mg). */
async function projectTimeline(project: string, format?: string) {
  const srv = await startVite(project);
  const browser = await launch();
  try {
    const page = await browser.newPage();
    await page.goto(`${srv.url}/?export=1${format ? `&format=${format}` : ''}`);
    await page.waitForFunction(() => (window as any).__mg?.ready || (window as any).__mg?.error, null, { timeout: 120000 });
    return await page.evaluate(() => { const m = (window as any).__mg; return { fps: m.fps as number, scenes: m.timeline as Scene[], error: m.error }; });
  } finally { await browser.close(); srv.stop(); }
}

// ---------- notes ----------
function sceneAt(d: Doc, frame: number) {
  const t = (frame + 0.5) / d.fps;
  return d.scenes.find((s) => t >= s.start && t < s.end) ?? null;
}
const n01 = (v: unknown) => Math.max(0, Math.min(1, +(v as number) || 0));
/** Validate a note from the page; the frame number is the truth, times follow from it. */
function cleanNote(d: Doc, id: string, raw: any): Note {
  const F = (v: unknown) => Math.max(0, Math.min(d.frames - 1, Math.round(+(v as number) || 0)));
  const frame = F(raw.frame);
  let shape: Shape | null = null;
  const s = raw.shape;
  if (s?.type === 'pin') shape = { type: 'pin', x: n01(s.x), y: n01(s.y) };
  else if (s?.type === 'rect') shape = { type: 'rect', x: n01(s.x), y: n01(s.y), w: n01(s.w), h: n01(s.h) };
  else if (s?.type === 'stroke' && Array.isArray(s.paths)) shape = { type: 'stroke', paths: s.paths.slice(0, 200).map((p: any) => (Array.isArray(p) ? p : []).slice(0, 5000).map((q: any) => [n01(q?.[0]), n01(q?.[1])])) };
  let range: Note['range'] = null;
  if (raw.range) { const a = F(raw.range.inFrame), b = F(raw.range.outFrame); range = { inFrame: Math.min(a, b), outFrame: Math.max(a, b), in: Math.min(a, b) / d.fps, out: Math.max(a, b) / d.fps }; }
  const sc = sceneAt(d, range?.inFrame ?? frame);
  const note: Note = {
    id, frame, t: frame / d.fps, range, shape,
    text: String(raw.text ?? '').slice(0, 20000), author: String(raw.author ?? 'reviewer').slice(0, 80),
    status: raw.status === 'resolved' ? 'resolved' : 'open', created: String(raw.created ?? new Date().toISOString()),
    scene: sc?.id ?? null,
  };
  if (sc) { note.sceneT = +((range?.in ?? note.t) - sc.start).toFixed(4); note.sceneFrame = (range?.inFrame ?? frame) - Math.round(sc.start * d.fps); }
  if (note.status === 'resolved') note.resolved = raw.resolved ?? new Date().toISOString();
  if (raw.resolution) note.resolution = String(raw.resolution).slice(0, 4000);
  if (sc) Object.assign(note, { block: sc.id, blockT: note.sceneT, blockFrame: note.sceneFrame });
  const tu = raw.tune;
  if (tu && typeof tu.set === 'object' && typeof tu.was === 'object') {
    note.tune = { set: tu.set, was: tu.was, wasSource: tu.wasSource ?? {}, file: String(tu.file ?? 'public/tune.json') };
    if (tu.reverted) note.tune.reverted = String(tu.reverted);
  }
  const va = raw.variants;
  if (va && typeof va.options === 'object' && Object.keys(va.options).length) {
    note.variants = { options: va.options };
    if (va.picked) Object.assign(note.variants, { picked: String(va.picked), pickedIn: String(va.pickedIn ?? '') });
  }
  return note;
}

// ---------- serve ----------
async function serve() {
  const live = flag('live');
  const port = +opt('port', '8790')!;
  let docPath: string, videoPath: string | null = null, target: { url: string; stop: () => void } | null = null;
  let codeVersion = 0, ownTuneWrite = 0;
  const project = path.resolve(opt('project', APP)!), tunePath = path.join(project, 'public', 'tune.json');
  if (live) {
    const fmt = opt('format');
    docPath = path.join(project, 'out', `live${fmt ? '-' + fmt : ''}.markup.json`);
    mkdirSync(path.dirname(docPath), { recursive: true });
    const given = opt('url');
    target = given && (await reachable(given)) ? { url: given.replace(/\/$/, ''), stop: () => {} } : await startVite(project);
    if (!existsSync(docPath)) writeDoc(docPath, { version: 1, source: { type: 'live', project: path.relative(path.dirname(docPath), project) || '.', format: fmt ?? '' }, fps: 30, frames: 1, duration: 0, width: 1, height: 1, scenes: [], notes: [] });
    // a given server (a built engine, a running dev server) is remembered: the export renders its stills there
    const d0 = readDoc(docPath);
    if (d0.source.type === 'live') { if (given && target.url === given.replace(/\/$/, '')) d0.source.url = target.url; else delete d0.source.url; writeDoc(docPath, d0); }
    // the page reloads the engine (keeping its frame) when the code changes
    let t: Timer | undefined;
    for (const dir of ['src', 'public']) {
      const p = path.join(project, dir);
      // tune.json written by this server is already live in the page; an edit from elsewhere reloads it like code
      if (existsSync(p)) watch(p, { recursive: true }, (_ev, f) => {
        if (String(f ?? '').endsWith('tune.json') && Date.now() - ownTuneWrite < 1500) return;
        clearTimeout(t); t = setTimeout(() => codeVersion++, 300);
      });
    }
  } else {
    const v = opt('video') ?? argv.find((a, i) => i > 0 && /\.(mp4|mov|webm|mkv)$/i.test(a) && !argv[i - 1]?.startsWith('--'));
    if (!v || !existsSync(v)) throw new Error('serve needs --video <file.mp4> (or --live)');
    videoPath = path.resolve(v);
    docPath = docPathFor(videoPath);
    const p = probe(videoPath);
    const fps = +opt('fps', String(p.fps))!;
    const old: Doc | null = existsSync(docPath) ? readDoc(docPath) : null;
    let scenes = old?.scenes ?? [];
    if (opt('scenes')) scenes = loadScenes(path.resolve(opt('scenes')!));
    else if (!scenes.length && projectOf(videoPath)) {
      const proj = projectOf(videoPath)!;
      const fmt = path.basename(videoPath).replace(/\.[^.]+$/, '');
      console.log(`reading the scene track from ${path.basename(proj)}'s timeline…`);
      try { scenes = (await projectTimeline(proj, ['vertical', 'portrait', 'square', 'landscape'].includes(fmt) ? fmt : undefined)).scenes; } catch (e) { console.error(`(no scene track: ${(e as Error).message.split('\n')[0]})`); }
    }
    const doc: Doc = { version: 1, notes: [], ...old, source: { type: 'video', file: path.basename(videoPath) }, fps, frames: p.frames, duration: p.duration, width: p.width, height: p.height, scenes };
    writeDoc(docPath, doc);
  }

  const mtime = (p: string | null) => (p && existsSync(p) ? statSync(p).mtimeMs : 0);
  const state = () => ({
    doc: readDoc(docPath), version: mtime(docPath), mediaVersion: mtime(videoPath), codeVersion,
    mode: live ? 'live' : 'video', name: live ? `${path.basename(path.resolve(opt('project', APP)!))} (live)` : path.basename(videoPath!),
    media: `/__markup/media?v=${Math.round(mtime(videoPath))}`, app: `/?export=1${opt('format') ? `&format=${opt('format')}` : ''}`,
    author: opt('author') ?? '',
  });
  const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
  const files: Record<string, string> = { '/__markup/': 'index.html', '/__markup/app.js': 'app.js', '/__markup/draw.js': 'draw.js', '/__markup/style.css': 'style.css' };
  const types: Record<string, string> = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8' };

  const server = Bun.serve({
    hostname: '127.0.0.1', port, idleTimeout: 120,
    async fetch(req) {
      // only our own loopback names (a page elsewhere can't reach the API through DNS rebinding)
      if (!/^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(req.headers.get('host') ?? '')) return new Response('forbidden host', { status: 403 });
      const u = new URL(req.url);
      // and only the page itself may change notes or tune.json: a site open in another tab could otherwise
      // POST here (browsers always send Origin on cross-site and same-origin writes, and can't forge it)
      if (u.pathname.startsWith('/__markup/api/') && req.method !== 'GET' && req.headers.get('origin') !== `http://${req.headers.get('host')}`)
        return new Response('forbidden origin', { status: 403 });
      if (u.pathname === '/' && !u.search) return Response.redirect('/__markup/', 302);
      if (u.pathname === '/__markup') return Response.redirect('/__markup/', 302);
      const f = files[u.pathname];
      if (f) return new Response(Bun.file(path.join(UI, f)), { headers: { 'content-type': types[f.split('.').pop()!]!, 'cache-control': 'no-store' } });
      if (u.pathname === '/__markup/api/doc') return json(state());
      if (u.pathname === '/__markup/api/meta' && req.method === 'PUT' && live) {
        // the live engine tells the server what it renders: fps, length, size, format and the timeline
        const m: any = await req.json(), d = readDoc(docPath);
        Object.assign(d, { fps: +m.fps, duration: +m.duration, frames: Math.round(+m.duration * +m.fps), width: +m.width, height: +m.height,
          scenes: (m.scenes ?? []).map((s: any) => ({ id: String(s.id), start: +s.start, end: +s.end })) });
        if (d.source.type === 'live') d.source.format = String(m.format ?? '');
        writeDoc(docPath, d);
        return json(state());
      }
      if (u.pathname === '/__markup/api/tune' && live) {
        if (req.method === 'GET') return json(readTune(tunePath));
        if (req.method === 'POST') {
          // Keep: write the changed controls to tune.json and record the change as a note
          const b: any = await req.json(), d = readDoc(docPath);
          if (!d.scenes.some((s) => s.id === b.block)) return new Response(`no block ${b.block}`, { status: 400 });
          ownTuneWrite = Date.now();
          applyTune(tunePath, String(b.block), b.set ?? {});
          const id = `n${1 + Math.max(0, ...d.notes.map((n) => +n.id.slice(1) || 0))}`;
          d.notes.push(cleanNote(d, id, {
            frame: b.frame, shape: b.shape ?? null, text: String(b.text ?? '').trim() || changeLine(b.set, b.was), author: b.author,
            status: 'open', created: new Date().toISOString(), tune: { set: b.set, was: b.was, wasSource: b.wasSource, file: path.relative(project, tunePath).split(path.sep).join('/') },
          }));
          // a pick from an agent's proposal closes the proposal and says which change carried it out
          const pr = b.pick && d.notes.find((n) => n.id === b.pick.note && n.variants);
          if (pr) Object.assign(pr, { status: 'resolved', resolved: new Date().toISOString(), resolution: `picked ${b.pick.option} (${id})`, variants: { ...pr.variants, picked: String(b.pick.option), pickedIn: id } });
          writeDoc(docPath, d);
          return json(state());
        }
      }
      const rv = /^\/__markup\/api\/revert\/(n\d{1,6})$/.exec(u.pathname);
      if (rv && req.method === 'POST' && live) {
        ownTuneWrite = Date.now();
        try { revertChange(docPath, tunePath, rv[1]!); } catch (e) { return new Response((e as Error).message, { status: 400 }); }
        return json(state());
      }
      const nm = /^\/__markup\/api\/notes\/(n\d{1,6})$/.exec(u.pathname);
      if (nm) {
        const d = readDoc(docPath), id = nm[1]!;
        if (req.method === 'PUT') {
          const note = cleanNote(d, id, await req.json());
          if (!note.text.trim()) return new Response('a note needs text', { status: 400 });
          const i = d.notes.findIndex((n) => n.id === id);
          if (i >= 0) d.notes[i] = note; else d.notes.push(note);
        } else if (req.method === 'DELETE') d.notes = d.notes.filter((n) => n.id !== id);
        else return new Response('method', { status: 405 });
        writeDoc(docPath, d);
        return json(state());
      }
      if (u.pathname === '/__markup/media' && videoPath) return serveRange(req, videoPath);
      if (target) return proxy(req, target.url);
      return new Response('not found', { status: 404 });
    },
  });
  console.log(`markup: http://127.0.0.1:${server.port}/   (loopback only; Ctrl+C stops it)`);
  console.log(`notes:  ${docPath}`);
  if (target) console.log(`engine: ${target.url} (proxied, so the page can drive it)`);
  const bye = () => { target?.stop(); process.exit(0); };
  process.on('SIGINT', bye); process.on('SIGTERM', bye);
}

// ---------- tune.json (block controls; see src/engine/controls.ts) ----------
const readTune = (p: string): Record<string, Record<string, unknown>> => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8') || '{}') : {});
/** Merge one block's overrides into tune.json; a null value removes an override (back to the code's value). */
function applyTune(p: string, block: string, set: Record<string, unknown>) {
  const t = readTune(p), cur = { ...(t[block] ?? {}) };
  for (const [k, v] of Object.entries(set)) if (v === null) delete cur[k]; else cur[k] = v;
  if (Object.keys(cur).length) t[block] = cur; else delete t[block];
  mkdirSync(path.dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(t, null, 2) + '\n');
  try { renameSync(tmp, p); } catch { writeFileSync(p, readFileSync(tmp)); rmSync(tmp, { force: true }); }
}
const fmtV = (v: unknown) => (typeof v === 'number' ? String(+v.toFixed(4)) : JSON.stringify(v));
const changeLine = (set: Record<string, unknown>, was: Record<string, unknown>) =>
  Object.keys(set).map((k) => `${k} ${fmtV(was?.[k])} → ${set[k] === null ? '(code)' : fmtV(set[k])}`).join(', ');
/** Undo a kept change: each control goes back to its earlier override, or to the code's value. */
function revertChange(docPath: string, tunePath: string, id: string) {
  const d = readDoc(docPath), n = d.notes.find((m) => m.id === id);
  if (!n?.tune) throw new Error(`${id} is not a change record`);
  if (n.tune.reverted) throw new Error(`${id} was already reverted`);
  const back: Record<string, unknown> = {};
  for (const k of Object.keys(n.tune.set)) back[k] = n.tune.wasSource[k] === 'tune' ? n.tune.was[k] : null;
  applyTune(tunePath, n.block ?? n.scene ?? '', back);
  n.tune.reverted = new Date().toISOString();
  n.status = 'resolved'; n.resolved = n.tune.reverted;
  n.resolution = n.resolution ? `${n.resolution}; reverted` : 'reverted';
  writeDoc(docPath, d);
  return n;
}

/** A file with HTTP Range support (the video element seeks with byte ranges). */
function serveRange(req: Request, file: string) {
  const f = Bun.file(file), size = f.size;
  const h = { 'accept-ranges': 'bytes', 'content-type': 'video/mp4', 'cache-control': 'no-store' };
  const m = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') ?? '');
  if (!m || (!m[1] && !m[2])) return new Response(f, { headers: { ...h, 'content-length': String(size) } });
  let start = m[1] ? +m[1] : Math.max(0, size - +m[2]!), end = m[1] && m[2] ? Math.min(+m[2], size - 1) : size - 1;
  if (start > end || start >= size) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
  return new Response(f.slice(start, end + 1), { status: 206, headers: { ...h, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': String(end - start + 1) } });
}

/** Same-origin proxy to the project's dev server, so the page can call the engine's window.__mg directly. */
async function proxy(req: Request, target: string) {
  const u = new URL(req.url);
  const headers = new Headers(req.headers);
  headers.delete('host'); headers.delete('accept-encoding');
  const r = await fetch(target + u.pathname + u.search, { method: req.method, headers, body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body, redirect: 'manual' });
  const out = new Headers(r.headers);
  out.delete('content-encoding'); out.delete('content-length');
  return new Response(r.body, { status: r.status, headers: out });
}

// ---------- export ----------
const fmtT = (t: number) => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(3).padStart(6, '0')}`; };
const KIND = { rect: 'box', stroke: 'drawing', pin: 'pin' } as const;
const kindOf = (n: Note) => (n.tune ? 'change' : n.variants ? 'proposal' : n.shape ? KIND[n.shape.type] : n.range ? 'range' : 'frame');

/** The frames a note's still shows: its frame, or four across its range; with --context, its neighbours. */
function framesFor(d: Doc, n: Note, context: number): { frame: number; tag: string }[] {
  if (n.range) {
    const a = n.range.inFrame, b = n.range.outFrame;
    const fs = [...new Set([a, Math.round(a + (b - a) / 3), Math.round(a + (2 * (b - a)) / 3), b])];
    return fs.map((f, i) => ({ frame: f, tag: i === 0 ? 'in' : i === fs.length - 1 ? 'out' : '' }));
  }
  if (!context) return [{ frame: n.frame, tag: '' }];
  const c = Math.round(context * d.fps);
  return [{ frame: Math.max(0, n.frame - c), tag: `-${context}s` }, { frame: n.frame, tag: '▶' }, { frame: Math.min(d.frames - 1, n.frame + c), tag: `+${context}s` }];
}

async function extractVideoFrames(video: string, fps: number, frames: number[], dir: string) {
  // seek a quarter frame early: ffmpeg's accurate seek keeps the first frame at or after -ss, which is frame k
  const one = async (k: number) => {
    const out = path.join(dir, `f${String(k).padStart(6, '0')}.png`);
    const p = Bun.spawn(['ffmpeg', '-y', '-v', 'error', '-ss', Math.max(0, (k - 0.25) / fps).toFixed(6), '-i', video, '-frames:v', '1', '-update', '1', out], { stderr: 'pipe' });
    if ((await p.exited) !== 0 || !existsSync(out)) throw new Error(`ffmpeg could not grab frame ${k}: ${await new Response(p.stderr).text()}`);
    return [k, out] as const;
  };
  const got = new Map<number, string>();
  for (let i = 0; i < frames.length; i += 4) for (const [k, f] of await Promise.all(frames.slice(i, i + 4).map(one))) got.set(k, f);
  return got;
}

async function extractLiveFrames(d: Doc, project: string, frames: number[], dir: string) {
  // the project's own renderer, one browser for all of them; it names stills f_<t to 2 decimals>.png
  const times = frames.map((k) => k / d.fps);
  const fmt = d.source.type === 'live' ? d.source.format : '', url = d.source.type === 'live' ? d.source.url : undefined;
  const args = [process.execPath, path.join(project, 'scripts', 'render.ts'), 'stills', '--t', times.map((t) => t.toFixed(6)).join(','), '--out', dir,
    ...(fmt ? ['--format', fmt] : []), ...(url ? ['--url', url] : [])];
  const p = Bun.spawn(args, { cwd: project, stdout: 'pipe', stderr: 'inherit' });
  if ((await p.exited) !== 0) throw new Error('render.ts stills failed');
  return new Map(frames.map((k) => [k, path.join(dir, `f_${(Math.round(k) / d.fps).toFixed(2).padStart(6, '0')}.png`)]));
}

async function exportNotes() {
  const src = argv[1];
  if (!src) throw new Error('export needs <video.mp4 | notes.markup.json>');
  const docPath = docPathFor(src);
  if (!existsSync(docPath)) throw new Error(`no notes at ${docPath}`);
  const d = readDoc(docPath), root = path.dirname(docPath);
  const notes = d.notes.filter((n) => flag('all') || n.status !== 'resolved').sort((a, b) => (a.range?.inFrame ?? a.frame) - (b.range?.inFrame ?? b.frame));
  const stem = path.basename(docPath).replace(/\.markup\.json$/i, '');
  const outDir = path.resolve(opt('out', path.join(root, `${stem}-markup`))!);
  mkdirSync(outDir, { recursive: true });
  for (const f of readdirSync(outDir)) if (/^n\d+-f\d+\.png$/.test(f)) rmSync(path.join(outDir, f));
  const context = +opt('context', '0')!;
  const plan = notes.map((n) => ({ n, frames: framesFor(d, n, context) }));
  const need = [...new Set(plan.flatMap((p) => p.frames.map((f) => f.frame)))].sort((a, b) => a - b);
  const tmp = path.join(outDir, '.frames');
  rmSync(tmp, { recursive: true, force: true }); mkdirSync(tmp, { recursive: true });
  const got = d.source.type === 'video'
    ? await extractVideoFrames(path.join(root, d.source.file), d.fps, need, tmp)
    : await extractLiveFrames(d, path.resolve(root, d.source.project), need, tmp);

  const browser = await launch();
  const stills: Record<string, string> = {};
  try {
    const page = await browser.newPage();
    await page.setContent('<!doctype html><body></body>');
    await page.addScriptTag({ content: readFileSync(path.join(UI, 'draw.js'), 'utf8') });
    for (const { n, frames } of plan) {
      const sc = (k: number) => { const s = sceneAt(d, k); return s ? `${s.id} +${(k / d.fps - s.start).toFixed(2)}s` : ''; };
      const tiles = frames.map((f) => ({ b64: readFileSync(got.get(f.frame)!).toString('base64'), label: `${f.tag ? f.tag + '  ' : ''}${fmtT(f.frame / d.fps)}  f${f.frame}  ${sc(f.frame)}`, main: !context || f.tag === '▶' || !!n.range }));
      const where = n.range ? `${fmtT(n.range.in)}–${fmtT(n.range.out)}  f${n.range.inFrame}–${n.range.outFrame}` : `${fmtT(n.t)}  f${n.frame}`;
      const head = `${n.id}  ${kindOf(n)}  ${where}${n.scene ? '  ' + n.scene : ''}${n.status === 'resolved' ? '  (resolved)' : ''}`;
      const b64: string = await page.evaluate(compose, { tiles, shape: n.shape, label: n.id.slice(1), head, text: n.text, resolved: n.status === 'resolved' });
      const file = `${n.id}-f${String(n.range?.inFrame ?? n.frame).padStart(6, '0')}.png`;
      writeFileSync(path.join(outDir, file), Buffer.from(b64, 'base64'));
      stills[n.id] = file;
    }
  } finally { await browser.close(); }
  rmSync(tmp, { recursive: true, force: true });

  const md = markdown(d, docPath, notes, stills);
  const mdPath = path.join(outDir, 'MARKUP.md');
  writeFileSync(mdPath, md);
  console.log(mdPath);
  for (const n of notes) console.log(`  ${n.id}  ${path.join(outDir, stills[n.id]!)}`);
  if (!notes.length) console.log('  (no open notes)');
}

/** Runs in the page: tiles the frames side by side with the shape burned in, under a header with the note. */
async function compose(o: { tiles: { b64: string; label: string; main: boolean }[]; shape: any; label: string; head: string; text: string; resolved: boolean }) {
  const D = (globalThis as any).MarkupDraw;
  const imgs = await Promise.all(o.tiles.map((t) => new Promise<HTMLImageElement>((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = 'data:image/png;base64,' + t.b64; })));
  const W0 = imgs[0]!.width, H0 = imgs[0]!.height, n = imgs.length;
  // one frame up to 1600 px on its long side; several in a grid that stays under ~1600 px wide
  // (landscape: 2 per row, so four range frames make a 2×2; portrait: up to 4 in a row)
  const cols = n === 1 ? 1 : W0 >= H0 ? Math.min(n, n === 3 ? 3 : 2) : Math.min(n, 4);
  const rows = Math.ceil(n / cols);
  const k = n === 1 ? Math.min(1, 1600 / Math.max(W0, H0)) : Math.min(1, (W0 >= H0 ? (cols === 3 ? 540 : 780) : 400) / W0);
  const tw = Math.round(W0 * k), th = Math.round(H0 * k), pad = 10, lab = 26;
  const width = Math.max(cols * tw + (cols + 1) * pad, 640);
  const cv = document.createElement('canvas'), c = cv.getContext('2d')!;
  // header: the note's id, kind, time and scene, then its text wrapped
  c.font = '17px ui-sans-serif, system-ui, sans-serif';
  const words = o.text.replace(/\s+/g, ' ').split(' '), lines: string[] = [];
  let line = '';
  for (const w of words) { const t2 = line ? line + ' ' + w : w; if (c.measureText(t2).width > width - pad * 2 - 10 && line) { lines.push(line); line = w; } else line = t2; }
  if (line) lines.push(line);
  const headH = 18 + 30 + lines.length * 23 + 10;
  cv.width = width; cv.height = headH + rows * (th + lab + pad) + pad;
  c.fillStyle = '#161616'; c.fillRect(0, 0, cv.width, cv.height);
  const color = o.resolved ? D.COLOR.resolved : D.COLOR.open;
  c.fillStyle = color; c.fillRect(0, 0, 6, headH);
  c.font = '600 16px ui-monospace, monospace'; c.fillStyle = color; c.textBaseline = 'top';
  c.fillText(o.head, pad + 8, 16);
  c.font = '17px ui-sans-serif, system-ui, sans-serif'; c.fillStyle = '#eee';
  lines.forEach((l, i) => c.fillText(l, pad + 8, 46 + i * 23));
  imgs.forEach((im, i) => {
    const x = pad + (i % cols) * (tw + pad), y = headH + pad + Math.floor(i / cols) * (th + lab + pad);
    const t = document.createElement('canvas'); t.width = tw; t.height = th;
    const tc = t.getContext('2d')!;
    tc.drawImage(im, 0, 0, tw, th);
    D.drawShape(tc, o.shape, tw, th, { label: o.label, color, dashed: !o.tiles[i]!.main, alpha: o.tiles[i]!.main ? 1 : 0.6 });
    c.drawImage(t, x, y);
    c.font = '13px ui-monospace, monospace'; c.fillStyle = '#bbb'; c.textBaseline = 'middle';
    c.fillText(o.tiles[i]!.label, x + 2, y + th + lab / 2 + 2);
  });
  return cv.toDataURL('image/png').split(',')[1]!;
}

function markdown(d: Doc, docPath: string, notes: Note[], stills: Record<string, string>) {
  const open = d.notes.filter((n) => n.status !== 'resolved').length;
  const srcName = d.source.type === 'video' ? d.source.file : `live engine${d.source.format ? ` (${d.source.format})` : ''}`;
  const sc = (k: number) => sceneAt(d, k);
  const sceneCell = (n: Note) => { const s = sc(n.range?.inFrame ?? n.frame); return s ? `${s.id} +${((n.range?.in ?? n.t) - s.start).toFixed(3)} s` : ''; };
  const one = (s: string) => s.replace(/\s+/g, ' ').replace(/\|/g, '\\|');
  const L: string[] = [];
  L.push(`# Markup: ${srcName}`, '');
  L.push(`${open} open, ${d.notes.length - open} resolved. ${d.width}×${d.height}, ${+d.fps.toFixed(3)} fps, ${d.frames} frames (${fmtT(d.duration)}). Exported ${new Date().toISOString().slice(0, 16).replace('T', ' ')}.`, '');
  L.push(`Notes file: \`${docPath}\`. Times are frame starts (frame k = k / fps s); regions are fractions of the frame from its top-left. Each still has the reviewer's drawing burned in.`, '');
  if (!notes.length) { L.push('No open notes.'); return L.join('\n') + '\n'; }
  L.push('| note | time | frame | scene | kind | says |', '|---|---|---|---|---|---|');
  for (const n of notes) {
    const time = n.range ? `${fmtT(n.range.in)}–${fmtT(n.range.out)}` : fmtT(n.t);
    const fr = n.range ? `${n.range.inFrame}–${n.range.outFrame}` : String(n.frame);
    const said = one(n.text);
    L.push(`| ${n.id} | ${time} | ${fr} | ${sceneCell(n)} | ${kindOf(n)} | ${said.length > 90 ? said.slice(0, 87) + '…' : said} |`);
  }
  for (const n of notes) {
    L.push('', `## ${n.id} · ${n.range ? `${fmtT(n.range.in)}–${fmtT(n.range.out)}` : fmtT(n.t)} · ${kindOf(n)}${n.status === 'resolved' ? ' · resolved' : ''}`, '');
    L.push(...n.text.split('\n').map((l) => `> ${l}`), '');
    L.push(`- **When:** ${n.range ? `frames ${n.range.inFrame}–${n.range.outFrame} (${fmtT(n.range.in)} to ${fmtT(n.range.out)}, ${((n.range.outFrame - n.range.inFrame + 1) / d.fps).toFixed(2)} s)` : `frame ${n.frame} (${fmtT(n.t)}, t = ${n.t.toFixed(4)} s)`}`);
    const s = sc(n.range?.inFrame ?? n.frame);
    if (s) {
      const f0 = Math.round(s.start * d.fps), k = (n.range?.inFrame ?? n.frame) - f0;
      let line = `- **Scene:** ${s.id} (${fmtT(s.start)}–${fmtT(s.end)}), ${((n.range?.in ?? n.t) - s.start).toFixed(3)} s in = its frame ${k} of ${Math.round(s.end * d.fps) - f0}`;
      if (n.range) { const e = sc(n.range.outFrame); if (e && e !== s) line += `; the range ends in ${e.id}, ${(n.range.out - e.start).toFixed(3)} s in`; }
      L.push(line);
    }
    const sh = n.shape;
    if (sh?.type === 'rect') L.push(`- **Region:** box x ${(sh.x * 100).toFixed(1)}–${((sh.x + sh.w) * 100).toFixed(1)} %, y ${(sh.y * 100).toFixed(1)}–${((sh.y + sh.h) * 100).toFixed(1)} % (${Math.round(sh.x * d.width)},${Math.round(sh.y * d.height)} to ${Math.round((sh.x + sh.w) * d.width)},${Math.round((sh.y + sh.h) * d.height)} px of ${d.width}×${d.height})`);
    else if (sh?.type === 'pin') L.push(`- **Point:** x ${(sh.x * 100).toFixed(1)} %, y ${(sh.y * 100).toFixed(1)} % (${Math.round(sh.x * d.width)},${Math.round(sh.y * d.height)} px of ${d.width}×${d.height})`);
    else if (sh?.type === 'stroke') {
      const pts = sh.paths.flat(), x0 = Math.min(...pts.map((p) => p[0]!)), x1 = Math.max(...pts.map((p) => p[0]!)), y0 = Math.min(...pts.map((p) => p[1]!)), y1 = Math.max(...pts.map((p) => p[1]!));
      L.push(`- **Drawing:** ${sh.paths.length} stroke${sh.paths.length > 1 ? 's' : ''} over x ${(x0 * 100).toFixed(1)}–${(x1 * 100).toFixed(1)} %, y ${(y0 * 100).toFixed(1)}–${(y1 * 100).toFixed(1)} % (look at the still for what it marks)`);
    } else L.push(`- **Region:** the whole frame${n.range ? ' across the range' : ''}`);
    L.push(`- **From:** ${n.author}, ${n.created.slice(0, 16).replace('T', ' ')}`);
    if (n.tune) L.push(`- **Change:** in ${n.tune.file}, block ${n.block ?? n.scene}: ${changeLine(n.tune.set, n.tune.was)} (was from ${[...new Set(Object.values(n.tune.wasSource))].join('/') || 'unknown'})${n.tune.reverted ? '; reverted' : ''}. Keep it as data, fold it into the code (the scene's default or the timeline params, then drop the override), or say why not.`);
    if (n.variants) L.push(`- **Options:** ${Object.entries(n.variants.options).map(([k, v]) => `${k} ${JSON.stringify(v)}`).join('; ')}${n.variants.picked ? `. Picked **${n.variants.picked}** (kept as ${n.variants.pickedIn})` : '. Not picked yet'}`);
    if (n.resolution) L.push(`- **Resolution:** ${n.resolution}`);
    L.push(`- **Still:** [${stills[n.id]}](${stills[n.id]})${n.range ? ' (in, two between, out)' : ''}`);
  }
  L.push('', '---', '', `After a fix, re-render, then mark the note: \`bun scripts/markup.ts resolve ${path.basename(docPath)} <ids> --note "what changed"\` (run next to the notes file, or pass its path). The page shows it as resolved.`);
  return L.join('\n') + '\n';
}

// ---------- resolve ----------
function resolve() {
  const src = argv[1], ids = (argv[2] ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!src || !ids.length) throw new Error('resolve needs <video.mp4 | notes.markup.json> n1,n2 [--note "..."] [--reopen]');
  const docPath = docPathFor(src), d = readDoc(docPath), reopen = flag('reopen');
  for (const id of ids) {
    const n = d.notes.find((m) => m.id === id);
    if (!n) { console.error(`no note ${id}`); continue; }
    n.status = reopen ? 'open' : 'resolved';
    n.resolved = reopen ? null : new Date().toISOString();
    if (opt('note')) n.resolution = opt('note');
    console.log(`${id} ${n.status}${n.resolution ? `: ${n.resolution}` : ''}`);
  }
  writeDoc(docPath, d);
}

if (mode === 'serve') await serve();
else if (mode === 'export') await exportNotes();
else if (mode === 'resolve') resolve();
else if (mode === 'propose') {
  // propose <notes.markup.json> <block> --frame N --options '{"A": {...}, "B": {...}}' [--note "question"]
  const docPath = docPathFor(argv[1] ?? ''), d = readDoc(docPath), block = argv[2] ?? '';
  if (d.source.type !== 'live') throw new Error('propose works on live notes (out/live*.markup.json): the page previews options on the engine');
  const sc = d.scenes.find((s) => s.id === block);
  if (!sc) throw new Error(`no block "${block}" (blocks: ${d.scenes.map((s) => s.id).join(', ')})`);
  const options = JSON.parse(opt('options') ?? '{}');
  if (!Object.keys(options).length) throw new Error('--options needs at least one named set, e.g. {"A": {"glow": 0.8}, "B": {"glow": 0.5}}');
  const frame = opt('frame') ? +opt('frame')! : Math.round(((sc.start + sc.end) / 2) * d.fps);
  if (sceneAt(d, frame)?.id !== block) throw new Error(`frame ${frame} is not in ${block} (frames ${Math.round(sc.start * d.fps)}-${Math.round(sc.end * d.fps) - 1})`);
  const id = `n${1 + Math.max(0, ...d.notes.map((n) => +n.id.slice(1) || 0))}`;
  d.notes.push(cleanNote(d, id, { frame, text: opt('note') ?? `Which reads better in ${block}?`, author: opt('author', 'agent'), variants: { options } }));
  writeDoc(docPath, d);
  console.log(`${id}: ${Object.entries(options).map(([k, v]) => `${k} ${JSON.stringify(v)}`).join('  ')} at frame ${frame} of ${block}`);
}
else if (mode === 'revert') {
  // revert <notes.markup.json> n7: undo a kept control change in tune.json (live notes)
  const docPath = docPathFor(argv[1] ?? ''), d = readDoc(docPath);
  if (d.source.type !== 'live') throw new Error('revert works on live notes (out/live*.markup.json)');
  const n = revertChange(docPath, path.join(path.resolve(path.dirname(docPath), d.source.project), 'public', 'tune.json'), argv[2] ?? '');
  console.log(`${n.id} reverted: ${changeLine(n.tune!.set, n.tune!.was)}`);
}
else throw new Error(`unknown mode ${mode} (serve, export, resolve, revert, propose)`);
