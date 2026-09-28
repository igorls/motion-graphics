// Shared motifs: the pieces every scene reuses so the whole piece looks like one film.
// Put recurring elements here (the background field, the glow, a signature line or shape).
import * as THREE from 'three';
import { FSPass } from '../engine/gl';
import { hexToLinear } from '../engine/util';
import { brand } from '../brand';

export const LIN = Object.fromEntries(Object.entries(brand.colors).map(([k, v]) => [k, hexToLinear(v)])) as
  Record<keyof typeof brand.colors, [number, number, number]>;

/** HDR tint: a brand colour pushed `k` times over 1 so it blooms. Only the accent should ever glow. */
export const glow = (key: keyof typeof brand.colors, k: number): [number, number, number] => LIN[key].map((c) => c * k) as [number, number, number];

/**
 * The background: two brand tones drifting in slow fbm, a soft accent light that can follow a point
 * and swell with the music. Never flat black, never busy.
 */
export class BgField {
  pass = new FSPass(/* glsl */ `
    uniform float t, energy, light; uniform vec2 lightPos; uniform vec3 c0, c1, cA;
    void main() {
      vec2 p = FRAG_PX / uRes.y;
      float n = fbm(p * 1.6 + vec2(t * 0.05, -t * 0.03));
      vec3 col = mix(c0, c1, smoothstep(0.25, 0.85, n));
      vec2 lp = vec2(lightPos.x, uRes.y - lightPos.y) / uRes.y; // lightPos is y-down like Canvas2D
      float d = length(p - lp);
      col += cA * light * (0.035 + 0.09 * energy) * exp(-d * d * 7.0);
      fragColor = vec4(col, 1.0);
    }`, {
    t: { value: 0 }, energy: { value: 0 }, light: { value: 1 }, lightPos: { value: new THREE.Vector2() },
    c0: { value: new THREE.Vector3(...LIN.bg) }, c1: { value: new THREE.Vector3(...LIN.bg2) }, cA: { value: new THREE.Vector3(...LIN.accent) },
  });
  render(r: THREE.WebGLRenderer, out: THREE.WebGLRenderTarget, o: { t: number; x: number; y: number; energy?: number; light?: number }) {
    const u = this.pass.u;
    u.t!.value = o.t;
    u.energy!.value = o.energy ?? 0;
    u.light!.value = o.light ?? 1;
    (u.lightPos!.value as THREE.Vector2).set(o.x, o.y);
    this.pass.render(r, out);
  }
}

/** Fill style for the wordmark: the brand gradient across [x0, x1], or the solid accent. */
export function brandFill(c: CanvasRenderingContext2D, x0: number, x1: number) {
  if (brand.gradient.length < 2) return brand.colors.accent;
  const g = c.createLinearGradient(x0, 0, x1, 0);
  brand.gradient.forEach((s, i) => g.addColorStop(i / (brand.gradient.length - 1), s));
  return g;
}
