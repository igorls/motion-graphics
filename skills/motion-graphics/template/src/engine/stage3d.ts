// A 3D stage: a three.js scene with a perspective camera that renders into the engine's HDR
// pipeline (so it gets motion blur, bloom and grain like everything else). Use it for camera moves
// through depth, parallax, type and images standing in space, instanced fields of objects.
// Everything stays a pure function of time: position the camera and objects from f.t every frame.
import * as THREE from 'three';
import { W, H, SCALE, Layer2D } from './gl';
import type { FontSpec } from '../brand';
import { font } from './type';

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

  /** Render the stage and return its texture; composite it with comp.draw(r, tex, out, { mode: 'replace', srgb: false }). */
  render(r: THREE.WebGLRenderer) {
    r.setRenderTarget(this.rt);
    r.setClearColor(this.scene.background instanceof THREE.Color ? this.scene.background : new THREE.Color(0, 0, 0), 1);
    r.clear(true, true, false);
    r.render(this.scene, this.camera);
    return this.rt.texture;
  }
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
