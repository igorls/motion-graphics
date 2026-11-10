// The look over the HDR frame, sized to the live canvas: bloom (only values above the threshold
// glow, so tint the accent over 1 and keep everything else at or below 1), a soft film shoulder,
// a split-tone grade, vignette, fine grain and dither. Adapted from the motion engine's post.ts.
import * as THREE from 'three';
import type { Box } from './keep';
import { FSPass, makeRT, resizeRT } from './gl';

export interface PostParams {
  exposure: number;
  bloom: number;
  bloomThreshold: number;
  bloomRadius: number;
  /** Grain amplitude (sRGB units); keep it low on the web (<= 0.03). */
  grain: number;
  vignette: number;
  /** Split tone: colours added to shadows and highlights (linear, small values like 0.02). */
  shadowTint: [number, number, number];
  highlightTint: [number, number, number];
  /** 0..1 fade towards fadeColor (linear). */
  fade: number;
  fadeColor: [number, number, number];
  /** 0..1: calm the world behind the page's copy (the [data-keep] boxes): defocus it and pull it towards calmColor (linear). */
  calm: number;
  calmColor: [number, number, number];
}

export const DEFAULT_POST: PostParams = {
  exposure: 1,
  bloom: 0.8,
  bloomThreshold: 1.0,
  bloomRadius: 0.85,
  grain: 0.022,
  vignette: 0.22,
  shadowTint: [0, 0, 0],
  highlightTint: [0, 0, 0],
  fade: 0,
  fadeColor: [0, 0, 0],
  calm: 0,
  calmColor: [0, 0, 0],
};

const SHOULDER = /* glsl */ `
vec3 shoulder(vec3 x) {
  const float k = 0.78;
  vec3 y = mix(x, k + (1.0 - k) * (1.0 - exp(-(x - k) / (1.0 - k))), step(k, x));
  float over = max(max(x.r, x.g), x.b);
  return mix(y, vec3(1.0), smoothstep(2.0, 14.0, over) * 0.85);
}`;

export class Post {
  private prefilter: FSPass;
  private down: FSPass;
  private up: FSPass;
  private final: FSPass;
  private mips: THREE.WebGLRenderTarget[] = [];
  private ups: THREE.WebGLRenderTarget[] = [];

  /** `levels`: bloom pyramid depth (fewer on phones). */
  constructor(readonly levels = 6) {
    for (let i = 0; i < levels; i++) { this.mips.push(makeRT(2, 2)); this.ups.push(makeRT(2, 2)); }
    this.prefilter = new FSPass(/* glsl */ `
      uniform sampler2D src; uniform vec2 texel; uniform float threshold;
      void main() {
        vec3 c = 0.25 * (texture(src, vUv + texel * vec2(-1, -1)).rgb + texture(src, vUv + texel * vec2(1, -1)).rgb
               + texture(src, vUv + texel * vec2(-1, 1)).rgb + texture(src, vUv + texel * vec2(1, 1)).rgb);
        c = min(c, vec3(40.0));
        float l = max(c.r, max(c.g, c.b)), knee = 0.25;
        float rq = clamp(l - threshold + knee, 0.0, 2.0 * knee);
        rq = rq * rq / (4.0 * knee + 1e-5);
        fragColor = vec4(c * max(rq, l - threshold) / max(l, 1e-5), 1.0);
      }`, { src: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: 1 } });
    this.down = new FSPass(/* glsl */ `
      uniform sampler2D src; uniform vec2 texel;
      void main() {
        vec3 a = texture(src, vUv + texel * vec2(-2, -2)).rgb, b = texture(src, vUv + texel * vec2(0, -2)).rgb, c = texture(src, vUv + texel * vec2(2, -2)).rgb;
        vec3 d = texture(src, vUv + texel * vec2(-1, -1)).rgb, e = texture(src, vUv + texel * vec2(1, -1)).rgb;
        vec3 f = texture(src, vUv + texel * vec2(-2, 0)).rgb, g = texture(src, vUv).rgb, h = texture(src, vUv + texel * vec2(2, 0)).rgb;
        vec3 i = texture(src, vUv + texel * vec2(-1, 1)).rgb, j = texture(src, vUv + texel * vec2(1, 1)).rgb;
        vec3 k = texture(src, vUv + texel * vec2(-2, 2)).rgb, l = texture(src, vUv + texel * vec2(0, 2)).rgb, m = texture(src, vUv + texel * vec2(2, 2)).rgb;
        fragColor = vec4((d + e + i + j) * 0.125 + (a + b + g + f + b + c + h + g + f + g + l + k + g + h + m + l) * 0.03125, 1.0);
      }`, { src: { value: null }, texel: { value: new THREE.Vector2() } });
    this.up = new FSPass(/* glsl */ `
      uniform sampler2D src; uniform sampler2D prev; uniform vec2 texel; uniform float radius;
      void main() {
        vec2 o = texel * radius;
        vec3 s = texture(src, vUv - o).rgb + 2.0 * texture(src, vUv + vec2(0, -o.y)).rgb + texture(src, vUv + vec2(o.x, -o.y)).rgb
          + 2.0 * texture(src, vUv + vec2(-o.x, 0)).rgb + 4.0 * texture(src, vUv).rgb + 2.0 * texture(src, vUv + vec2(o.x, 0)).rgb
          + texture(src, vUv + vec2(-o.x, o.y)).rgb + 2.0 * texture(src, vUv + vec2(0, o.y)).rgb + texture(src, vUv + o).rgb;
        fragColor = vec4(texture(prev, vUv).rgb + s / 16.0, 1.0);
      }`, { src: { value: null }, prev: { value: null }, texel: { value: new THREE.Vector2() }, radius: { value: 1 } });
    this.final = new FSPass(/* glsl */ `
      uniform sampler2D src; uniform sampler2D bloomTex;
      uniform float exposure, bloom, grain, vignette, fade, seed;
      uniform vec3 shadowTint, highlightTint, fadeColor;
      uniform vec4 calmBox[6]; uniform int calmN; uniform float calm; uniform vec3 calmColor; uniform vec2 calmFeather;
      ${SHOULDER}
      // 1 inside the copy's boxes, falling off over calmFeather outside them
      float calmMask(vec2 uv) {
        float m = 0.0;
        for (int i = 0; i < 6; i++) {
          if (i >= calmN) break;
          vec4 b = calmBox[i];
          vec2 o = max(max(b.xy - uv, uv - b.zw), 0.0) / calmFeather;
          m = max(m, 1.0 - smoothstep(0.0, 1.0, length(o)));
        }
        return m;
      }
      void main() {
        vec3 col = texture(src, vUv).rgb + texture(bloomTex, vUv).rgb * bloom;
        float cm = calm > 0.0 ? calmMask(vUv) * calm : 0.0;
        if (cm > 0.002) {
          // defocus: a ring of taps a few pixels out, then lean towards the calm colour
          vec2 tx = 7.0 / vec2(textureSize(src, 0));
          vec3 acc = col;
          for (int k = 0; k < 8; k++) { float a = float(k) * 0.7853982 + 0.39; acc += texture(src, vUv + vec2(cos(a), sin(a)) * tx).rgb; }
          col = mix(col, acc / 9.0, min(1.0, cm * 1.6));
          col = mix(col, calmColor, cm * 0.62);
        }
        col *= exposure;
        float l = luma(col);
        col += shadowTint * (1.0 - smoothstep(0.0, 0.5, l)) + highlightTint * smoothstep(0.35, 1.0, l);
        col = shoulder(max(col, 0.0));
        vec2 dc = vUv - 0.5;
        col *= mix(1.0, smoothstep(0.98, 0.28, length(dc * vec2(1.0, 0.85))), vignette);
        col = mix(col, fadeColor, fade);
        vec3 s = toSRGB(sat(col));
        float g1 = hash12(gl_FragCoord.xy + seed * 13.37) - 0.5;
        float g2 = hash12(floor(gl_FragCoord.xy / 2.0) + seed * 7.13) - 0.5;
        float lm = luma(s);
        s += (g1 * 0.6 + g2 * 0.4) * grain * (0.5 + 1.2 * lm * (1.0 - lm));
        s += (hash12(gl_FragCoord.xy * 1.37 + seed) - 0.5) / 255.0;
        fragColor = vec4(sat(s), 1.0);
      }`, {
      src: { value: null }, bloomTex: { value: null }, exposure: { value: 1 }, bloom: { value: 0.5 },
      grain: { value: 0.02 }, vignette: { value: 0.2 }, fade: { value: 0 }, seed: { value: 0 },
      shadowTint: { value: new THREE.Vector3() }, highlightTint: { value: new THREE.Vector3() }, fadeColor: { value: new THREE.Vector3() },
      calmBox: { value: Array.from({ length: 6 }, () => new THREE.Vector4()) }, calmN: { value: 0 }, calm: { value: 0 },
      calmColor: { value: new THREE.Vector3() }, calmFeather: { value: new THREE.Vector2(0.05, 0.08) },
    });
  }

  /** Bloom is computed at half the physical resolution and below. */
  setSize(w: number, h: number) {
    let mw = w / 2, mh = h / 2;
    for (let i = 0; i < this.levels; i++) {
      resizeRT(this.mips[i]!, Math.max(2, mw), Math.max(2, mh));
      resizeRT(this.ups[i]!, Math.max(2, mw), Math.max(2, mh));
      mw /= 2; mh /= 2;
    }
  }

  /** `keep`: the copy's boxes in css px (World.keep), for the calm field; w, h: the viewport in css px. */
  render(r: THREE.WebGLRenderer, src: THREE.Texture, out: THREE.WebGLRenderTarget | null, p: PostParams, seed: number, keep: Box[] = [], w = 1, h = 1) {
    const n = this.levels;
    this.prefilter.u.src!.value = src;
    (this.prefilter.u.texel!.value as THREE.Vector2).set(1 / (this.mips[0]!.width * 2), 1 / (this.mips[0]!.height * 2));
    this.prefilter.u.threshold!.value = p.bloomThreshold;
    this.prefilter.render(r, this.mips[0]!);
    for (let i = 1; i < n; i++) {
      const s = this.mips[i - 1]!;
      this.down.u.src!.value = s.texture;
      (this.down.u.texel!.value as THREE.Vector2).set(1 / s.width, 1 / s.height);
      this.down.render(r, this.mips[i]!);
    }
    let prev = this.mips[n - 1]!.texture;
    for (let i = n - 2; i >= 0; i--) {
      const small = i === n - 2 ? this.mips[n - 1]! : this.ups[i + 1]!;
      this.up.u.src!.value = prev;
      this.up.u.prev!.value = this.mips[i]!.texture;
      (this.up.u.texel!.value as THREE.Vector2).set(1 / small.width, 1 / small.height);
      this.up.u.radius!.value = 0.5 + p.bloomRadius;
      this.up.render(r, this.ups[i]!);
      prev = this.ups[i]!.texture;
    }
    const f = this.final.u;
    f.src!.value = src;
    f.bloomTex!.value = this.ups[0]!.texture;
    f.exposure!.value = p.exposure;
    f.bloom!.value = p.bloom / 3;
    f.grain!.value = p.grain;
    f.vignette!.value = p.vignette;
    f.fade!.value = p.fade;
    f.seed!.value = (seed % 997) * 1.618;
    (f.shadowTint!.value as THREE.Vector3).set(...p.shadowTint);
    (f.highlightTint!.value as THREE.Vector3).set(...p.highlightTint);
    (f.fadeColor!.value as THREE.Vector3).set(...p.fadeColor);
    const nk = p.calm > 0 ? Math.min(6, keep.length) : 0;
    const boxes = f.calmBox!.value as THREE.Vector4[];
    for (let i = 0; i < nk; i++) { const b = keep[i]!; boxes[i]!.set(b.x0 / w, 1 - b.y1 / h, b.x1 / w, 1 - b.y0 / h); }
    f.calmN!.value = nk;
    f.calm!.value = p.calm;
    (f.calmColor!.value as THREE.Vector3).set(...p.calmColor);
    (f.calmFeather!.value as THREE.Vector2).set(90 / w, 90 / h);
    this.final.render(r, out);
  }
}
