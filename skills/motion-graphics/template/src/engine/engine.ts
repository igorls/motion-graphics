// The engine: renders any time t of the piece deterministically. It composites the active
// timeline entries (hard cut when windows touch, crossfade when they overlap, or a scene's own
// transition), averages sub-frames over a shutter for real motion blur (a fixed count, or
// adaptively per frame), and applies the post chain. Adapted from mexicat/pdoom-video (MIT).
import * as THREE from 'three';
import { Audio } from './audio';
import { Compositor, FSPass, clearRT, makeRT, W, H, PW, PH, SCALE } from './gl';
import { SAFE } from './format';
import { DEFAULT_POST, Post, type PostParams } from './post';
import type { Frame, SceneClass, Scene } from './scene';

export interface TimelineEntry {
  id: string;
  scene: SceneClass;
  start: number;
  end: number;
  params?: Record<string, any>;
  /** Default post overrides for this entry (the scene's own overrides win). */
  post?: Partial<PostParams>;
}

interface Loaded { entry: TimelineEntry; scene: Scene | null }

/**
 * Adaptive motion blur: the sub-frame count per frame steps through 4, 12, 36, 108, 324 (from `min`
 * up to at most `max`) until the frame's estimated remaining sampling error is below `tol` 8-bit
 * levels everywhere (worst 2x2 px block). Still frames stop at 12; whips and slams go on until
 * their streaks are continuous instead of stepped copies.
 */
export interface AdaptiveSampling { min: number; max: number; tol: number }
export type Sampling = number | AdaptiveSampling;

/**
 * Shutter offsets (-0.5..0.5) in rendering order: 4 evenly spread, then each step splits every
 * interval in three, adding a sub-frame either side of each old one. Every prefix of 4*3^l is evenly
 * spread and centred, and so is each step's new set, so comparing the new set's average with the
 * old one's measures sampling error, not a shift in time.
 */
function ternaryOffsets(steps: number) {
  const u = [0, 1, 2, 3].map((i) => (i + 0.5) / 4 - 0.5);
  for (let l = 0, n = 4; l < steps; l++, n *= 3)
    for (let m = 0; m < n; m++) u.push((3 * m + 0.5) / (3 * n) - 0.5, (3 * m + 2.5) / (3 * n) - 0.5);
  return u;
}

// error blocks: B x B physical px (2x2 logical), reduced by R x R before the CPU reads the maximum
const B = 2 * SCALE, EW = Math.ceil(PW / B), EH = Math.ceil(PH / B), R = 16;
const smallRT = (w: number, h: number) => new THREE.WebGLRenderTarget(w, h, {
  type: THREE.FloatType, depthBuffer: false, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, colorSpace: THREE.NoColorSpace,
});

export class Engine {
  renderer: THREE.WebGLRenderer;
  comp = new Compositor();
  post!: Post;
  audio!: Audio;
  timeline: TimelineEntry[] = [];
  loaded = new Map<string, Loaded>();
  errors: string[] = [];
  lastPost: PostParams = { ...DEFAULT_POST };
  /** Sub-frames used for the last rendered frame. */
  lastSamples = 1;

  private rts = [makeRT(), makeRT(), makeRT()];
  private mixRT = makeRT();
  private sumRT = makeRT(W, H, { type: THREE.FloatType });
  private newRT = makeRT(W, H, { type: THREE.FloatType });
  private errRT = smallRT(EW, EH);
  private maxRT = smallRT(Math.ceil(EW / R), Math.ceil(EH / R));
  private errBuf = new Float32Array(this.maxRT.width * this.maxRT.height * 4);
  // how far the displayed frame (8-bit levels) moves when a step's 2n new sub-frames (sum b) join the
  // n before them (sum a): 2/3 of the gap between the two averages, per block
  private errPass = new FSPass(`uniform sampler2D a; uniform sampler2D b; uniform float invA, invB;
    vec3 disp(vec3 x) { return toSRGB(sat(x)); }
    void main() {
      ivec2 p0 = ivec2(gl_FragCoord.xy) * ${B}, lim = ivec2(${PW - 1}, ${PH - 1});
      vec3 sa = vec3(0.0), sb = vec3(0.0);
      for (int y = 0; y < ${B}; y++) for (int x = 0; x < ${B}; x++) {
        ivec2 p = min(p0 + ivec2(x, y), lim);
        sa += texelFetch(a, p, 0).rgb; sb += texelFetch(b, p, 0).rgb;
      }
      vec3 e = abs(disp(sa * (invA / ${B * B}.0)) - disp(sb * (invB / ${B * B}.0)));
      fragColor = vec4(170.0 * max(e.r, max(e.g, e.b)), 0.0, 0.0, 1.0);
    }`, { a: { value: null }, b: { value: null }, invA: { value: 1 }, invB: { value: 1 } });
  private maxPass = new FSPass(`uniform sampler2D e;
    void main() {
      ivec2 p0 = ivec2(gl_FragCoord.xy) * ${R};
      float m = 0.0;
      for (int y = 0; y < ${R}; y++) for (int x = 0; x < ${R}; x++) {
        ivec2 p = p0 + ivec2(x, y);
        if (p.x < ${EW} && p.y < ${EH}) m = max(m, texelFetch(e, p, 0).r);
      }
      fragColor = vec4(m, 0.0, 0.0, 1.0);
    }`, { e: { value: null } });
  private avgRT = makeRT();
  private finalRT = new THREE.WebGLRenderTarget(PW, PH, { type: THREE.UnsignedByteType, depthBuffer: false, colorSpace: THREE.NoColorSpace });
  private blit = new FSPass(`uniform sampler2D src; void main(){ fragColor = texture(src, vUv); }`, { src: { value: null } });
  private xfade = new FSPass(`uniform sampler2D a; uniform sampler2D b; uniform float k;
    void main(){ fragColor = mix(texture(a, vUv), texture(b, vUv), k); }`, { a: { value: null }, b: { value: null }, k: { value: 0 } });
  private avg = new FSPass(`uniform sampler2D src; uniform float inv; void main(){ fragColor = vec4(texture(src, vUv).rgb * inv, 1.0); }`,
    { src: { value: null }, inv: { value: 1 } });
  // adds one sub-frame to the sum; a non-finite pixel from some shader is dropped, or it would poison the average
  private accum = new FSPass(`uniform sampler2D src;
    void main() {
      vec4 c = texture(src, vUv);
      bool ok = abs(c.r) <= 6e4 && abs(c.g) <= 6e4 && abs(c.b) <= 6e4;
      fragColor = ok ? vec4(c.rgb, 1.0) : vec4(0.0);
    }`, { src: { value: null } }, {
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor, transparent: true,
  });

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(1);
    this.renderer.setSize(PW, PH, false);
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  }

  async init(audio: Audio, timeline: TimelineEntry[], only?: string[]) {
    this.audio = audio;
    this.timeline = timeline;
    this.post = new Post();
    const entries = only?.length ? timeline.filter((e) => only.includes(e.id)) : timeline;
    await Promise.all(entries.map(async (e) => {
      const rec: Loaded = { entry: e, scene: null };
      this.loaded.set(e.id, rec);
      try {
        const s = new e.scene({
          renderer: this.renderer, audio, comp: this.comp, W, H, SAFE, id: e.id, params: e.params ?? {}, start: e.start, end: e.end,
        });
        await s.init();
        rec.scene = s;
      } catch (err) {
        this.errors.push(`[${e.id}] init: ${(err as Error)?.stack ?? err}`);
      }
    }));
  }

  get duration() { return this.timeline.reduce((m, e) => Math.max(m, e.end), 0); }

  entryAt(t: number) { return this.timeline.filter((e) => t >= e.start && t < e.end).at(-1); }

  /**
   * Render time t; returns the number of sub-frames used. `dt` is the frame step (1/fps). With
   * samples > 1 the frame is the average of that many sub-frames spread evenly over shutter x dt
   * around t: true motion blur and temporal anti-aliasing. With an AdaptiveSampling the count is
   * chosen per frame (see ternaryOffsets). Post parameters (flash, shake, zoom, fades) are read at
   * one point of the shutter, 1/8 of it after t, which every sample set includes.
   */
  render(t: number, dt: number, toScreen = true, samples: Sampling = 1, shutter = 0.5) {
    const r = this.renderer;
    let tex: THREE.Texture;
    let post: PostParams = { ...DEFAULT_POST };
    let n = 1;
    if (typeof samples === 'number' && samples <= 1) {
      ({ tex, post } = this.composite(t));
    } else {
      const POST_U = 0.125;
      let nearest = Infinity;
      const sub = (u: number, into: THREE.WebGLRenderTarget) => {
        const res = this.composite(Math.max(0, t + dt * shutter * u));
        this.accum.u.src!.value = res.tex;
        this.accum.render(r, into);
        const d = Math.abs(u - POST_U);
        if (d < nearest - 1e-9) { nearest = d; post = res.post; }
      };
      clearRT(r, this.sumRT, [0, 0, 0], 0);
      if (typeof samples === 'number') {
        n = Math.round(samples);
        for (let k = 0; k < n; k++) sub((k + 0.5) / n - 0.5, this.sumRT);
      } else {
        const lg3 = (x: number) => Math.log(x / 4) / Math.log(3);
        const lo = Math.max(0, Math.round(lg3(samples.min))), hi = Math.max(lo, Math.floor(lg3(samples.max) + 1e-9));
        const u = ternaryOffsets(hi);
        n = 4 * 3 ** lo;
        for (let k = 0; k < n; k++) sub(u[k]!, this.sumRT);
        for (let l = lo; l < hi; l++) {
          clearRT(r, this.newRT, [0, 0, 0], 0);
          for (let k = n; k < 3 * n; k++) sub(u[k]!, this.newRT);
          const err = this.sampleError(n) / 2; // what is left after this step is about half its change
          this.accum.u.src!.value = this.newRT.texture;
          this.accum.render(r, this.sumRT);
          n *= 3;
          if (err < samples.tol) break;
        }
      }
      this.avg.u.src!.value = this.sumRT.texture;
      this.avg.u.inv!.value = 1 / n;
      this.avg.render(r, this.avgRT);
      tex = this.avgRT.texture;
    }
    this.lastSamples = n;
    this.post.render(r, tex, this.finalRT, post, t);
    this.lastPost = post;
    if (toScreen) {
      this.blit.u.src!.value = this.finalRT.texture;
      this.blit.render(r, null);
    }
    return n;
  }

  /** Worst-block change (8-bit levels) between the n sub-frames in sumRT and the 2n in newRT. */
  private sampleError(n: number) {
    const r = this.renderer;
    this.errPass.u.a!.value = this.sumRT.texture;
    this.errPass.u.b!.value = this.newRT.texture;
    this.errPass.u.invA!.value = 1 / n;
    this.errPass.u.invB!.value = 1 / (2 * n);
    this.errPass.render(r, this.errRT);
    this.maxPass.u.e!.value = this.errRT.texture;
    this.maxPass.render(r, this.maxRT);
    r.readRenderTargetPixels(this.maxRT, 0, 0, this.maxRT.width, this.maxRT.height, this.errBuf);
    let m = 0;
    for (let i = 0; i < this.errBuf.length; i += 4) m = Math.max(m, this.errBuf[i]!);
    return m;
  }

  private frameFor(e: TimelineEntry, t: number, under: THREE.Texture | null, tin: number, tout: number): Frame {
    const beat = this.audio.beatAt(t), bar = this.audio.barAt(t);
    return {
      t, lt: t - e.start, p: (t - e.start) / (e.end - e.start), start: e.start, end: e.end,
      beat, bar, beatPhase: beat - Math.floor(beat), barPhase: bar - Math.floor(bar),
      a: this.audio.sample(t), under, tin, tout,
    };
  }

  /** All scenes active at t composited into one HDR texture (no post). */
  private composite(t: number): { tex: THREE.Texture; post: PostParams } {
    const r = this.renderer;
    const active = this.timeline.filter((e) => t >= e.start && t < e.end && this.loaded.has(e.id)).sort((a, b) => a.start - b.start);
    let post: PostParams = { ...DEFAULT_POST };
    let under: THREE.Texture | null = null;
    active.forEach((e, idx) => {
      const rt = this.rts[idx % this.rts.length]!;
      const s = this.loaded.get(e.id)?.scene;
      const prev = active[idx - 1], next = active[idx + 1];
      const tin = prev ? Math.min(1, (t - e.start) / Math.max(1e-3, prev.end - e.start)) : 1;
      const tout = next ? Math.max(0, (t - next.start) / Math.max(1e-3, e.end - next.start)) : 0;
      if (!s) { clearRT(r, rt, [0.3, 0, 0]); under = rt.texture; return; } // failed scene: dark red, loud on purpose
      let ov: Partial<PostParams> | void = undefined;
      try {
        ov = s.render(this.frameFor(e, t, idx > 0 ? under : null, tin, tout), rt);
      } catch (err) {
        const msg = `[${e.id}] render @${t.toFixed(3)}: ${(err as Error)?.stack ?? err}`;
        if (!this.errors.includes(msg)) this.errors.push(msg);
        clearRT(r, rt, [0.3, 0, 0]);
      }
      post = { ...post, ...(e.post ?? {}), ...(ov ?? {}) };
      if (idx > 0 && under && !s.handlesTransition) {
        this.xfade.u.a!.value = under;
        this.xfade.u.b!.value = rt.texture;
        this.xfade.u.k!.value = tin;
        this.xfade.render(r, this.mixRT);
        under = this.mixRT.texture;
      } else under = rt.texture;
    });
    if (!under) { clearRT(r, this.rts[0]!, [0, 0, 0]); under = this.rts[0]!.texture; }
    return { tex: under, post };
  }

  /** RGBA8 pixels of the last frame (rows bottom-up), without stalling the GPU pipeline. */
  async readPixelsAsync(buf: Uint8Array) {
    await this.renderer.readRenderTargetPixelsAsync(this.finalRT, 0, 0, PW, PH, buf);
    return buf;
  }
}
