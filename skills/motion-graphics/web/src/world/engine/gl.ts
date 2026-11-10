// GPU building blocks for a live, resizable canvas: fullscreen shader passes and HDR render
// targets. Colours inside the pipeline are LINEAR and may exceed 1 (that is what blooms).
// The web counterpart of the motion engine's gl.ts: sizes come from the viewport, not a format.
import * as THREE from 'three';

/** Prepended to every FSPass fragment shader. */
export const GLSL_COMMON = /* glsl */ `
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform vec2 uRes;      // physical px of the target
float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
vec3 sat(vec3 c) { return clamp(c, 0.0, 1.0); }
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
vec3 toLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
`;

const VERT = /* glsl */ `
in vec3 position;
out vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const TRI = new THREE.BufferGeometry();
TRI.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
const CAM = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

type Uniforms = Record<string, THREE.IUniform>;

/** A fullscreen GLSL3 fragment pass. Write `void main(){ fragColor = ...; }` using vUv. */
export class FSPass {
  mat: THREE.RawShaderMaterial;
  u: Uniforms;
  private scene = new THREE.Scene();
  constructor(frag: string, uniforms: Uniforms = {}, opts: Partial<THREE.ShaderMaterialParameters> = {}) {
    this.u = { uRes: { value: new THREE.Vector2(1, 1) }, ...uniforms };
    this.mat = new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3, vertexShader: VERT, fragmentShader: GLSL_COMMON + frag, uniforms: this.u,
      depthTest: false, depthWrite: false, blending: THREE.NoBlending, ...opts,
    });
    const mesh = new THREE.Mesh(TRI, this.mat);
    mesh.frustumCulled = false;
    this.scene.add(mesh);
  }
  render(r: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget | null) {
    if (target) (this.u.uRes!.value as THREE.Vector2).set(target.width, target.height);
    else { const v = r.getDrawingBufferSize(new THREE.Vector2()); (this.u.uRes!.value as THREE.Vector2).copy(v); }
    r.setRenderTarget(target);
    r.render(this.scene, CAM);
  }
  dispose() { this.mat.dispose(); }
}

/** An HDR (half-float, linear) render target in physical px. */
export function makeRT(w: number, h: number, o: { depth?: boolean; samples?: number; type?: THREE.TextureDataType } = {}) {
  return new THREE.WebGLRenderTarget(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)), {
    type: o.type ?? THREE.HalfFloatType, depthBuffer: o.depth ?? false, samples: o.samples ?? 0,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, colorSpace: THREE.NoColorSpace,
  });
}

export function resizeRT(rt: THREE.WebGLRenderTarget, w: number, h: number) {
  const W = Math.max(1, Math.round(w)), H = Math.max(1, Math.round(h));
  if (rt.width !== W || rt.height !== H) rt.setSize(W, H);
}

/** Load and decode an image. */
export async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  await img.decode();
  return img;
}
