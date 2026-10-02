// GPU building blocks: fullscreen shader passes, HDR render targets, Canvas2D layers and a
// compositor. Colours inside the pipeline are LINEAR and may exceed 1 (that is what blooms);
// Canvas2D layers are sRGB and converted on composite.
import * as THREE from 'three';
import { W, H, SCALE, PW, PH } from './format';

export { W, H, SCALE, PW, PH };

/** Prepended to every FSPass fragment shader. */
export const GLSL_COMMON = /* glsl */ `
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform vec2 uRes;      // logical px
uniform float uScale;   // output scale
#define FRAG_PX (gl_FragCoord.xy / uScale)
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 sat(vec3 c) { return clamp(c, 0.0, 1.0); }
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }
float sdRoundBox(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
// antialiased fill of a signed distance in logical px
float aaFill(float d) { return clamp(0.5 - d * uScale, 0.0, 1.0); }
`;

const VERT = /* glsl */ `
in vec3 position;
out vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const TRI = new THREE.BufferGeometry();
TRI.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
const CAM = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

type Uniforms = Record<string, THREE.IUniform>;

/** A fullscreen GLSL3 fragment pass. Write `void main(){ fragColor = ...; }` using vUv / FRAG_PX. */
export class FSPass {
  mat: THREE.RawShaderMaterial;
  u: Uniforms;
  private scene = new THREE.Scene();
  constructor(frag: string, uniforms: Uniforms = {}, opts: Partial<THREE.ShaderMaterialParameters> = {}) {
    this.u = { uRes: { value: new THREE.Vector2(W, H) }, uScale: { value: SCALE }, ...uniforms };
    this.mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: GLSL_COMMON + frag, uniforms: this.u,
      depthTest: false, depthWrite: false, blending: THREE.NoBlending, ...opts,
    });
    const mesh = new THREE.Mesh(TRI, this.mat);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }
  render(r: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget | null) {
    r.setRenderTarget(target);
    r.render(this.scene, CAM);
  }
  dispose() { this.mat.dispose(); }
}

/** An HDR (half-float, linear) render target. Sizes are logical px; pxScale 1 = data-sized. */
export function makeRT(w = W, h = H, opts: { pxScale?: number; type?: THREE.TextureDataType; depthBuffer?: boolean } = {}) {
  const s = opts.pxScale ?? SCALE;
  return new THREE.WebGLRenderTarget(Math.max(1, Math.round(w * s)), Math.max(1, Math.round(h * s)), {
    type: opts.type ?? THREE.HalfFloatType, depthBuffer: opts.depthBuffer ?? false,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, colorSpace: THREE.NoColorSpace,
  });
}

export function clearRT(r: THREE.WebGLRenderer, rt: THREE.WebGLRenderTarget | null, rgb: [number, number, number] = [0, 0, 0], a = 1) {
  r.setRenderTarget(rt);
  r.setClearColor(new THREE.Color(rgb[0], rgb[1], rgb[2]), a);
  r.clear(true, false, false);
}

/**
 * A Canvas2D layer the size of the frame. Draw in logical px (the context is pre-scaled for
 * SCALE), then comp.draw(r, layer.upload(), out). Uploads cost a few ms each at 1080p: keep
 * to 2-3 layers per scene. Canvas colours are sRGB; the compositor converts them.
 *
 * Content that changes once per output frame (counters, readouts, text driven by frameIdx or by
 * recorded data quantized to the frame) should use clearFor(frameIdx(t)): the motion-blur
 * sub-frames of one frame then reuse one drawing and one upload instead of redrawing it N times.
 */
export class Layer2D {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  tex: THREE.CanvasTexture;
  constructor(public w = W, public h = H, public scale = SCALE) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.round(w * scale);
    this.canvas.height = Math.round(h * scale);
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: false })!;
    this.tex = new THREE.CanvasTexture(this.canvas);
    this.tex.premultiplyAlpha = true; // no dark fringes when the layer is filtered or scaled
    this.tex.colorSpace = THREE.NoColorSpace;
    this.tex.minFilter = THREE.LinearFilter;
    this.tex.generateMipmaps = false;
  }
  private key = NaN;
  private reused = false;
  /**
   * Like clear(), but returns null when the layer is already drawn for this key (pass
   * frameIdx(t)): skip drawing, and upload() reuses the texture already on the GPU. Keep clear()
   * for content animated in continuous t, so the sub-frames blur it.
   */
  clearFor(key: number): CanvasRenderingContext2D | null {
    if (key === this.key) { this.reused = true; return null; }
    const c = this.clear();
    this.key = key;
    return c;
  }
  clear() {
    this.reused = false;
    this.key = NaN;
    const c = this.ctx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, this.canvas.width, this.canvas.height);
    c.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    c.globalAlpha = 1;
    c.globalCompositeOperation = 'source-over';
    c.filter = 'none';
    c.fontKerning = 'normal';
    return c;
  }
  /** The layer as a texture; re-sent to the GPU unless clearFor() just reused this frame's drawing. */
  upload() {
    if (!this.reused) this.tex.needsUpdate = true;
    this.reused = false;
    return this.tex;
  }
  dispose() { this.tex.dispose(); }
}

export type BlendMode = 'normal' | 'add' | 'replace';
export interface DrawOpts {
  mode?: BlendMode;
  opacity?: number;
  /** Multiplies the colour; values > 1 push it into bloom (e.g. an accent glow at 3x). */
  tint?: [number, number, number];
  /** The source is an sRGB canvas (true for Layer2D/images) or a linear render target (false). */
  srgb?: boolean;
}

/** Draws a texture over a target: premultiplied alpha-over, additive, or replace. */
export class Compositor {
  private passes: Record<BlendMode, FSPass>;
  constructor() {
    const frag = /* glsl */ `
      uniform sampler2D src; uniform float opacity; uniform vec3 tint; uniform float srgb;
      void main() {
        vec4 c = texture(src, vUv);
        vec3 rgb = c.a > 1e-5 ? c.rgb / c.a : vec3(0.0);
        rgb = mix(rgb, toLinear(sat(rgb)), srgb) * tint;
        float a = c.a * opacity;
        fragColor = vec4(rgb * a, a);
      }`;
    const u = () => ({ src: { value: null }, opacity: { value: 1 }, tint: { value: new THREE.Vector3(1, 1, 1) }, srgb: { value: 1 } });
    const blend = (src: THREE.BlendingDstFactor, dst: THREE.BlendingDstFactor) => ({
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
      blendSrc: src, blendDst: dst, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
      transparent: true,
    });
    this.passes = {
      normal: new FSPass(frag, u(), blend(THREE.OneFactor, THREE.OneMinusSrcAlphaFactor)),
      add: new FSPass(frag, u(), blend(THREE.OneFactor, THREE.OneFactor)),
      replace: new FSPass(frag, u()),
    };
  }
  draw(r: THREE.WebGLRenderer, tex: THREE.Texture, target: THREE.WebGLRenderTarget | null, o: DrawOpts = {}) {
    const p = this.passes[o.mode ?? 'normal'];
    p.u.src!.value = tex;
    p.u.opacity!.value = o.opacity ?? 1;
    (p.u.tint!.value as THREE.Vector3).set(...(o.tint ?? [1, 1, 1]));
    p.u.srgb!.value = (o.srgb ?? tex instanceof THREE.CanvasTexture) ? 1 : 0;
    p.render(r, target);
  }
}

/** Load and decode an image (for drawing into a Layer2D). Rejects if it is missing. */
export async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  return img;
}

/** Draw an image to cover the rect (like CSS object-fit: cover), with an extra zoom and focus point. */
export function drawCover(
  c: CanvasRenderingContext2D, img: CanvasImageSource & { width: number; height: number },
  x: number, y: number, w: number, h: number, zoom = 1, fx = 0.5, fy = 0.5,
) {
  const s = Math.max(w / img.width, h / img.height) * zoom;
  const dw = img.width * s, dh = img.height * s;
  c.drawImage(img, x + (w - dw) * fx, y + (h - dh) * fy, dw, dh);
}
