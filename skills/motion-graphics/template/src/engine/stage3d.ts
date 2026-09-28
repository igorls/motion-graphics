// A 3D stage: a three.js scene with a perspective camera that renders into the engine's HDR
// pipeline (so it gets motion blur, bloom and grain like everything else). Use it for camera moves
// through depth, parallax, type and images standing in space, instanced fields of objects.
// Everything stays a pure function of time: position the camera and objects from f.t every frame.
import * as THREE from 'three';
import { W, H, SCALE, Layer2D } from './gl';
import type { FontSpec } from '../brand';
import { font } from './type';
import { looks } from './looks';

export class Stage3D {
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  private rt: THREE.WebGLRenderTarget;

  /** fov in degrees (vertical). 25-40 reads cinematic; 60+ reads wide-angle and dramatic. */
  constructor(fov = 35) {
    this.camera = new THREE.PerspectiveCamera(fov, W / H, 0.1, 5000);
    this.rt = new THREE.WebGLRenderTarget(W * SCALE, H * SCALE, {
      type: THREE.HalfFloatType, depthBuffer: true, samples: 4, colorSpace: THREE.NoColorSpace,
    });
  }

  /** Linear fog towards a colour: the cheapest, strongest depth cue. near/far in world units. */
  fog(hexColor: string, near: number, far: number) {
    this.scene.fog = new THREE.Fog(new THREE.Color(hexColor), near, far);
    this.scene.background = new THREE.Color(hexColor);
    return this;
  }

  /** Aim the camera: from position (x, y, z) at target (tx, ty, tz), with an optional roll in radians. */
  look(x: number, y: number, z: number, tx: number, ty: number, tz: number, roll = 0) {
    this.camera.position.set(x, y, z);
    this.camera.up.set(Math.sin(roll), Math.cos(roll), 0);
    this.camera.lookAt(tx, ty, tz);
    return this;
  }

  private shadows = false;

  /**
   * Light the stage like a set: a sky/ground hemisphere fill plus one key light casting soft shadows.
   * Unlit (MeshBasicMaterial) planes ignore it; use `paper()`/`matte()` or any MeshStandardMaterial for
   * objects that should read as physical. Call `castShadows(obj)` on what should cast and receive.
   * `extent` is the half-size of the shadow frustum in world units (keep it tight around the set).
   */
  light(preset: LightPreset = 'studio', o: { extent?: number; target?: [number, number, number]; intensity?: number } = {}) {
    const p = LIGHTS[preset];
    const hemi = new THREE.HemisphereLight(p.sky, p.ground, p.fill * (o.intensity ?? 1));
    const key = new THREE.DirectionalLight(p.key, p.keyI * (o.intensity ?? 1));
    const [tx, ty, tz] = o.target ?? [0, 0, 0];
    key.position.set(tx + p.dir[0] * 40, ty + p.dir[1] * 40, tz + p.dir[2] * 40);
    key.target.position.set(tx, ty, tz);
    key.castShadow = true;
    const e = o.extent ?? 20, cam = key.shadow.camera;
    cam.left = -e; cam.right = e; cam.top = e; cam.bottom = -e; cam.near = 1; cam.far = 120;
    key.shadow.mapSize.set(4096, 4096);
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.03;
    key.shadow.radius = 6;
    this.scene.add(hemi, key, key.target);
    looks.lightDir.value.set(p.dir[0], p.dir[1], p.dir[2]).normalize(); // custom looks shade from the same key
    this.shadows = true;
    return { hemi, key };
  }

  /**
   * Render the stage and return its texture; composite it with comp.draw(r, tex, out, { mode: 'replace', srgb: false }).
   * Pass the frame so time-driven looks (looks.ts) animate deterministically.
   */
  render(r: THREE.WebGLRenderer, f?: { t: number; beat: number }) {
    if (f) { looks.time.value = f.t; looks.beat.value = f.beat; }
    if (this.shadows && !r.shadowMap.enabled) {
      r.shadowMap.enabled = true;
      r.shadowMap.type = THREE.VSMShadowMap; // soft penumbrae that respect shadow.radius
    }
    r.setRenderTarget(this.rt);
    r.setClearColor(this.scene.background instanceof THREE.Color ? this.scene.background : new THREE.Color(0, 0, 0), 1);
    r.clear(true, true, false);
    r.render(this.scene, this.camera);
    return this.rt.texture;
  }
}

export type LightPreset = 'studio' | 'daylight' | 'dusk' | 'night';
const LIGHTS: Record<LightPreset, { sky: string; ground: string; fill: number; key: string; keyI: number; dir: [number, number, number] }> = {
  studio: { sky: '#ffffff', ground: '#b9b3a8', fill: 1.3, key: '#fff4e6', keyI: 2.4, dir: [-0.55, 1, 0.65] },
  daylight: { sky: '#d6e6ff', ground: '#cdbd9f', fill: 1.5, key: '#fff0d2', keyI: 3.2, dir: [0.6, 1, 0.35] },
  dusk: { sky: '#7084c0', ground: '#1b2031', fill: 0.8, key: '#ffb27a', keyI: 1.9, dir: [-1, 0.32, 0.45] },
  night: { sky: '#26345c', ground: '#06080e', fill: 0.35, key: '#a4bcff', keyI: 0.9, dir: [0.3, 1, 0.25] },
};

/** Make every mesh under `obj` cast and receive shadows. */
export function castShadows(obj: THREE.Object3D) {
  obj.traverse((m) => { if ((m as THREE.Mesh).isMesh) { m.castShadow = true; m.receiveShadow = true; } });
  return obj;
}

/**
 * Card stock / paper: a matte physical material with a procedural fibre-and-mottle texture (seeded,
 * so every render is identical). `repeat` tiles it; `grain` 0..1 sets how visible the fibres are.
 * The difference between "grey-box render" and "a real paper model" is mostly this plus the light.
 */
export function paper(hex: string, o: { repeat?: number; grain?: number; roughness?: number } = {}) {
  const tex = paperTexture(hex, o.grain ?? 0.5);
  tex.repeat.setScalar(o.repeat ?? 1);
  const bump = paperTexture('#808080', 1);
  bump.repeat.setScalar(o.repeat ?? 1);
  return new THREE.MeshStandardMaterial({ map: tex, bumpMap: bump, bumpScale: 0.6, roughness: o.roughness ?? 0.92, metalness: 0 });
}

/** A plain matte physical material (plastic, painted wood, clay). */
export function matte(hex: string, roughness = 0.8) {
  return new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness, metalness: 0 });
}

/** A large ground plane that receives shadows (contact shadows ground objects in the set). */
export function ground(material: THREE.Material, size = 200) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), material);
  m.rotation.x = -Math.PI / 2;
  m.receiveShadow = true;
  return m;
}

function paperTexture(hex: string, grain: number) {
  const N = 512, cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const c = cv.getContext('2d')!;
  c.fillStyle = hex; c.fillRect(0, 0, N, N);
  let s = 1234567;
  const rnd = () => ((s = (s * 1103515245 + 12345) >>> 0) / 4294967296);
  // soft mottling
  for (let i = 0; i < 220; i++) {
    const x = rnd() * N, y = rnd() * N, r = 20 + rnd() * 70, a = (rnd() - 0.5) * 0.06 * grain;
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, a > 0 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${-a})`); g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // fibres
  c.lineCap = 'round';
  for (let i = 0; i < 2600; i++) {
    const x = rnd() * N, y = rnd() * N, len = 3 + rnd() * 14, ang = rnd() * Math.PI;
    c.strokeStyle = rnd() > 0.5 ? `rgba(255,255,255,${0.10 * grain})` : `rgba(0,0,0,${0.08 * grain})`;
    c.lineWidth = 0.6 + rnd() * 0.8;
    c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); c.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = hex === '#808080' ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Text as a plane in 3D: set once with Canvas2D (kerning, brand font), shown as a textured quad.
 * `height` is the plane's height in world units; width follows the text. Unlit (MeshBasicMaterial),
 * so it keeps its exact colour; `glow` > 1 pushes it into bloom.
 */
export function textPlane(text: string, spec: FontSpec, o: { px?: number; weight?: number | string; color?: string; height?: number; glow?: number; pad?: number } = {}) {
  const px = o.px ?? 160, pad = o.pad ?? px * 0.2;
  const probe = new Layer2D(8, 8, 1).ctx;
  probe.font = font(spec, px, o.weight ?? 700);
  const w = Math.ceil(probe.measureText(text).width + pad * 2), h = Math.ceil(px * 1.3 + pad * 2);
  const layer = new Layer2D(w, h, 2);
  const c = layer.clear();
  c.font = font(spec, px, o.weight ?? 700);
  c.fillStyle = o.color ?? '#ffffff';
  c.textBaseline = 'middle';
  c.fillText(text, pad, h / 2);
  return planeFromCanvas(layer.canvas, (o.height ?? 1) * (w / h), o.height ?? 1, o.glow);
}

/** An image (photo, screenshot, UI) as a plane `height` world units tall. */
export function imagePlane(img: CanvasImageSource & { width: number; height: number }, height = 1, glow?: number) {
  return planeFromCanvas(img, height * (img.width / img.height), height, glow);
}

function planeFromCanvas(src: CanvasImageSource, w: number, h: number, glow = 1) {
  const tex = new THREE.Texture(src as HTMLCanvasElement);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, side: THREE.DoubleSide });
  mat.color.setScalar(glow);
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  return mesh;
}
