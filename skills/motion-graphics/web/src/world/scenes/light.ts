// Light and atmosphere shared by every surface: the sun, the sky fill, the sky dome, the haze that
// dissolves distance into it, and how much night it is. Presets blend by story time, so the light
// itself can move with the scroll (a page can be one day: day, golden hour, blue hour, night).
// Glow needs darkness: on a bright page additive light washes to white; plan the wow for a dark part.
import * as THREE from 'three';
import { FSPass } from '../engine/gl';
import { lerp } from '../engine/util';

type V3 = [number, number, number];
export interface LightPreset {
  sunDir: V3; sunCol: V3; skyCol: V3; zenith: V3; horizon: V3; below: V3; sunGlow: V3; hazeK: number; hazeStart: number; night: number;
}

const hex = (h: string, k = 1): V3 => { const c = new THREE.Color(h); return [c.r * k, c.g * k, c.b * k]; };
/** A sun direction from azimuth (degrees, from +x towards +z) and elevation (degrees). */
export const dir = (azDeg: number, elDeg: number): V3 => {
  const az = (azDeg * Math.PI) / 180, el = (elDeg * Math.PI) / 180;
  return [Math.cos(el) * Math.cos(az), Math.sin(el), Math.cos(el) * Math.sin(az)];
};

// Starting points: tune sunCol/skyCol so lit surfaces land near 0.95 and shade near a third of that.
export const PRESETS = {
  day: { sunDir: dir(150, 38), sunCol: [1.0, 0.92, 0.8], skyCol: [0.36, 0.4, 0.48], zenith: hex('#CFDAE8'), horizon: hex('#F4F0EA'), below: hex('#EEE9E2'), sunGlow: hex('#FFE6C8', 0.4), hazeK: 0.018, hazeStart: 20, night: 0 },
  golden: { sunDir: dir(156, 24), sunCol: [1.38, 1.1, 0.82], skyCol: [0.36, 0.36, 0.41], zenith: hex('#C4D2E3'), horizon: hex('#F4DFC8'), below: hex('#EFE3D4'), sunGlow: hex('#FFD7A8', 0.7), hazeK: 0.02, hazeStart: 18, night: 0 },
  blue: { sunDir: dir(170, -4), sunCol: [0, 0, 0], skyCol: [0.11, 0.15, 0.3], zenith: hex('#18223D'), horizon: hex('#3F4470'), below: hex('#262A47'), sunGlow: hex('#B56A72', 0.3), hazeK: 0.026, hazeStart: 15, night: 0.7 },
  night: { sunDir: dir(170, -12), sunCol: [0, 0, 0], skyCol: [0.06, 0.08, 0.17], zenith: hex('#0B1120'), horizon: hex('#22273F'), below: hex('#161A2C'), sunGlow: hex('#000000'), hazeK: 0.03, hazeStart: 13, night: 1 },
} satisfies Record<string, LightPreset>;

const u = {
  uSunDir: { value: new THREE.Vector3() }, uSunCol: { value: new THREE.Vector3() }, uSkyCol: { value: new THREE.Vector3() },
  uZenith: { value: new THREE.Vector3() }, uHorizon: { value: new THREE.Vector3() }, uBelow: { value: new THREE.Vector3() },
  uSunGlow: { value: new THREE.Vector3() }, uHazeK: { value: 0.02 }, uHazeStart: { value: 18 }, uNight: { value: 0 },
};

const GLSL = /* glsl */ `
uniform vec3 uSunDir, uSunCol, uSkyCol, uZenith, uHorizon, uBelow, uSunGlow;
uniform float uHazeK, uHazeStart, uNight;
vec3 srgb2lin(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 skyAt(vec3 d) {
  vec3 c = mix(uHorizon, uZenith, smoothstep(0.0, 0.6, d.y));
  c = mix(c, uBelow, smoothstep(0.0, -0.25, d.y));
  float sd = max(dot(d, normalize(uSunDir)), 0.0);
  c += uSunGlow * (pow(sd, 6.0) * 0.26 + pow(sd, 220.0) * 0.55 + smoothstep(0.99962, 0.9998, sd) * 6.0);
  return c;
}
vec3 haze(vec3 col, vec3 p) {
  vec3 d = p - cameraPosition;
  float dist = length(d);
  float f = 1.0 - exp(-max(dist - uHazeStart, 0.0) * uHazeK);
  return mix(col, skyAt(d / dist), clamp(f, 0.0, 1.0));
}`;

let current: LightPreset = PRESETS.day;

export const light = {
  uniforms: u,
  glsl: GLSL,
  get now() { return current; },
  /** Blend two presets (k = 0 -> a, 1 -> b) into the shared uniforms. */
  set(a: LightPreset, b: LightPreset = a, k = 0) {
    const m = (x: V3, y: V3): V3 => [lerp(x[0], y[0], k), lerp(x[1], y[1], k), lerp(x[2], y[2], k)];
    current = {
      sunDir: m(a.sunDir, b.sunDir), sunCol: m(a.sunCol, b.sunCol), skyCol: m(a.skyCol, b.skyCol), zenith: m(a.zenith, b.zenith),
      horizon: m(a.horizon, b.horizon), below: m(a.below, b.below), sunGlow: m(a.sunGlow, b.sunGlow),
      hazeK: lerp(a.hazeK, b.hazeK, k), hazeStart: lerp(a.hazeStart, b.hazeStart, k), night: lerp(a.night, b.night, k),
    };
    const c = current;
    u.uSunDir.value.set(...c.sunDir).normalize();
    u.uSunCol.value.set(...c.sunCol).multiplyScalar(THREE.MathUtils.smoothstep(u.uSunDir.value.y, -0.02, 0.06));
    u.uSkyCol.value.set(...c.skyCol); u.uZenith.value.set(...c.zenith); u.uHorizon.value.set(...c.horizon);
    u.uBelow.value.set(...c.below); u.uSunGlow.value.set(...c.sunGlow);
    u.uHazeK.value = c.hazeK; u.uHazeStart.value = c.hazeStart; u.uNight.value = c.night;
  },
  /** Walk a list of [storyTime, preset] keys (smoothstep between neighbours). */
  along(s: number, keys: [number, LightPreset][]) {
    if (s <= keys[0]![0]) return this.set(keys[0]![1]);
    for (let i = 1; i < keys.length; i++) {
      const [s1, b] = keys[i]!, [s0, a] = keys[i - 1]!;
      if (s <= s1) { const k = (s - s0) / Math.max(1e-6, s1 - s0); return this.set(a, b, k * k * (3 - 2 * k)); }
    }
    this.set(keys[keys.length - 1]![1]);
  },
};

/** The sky dome as a fullscreen pass behind everything (it needs the camera's matrices). */
export class SkyPass {
  pass = new FSPass(/* glsl */ `
    uniform mat4 uInvProj, uCamWorld; uniform vec3 cameraPosition;
    ${GLSL}
    void main() {
      vec4 v = uInvProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
      vec3 d = normalize((uCamWorld * vec4(v.xyz / v.w, 0.0)).xyz);
      fragColor = vec4(skyAt(d), 1.0);
    }`, { ...u, uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, cameraPosition: { value: new THREE.Vector3() } });
  render(r: THREE.WebGLRenderer, cam: THREE.PerspectiveCamera, target: THREE.WebGLRenderTarget) {
    (this.pass.u.uInvProj!.value as THREE.Matrix4).copy(cam.projectionMatrixInverse);
    (this.pass.u.uCamWorld!.value as THREE.Matrix4).copy(cam.matrixWorld);
    (this.pass.u.cameraPosition!.value as THREE.Vector3).copy(cam.position);
    this.pass.render(r, target);
  }
}
