#!/usr/bin/env bun
// Look at the site the way a visitor sees it: real Chrome (GPU), real DOM over the live world,
// at exact story times (scroll positions) and viewports. The web counterpart of the motion
// engine's render.ts.
//
//   at     --s 0,1.4,3.7 [--eval "js"] [--press "sel:ms"] [--tab N]   stills; --eval sets a state with page script,
//          --press holds a real pointer on a control's visible centre (fails if it's off screen), --tab focuses by keyboard
//                                                                               out/shots/<vp>/<page>-s<s>.png
//   sheet  [--from 0 --to 9 --n 24 | --every 0.25 | --times a,b,c] [--cols 6]  contact sheet, labelled with s and chapter   out/sheet-<page>-<vp>.png
//   strip  --from 3 --to 3.8 --every 0.05 [--crop x,y,w,h]     a motion strip of one move (css px crop)   out/strip-<page>-<vp>.png
//   check  --s 0,3.7 [--vp desktop,laptop,tablet,phone]        the same moments in every viewport, one row each   out/check-<page>.png
//   clock  --s 0 --from 0 --to 8 --every 1 [--crop x,y,w,h]   the ambient clock at one scroll position (idle motion)   out/clock-<page>-<vp>.png
//   seams  [--around 0.3 --samples 5]   each chapter boundary across its hand-off, one row each (add --reduced too)   out/seams-<page>-<vp>.png
//   perf   [--seconds 8]             scroll the page top to bottom at a steady pace; frame times, tier, errors
//   full   [--js]                     the page without the world, as it reads without JavaScript (every line, posters), in parts past 16k px
//   posters                           the world alone (no page), per page and chapter (src/site/shots.ts), desktop and phone:
//                                     public/posters/<page>-<chapter>-<vp>.webp (first paint, and the no-WebGL fallback)
//   crawl                             every URL in the built site's sitemap (served from dist/): console errors,
//                                     CSP violations, failed requests, with the world running
//   og                                1200x630 share images at the moments in src/site/shots.ts: public/og/<route>-<lang>.jpg
//
// Common: --page / (path) --vp desktop|laptop|tablet|phone (default desktop) --url http://localhost:5180
//         --live (damping and ambient motion on; default is ?still) --q 0..3 (quality tier) --reduced (prefers-reduced-motion)
//         --dist (shoot the production build in dist/, served with its real headers)
//         --cell 360 (sheet tile width)  --headed
import { chromium, type Page, type Browser } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { shots } from '../src/site/shots';
import path from 'node:path';

const argv = process.argv.slice(2);
const mode = argv[0] ?? 'at';
const opt = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const flag = (k: string) => argv.includes(`--${k}`);
const ROOT = path.resolve(import.meta.dir, '..');
const OUT = path.join(ROOT, 'out');

export const VIEWPORTS = {
  desktop: { width: 1440, height: 900, dpr: 1, mobile: false },
  laptop: { width: 1280, height: 760, dpr: 1, mobile: false },
  tablet: { width: 834, height: 1112, dpr: 1, mobile: true },
  phone: { width: 390, height: 844, dpr: 2, mobile: true },
  /** a GPU stress test: about 20x a phone's pixels */
  stress: { width: 2560, height: 1440, dpr: 2, mobile: false },
} as const;
type VP = keyof typeof VIEWPORTS;

async function reachable(url: string) { try { return (await fetch(url, { signal: AbortSignal.timeout(1500) })).ok; } catch { return false; } }

async function ensureServer() {
  const given = opt('url');
  if (given && (await reachable(given))) return { url: given, stop: () => {} };
  const port = 5400 + Math.floor(Math.random() * 400);
  const vite = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js');
  const proc = Bun.spawn([process.execPath, vite, '--port', String(port), '--strictPort'], { cwd: ROOT, stdout: 'ignore', stderr: 'inherit', env: { ...process.env, SITE_NO_HMR: '1' } });
  const url = `http://localhost:${port}`;
  for (let i = 0; i < 300 && !(await reachable(url)); i++) await Bun.sleep(100);
  if (!(await reachable(url))) throw new Error('vite did not start');
  return { url, stop: () => proc.kill() };
}

/** Serve dist/ with scripts/serve.ts (production headers) on a free port. */
async function serveDist() {
  const port = 4800 + Math.floor(Math.random() * 400);
  const proc = Bun.spawn([process.execPath, path.join(ROOT, 'scripts', 'serve.ts'), '--port', String(port)], { cwd: ROOT, stdout: 'ignore', stderr: 'inherit' });
  const url = `http://localhost:${port}`;
  for (let i = 0; i < 100 && !(await reachable(url)); i++) await Bun.sleep(100);
  return { url, stop: () => proc.kill() };
}

let browser: Browser | null = null;
/**
 * A page path from --page: "/privacy/", "privacy" or "privacy/" all work. Git Bash on Windows rewrites
 * arguments that start with "/" into Windows paths ("C:/Program Files/Git/privacy/"); undo that.
 */
function pagePathArg(raw = opt('page', '/')!) {
  const msys = raw.match(/^[A-Za-z]:[\\/].*?[\\/]Git([\\/].*)$/);
  let p = (msys ? msys[1]! : raw).replace(/\\/g, '/');
  if (!p.startsWith('/')) p = `/${p}`;
  if (!p.endsWith('/') && !/\.[a-z0-9]+$/i.test(p)) p += '/';
  return p;
}

async function open(url: string, vp: VP, extra: Record<string, string> = {}, pagePath = pagePathArg()) {
  browser ??= await chromium.launch({ channel: 'chrome', headless: !flag('headed'), args: ['--use-angle=d3d11', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
  const v = VIEWPORTS[vp];
  const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, deviceScaleFactor: v.dpr, isMobile: v.mobile, hasTouch: v.mobile, reducedMotion: flag('reduced') ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  const logs: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
  const qs = new URLSearchParams(extra);
  if (!flag('live') && mode !== 'perf') qs.set('still', '1');
  if (opt('q')) qs.set('q', opt('q')!);
  const target = `${url}${pagePath}${qs.size ? `?${qs}` : ''}`;
  await page.goto(target, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  if (extra.world !== 'off') {
    await page.waitForFunction(() => (window as any).__world?.ready || document.documentElement.classList.contains('no-world'), null, { timeout: 60000 }).catch(() => {});
  }
  return { page, logs, v };
}

async function go(page: Page, s: number) {
  const got = await page.evaluate(async (s) => {
    const w = (window as any).__world;
    if (!w) { return null; }
    const r = w.go(s);
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    (window as any).__ui?.update?.();
    window.dispatchEvent(new Event('scroll'));
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    w.frame();
    return r;
  }, s);
  return got as number | null;
}

async function chapterAt(page: Page, s: number) {
  return page.evaluate((s) => (window as any).__world?.chapters()[Math.min(Math.floor(s), 99)]?.id ?? '', s);
}

const pageSlug = () => (pagePathArg().replace(/^\/|\/$/g, '').replace(/\//g, '_') || 'home');
const list = (s?: string) => (s ?? '').split(',').filter(Boolean).map(Number);
const vps = () => (opt('vp', 'desktop')!.split(',') as VP[]);

/** Tile PNG buffers into one labelled sheet (composited in the browser). */
async function compose(tiles: { png: Buffer; label: string }[], cols: number, cell: number, file: string, rowLabels?: string[]) {
  const p = await (browser!.newPage());
  const b64 = tiles.map((t) => `data:image/png;base64,${t.png.toString('base64')}`);
  const out: string = await p.evaluate(async ({ b64, labels, cols, cell, rowLabels }) => {
    const imgs = await Promise.all(b64.map((src) => new Promise<HTMLImageElement>((res) => { const i = new Image(); i.onload = () => res(i); i.src = src; })));
    const w0 = imgs[0]!.width, h0 = imgs[0]!.height;
    const cw = cell, ch = Math.round((cw * h0) / w0), pad = 8, lab = 20, rl = rowLabels ? 90 : 0;
    const rows = Math.ceil(imgs.length / cols);
    const c = document.createElement('canvas');
    c.width = rl + cols * (cw + pad) + pad; c.height = rows * (ch + lab + pad) + pad;
    const g = c.getContext('2d')!;
    g.fillStyle = '#1b1d22'; g.fillRect(0, 0, c.width, c.height);
    g.font = '600 12px system-ui, sans-serif';
    imgs.forEach((im, i) => {
      const x = rl + pad + (i % cols) * (cw + pad), y = pad + Math.floor(i / cols) * (ch + lab + pad);
      g.drawImage(im, x, y + lab, cw, ch);
      g.fillStyle = '#d9dde5'; g.fillText(labels[i]!, x, y + 14);
    });
    if (rowLabels) rowLabels.forEach((t, r) => { g.fillStyle = '#ffb27a'; g.fillText(t, 8, pad + r * (ch + lab + pad) + lab + 16); });
    return c.toDataURL('image/png').split(',')[1]!;
  }, { b64, labels: tiles.map((t) => t.label), cols, cell, rowLabels });
  await Bun.write(file, Buffer.from(out, 'base64'));
  await p.close();
  console.log(file);
}

async function main() {
  // crawl checks the production build: start its static server (bun run build first)
  // --dist: shoot the production build (bun run build first); the ship gate wants frames from it
  const { url, stop } = (mode === 'crawl' || flag('dist')) && !opt('url') ? await serveDist() : await ensureServer();
  mkdirSync(OUT, { recursive: true });
  try {
    if (mode === 'at') {
      for (const vp of vps()) {
        const { page, logs } = await open(url, vp);
        const dir = path.join(OUT, 'shots', vp); mkdirSync(dir, { recursive: true });
        for (const s of list(opt('s', '0'))) {
          await go(page, s);
          // --eval "js": run a line of page script before capturing (set a state), then redraw
          if (opt('eval')) {
            const r = await page.evaluate(opt('eval')!);
            if (r !== undefined) console.log(`eval: ${JSON.stringify(r)}`);
            await page.evaluate(() => (window as any).__world?.frame());
          }
          // --tab N: press Tab N times, as a keyboard visitor would (the capture shows the focus ring and any jump)
          for (let k = 0; k < +opt('tab', '0')!; k++) await page.keyboard.press('Tab');
          // --press "selector:ms": a real pointer press at the control's visible centre, held ms, captured while
          // still held. Fails when the control isn't fully on screen: a synthetic event would pass anywhere.
          const press = opt('press');
          if (press) {
            const at = press.lastIndexOf(':'), sel = press.slice(0, at), ms = +press.slice(at + 1);
            const box = await page.locator(sel).first().boundingBox(), v = page.viewportSize()!;
            if (!box || box.x < 0 || box.y < 0 || box.x + box.width > v.width || box.y + box.height > v.height) throw new Error(`--press: ${sel} is not fully on screen (${JSON.stringify(box)})`);
            await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
            await page.mouse.down();
            await page.waitForTimeout(ms);
          }
          if (press || opt('tab')) await page.evaluate(() => (window as any).__world?.frame());
          const tag = opt('eval') || press || opt('tab') ? '-eval' : '';
          const f = path.join(dir, `${pageSlug()}-s${s.toFixed(2)}${tag}.png`);
          await page.screenshot({ path: f });
          if (press) await page.mouse.up();
          console.log(f);
        }
        report(logs, page);
      }
    } else if (mode === 'clock') {
      // the ambient clock at one scroll position: idle motion (walkers, pings, breathing) that story-time strips can't show
      for (const vp of vps()) {
        const { page, logs } = await open(url, vp);
        const s = +opt('s', '0')!, from = +opt('from', '0')!, to = +opt('to', '8')!, every = +opt('every', '1')!;
        await go(page, s);
        const tiles: { png: Buffer; label: string }[] = [];
        for (let t = from; t <= to + 1e-6; t += every) {
          await page.evaluate((t) => (window as any).__world?.setT(t), t);
          const crop = opt('crop')?.split(',').map(Number);
          const png = await page.screenshot(crop ? { clip: { x: crop[0]!, y: crop[1]!, width: crop[2]!, height: crop[3]! } } : {});
          tiles.push({ png, label: `s ${s.toFixed(2)}  t ${t.toFixed(1)} s` });
        }
        await compose(tiles, +opt('cols', '8')!, +opt('cell', '240')!, path.join(OUT, `${opt('name', 'clock')}-${pageSlug()}-${vp}.png`));
        report(logs, page);
      }
    } else if (mode === 'sheet' || mode === 'strip' || mode === 'seams') {
      for (const vp of vps()) {
        const { page, logs } = await open(url, vp);
        const n = await page.evaluate(() => (window as any).__world?.chapters().length ?? 1);
        const from = +opt('from', '0')!, to = +opt('to', String(n - 0.001))!;
        const every = opt('every');
        const count = +opt('n', '24')!, given = list(opt('times'));
        // seams: around every chapter boundary (where copy and subjects hand off), one row per boundary
        const around = +opt('around', '0.3')!, per = +opt('samples', '5')!;
        const seams = Array.from({ length: n - 1 }, (_, b) => Array.from({ length: per }, (_, k) => b + 1 - around + (2 * around * k) / Math.max(1, per - 1))).flat();
        const times: number[] = mode === 'seams' ? seams : given.length ? given : every ? Array.from({ length: Math.floor((to - from) / +every + 1e-6) + 1 }, (_, i) => from + i * +every) : Array.from({ length: count }, (_, i) => from + ((to - from) * i) / Math.max(1, count - 1));
        const crop = opt('crop')?.split(',').map(Number);
        const tiles: { png: Buffer; label: string }[] = [];
        for (const s of times) {
          await go(page, s);
          const png = await page.screenshot(crop ? { clip: { x: crop[0]!, y: crop[1]!, width: crop[2]!, height: crop[3]! } } : {});
          tiles.push({ png, label: `s ${s.toFixed(2)}  ${await chapterAt(page, s)}` });
        }
        const cols = +opt('cols', mode === 'strip' ? '8' : mode === 'seams' ? String(per) : '6')!;
        await compose(tiles, cols, +opt('cell', mode === 'strip' ? '240' : '360')!, path.join(OUT, `${opt('name', mode)}-${pageSlug()}-${vp}.png`));
        report(logs, page);
      }
    } else if (mode === 'check') {
      const all = (opt('vp', 'desktop,laptop,tablet,phone')!.split(',') as VP[]);
      const times = list(opt('s', '0'));
      const rows: { png: Buffer; label: string }[][] = [];
      for (const vp of all) {
        const { page, logs } = await open(url, vp);
        const row: { png: Buffer; label: string }[] = [];
        for (const s of times) { await go(page, s); row.push({ png: await page.screenshot(), label: `${vp} s ${s.toFixed(2)}` }); }
        rows.push(row);
        report(logs, page);
      }
      // one sheet per viewport row (sizes differ), stacked as separate files plus an index line
      for (let r = 0; r < rows.length; r++) await compose(rows[r]!, times.length, +opt('cell', '300')!, path.join(OUT, `check-${pageSlug()}-${all[r]}.png`));
    } else if (mode === 'perf') {
      for (const vp of vps()) {
        const { page, logs } = await open(url, vp, { perf: '1' });
        const res = await page.evaluate(async (secs) => {
          // undo ?still: let the world run live
          const max = document.documentElement.scrollHeight - innerHeight, t0 = performance.now(), times: number[] = [];
          const w = (window as any).__world, at: { ms: number; s: number }[] = [];
          let prev = t0;
          await new Promise<void>((done) => {
            const step = () => {
              const now = performance.now(), k = (now - t0) / (secs * 1000);
              times.push(now - prev); at.push({ ms: now - prev, s: w?.s ?? 0 }); prev = now;
              scrollTo(0, max * Math.min(1, k));
              if (k < 1) requestAnimationFrame(step); else done();
            };
            requestAnimationFrame(step);
          });
          times.sort((a, b) => a - b);
          // the slowest frames, with the story time and chapter they landed in (a first-use shader compile, a heavy pass)
          const chs = w?.chapters?.() ?? [];
          const worst = at.sort((a, b) => b.ms - a.ms).slice(0, 3).map((f) => `${f.ms.toFixed(0)} ms at s ${f.s.toFixed(2)} (${chs[Math.floor(f.s)]?.id ?? '?'})`);
          return { frames: times.length, median: times[Math.floor(times.length / 2)], p95: times[Math.floor(times.length * 0.95)], max: times[times.length - 1], tier: w?.tier, errors: w?.errors ?? [], worst };
        }, +opt('seconds', '8')!);
        console.log(`${vp}: ${res.frames} frames, median ${res.median?.toFixed(1)} ms, p95 ${res.p95?.toFixed(1)} ms, max ${res.max?.toFixed(1)} ms, tier ${res.tier}`);
        console.log(`  slowest: ${res.worst.join('; ')}`);
        if (res.errors.length) console.log(res.errors.join('\n'));
        report(logs, page);
      }
    } else if (mode === 'full') {
      for (const vp of vps()) {
        const { page, logs } = await open(url, vp, { world: 'off' });
        // the page as it reads without JavaScript: every line shown (scroll reveals and beats need a scroll position a
        // full-page capture doesn't have), the posters as backgrounds; --js keeps the scripted state instead
        if (!flag('js')) { await page.evaluate(() => { const r = document.documentElement; r.classList.replace('js', 'no-js'); r.classList.remove('still'); }); await page.waitForTimeout(400); }
        // Chrome captures at most 16384 device px in one image (past that it wraps): tall pages come out in numbered parts
        const { H, W } = await page.evaluate(() => ({ H: document.documentElement.scrollHeight, W: document.documentElement.clientWidth }));
        const part = Math.floor(16000 / VIEWPORTS[vp].dpr), parts = Math.ceil(H / part);
        for (let i = 0; i < parts; i++) {
          const f = path.join(OUT, `full-${pageSlug()}-${vp}${parts > 1 ? `-${i + 1}` : ''}.png`);
          await page.screenshot({ path: f, fullPage: true, clip: { x: 0, y: i * part, width: W, height: Math.min(part, H - i * part) } });
          console.log(f);
        }
        report(logs, page);
      }
    } else if (mode === 'posters') {
      const POSTERS = shots.posters;
      const dir = path.join(ROOT, 'public', 'posters'); mkdirSync(dir, { recursive: true });
      for (const vp of ['desktop', 'phone'] as VP[]) for (const [name, spec] of Object.entries(POSTERS)) {
        const { page, logs } = await open(url, vp, {}, spec.path);
        for (const [ch, s] of Object.entries(spec.at)) {
          await go(page, s);
          const b64: string = await page.evaluate(() => (document.querySelector('canvas.world') as HTMLCanvasElement).toDataURL('image/webp', 0.82).split(',')[1]!);
          const f = path.join(dir, `${name}-${ch}-${vp}.webp`);
          await Bun.write(f, Buffer.from(b64, 'base64'));
          console.log(f);
        }
        report(logs, page);
        await page.context().close();
      }
    } else if (mode === 'crawl') {
      // the production build as a visitor gets it: every sitemap URL (plus the 404), world on
      const xml = await (await fetch(`${url}/sitemap.xml`)).text();
      const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]!).pathname);
      urls.push('/no-such-page/');
      browser ??= await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
      let bad = 0;
      for (const p of urls) {
        const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
        const page = await ctx.newPage();
        const problems: string[] = [];
        page.on('console', (m) => { if ((m.type() === 'error' || m.type() === 'warning') && !(p === '/no-such-page/' && m.text().includes('404'))) problems.push(`[${m.type()}] ${m.text()}`); });
        page.on('pageerror', (e) => problems.push(`[pageerror] ${e.message}`));
        page.on('requestfailed', (r) => problems.push(`[failed] ${r.url()}`));
        page.on('response', (r) => { if (r.status() >= 400 && !(p === '/no-such-page/' && r.url().endsWith(p))) problems.push(`[${r.status()}] ${r.url()}`); });
        await page.addInitScript(() => document.addEventListener('securitypolicyviolation', (e) => console.error(`CSP ${e.violatedDirective} ${e.blockedURI}`)));
        await page.goto(`${url}${p}`, { waitUntil: 'load' });
        await page.waitForFunction(() => (window as any).__world?.ready || document.documentElement.classList.contains('no-world') || !document.body.dataset.world, null, { timeout: 30000 }).catch(() => problems.push('[world] did not start'));
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight / 2));
        await page.waitForTimeout(600);
        const errs = await page.evaluate(() => (window as any).__world?.errors ?? []);
        for (const e of errs) problems.push(`[world] ${String(e).split('\n')[0]}`);
        console.log(`${problems.length ? 'FAIL' : 'ok  '} ${p}${problems.length ? `\n  ${problems.join('\n  ')}` : ''}`);
        if (problems.length) bad++;
        await ctx.close();
      }
      console.log(bad ? `${bad} page(s) with problems` : `all ${urls.length} pages clean`);
    } else if (mode === 'og') {
      const OG = shots.og;
      const dir = path.join(ROOT, 'public', 'og'); mkdirSync(dir, { recursive: true });
      browser ??= await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=d3d11', '--ignore-gpu-blocklist'] });
      for (const o of OG) {
        const ctx = await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
        const page = await ctx.newPage();
        await page.goto(`${url}${o.path}?still=1&og=1`, { waitUntil: 'load' });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForFunction(() => (window as any).__world?.ready, null, { timeout: 60000 }).catch(() => {});
        await go(page, o.s);
        const f = path.join(dir, `${o.route}-${o.lang}.jpg`);
        await page.screenshot({ path: f, type: 'jpeg', quality: 86 });
        console.log(f);
        await ctx.close();
      }
    } else throw new Error(`unknown mode ${mode}`);
  } finally {
    await browser?.close();
    stop();
  }
}

function report(logs: string[], page: Page) {
  void page;
  if (logs.length) console.log(`console:\n  ${logs.slice(0, 20).join('\n  ')}`);
}

await main();
