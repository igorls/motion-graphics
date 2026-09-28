// The "look": one post chain over the composited HDR frame, shared by every scene so the whole
// piece reads as one film. Bloom (only HDR values above 1 glow: tint the accent over 1 to make it glow;
// type and photos stay crisp), a soft tone shoulder,
// chromatic aberration, vignette, grain, plus the punctuation scenes animate: flash, fade,
// shake, zoom. Adapted from mexicat/pdoom-video (MIT).
import * as THREE from 'three';
import { FSPass, makeRT, W, H } from './gl';
import { frameIdx } from './util';

export interface PostParams {
  exposure: number;
  bloom: number;
  bloomThreshold: number;
  bloomRadius: number;
  /** Chromatic aberration in px at the frame edge. */
  ca: number;
  /** Film grain amplitude (sRGB units). Keep <= 0.04 for social: platform re-encoding smears heavy grain into mush. */
  grain: number;
  vignette: number;
  /** 0..1 fade to black. */
  fade: number;
  /** Flash, 0..1: a screen blend towards flashColor (0.1 = a 10% lift, 1 = a full white frame). */
  flash: number;
  flashColor: [number, number, number];
  /** Frame offset in logical px, and frame zoom (1 = none) for punch-ins on hits. */
  shake: [number, number];
  zoom: number;
}

export const DEFAULT_POST: PostParams = {
  exposure: 1,
  bloom: 0.6,
  bloomThreshold: 1.0,
  bloomRadius: 0.8,
  ca: 0.8,
  grain: 0.03,
  vignette: 0.3,
  fade: 0,
  flash: 0,
  flashColor: [1, 1, 1],
  shake: [0, 0],
  zoom: 1,
};

const SHOULDER = /* glsl */ `
vec3 shoulder(vec3 x) {
  // identity below k, smooth roll-off above; very bright values desaturate towards white like film
  const float k = 0.75;
  vec3 y = mix(x, k + (1.0 - k) * (1.0 - exp(-(x - k) / (1.0 - k))), step(k, x));
  float over = max(max(x.r, x.g), x.b);
  return mix(y, vec3(1.0), smoothstep(2.0, 12.0, over) * 0.85);
}`;

const MIPS = 6;

export class Post {
  private prefilter: FSPass;
  private down: FSPass;
  private up: FSPass;
  private final: FSPass;
  private mips: THREE.WebGLRenderTarget[] = [];
  private ups: THREE.WebGLRenderTarget[] = [];

  constructor() {
    // the bloom pyramid is sized in logical px, so the glow looks the same at every output scale
    let w = W >> 1, h = H >> 1;
    for (let i = 0; i < MIPS; i++) {
      this.mips.push(makeRT(Math.max(2, w), Math.max(2, h), { pxScale: 1 }));
      this.ups.push(makeRT(Math.max(2, w), Math.max(2, h), { pxScale: 1 }));
      w >>= 1; h >>= 1;
    }
    this.prefilter = new FSPass(/* glsl */ `
      uniform sampler2D src; uniform vec2 texel; uniform float threshold;
      void main() {
        vec3 c = 0.25 * (texture(src, vUv + texel * vec2(-1, -1)).rgb + texture(src, vUv + texel * vec2(1, -1)).rgb
               + texture(src, vUv + texel * vec2(-1, 1)).rgb + texture(src, vUv + texel * vec2(1, 1)).rgb);
        c = min(c, vec3(40.0));
        float l = max(c.r, max(c.g, c.b)), knee = 0.2;
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
      uniform float exposure, bloom, ca, grain, vignette, fade, flash, zoom, seed;
      uniform vec3 flashColor; uniform vec2 shake;
      ${SHOULDER}
      void main() {
        vec2 uv = (vUv - 0.5) / zoom + 0.5 - shake / uRes;
        vec2 dc = uv - 0.5;
        vec2 asp = vec2(uRes.x / uRes.y, 1.0);
        vec2 off = dc * dot(dc * asp, dc * asp) * ca / uRes.x * 4.0;
        vec3 col = vec3(texture(src, uv + off).r, texture(src, uv).g, texture(src, uv - off).b);
        col += texture(bloomTex, uv).rgb * bloom;
        col = shoulder(col * exposure);
        col *= mix(1.0, smoothstep(0.95, 0.25, length(dc * vec2(1.0, 0.8))), vignette);
        col *= 1.0 - fade;
        vec3 s = toSRGB(sat(col));
        // flash: a screen blend in display space, so 0.1 reads as a 10% lift (added in linear light it would wash out the shadows)
        s = 1.0 - (1.0 - s) * (1.0 - sat(toSRGB(sat(flashColor)) * flash));
        // grain in two sizes, strongest in the mid-tones, re-seeded once per output frame
        float g1 = hash12(FRAG_PX + seed * 13.37) - 0.5;
        float g2 = hash12(floor(FRAG_PX / 2.0) + seed * 7.13) - 0.5;
        float lm = luma(s);
        s += (g1 * 0.6 + g2 * 0.4) * grain * (0.55 + 1.2 * lm * (1.0 - lm));
        s += (hash12(gl_FragCoord.xy * 1.37 + seed) - 0.5) / 255.0; // dither: no banding in gradients
        fragColor = vec4(sat(s), 1.0);
      }`, {
      src: { value: null }, bloomTex: { value: null }, exposure: { value: 1 }, bloom: { value: 0.5 }, ca: { value: 1 },
      grain: { value: 0.03 }, vignette: { value: 0.3 }, fade: { value: 0 }, flash: { value: 0 }, zoom: { value: 1 },
      seed: { value: 0 }, flashColor: { value: new THREE.Vector3(1, 1, 1) }, shake: { value: new THREE.Vector2() },
    });
  }

  /** src (HDR linear) -> out (8-bit sRGB target, or the screen). */
  render(r: THREE.WebGLRenderer, src: THREE.Texture, out: THREE.WebGLRenderTarget | null, p: PostParams, t: number) {
    this.prefilter.u.src!.value = src;
    (this.prefilter.u.texel!.value as THREE.Vector2).set(1 / W, 1 / H);
    this.prefilter.u.threshold!.value = p.bloomThreshold;
    this.prefilter.render(r, this.mips[0]!);
    for (let i = 1; i < MIPS; i++) {
      const s = this.mips[i - 1]!;
      this.down.u.src!.value = s.texture;
      (this.down.u.texel!.value as THREE.Vector2).set(1 / s.width, 1 / s.height);
      this.down.render(r, this.mips[i]!);
    }
    let prev = this.mips[MIPS - 1]!.texture;
    for (let i = MIPS - 2; i >= 0; i--) {
      const small = i === MIPS - 2 ? this.mips[MIPS - 1]! : this.ups[i + 1]!;
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
    f.ca!.value = p.ca;
    f.grain!.value = p.grain;
    f.vignette!.value = p.vignette;
    f.fade!.value = p.fade;
    f.flash!.value = p.flash;
    f.zoom!.value = p.zoom;
    f.seed!.value = (frameIdx(t) % 997) * 1.618;
    (f.flashColor!.value as THREE.Vector3).set(...p.flashColor);
    (f.shake!.value as THREE.Vector2).set(p.shake[0], p.shake[1]);
    this.final.render(r, out);
  }
}
