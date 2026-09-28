#!/usr/bin/env bun
// Turns a video file (generated or shot) into a frame sequence the engine plays deterministically:
// public/clips/<name>/f_0001.(png|jpg) ... + clip.json. Optional green/blue screen key.
//
//   bun scripts/prep_clip.ts <video> --name <name> [--key auto|green|blue|none]
//        [--lo 0.25] [--hi 0.6] [--choke 1] [--soften 1] [--despill 1]
//        [--from 0.5 --to 4] [--width 900] [--fps 30 (resample with motion interpolation)]
//
// The keyer is a colour-difference matte (the classic green/blue screen method): for green,
// d = G - max(R, B), normalised by d of the screen colour sampled from the first frame's border.
// d <= lo is opaque, d >= hi is transparent, soft in between. Neutral colours (white, grey,
// black, skin) never have green excess, so they stay solid even on a dull generated "screen";
// shadows on the screen come out as soft partial alpha (raise --lo to drop them, lower --hi to
// keep more of them). Then the matte is choked (eroded) and softened by a pixel, and green is
// clamped to max(R, B) where it spills onto the subject.
//
// Writes out/qa-<name>.png: 5 frames over magenta (top) and a checkerboard (bottom). LOOK AT IT:
// holes in the subject, leftover screen, green fringes and floor shadows all show there.
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const input = argv[0];
const opt = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
if (!input || !existsSync(input)) throw new Error('usage: bun scripts/prep_clip.ts <video> --name <name> [--key auto]');
const APP = path.resolve(import.meta.dir, '..');
const name = opt('name', path.parse(input).name)!;
const outDir = path.join(APP, 'public', 'clips', name);
const keyMode = opt('key', 'none')!;
const LO = +opt('lo', '0.25')!, HI = +opt('hi', '0.6')!;
const CHOKE = +opt('choke', '1')!, SOFTEN = +opt('soften', '1')!, DESPILL = +opt('despill', '1')!;

async function capture(args: string[]) {
  const p = Bun.spawn(args, { stdout: 'pipe', stderr: 'pipe' });
  const [code, out, err] = await Promise.all([p.exited, new Response(p.stdout).arrayBuffer(), new Response(p.stderr).text()]);
  if (code !== 0) throw new Error(`${args[0]} failed:\n${err}`);
  return new Uint8Array(out);
}

// ---- probe + decode filters ----
const probe = JSON.parse(new TextDecoder().decode(await capture(['ffprobe', '-v', 'error', '-select_streams', 'v:0',
  '-show_entries', 'stream=width,height,r_frame_rate', '-of', 'json', input])));
const st = probe.streams[0];
const [fn, fd] = String(st.r_frame_rate).split('/').map(Number);
const fps = +(opt('fps') ?? fn! / (fd || 1));
const vf: string[] = [];
if (opt('fps')) vf.push(`minterpolate=fps=${fps}:mi_mode=mci:mc_mode=aobmc:vsbmc=1`);
let W = st.width as number, H = st.height as number;
if (opt('width')) { W = +opt('width')!; H = Math.round((st.height * W) / st.width / 2) * 2; vf.push(`scale=${W}:${H}:flags=lanczos`); }
const decodeArgs = ['ffmpeg', '-v', 'error'];
if (opt('from')) decodeArgs.push('-ss', opt('from')!);
if (opt('to')) decodeArgs.push('-to', opt('to')!);
decodeArgs.push('-i', input, '-an');
if (vf.length) decodeArgs.push('-vf', vf.join(','));
decodeArgs.push('-f', 'rawvideo', '-pix_fmt', 'rgb24', '-');

if (existsSync(outDir)) rmSync(outDir, { recursive: true });
mkdirSync(outDir, { recursive: true });
const keyed = keyMode !== 'none';
const ext = keyed ? 'png' : 'jpg';
const enc = Bun.spawn(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', keyed ? 'rgba' : 'rgb24', '-s', `${W}x${H}`, '-r', String(fps),
  '-i', '-', ...(keyed ? [] : ['-q:v', '2']), '-start_number', '1', path.join(outDir, `f_%04d.${ext}`)], { stdin: 'pipe', stderr: 'inherit' });

// ---- keyer ----
const N = W * H;
let chan: 'green' | 'blue' = keyMode === 'blue' ? 'blue' : 'green';
let screenD = 0;
const alpha = new Float32Array(N), tmp = new Float32Array(N);
/** Union bounding box of the keyed subject (alpha >= 0.5) over the whole clip. */
const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };

/** Median screen colour on the outer 5% border of the first frame. */
function sampleScreen(f: Uint8Array) {
  const b = Math.max(2, Math.round(Math.min(W, H) * 0.05)), rs: number[] = [], gs: number[] = [], bs: number[] = [];
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) {
    if (x >= b && x < W - b && y >= b && y < H - b) continue;
    const i = (y * W + x) * 3;
    rs.push(f[i]!); gs.push(f[i + 1]!); bs.push(f[i + 2]!);
  }
  const med = (a: number[]) => a.sort((p, q) => p - q)[a.length >> 1]!;
  const [r, g, bl] = [med(rs), med(gs), med(bs)];
  if (keyMode === 'auto') chan = bl > g ? 'blue' : 'green';
  screenD = chan === 'green' ? g - Math.max(r, bl) : bl - Math.max(r, g);
  console.log(`screen colour rgb(${r},${g},${bl}), keying ${chan}, screen excess ${screenD}`);
  if (screenD < 20) console.warn('warning: the border barely differs from neutral; is this really a green/blue screen plate?');
}

/** Separable 3x3 min (choke) or box blur (soften) on the alpha plane, `n` passes. */
function filterAlpha(kind: 'min' | 'blur', n: number) {
  for (let pass = 0; pass < n; pass++) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, l = alpha[x > 0 ? i - 1 : i]!, c = alpha[i]!, r = alpha[x < W - 1 ? i + 1 : i]!;
      tmp[i] = kind === 'min' ? Math.min(l, c, r) : (l + c + r) / 3;
    }
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, u = tmp[y > 0 ? i - W : i]!, c = tmp[i]!, d = tmp[y < H - 1 ? i + W : i]!;
      alpha[i] = kind === 'min' ? Math.min(u, c, d) : (u + c + d) / 3;
    }
  }
}

function key(f: Uint8Array): Uint8Array {
  const g1 = chan === 'green' ? 1 : 2, o1 = chan === 'green' ? 0 : 0, o2 = chan === 'green' ? 2 : 1;
  for (let p = 0; p < N; p++) {
    const i = p * 3, s = f[i + g1]!, m = Math.max(f[i + o1]!, f[i + o2]!);
    const d = (s - m) / screenD;
    alpha[p] = d <= LO ? 1 : d >= HI ? 0 : 1 - (d - LO) / (HI - LO);
  }
  if (CHOKE) filterAlpha('min', CHOKE);
  if (SOFTEN) filterAlpha('blur', SOFTEN);
  const out = new Uint8Array(N * 4);
  for (let p = 0; p < N; p++) {
    const i = p * 3, o = p * 4;
    let r = f[i]!, g = f[i + 1]!, b = f[i + 2]!;
    if (DESPILL) {
      if (chan === 'green') { const m = Math.max(r, b); if (g > m) g = Math.round(g - (g - m) * DESPILL); }
      else { const m = Math.max(r, g); if (b > m) b = Math.round(b - (b - m) * DESPILL); }
    }
    out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = Math.round(alpha[p]! * 255);
    if (alpha[p]! >= 0.5) {
      const x = p % W, y = (p / W) | 0;
      if (x < box.x0) box.x0 = x; if (x > box.x1) box.x1 = x; if (y < box.y0) box.y0 = y; if (y > box.y1) box.y1 = y;
    }
  }
  return out;
}

// ---- stream frames through ----
const frameBytes = N * 3;
const qaPick: Uint8Array[] = [];
const all: Uint8Array[] = [];
const dec = Bun.spawn(decodeArgs, { stdout: 'pipe', stderr: 'inherit' });
let buf = new Uint8Array(0), count = 0;
for await (const chunk of dec.stdout as unknown as AsyncIterable<Uint8Array>) {
  const merged = new Uint8Array(buf.length + chunk.length);
  merged.set(buf); merged.set(chunk, buf.length);
  buf = merged;
  while (buf.length >= frameBytes) {
    const frame = buf.slice(0, frameBytes);
    buf = buf.slice(frameBytes);
    if (count === 0 && keyed) sampleScreen(frame);
    const outFrame = keyed ? key(frame) : frame;
    enc.stdin.write(outFrame);
    if (keyed) all.push(outFrame);
    count++;
  }
}
await dec.exited;
enc.stdin.end();
await enc.exited;

const bbox = keyed && box.x1 >= box.x0 ? { x: box.x0, y: box.y0, w: box.x1 - box.x0 + 1, h: box.y1 - box.y0 + 1 } : { x: 0, y: 0, w: W, h: H };
if (keyed) {
  console.log(`subject bbox over the clip: ${bbox.w}x${bbox.h} at ${bbox.x},${bbox.y}`);
  if (bbox.x <= 1 || bbox.y <= 1 || bbox.x + bbox.w >= W - 1 || bbox.y + bbox.h >= H - 1)
    console.warn('warning: the subject touches the frame edge at some point: it will look cut off when composited (or the screen was not fully keyed)');
}
const manifest = { name, fps, count, width: W, height: H, ext, alpha: keyed, bbox, key: keyed ? { chan, lo: LO, hi: HI, choke: CHOKE, soften: SOFTEN, despill: DESPILL } : null, source: path.basename(input), duration: count / fps };
await Bun.write(path.join(outDir, 'clip.json'), JSON.stringify(manifest, null, 2));
console.log(`${outDir}: ${count} frames @ ${fps} fps (${manifest.duration.toFixed(2)} s), ${W}x${H} ${ext}`);

// ---- QA sheet: 5 frames over magenta (top row) and a checkerboard (bottom row) ----
if (keyed && all.length) {
  for (const p of [0, 0.25, 0.5, 0.75, 1]) qaPick.push(all[Math.round(p * (all.length - 1))]!);
  const s = Math.max(1, Math.ceil(W / 300)), tw = Math.floor(W / s), th = Math.floor(H / s);
  const QW = tw * qaPick.length, QH = th * 2, qa = new Uint8Array(QW * QH * 3);
  qaPick.forEach((fr, k) => {
    for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) {
      const si = ((y * s) * W + x * s) * 4, a = fr[si + 3]! / 255;
      for (let row = 0; row < 2; row++) {
        const bg = row === 0 ? [255, 0, 255] : (((x >> 3) + (y >> 3)) & 1 ? [200, 200, 200] : [110, 110, 110]);
        const di = ((y + row * th) * QW + k * tw + x) * 3;
        for (let c = 0; c < 3; c++) qa[di + c] = Math.round(fr[si + c]! * a + bg[c]! * (1 - a));
      }
    }
  });
  const qaPath = path.join(APP, 'out', `qa-${name}.png`);
  mkdirSync(path.dirname(qaPath), { recursive: true });
  const q = Bun.spawn(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${QW}x${QH}`, '-i', '-', '-frames:v', '1', qaPath], { stdin: 'pipe' });
  q.stdin.write(qa); q.stdin.end(); await q.exited;
  console.log(`QA sheet: ${qaPath}`);
}
