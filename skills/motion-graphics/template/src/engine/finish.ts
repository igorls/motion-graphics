// A cinematic finish for a 3D stage, as two passes. Finish reads the stage's colour and depth: soft contact
// shadows, a light you can see in the air (a key beam and a point glow, marched through drifting dust), steam,
// rain and a night sky wherever depth is empty. Lens then focuses it, or pulls it into radial speed streaks.
// A starting look: retune the sky, grade and levels per piece. keyCol is about intensity * 0.015.
import * as THREE from 'three';
import { FSPass, makeRT } from './gl';

const FINISH = /* glsl */ `
uniform sampler2D color, depthT;
uniform mat4 invProj, camW;
uniform float proj11, t, frame, steam, rain, night, aoAmt;
uniform vec3 keyPos, keyDir, keyCol, glowPos, glowCol;
uniform float keyCos;
float ign(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
float h31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }
float n3(vec3 p) {
  vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h31(i), h31(i + vec3(1, 0, 0)), f.x), mix(h31(i + vec3(0, 1, 0)), h31(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h31(i + vec3(0, 0, 1)), h31(i + vec3(1, 0, 1)), f.x), mix(h31(i + vec3(0, 1, 1)), h31(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
vec3 viewAt(vec2 uv) {
  vec4 p = invProj * vec4(uv * 2.0 - 1.0, texture(depthT, uv).r * 2.0 - 1.0, 1.0);
  return p.xyz / p.w;
}
// the night outside: a low glow of the city, its lights out of focus, and cloud above
vec3 sky(vec3 d) {
  float up = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);
  vec3 c = mix(vec3(0.0075, 0.0105, 0.019), vec3(0.0016, 0.0024, 0.0055), smoothstep(0.42, 0.8, up));
  c += vec3(0.014, 0.0095, 0.012) * exp(-pow((up - 0.47) * 13.0, 2.0));
  c *= 0.75 + 0.5 * fbm(vec2(atan(d.x, -d.z) * 3.0 + t * 0.01, d.y * 7.0));
  vec2 g = vec2(atan(d.x, -d.z) * 46.0, d.y * 150.0), id = floor(g), f = fract(g) - 0.5;
  float on = step(0.93, hash12(id)) * smoothstep(0.56, 0.44, up);
  c += vec3(1.0, 0.78, 0.6) * on * smoothstep(0.42, 0.2, length(f)) * 0.09 * (0.4 + hash12(id + 3.0));
  return c;
}
void main() {
  vec2 uv = vUv;
  vec3 col = texture(color, uv).rgb;
  float raw = texture(depthT, uv).r, sky1 = step(0.99999, raw);
  vec3 P = viewAt(uv);
  float jit = ign(gl_FragCoord.xy + frame * 5.588238);
  vec4 fw = invProj * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
  vec3 ray = normalize((camW * vec4(fw.xyz / fw.w, 0.0)).xyz), ro = camW[3].xyz;

  float ao = 1.0;
  if (sky1 < 0.5) {
    vec3 N = normalize(cross(dFdx(P), dFdy(P)));
    float R = 1.15, rad = R * proj11 * 0.5 / max(-P.z, 0.5), sum = 0.0;
    for (int i = 0; i < 16; i++) {
      float a = (float(i) + jit) * 2.399963, r = sqrt((float(i) + 0.5) / 16.0);
      vec2 o = vec2(cos(a) * uRes.y / uRes.x, sin(a)) * r * rad;
      vec3 v = viewAt(uv + o) - P;
      float l = length(v);
      sum += max(dot(N, v / max(l, 1e-3)) - 0.08, 0.0) * smoothstep(R * 1.6, R * 0.4, l);
    }
    ao = 1.0 - clamp(sum / 16.0 * 2.6, 0.0, 0.85) * aoAmt;
    col *= mix(ao, 1.0, smoothstep(0.9, 1.6, luma(col)));
  } else {
    col = sky(ray);
  }

  // light in the air: march to the surface through drifting dust
  float end = sky1 > 0.5 ? 70.0 : min(length(P), 90.0), stepL = end / 22.0;
  vec3 scatter = vec3(0.0);
  for (int i = 0; i < 22; i++) {
    vec3 p = ro + ray * (float(i) + jit) * stepL;
    float dust = n3(p * 0.42 + vec3(t * 0.05, -t * 0.08, t * 0.03)) * 0.7 + n3(p * 1.3 - vec3(0.0, t * 0.12, 0.0)) * 0.3;
    dust = 0.25 + dust * dust * 2.0;
    vec3 v = p - keyPos; float d = length(v);
    float cone = smoothstep(keyCos, keyCos + 0.1, dot(v / max(d, 1e-3), keyDir));
    vec3 s = keyCol * cone / (1.0 + d * d * 0.12);
    float steamD = steam * smoothstep(5.5, 0.0, abs(p.y - keyPos.y + 7.0)) * pow(n3(p * vec3(0.5, 0.26, 0.5) - vec3(0.0, t * 0.7, 0.0)), 2.0) * 3.0;
    vec3 g = p - glowPos; float gd = dot(g, g);
    scatter += (s * (dust + steamD) + glowCol * dust / (0.1 + gd * 1.6)) * stepL;
  }
  col += scatter * 0.035;

  // rain, seen against the dark: long thin streaks falling across the frame
  if (rain > 0.0) {
    vec2 q = FRAG_PX / uRes.y;
    for (int i = 0; i < 3; i++) {
      float s = 1.0 + float(i) * 0.7;
      vec2 r = vec2(q.x * 150.0 * s + q.y * 7.0, q.y * 2.4 * s + t * (3.4 + s));
      vec2 id = floor(r), f = fract(r);
      float on = step(0.86, hash12(id)) * smoothstep(0.5, 0.2, abs(f.x - 0.5)) * smoothstep(0.0, 0.3, f.y) * smoothstep(1.0, 0.7, f.y);
      col += vec3(0.5, 0.6, 0.8) * on * rain * 0.022;
    }
  }
  // the grade: cool shadows, warm light, and blacks that are never empty
  float l = luma(col);
  col = mix(col * vec3(0.86, 0.95, 1.16), col * vec3(1.05, 0.995, 0.93), smoothstep(0.02, 0.5, l));
  col += vec3(0.0012, 0.0016, 0.003);
  fragColor = vec4(col, 1.0);
}`;

const LENS = /* glsl */ `
uniform sampler2D src, depthT;
uniform mat4 invProj;
uniform float focus, aperture, speed, kick;
float cocAt(vec2 uv) {
  vec4 p = invProj * vec4(uv * 2.0 - 1.0, texture(depthT, uv).r * 2.0 - 1.0, 1.0);
  float d = -p.z / p.w;
  return clamp(abs(d - focus) / max(d, 0.1) * aperture, 0.0, 15.0);
}
void main() {
  vec2 uv = vUv, px = 1.0 / uRes;
  vec3 c = vec3(0.0); float w = 0.0;
  if (speed > 0.0) {
    // the lift: everything streams out of the point it is flying to
    vec2 d = (uv - 0.5);
    for (int i = 0; i < 14; i++) { float k = 1.0 - speed * 0.16 * (float(i) + 0.5) / 14.0 * smoothstep(0.03, 0.5, length(d)); c += texture(src, 0.5 + d * k).rgb; w += 1.0; }
    fragColor = vec4(c / w, 1.0); return;
  }
  float coc = cocAt(uv);
  for (int i = 0; i < 22; i++) {
    float a = float(i) * 2.399963, r = sqrt((float(i) + 0.5) / 22.0);
    vec2 q = uv + vec2(cos(a), sin(a)) * r * coc * px;
    float cw = 0.25 + smoothstep(0.0, 1.0, cocAt(q) / max(coc, 0.5));
    vec3 s = texture(src, q).rgb;
    c += s * cw * (1.0 + luma(s) * 1.4); w += cw * (1.0 + luma(s) * 1.4);
  }
  fragColor = vec4(c / w, 1.0);
}`;

export class Finish {
  rt = makeRT();
  a = new FSPass(FINISH, {
    color: { value: null }, depthT: { value: null }, invProj: { value: new THREE.Matrix4() }, camW: { value: new THREE.Matrix4() },
    proj11: { value: 1 }, t: { value: 0 }, frame: { value: 0 }, steam: { value: 0 }, rain: { value: 0 }, night: { value: 0 }, aoAmt: { value: 1 },
    keyPos: { value: new THREE.Vector3() }, keyDir: { value: new THREE.Vector3(0, -1, 0) }, keyCol: { value: new THREE.Vector3() }, keyCos: { value: 0.7 },
    glowPos: { value: new THREE.Vector3() }, glowCol: { value: new THREE.Vector3() },
  });
  b = new FSPass(LENS, {
    src: { value: null }, depthT: { value: null }, invProj: { value: new THREE.Matrix4() }, focus: { value: 20 }, aperture: { value: 0 }, speed: { value: 0 }, kick: { value: 0 },
  });

  run(r: THREE.WebGLRenderer, color: THREE.Texture, depth: THREE.Texture, cam: THREE.PerspectiveCamera, out: THREE.WebGLRenderTarget) {
    const u = this.a.u, v = this.b.u;
    u.color!.value = color; u.depthT!.value = depth;
    (u.invProj!.value as THREE.Matrix4).copy(cam.projectionMatrixInverse);
    (u.camW!.value as THREE.Matrix4).copy(cam.matrixWorld);
    u.proj11!.value = cam.projectionMatrix.elements[5];
    this.a.render(r, this.rt);
    v.src!.value = this.rt.texture; v.depthT!.value = depth;
    (v.invProj!.value as THREE.Matrix4).copy(cam.projectionMatrixInverse);
    this.b.render(r, out);
  }
}
