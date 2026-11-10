// A graphic ground: one plane drawn by a shader, 2D marks in 3D space. A warped line grid and a
// halftone field whose dots grow with a density (procedural noise by default; pass your own data as
// a texture, red channel 0..1, centred on the origin). By day it's ink on paper; at night the dots
// become points of light, warm and cool, a few breathing. It fades into the sky with distance.
// Nothing to model and nothing to light: the shader is the look, and it follows the hour.
import * as THREE from 'three';
import { light } from './light';

export interface FieldOptions {
  /** Height of the plane (world units). */
  y?: number;
  /** Halftone cell size, and the line grid's spacing (world units). */
  cell?: number;
  grid?: number;
  /** Side of the plane (world units). */
  extent?: number;
  /** Your data: density in the red channel, covering `densitySize` world units around the origin. */
  density?: THREE.Texture | null;
  densitySize?: number;
}

export function graphicField(o: FieldOptions = {}) {
  const uniforms = {
    uCell: { value: o.cell ?? 0.42 },
    uGrid: { value: o.grid ?? 2.4 },
    uDensity: { value: o.density ?? null },
    uUseTex: { value: o.density ? 1 : 0 },
    uDensitySize: { value: o.densitySize ?? 40 },
    uTime: { value: 0 },
    /** A light pooling on the ground (an object's glow): position, and colour * intensity. */
    uGlowPos: { value: new THREE.Vector3() },
    uGlow: { value: new THREE.Vector3() },
    ...light.uniforms,
  };
  const geo = new THREE.PlaneGeometry(o.extent ?? 400, o.extent ?? 400);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `varying vec3 vP; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vP = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: /* glsl */ `
      uniform float uCell, uGrid, uUseTex, uDensitySize, uTime; uniform sampler2D uDensity; uniform vec3 uGlowPos, uGlow;
      varying vec3 vP;
      ${light.glsl}
      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float noise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + 1.0), f.x), f.y); }
      float densityAt(vec2 xz) {
        float n = noise(xz * 0.12) * 0.65 + noise(xz * 0.37 + 4.0) * 0.35;
        float procedural = smoothstep(0.35, 0.85, n) * exp(-length(xz) / 60.0);
        return mix(procedural, texture(uDensity, xz / uDensitySize + 0.5).r, uUseTex);
      }
      void main() {
        vec2 xz = vP.xz;
        // a gently warped line grid
        vec2 q = (xz + vec2(sin(xz.y * 0.09) * 1.2, sin(xz.x * 0.08) * 1.0)) / uGrid;
        vec2 fq = abs(fract(q) - 0.5) * uGrid;
        float line = 1.0 - smoothstep(0.015, 0.05 + fwidth(q.x) * uGrid, uGrid * 0.5 - max(fq.x, fq.y));
        // halftone: one dot per cell, sized by the density at the cell's centre
        vec2 g = xz / uCell, id = floor(g), f = fract(g) - 0.5;
        float dens = densityAt((id + 0.5) * uCell);
        float r = step(0.02, dens) * mix(0.08, 0.44, sqrt(dens));
        float d = length(f), aa = fwidth(d) * 1.2;
        float dotv = 1.0 - smoothstep(r - aa, r + aa, d);
        // far away the cells get smaller than a pixel: settle to their average coverage instead of shimmering
        dotv = mix(dotv, 3.14159 * r * r, smoothstep(0.3, 0.7, length(fwidth(g))));
        // day: ink on warm paper, tinted by the hour
        vec3 tint = clamp(uSunCol * 0.42 + uSkyCol * 1.1, 0.0, 1.4);
        vec3 day = srgb2lin(vec3(0.957, 0.937, 0.906)) * mix(vec3(1.0), tint, 0.55);
        day = mix(day, srgb2lin(vec3(0.70, 0.645, 0.585)) * mix(vec3(1.0), tint, 0.35), line * 0.8);
        day = mix(day, srgb2lin(vec3(0.43, 0.39, 0.35)) * mix(vec3(1.0), tint, 0.3), dotv * mix(0.55, 0.95, dens));
        // night: the dots are points of light (not all lit, a few breathing)
        float lit = step(0.32, hash(id + 7.7)) * step(0.02, dens);
        vec3 lamp = mix(srgb2lin(vec3(0.72, 0.80, 1.0)), srgb2lin(vec3(1.0, 0.70, 0.40)), step(0.28, hash(id + 1.3)));
        float breathe = 0.78 + 0.22 * sin(uTime * (0.4 + hash(id + 3.1) * 0.8) + hash(id) * 6.2832);
        vec3 night = srgb2lin(vec3(0.05, 0.068, 0.12)) + srgb2lin(vec3(0.10, 0.13, 0.22)) * line + lamp * dotv * lit * breathe * mix(0.45, 2.0, dens);
        vec3 col = mix(day, night, smoothstep(0.25, 0.85, uNight));
        float dr = length(xz - uGlowPos.xz);
        col += uGlow * (exp(-dr * dr / 60.0) * 0.55 + dotv * exp(-dr * dr / 140.0) * 0.6);
        gl_FragColor = vec4(haze(col, vP), 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = o.y ?? 0;
  mesh.frustumCulled = false;
  return { mesh, uniforms, tick(t: number) { uniforms.uTime.value = t; } };
}
