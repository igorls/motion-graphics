// Procedural surfaces. Each stays a real lit material (light, shadow, reflections) with a
// shader written into it: colour, relief and gloss computed from world position, so no two walls match
// and nothing needs a texture file.
import * as THREE from 'three';

const NOISE = /* glsl */ `
float sf_h(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float sf_n(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(sf_h(i), sf_h(i + vec2(1, 0)), f.x), mix(sf_h(i + vec2(0, 1)), sf_h(i + vec2(1, 1)), f.x), f.y); }
float sf_f(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * sf_n(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
`;

/** Each body sets: base (colour multiplier), rough (roughness multiplier), h (height, for relief). Reads uv, P, tint. */
const BODIES = {
  // printed paper: a repeating lattice of flowers, a darker dado, damp rising from the skirting
  wallpaper: /* glsl */ `
    vec2 c = uv / vec2(1.1, 1.5); vec2 id = floor(c); vec2 f = fract(c) - 0.5; f.x += mod(id.y, 2.0) * 0.0;
    vec2 q = abs(f);
    float petal = abs(sin(atan(f.y, f.x) * 4.0)) * 0.3 + 0.1;
    float motif = smoothstep(0.012, 0.0, abs(length(f) - petal)) + smoothstep(0.03, 0.0, abs(q.x + q.y - 0.47));
    float seam = smoothstep(0.012, 0.0, abs(fract(uv.x / 2.2) - 0.5) - 0.0);
    float damp = smoothstep(2.2, 0.0, P.y - floorY) * sf_f(uv * vec2(0.7, 0.35) + 3.0);
    base = (0.82 + 0.26 * sf_f(uv * 0.5)) * (1.0 + 0.3 * motif) * (1.0 - 0.28 * damp) * (1.0 - 0.15 * seam);
    rough = 1.0 - 0.3 * motif; h = motif * 0.05;`,
  // old plaster: mottled, with hairline cracks
  plaster: /* glsl */ `
    float m = sf_f(uv * 0.55), crack = smoothstep(0.022, 0.0, abs(sf_f(uv * 0.8 + 7.0) - 0.5));
    base = (0.72 + 0.56 * m) * (1.0 - 0.42 * crack) * (1.0 - 0.25 * smoothstep(1.6, 0.0, P.y - floorY));
    rough = 1.0; h = m * 0.16 - crack * 0.08;`,
  // boards: staggered planks, long grain, polish worn in the middle
  boards: /* glsl */ `
    vec2 c = uv * vec2(0.28, 2.2); float row = floor(c.y); c.x += sf_h(vec2(row, 3.0)) * 7.0;
    float plank = floor(c.x), edge = max(smoothstep(0.03, 0.0, fract(c.y)), smoothstep(0.012, 0.0, fract(c.x)));
    float grain = sf_f(vec2(c.x * 2.0, (c.y + plank) * 22.0));
    base = (0.62 + 0.72 * grain) * (0.75 + 0.5 * sf_h(vec2(plank, row))) * (1.0 - 0.75 * edge);
    rough = 0.42 + 0.5 * sf_f(uv * 0.4) ; h = -edge * 0.07 + grain * 0.02;`,
  // checker tile with grout, a lobby floor, polished
  tile: /* glsl */ `
    vec2 c = uv / 1.1, f = fract(c); float k = mod(floor(c.x) + floor(c.y), 2.0);
    float grout = smoothstep(0.035, 0.015, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
    base = mix(0.22, 1.25, k) * (0.86 + 0.28 * sf_f(uv * 1.4)) * (1.0 - 0.55 * grout);
    rough = 0.24 + 0.34 * sf_f(uv * 0.7) + grout * 0.6; h = -grout * 0.05;`,
  // poured concrete: shutter lines, tie holes, rain stains
  concrete: /* glsl */ `
    float line = smoothstep(0.016, 0.0, abs(fract(uv.y / 1.15) - 0.5)) * 0.6, stain = sf_f(vec2(uv.x * 0.8, uv.y * 0.12));
    vec2 tie = fract(uv / vec2(2.3, 1.15)) - 0.5;
    float hole = smoothstep(0.045, 0.03, length(tie));
    base = (0.6 + 0.7 * stain) * (1.0 - 0.3 * line) * (1.0 - 0.6 * hole) * (0.85 + 0.3 * sf_f(uv * 3.0));
    rough = 1.0; h = -line * 0.05 - hole * 0.1 + sf_n(uv * 9.0) * 0.015;`,
  // a ledger page: ruled lines, the soft tooth of old paper
  ledger: /* glsl */ `
    float rule = smoothstep(0.012, 0.0, abs(fract(uv.y / 0.68 + 0.42) - 0.5));
    base = (0.9 + 0.16 * sf_f(uv * 2.2)) * (1.0 - 0.16 * rule);
    rough = 1.0; h = sf_n(uv * 42.0) * 0.006;`,
  // brick: every brick its own, soot from above
  brick: /* glsl */ `
    float pit = sf_f(uv * 5.0), soot = sf_f(uv * 0.3 + 5.0);
    base = (0.68 + 0.6 * pit) * (0.55 + 0.75 * soot);
    rough = 1.0; h = pit * 0.1;`,
  // worked metal: brushed along its length, dull patches, rust where water sits
  metal: /* glsl */ `
    float br = sf_n(vec2(uv.x * 2.0, uv.y * 60.0)), patch1 = sf_f(uv * 0.7), rust = smoothstep(0.56, 0.72, sf_f(uv * 1.1 + 9.0));
    base = (0.82 + 0.3 * patch1) * mix(1.0, 0.55, rust);
    rough = 0.55 + 0.55 * patch1 + 0.3 * br + 1.2 * rust; h = br * 0.008 + rust * 0.03;`,
};
export type SurfaceKind = keyof typeof BODIES;

export function surface(kind: SurfaceKind, hex: string, o: { roughness?: number; metalness?: number; floorY?: number; bump?: number; env?: number } = {}) {
  const m = new THREE.MeshStandardMaterial({ color: hex, roughness: o.roughness ?? 0.8, metalness: o.metalness ?? 0, envMapIntensity: o.env ?? 0.5 });
  const floorY = o.floorY ?? 0, bump = o.bump ?? 1;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.floorY = { value: floorY }; sh.uniforms.sfBump = { value: bump };
    sh.vertexShader = 'varying vec3 sfP; varying vec3 sfN;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
      vec4 sfW = vec4(transformed, 1.0);
      #ifdef USE_INSTANCING
        sfW = instanceMatrix * sfW;
      #endif
      sfW = modelMatrix * sfW; sfP = sfW.xyz; sfN = normalize(mat3(modelMatrix) * objectNormal);`);
    sh.fragmentShader = `varying vec3 sfP; varying vec3 sfN; uniform float floorY; uniform float sfBump;\n${NOISE}
      void sfEval(in vec3 P, in vec2 uv, out float base, out float rough, out float h) { base = 1.0; rough = 1.0; h = 0.0; ${BODIES[kind]} }\n` + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        vec3 sfA = abs(sfN);
        vec2 sfUv = sfA.y > 0.6 ? sfP.xz : (sfA.x > 0.6 ? sfP.zy : sfP.xy);
        float sfBase, sfRough, sfHt; sfEval(sfP, sfUv, sfBase, sfRough, sfHt);
        diffuseColor.rgb *= sfBase;`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor * sfRough, 0.05, 1.0);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        { vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
          vec3 r1 = cross(sy, normal), r2 = cross(normal, sx); float det = dot(sx, r1);
          vec3 g = sign(det) * (dFdx(sfHt) * r1 + dFdy(sfHt) * r2) * sfBump;
          normal = normalize(abs(det) * normal - g); }`);
  };
  m.customProgramCacheKey = () => `sf-${kind}-${floorY}-${bump}`;
  return m;
}

/** What the metal sees: a tiny room of softboxes, prefiltered once. */
export function studio(renderer: THREE.WebGLRenderer, scene: THREE.Scene) {
  const env = new THREE.Scene(); env.background = new THREE.Color(0x07090e);
  const panel = (hex: number, k: number, x: number, y: number, z: number, w: number, h: number) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), side: THREE.DoubleSide }));
    m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
  };
  panel(0xffe6cc, 5, 8, 14, 6, 14, 6); panel(0xcfdcff, 1.6, -14, 5, 8, 8, 12); panel(0xffffff, 1.2, 0, 3, -16, 30, 3); panel(0xff3020, 1.2, 12, -4, -6, 6, 6);
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(env, 0.03).texture;
  pm.dispose();
}

/** Rising water: a dark glassy surface whose relief moves, so the room's light slides across it. */
export function water() {
  const m = new THREE.MeshStandardMaterial({ color: '#0f1c26', roughness: 0.06, metalness: 0.15, envMapIntensity: 1.6, transparent: true, opacity: 0.86 });
  const t = { value: 0 };
  m.userData.t = t;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.wT = t;
    sh.vertexShader = 'varying vec3 wP;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n wP = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = 'varying vec3 wP; uniform float wT;\n' + sh.fragmentShader.replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
      { vec2 q = wP.xz; float a = wT * 1.7;
        vec2 g = vec2(cos(q.x * 1.9 + a) + 0.6 * cos(q.x * 4.3 - q.y * 2.1 + a * 1.6), cos(q.y * 2.3 - a * 1.2) + 0.6 * cos(q.y * 5.1 + q.x * 1.7 - a * 1.4));
        normal = normalize(normal + (viewMatrix * vec4(g.x, 0.0, g.y, 0.0)).xyz * 0.09); }`);
  };
  return m;
}
