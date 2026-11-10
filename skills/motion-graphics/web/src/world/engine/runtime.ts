// The live world behind the page: one fixed, decorative WebGL canvas that renders a Story as a pure
// function of story time (from the scroll, see chapters.ts) plus a small ambient clock. It owns the
// renderer, the HDR target, the post chain, adaptive resolution, pausing, reduced motion and the
// test hooks (window.__world) that the screenshot script drives.
//
// URL parameters (for review and screenshots):
//   ?s=3.4      start at story time 3.4 (scrolls there)       ?t=2     freeze the ambient clock at 2 s
//   ?still      no damping, no pointer, no ambient motion       ?q=0..3  force a quality tier
//   ?world=off  no canvas (the static fallback)
import * as THREE from 'three';
import { makeRT, resizeRT } from './gl';
import { DEFAULT_POST, Post, type PostParams } from './post';
import { measureKeep, type Box } from './keep';
import { Chapters } from './chapters';

export interface WorldFrame {
  /** Story time (chapter index + progress), damped for smooth camera moves. */
  s: number;
  /** Ambient clock in seconds (idle motion: breathing, drift). Frozen with ?t= or ?still. */
  t: number;
  dt: number;
  /** Pointer, -1..1 from the viewport centre, damped (0 when there's no fine pointer). */
  px: number;
  py: number;
  /** Viewport in css px, and its aspect. */
  w: number;
  h: number;
  aspect: number;
  /** The user prefers reduced motion: hold designed states, no flights. */
  reduced: boolean;
  /** The page's copy on screen: boxes of the [data-keep] elements (css px). Keep subjects clear of them (keep.ts clearOf). */
  keep: Box[];
  /** Screenshot mode (?still): no damping anywhere, so every frame is exact. */
  still: boolean;
}

export interface Story {
  init(world: World): Promise<void> | void;
  /** Called after the viewport or quality changes. */
  resize?(world: World): void;
  /** Render the frame into `target` (linear HDR). Return post overrides. */
  render(f: WorldFrame, target: THREE.WebGLRenderTarget): Partial<PostParams> | void;
  /** Reduced motion: the story time to hold for each chapter (default: the middle of its pin). */
  restFor?(chapter: number): number;
}

/** Quality tiers, chosen from the device and adjusted live by frame time. */
export const TIERS = [
  { name: 'low', dpr: 1, samples: 0, bloomLevels: 4 },
  { name: 'medium', dpr: 1.25, samples: 2, bloomLevels: 5 },
  { name: 'high', dpr: 1.5, samples: 4, bloomLevels: 6 },
  { name: 'ultra', dpr: 2, samples: 4, bloomLevels: 6 },
] as const;

const q = new URLSearchParams(location.search);

export class World {
  canvas: HTMLCanvasElement;
  renderer: THREE.WebGLRenderer;
  chapters = new Chapters();
  post!: Post;
  hdr!: THREE.WebGLRenderTarget;
  tier: number;
  errors: string[] = [];
  /** css px of the viewport */
  w = innerWidth;
  h = innerHeight;
  readonly still = q.has('still');
  readonly reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  readonly coarse = matchMedia('(pointer: coarse)').matches;

  private sCur = 0;
  tCur = +(q.get('t') ?? 0);
  frozenT = q.has('t') || q.has('still');
  private px = 0; private py = 0; private tpx = 0; private tpy = 0;
  private last = 0;
  private raf = 0;
  private frameTimes: number[] = [];
  private lowSince = 0;
  private frames = 0;
  private fade = 0;
  private restChapter = -1;
  private holdUntil = 0;
  private warmQueue: number[] = [];
  private keepEls: HTMLElement[] = [];
  /** The copy's boxes this frame (see WorldFrame.keep). */
  readonly keep: Box[] = [];

  constructor(private story: Story, parent: HTMLElement = document.body) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'world';
    if (q.has('still')) this.canvas.style.transition = 'none';
    this.canvas.setAttribute('aria-hidden', 'true');
    parent.prepend(this.canvas);
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: q.has('still') });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    const forced = q.get('q');
    this.tier = forced !== null ? Math.max(0, Math.min(TIERS.length - 1, +forced)) : this.guessTier();
  }

  private guessTier() {
    const dpr = devicePixelRatio || 1, cores = navigator.hardwareConcurrency || 4;
    const mem = (navigator as any).deviceMemory ?? 8;
    if (this.coarse) return cores >= 8 && mem >= 6 ? 2 : 1;
    if (dpr >= 2 && cores >= 8) return 3;
    return 2;
  }

  get tierInfo() { return TIERS[this.tier]!; }
  get dpr() { return Math.min(devicePixelRatio || 1, this.tierInfo.dpr); }

  async start() {
    this.resize(true);
    try {
      await this.story.init(this);
    } catch (e) {
      this.errors.push(String((e as Error)?.stack ?? e));
      console.error(e);
      throw e;
    }
    this.story.resize?.(this);
    this.covers = [...document.querySelectorAll<HTMLElement>('[data-cover]')];
    this.keepEls = [...document.querySelectorAll<HTMLElement>('[data-keep]')];
    addEventListener('resize', () => this.resize());
    new ResizeObserver(() => this.chapters.measure()).observe(document.body);
    document.fonts?.ready.then(() => this.chapters.measure());
    if (!this.coarse && !this.still && !this.reduced) addEventListener('pointermove', (e: PointerEvent) => {
      this.tpx = (e.clientX / this.w) * 2 - 1;
      this.tpy = (e.clientY / this.h) * 2 - 1;
    }, { passive: true });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) { this.last = 0; this.loop(); } });
    if (q.has('s')) {
      this.chapters.measure();
      scrollTo({ top: this.chapters.scrollFor(+q.get('s')!), behavior: 'instant' as ScrollBehavior });
    }
    this.sCur = this.chapters.storyAt(scrollY);
    // compile every chapter's shaders before the world shows (a first use can stall a frame 50-100 ms):
    // one chapter per frame behind the poster, then the canvas fades in (turnOn)
    if (!this.still) this.warmQueue = [...Array(this.chapters.count).keys()].filter((i) => i !== Math.floor(this.sCur));
    this.expose();
    if (!this.warmQueue.length) this.turnOn();
    this.loop();
  }

  resize(force = false) {
    const w = innerWidth, h = innerHeight;
    if (!force && w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    this.applyQuality();
    this.chapters.measure();
  }

  private applyQuality() {
    const dpr = this.dpr, W = Math.round(this.w * dpr), H = Math.round(this.h * dpr);
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(W, H, false);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    const t = this.tierInfo;
    if (!this.hdr || this.hdr.samples !== t.samples) {
      this.hdr?.dispose();
      this.hdr = makeRT(W, H, { depth: true, samples: t.samples });
    } else resizeRT(this.hdr, W, H);
    if (!this.post || this.post.levels !== t.bloomLevels) this.post = new Post(t.bloomLevels);
    this.post.setSize(W, H);
    this.story.resize?.(this);
  }

  /** Physical pixel size of the drawing buffer. */
  get size() { return { W: this.hdr.width, H: this.hdr.height }; }

  private loop = () => {
    cancelAnimationFrame(this.raf);
    if (document.hidden) return;
    this.raf = requestAnimationFrame((now) => { this.frame(now); this.loop(); });
  };

  /** Render one frame now (the loop calls this; the screenshot script can too). */
  private covers: HTMLElement[] = [];

  /** True while an opaque section ([data-cover]) fills the viewport: nothing of the world is visible. */
  private covered() {
    for (const el of this.covers) { const r = el.getBoundingClientRect(); if (r.top <= -1 && r.bottom >= this.h + 1) return true; }
    return false;
  }

  frame(now = performance.now(), force = false) {
    const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 1 / 60;
    this.last = now;
    if (!force && this.covered()) return;
    const warm = this.warmQueue.shift();
    if (warm !== undefined) { this.warmChapter(warm); if (!this.warmQueue.length) this.turnOn(); }
    measureKeep(this.keepEls, this.keep);
    let target = this.chapters.storyAt(scrollY);
    if (this.reduced) target = this.rest(target, now);
    if (this.still || Math.abs(target - this.sCur) > 1.5) this.sCur = target;
    else this.sCur += (target - this.sCur) * (1 - Math.exp(-dt / 0.11));
    if (!this.frozenT && !this.reduced) this.tCur += dt;
    this.px += (this.tpx - this.px) * (1 - Math.exp(-dt / 0.6));
    this.py += (this.tpy - this.py) * (1 - Math.exp(-dt / 0.6));
    const f: WorldFrame = { s: this.sCur, t: this.tCur, dt, px: this.px, py: this.py, w: this.w, h: this.h, aspect: this.w / this.h, reduced: this.reduced, keep: this.keep, still: this.still };
    const r = this.renderer;
    let post: PostParams = { ...DEFAULT_POST };
    try {
      const ov = this.story.render(f, this.hdr);
      if (ov) post = { ...post, ...ov };
    } catch (e) {
      const msg = String((e as Error)?.stack ?? e);
      if (!this.errors.includes(msg)) { this.errors.push(msg); console.error(e); }
    }
    if (this.fade > 0) post.fade = Math.max(post.fade, this.fade);
    this.post.render(r, this.hdr.texture, null, post, this.frames++, this.keep, this.w, this.h);
    if (!this.still) this.adapt(dt * 1000, now);
  }

  /** The world fades in over the poster (html.world-on hides the poster in CSS). */
  private turnOn() {
    this.canvas.classList.add('on');
    document.documentElement.classList.add('world-on');
  }

  /** Draw chapter i's rest state once, unseen (the visible frame overwrites it): its shaders and targets get built now. */
  private warmChapter(i: number) {
    const s = this.story.restFor?.(i) ?? i + 0.5 * (this.chapters.list[i]?.pinEnd || 1);
    const f: WorldFrame = { s, t: this.tCur, dt: 1 / 60, px: 0, py: 0, w: this.w, h: this.h, aspect: this.w / this.h, reduced: this.reduced, keep: [], still: true };
    try { this.story.render(f, this.hdr); } catch { /* the visible frame reports errors */ }
  }

  /** Reduced motion: hold each chapter's designed state; dissolve between chapters. */
  private rest(target: number, now: number) {
    const i = Math.min(this.chapters.count - 1, Math.max(0, Math.floor(target)));
    if (i !== this.restChapter) {
      if (this.restChapter >= 0) this.holdUntil = now + 260;
      this.restChapter = i;
    }
    const k = Math.max(0, (this.holdUntil - now) / 260);
    this.fade = k > 0 ? Math.sin(k * Math.PI) * 0.9 : 0;
    const restS = this.story.restFor?.(i) ?? i + 0.5 * (this.chapters.list[i]?.pinEnd || 1);
    return restS;
  }

  /** Step resolution down when frames are slow, back up when there's headroom. */
  private adapt(ms: number, now: number) {
    if (q.has('q')) return;
    const ft = this.frameTimes;
    ft.push(ms);
    if (ft.length < 45) return;
    const sorted = [...ft].sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)]!;
    ft.length = 0;
    if (med > 24 && this.tier > 0) { this.tier--; this.applyQuality(); this.lowSince = 0; }
    else if (med < 13 && this.tier < this.guessTier()) {
      this.lowSince ||= now;
      if (now - this.lowSince > 4000) { this.tier++; this.applyQuality(); this.lowSince = 0; }
    } else this.lowSince = 0;
  }

  private expose() {
    const world = this;
    (window as any).__world = {
      ready: true,
      errors: this.errors,
      get s() { return world.sCur; },
      get tier() { return TIERS[world.tier]!.name; },
      /** The running story, for inspection while developing (measure a scene, toggle a part off). */
      get story() { return world.story; },
      chapters: () => this.chapters.list.map((c) => ({ id: c.id, top: c.top, height: c.height, pinEnd: c.pinEnd })),
      /** Scroll to story time s and render it at once (for screenshots). */
      go(s: number) { world.chapters.measure(); scrollTo({ top: world.chapters.scrollFor(s), behavior: 'instant' as ScrollBehavior }); world.sCur = world.chapters.storyAt(scrollY); world.frame(performance.now(), true); return world.sCur; },
      frame() { world.frame(performance.now(), true); },
      /** Set the ambient clock (seconds) and hold it there: scrub idle motion (walkers, pings, breathing) for screenshots. */
      setT(t: number) { world.tCur = t; world.frozenT = true; world.frame(performance.now(), true); },
      /** Median frame time (ms) over n animation frames, for performance checks. */
      async measure(n = 120) {
        const ts: number[] = [];
        let prev = performance.now();
        for (let i = 0; i < n; i++) { await new Promise((r) => requestAnimationFrame(r)); const t = performance.now(); ts.push(t - prev); prev = t; }
        ts.sort((a, b) => a - b);
        return { median: ts[Math.floor(n / 2)], p95: ts[Math.floor(n * 0.95)], tier: TIERS[world.tier]!.name };
      },
    };
  }
}
