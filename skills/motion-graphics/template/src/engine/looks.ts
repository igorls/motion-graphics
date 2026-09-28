// Look development: materials and shaders that give a piece its own surface language. These are
// STARTING POINTS: a piece should define 2-3 signature materials of its own (copy one of these and
// change the maths), never ship three.js's default grey. All time-driven looks read `looks.time` /
// `looks.beat`, which Stage3D.render(r, f) sets every frame, so they stay deterministic.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SCALE } from './gl';

/** Shared uniforms for every look: time (s), continuous beat index, and the key light direction (world). */
export const looks = {
  time: { value: 0 },
  beat: { value: 0 },
  lightDir: { value: new THREE.Vector3(-0.5, 1, 0.6).normalize() },
};

/** GLSL shared by the custom looks: noise, fresnel, a cosine palette, AA helpers. */
export const LOOK_GLSL = /* glsl */ `
uniform float uTime; uniform float uBeat; uniform vec3 uLightDir;
float lk_hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float lk_noise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(lk_hash(i), lk_hash(i + vec3(1,0,0)), f.x), mix(lk_hash(i + vec3(0,1,0)), lk_hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(lk_hash(i + vec3(0,0,1)), lk_hash(i + vec3(1,0,1)), f.x), mix(lk_hash(i + vec3(0,1,1)), lk_hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float lk_fbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * lk_noise(p); p *= 2.02; a *= 0.5; } return s; }
float lk_fresnel(vec3 n, vec3 v, float power) { return pow(1.0 - clamp(dot(n, v), 0.0, 1.0), power); }
// iq cosine palette: a + b*cos(2pi(c*t + d))
vec3 lk_palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) { return a + b * cos(6.28318 * (c * t + d)); }
vec3 lk_toLinear(vec3 c) { return pow(c, vec3(2.2)); }
`;

const VERT = /* glsl */ `
varying vec3 vNormalW; varying vec3 vPosW; varying vec2 vUv;
void main() {
  vUv = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vPosW = w.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  gl_Position = projectionMatrix * viewMatrix * w;
}`;

/**
 * A custom unlit look: you write the fragment body, given the world normal N, view vector V, light
 * direction L, world position P, uv, and must set `vec3 col` (linear; > 1 blooms) and `float alpha`.
 * This is the door to a piece's own material language.
 */
export function customLook(body: string, uniforms: Record<string, THREE.IUniform> = {}, o: Partial<THREE.ShaderMaterialParameters> = {}) {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: looks.time, uBeat: looks.beat, uLightDir: looks.lightDir, uPxScale: { value: SCALE }, ...uniforms },
    vertexShader: VERT,
    fragmentShader: /* glsl */ `
      ${LOOK_GLSL}
      uniform float uPxScale;
      varying vec3 vNormalW; varying vec3 vPosW; varying vec2 vUv;
      ${Object.entries(uniforms).map(([k, u]) => `uniform ${glslType(u.value)} ${k};`).join('\n')}
      void main() {
        vec3 N = normalize(vNormalW) * (gl_FrontFacing ? 1.0 : -1.0);
        vec3 V = normalize(cameraPosition - vPosW);
        vec3 L = normalize(uLightDir);
        vec3 P = vPosW; vec2 uv = vUv;
        vec3 col = vec3(1.0); float alpha = 1.0;
        ${body}
        gl_FragColor = vec4(col, alpha);
      }`,
    ...o,
  });
}

function glslType(v: unknown) {
  if (typeof v === 'number') return 'float';
  if (v instanceof THREE.Color || v instanceof THREE.Vector3) return 'vec3';
  if (v instanceof THREE.Vector2) return 'vec2';
  if (v instanceof THREE.Vector4) return 'vec4';
  if (v instanceof THREE.Texture) return 'sampler2D';
  throw new Error('customLook: unsupported uniform type');
}

const lin = (hex: string) => new THREE.Color(hex); // THREE.Color from hex is converted to linear

// ---------------------------------------------------------------------------------------------
// Starting-point looks. Read them as recipes; tune or rewrite the maths for each piece.

/** Risograph/halftone print: lighting becomes screen-space ink dots on paper (angle and size in px). */
export function halftone(ink: string, paperHex: string, o: { dotPx?: number; angle?: number; contrast?: number } = {}) {
  return customLook(/* glsl */ `
    float lambert = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
    float tone = pow(lambert, uContrast);                          // 1 = lit (no ink), 0 = shadow (full ink)
    vec2 px = gl_FragCoord.xy / uPxScale;
    float a = uAngle; mat2 R = mat2(cos(a), -sin(a), sin(a), cos(a));
    vec2 cell = R * px / uDot;
    float d = length(fract(cell) - 0.5);
    float r = sqrt(1.0 - tone) * 0.72;
    float w = fwidth(d);
    float inkMask = 1.0 - smoothstep(r - w, r + w, d);
    col = mix(uPaper, uInk, inkMask);`,
  { uInk: { value: lin(ink) }, uPaper: { value: lin(paperHex) }, uDot: { value: o.dotPx ?? 7 }, uAngle: { value: o.angle ?? 0.785 }, uContrast: { value: o.contrast ?? 1.4 } });
}

/** Illustrated warm/cool shading (Gooch) with a crisp specular: reads as designed, not rendered. */
export function gooch(warm: string, cool: string, o: { spec?: number } = {}) {
  return customLook(/* glsl */ `
    float k = dot(N, L) * 0.5 + 0.5;
    col = mix(uCool, uWarm, smoothstep(0.1, 0.9, k));
    vec3 H = normalize(L + V);
    col += vec3(uSpec) * smoothstep(0.92, 0.95, dot(N, H));`,
  { uWarm: { value: lin(warm) }, uCool: { value: lin(cool) }, uSpec: { value: o.spec ?? 0.6 } });
}

/** Rim/fresnel glow over a flat base: objects outlined by light. `glow` > 1 blooms the rim. */
export function rimGlow(base: string, rim: string, o: { power?: number; glow?: number; pulse?: number } = {}) {
  return customLook(/* glsl */ `
    float f = lk_fresnel(N, V, uPower);
    float beatPulse = pow(1.0 - fract(uBeat), 6.0) * uPulse;
    col = uBase * (0.35 + 0.65 * clamp(dot(N, L), 0.0, 1.0)) + uRim * f * (uGlow + beatPulse);`,
  { uBase: { value: lin(base) }, uRim: { value: lin(rim) }, uPower: { value: o.power ?? 2.5 }, uGlow: { value: o.glow ?? 2.0 }, uPulse: { value: o.pulse ?? 1.5 } });
}

/** Holographic thin film: hue shifts with view angle and height, fine scanlines drift. */
export function holo(o: { scan?: number; tint?: string; glow?: number } = {}) {
  return customLook(/* glsl */ `
    float f = lk_fresnel(N, V, 1.5);
    float h = f * 0.8 + P.y * 0.15 + uTime * 0.05;
    vec3 film = lk_palette(h, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.33, 0.67));
    float scan = 0.85 + 0.15 * sin(P.y * uScan - uTime * 6.0);
    col = mix(uTint, film, 0.35 + 0.65 * f) * scan * (0.6 + uGlow * f);
    alpha = 0.55 + 0.45 * f;`,
  { uScan: { value: o.scan ?? 220 }, uTint: { value: lin(o.tint ?? '#9fb7ff') }, uGlow: { value: o.glow ?? 1.6 } },
  { transparent: true, depthWrite: false, side: THREE.DoubleSide });
}

// ---------------------------------------------------------------------------------------------
// Physical materials (need an environment for reflections: call studioEnvironment once).

/** A soft studio environment map so metal, glass and gloss have something to reflect. */
export function studioEnvironment(renderer: THREE.WebGLRenderer, scene: THREE.Scene, intensity = 0.4) {
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = intensity;
  pm.dispose();
}

/** Clear or tinted glass (real transmission and refraction of what's behind it). */
export function glass(tint = '#ffffff', o: { roughness?: number; thickness?: number; ior?: number } = {}) {
  return new THREE.MeshPhysicalMaterial({ color: lin(tint), transmission: 1, roughness: o.roughness ?? 0.05, thickness: o.thickness ?? 0.6, ior: o.ior ?? 1.45, metalness: 0 });
}

/** Brushed / anodised metal. */
export function metal(hex: string, roughness = 0.3) {
  return new THREE.MeshPhysicalMaterial({ color: lin(hex), metalness: 1, roughness, clearcoat: 0.3 });
}

/** Iridescent coating (soap film, beetle shell, oil on water) over a base colour. */
export function iridescent(hex: string, o: { strength?: number; roughness?: number } = {}) {
  return new THREE.MeshPhysicalMaterial({ color: lin(hex), iridescence: o.strength ?? 1, iridescenceIOR: 1.3, iridescenceThicknessRange: [100, 800], roughness: o.roughness ?? 0.25, metalness: 0.2 });
}

// ---------------------------------------------------------------------------------------------
// Injecting GLSL into ANY built-in material (keeps three.js lighting and shadows, adds your look).

/** Add a fresnel rim of light to a lit material (standard/physical/lambert). */
export function addRim<M extends THREE.Material>(m: M, hex: string, power = 3, strength = 1.5): M {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRimCol = { value: lin(hex) };
    sh.uniforms.uRimPow = { value: power };
    sh.uniforms.uRimStr = { value: strength };
    sh.fragmentShader = 'uniform vec3 uRimCol; uniform float uRimPow; uniform float uRimStr;\n' + sh.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
       totalEmissiveRadiance += uRimCol * uRimStr * pow(1.0 - clamp(dot(normalize(normal), normalize(vViewPosition)), 0.0, 1.0), uRimPow);`);
  };
  m.customProgramCacheKey = () => `rim-${hex}-${power}-${strength}`;
  return m;
}

/** Add world-space noise to a lit material's colour (stone, concrete, printed stock, dirt). */
export function addGrain<M extends THREE.Material>(m: M, amount = 0.12, scale = 6): M {
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uGrainAmt = { value: amount };
    sh.uniforms.uGrainScale = { value: scale };
    sh.vertexShader = 'varying vec3 vGrainPos;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vGrainPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = `varying vec3 vGrainPos; uniform float uGrainAmt; uniform float uGrainScale;\n${LOOK_GLSL.replace(/uniform float uTime; uniform float uBeat; uniform vec3 uLightDir;/, '')}\n` + sh.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
       diffuseColor.rgb *= 1.0 + uGrainAmt * (lk_fbm(vGrainPos * uGrainScale) - 0.5) * 2.0;`);
  };
  m.customProgramCacheKey = () => `grain-${amount}-${scale}`;
  return m;
}
