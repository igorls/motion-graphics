#!/usr/bin/env bun
// Offline renderer: drives the app in headless Chrome (?export=1) and writes what you ask for.
//
//   stills  --t 1.5,4,9.2                 PNGs of single frames            (out/stills/<format>/)
//   sheet   [--from 0 --to 14] [--n 16] [--cols 4] [--cuts]   contact sheet (out/sheet-<format>.png)
//   video   [--from 0 --to <dur>] [--samples auto|N] [--shutter 0.5] [--crf 18] [--out out/<format>.mp4]
//           --samples auto (default): 12 sub-frames on still frames, up to --max-samples (108) on fast
//           motion, until the frame changes by less than --tol (3) levels; N = fixed (4 = quick draft)
//   poster  --t 12.8 [--video out/<format>.mp4]   render the poster frame and bake it in as frame 0
//
// Common: --format vertical|portrait|square|landscape (default: project.format)  --scale 2
//         --only id1,id2 (load only those timeline entries)  --url http://localhost:5173  --headed
//
// Look at every still and sheet you render (open the PNG): that is how the work gets checked.
import { chromium, type Page } from 'playwright-core';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const mode = argv[0] ?? 'stills';
const opt = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const flag = (k: string) => argv.includes(`--${k}`);
const APP = path.resolve(import.meta.dir, '..');
const OUT = path.join(APP, 'out');
const sampling = (d: string) => opt('samples', d) === 'auto'
  ? { min: +opt('min-samples', '4')!, max: +opt('max-samples', '108')!, tol: +opt('tol', '3')! }
  : +opt('samples', d)!;
const hist = (h: Record<string, number>) => Object.entries(h).sort((a, b) => +a[0] - +b[0]).map(([k, v]) => `${k}:${v}`).join(' ');

async function reachable(url: string) {
  try { return (await fetch(url, { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; }
}

/** Use a running dev server if given, else start a private one without live reload. */
async function ensureServer() {
  const given = opt('url');
  if (given && (await reachable(given))) return { url: given, stop: () => {} };
  const port = 5300 + Math.floor(Math.random() * 500);
  const vite = path.join(APP, 'node_modules', 'vite', 'bin', 'vite.js');
  const proc = Bun.spawn([process.execPath, vite, '--port', String(port), '--strictPort'], {
    cwd: APP, stdout: 'ignore', stderr: 'inherit', env: { ...process.env, MG_NO_HMR: '1' },
  });
  const url = `http://localhost:${port}`;
  for (let i = 0; i < 200 && !(await reachable(url)); i++) await Bun.sleep(100);
  if (!(await reachable(url))) throw new Error('vite did not start');
  return { url, stop: () => proc.kill() };
}

function angleFlag() {
  if (process.platform === 'darwin') return ['--use-angle=metal'];
  if (process.platform === 'win32') return ['--use-angle=d3d11'];
  return [];
}

async function openPage(url: string) {
  const browser = await chromium.launch({
    channel: 'chrome',
    headless: !flag('headed'),
    args: [...angleFlag(), '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const logs: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  const qs = new URLSearchParams({ export: '1' });
  for (const k of ['format', 'scale', 'only', 'fps']) if (opt(k)) qs.set(k, opt(k)!);
  await page.goto(`${url}/?${qs}`);
  await page.waitForFunction(() => (window as any).__mg?.ready || (window as any).__mg?.error, null, { timeout: 120000 });
  const err = await page.evaluate(() => (window as any).__mg.error);
  if (err) throw new Error(`app failed to boot:\n${err}\n${logs.join('\n')}`);
  const info = await page.evaluate(() => {
    const m = (window as any).__mg;
    return { width: m.width, height: m.height, fps: m.fps, duration: m.duration, format: m.format, music: m.music, timeline: m.timeline, errors: m.errors };
  });
  await page.setViewportSize({ width: info.width, height: info.height });
  return { browser, page, logs, info };
}

type Info = Awaited<ReturnType<typeof openPage>>['info'];

async function grab(page: Page, file: string) {
  const b64: string = await page.evaluate(() => (window as any).__mg.png());
  await Bun.write(file, Buffer.from(b64, 'base64'));
}

async function stills(page: Page, info: Info, times: number[], dir: string) {
  mkdirSync(dir, { recursive: true });
  const samples = sampling('1');
  for (const t of times) {
    const k: number = await page.evaluate(({ t, s }) => (window as any).__mg.still(t, s, 0.5), { t, s: samples });
    const f = path.join(dir, `f_${t.toFixed(2).padStart(6, '0')}.png`);
    await grab(page, f);
    console.log(k > 1 ? `${f}  (${k} sub-frames)` : f);
  }
}

async function sheet(page: Page, info: Info, times: number[], cols: number, out: string) {
  const data: string = await page.evaluate(async ({ times, cols, w, h }) => {
    const M = (window as any).__mg;
    const cw = 360, ch = Math.round((cw * h) / w), pad = 6, lab = 18;
    const rows = Math.ceil(times.length / cols);
    const cv = document.createElement('canvas');
    cv.width = cols * (cw + pad) + pad; cv.height = rows * (ch + lab + pad) + pad;
    const c = cv.getContext('2d')!;
    c.fillStyle = '#222'; c.fillRect(0, 0, cv.width, cv.height);
    const src = document.getElementById('c') as HTMLCanvasElement;
    times.forEach((t: number, i: number) => {
      M.still(t);
      const x = pad + (i % cols) * (cw + pad), y = pad + Math.floor(i / cols) * (ch + lab + pad);
      c.drawImage(src, x, y + lab, cw, ch);
      const id = M.timeline.filter((e: any) => t >= e.start && t < e.end).map((e: any) => e.id).join('+');
      c.fillStyle = '#ddd'; c.font = '12px monospace'; c.fillText(`${t.toFixed(2)}s ${id}`, x + 2, y + 13);
    });
    return cv.toDataURL('image/png').split(',')[1];
  }, { times, cols, w: info.width, h: info.height });
  mkdirSync(path.dirname(out), { recursive: true });
  await Bun.write(out, Buffer.from(data, 'base64'));
  console.log(out);
}

const COLOR = ['-vf', 'vflip,scale=out_color_matrix=bt709,setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709'];

async function video(page: Page, info: Info, from: number, to: number, out: string) {
  mkdirSync(path.dirname(out), { recursive: true });
  const { width, height, fps } = info;
  const music = info.music ? path.join(APP, 'public', info.music) : null;
  const withAudio = music && existsSync(music) && !flag('noaudio');
  const args = ['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${width}x${height}`, '-r', String(fps), '-i', 'pipe:0'];
  if (withAudio) args.push('-ss', String(from), '-t', String(to - from), '-i', music!);
  // Frames are sRGB: convert with the BT.709 matrix and tag it, or players guess BT.601 and shift the colours.
  args.push(...COLOR, '-c:v', 'libx264', '-preset', opt('preset', 'slow')!, '-crf', opt('crf', '18')!, '-pix_fmt', 'yuv420p',
    '-profile:v', 'high', '-x264-params', opt('x264', 'aq-mode=3')!);
  if (withAudio) {
    const fadeOut = Math.max(0, to - from - 0.6);
    args.push('-af', `afade=t=out:st=${fadeOut}:d=0.6`, '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-shortest');
  }
  args.push('-movflags', '+faststart', out);
  const ff = Bun.spawn(args, { stdin: 'pipe', stdout: 'inherit', stderr: 'inherit' });
  const total = Math.round(to * fps) - Math.round(from * fps);
  let frames = 0;
  const t0 = performance.now();
  const server = Bun.serve({
    port: 0,
    fetch(req, srv) { return srv.upgrade(req) ? undefined : new Response('ws only', { status: 400 }); },
    websocket: {
      maxPayloadLength: width * height * 4 + 1024,
      async message(ws, msg) {
        ff.stdin.write(msg as Uint8Array);
        await ff.stdin.flush();
        frames++;
        ws.send(String(frames));
        if (frames % fps === 0 || frames === total) {
          const el = (performance.now() - t0) / 1000;
          process.stdout.write(`\r${frames}/${total} frames  ${(frames / el).toFixed(1)} fps  eta ${((total - frames) / (frames / el)).toFixed(0)}s   `);
        }
      },
    },
  });
  const used: Record<string, number> = await page.evaluate((o) => (window as any).__mg.stream(o), {
    from, to, ws: `ws://localhost:${server.port}`, samples: sampling('auto'), shutter: +opt('shutter', '0.5')!,
  });
  while (frames < total) await Bun.sleep(10);
  ff.stdin.end();
  await ff.exited;
  server.stop();
  console.log(`\nwrote ${out} (${frames} frames, ${((performance.now() - t0) / 1000).toFixed(1)} s)${withAudio ? '' : ' [no audio]'}`);
  console.log(`sub-frames per frame (count:frames): ${hist(used)}`);
}

/** Render the poster frame at t, then replace frame 0 of the video with it (same length, audio copied). */
async function poster(page: Page, info: Info, t: number, videoPath: string) {
  const jpg = videoPath.replace(/\.mp4$/, '.poster.png');
  await page.evaluate(({ t, s }) => (window as any).__mg.still(t, s, 0.5), { t, s: sampling('auto') });
  await grab(page, jpg);
  console.log(jpg);
  if (!existsSync(videoPath)) { console.log(`(no ${videoPath} yet: poster saved only)`); return; }
  const tmp = videoPath.replace(/\.mp4$/, '.tmp.mp4');
  const p = Bun.spawn(['ffmpeg', '-y', '-loglevel', 'error', '-i', videoPath, '-i', jpg,
    '-filter_complex', "[1:v]scale=out_color_matrix=bt709[p];[0:v][p]overlay=0:0:enable='eq(n,0)',setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709[v]",
    '-map', '[v]', '-map', '0:a?', '-c:v', 'libx264', '-crf', opt('crf', '18')!, '-preset', 'slow', '-pix_fmt', 'yuv420p', '-profile:v', 'high',
    '-c:a', 'copy', '-movflags', '+faststart', tmp], { stdout: 'inherit', stderr: 'inherit' });
  if ((await p.exited) !== 0) throw new Error('ffmpeg poster bake failed');
  await Bun.write(videoPath, Bun.file(tmp));
  (await import('node:fs')).rmSync(tmp);
  console.log(`baked poster (t=${t}) into frame 0 of ${videoPath}`);
}

const { url, stop } = await ensureServer();
const { browser, page, logs, info } = await openPage(url);
try {
  if (info.errors.length) console.error('SCENE ERRORS:\n' + info.errors.join('\n'));
  const fmt = info.format as string;
  if (mode === 'stills') {
    const times = (opt('t') ?? '0').split(',').map(Number);
    await stills(page, info, times, opt('out', path.join(OUT, 'stills', fmt))!);
  } else if (mode === 'sheet') {
    const from = +opt('from', '0')!, to = +opt('to', String(info.duration))!, n = +opt('n', '16')!;
    let times = Array.from({ length: n }, (_, i) => from + ((to - from - 0.02) * i) / Math.max(1, n - 1));
    if (opt('times')) times = opt('times')!.split(',').map(Number);
    if (flag('cuts')) times = info.timeline.slice(1).flatMap((e: any) => [e.start - 0.1, e.start - 1 / info.fps, e.start, e.start + 0.1]);
    await sheet(page, info, times, +opt('cols', '4')!, opt('out', path.join(OUT, `sheet-${fmt}.png`))!);
  } else if (mode === 'video') {
    await video(page, info, +opt('from', '0')!, +opt('to', String(info.duration))!, path.resolve(opt('out', path.join(OUT, `${fmt}.mp4`))!));
  } else if (mode === 'poster') {
    if (!opt('t')) throw new Error('poster needs --t <seconds> (a settled, strongest frame)');
    await poster(page, info, +opt('t')!, path.resolve(opt('video', path.join(OUT, `${fmt}.mp4`))!));
  } else throw new Error(`unknown mode ${mode}`);
  const late = await page.evaluate(() => (window as any).__mg.errors as string[]);
  if (late.length > info.errors.length) console.error('SCENE ERRORS:\n' + late.slice(info.errors.length).join('\n'));
  if (logs.length) console.error('BROWSER LOG:\n' + logs.slice(0, 40).join('\n'));
} finally {
  await browser.close();
  stop();
}
