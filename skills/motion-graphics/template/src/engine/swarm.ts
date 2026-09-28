// Swarm: thousands of instances that fly between formations (a scattered cloud, the product's name,
// the logo, a grid, a sphere) with per-instance stagger and arcing paths. The classic "how did they do
// that" moment: everything assembles into the brand on the drop. GPU instanced, and every position is
// a closed-form function of time, so it renders deterministically with motion blur.
import * as THREE from 'three';
import { Layer2D } from './gl';
import { font } from './type';
import type { FontSpec } from '../brand';
import { clamp, ease as E, mulberry32, type Ease } from './util';

export type Points = Float32Array; // xyz triplets, world units

/** A formation change: from layout A to layout B, starting at t0, each instance taking `dur` seconds. */
export interface Move { to: Points; t0: number; dur: number; ease?: Ease; stagger?: number; arc?: number; order?: 'random' | 'x' | 'y' | 'radial' }

export class Swarm {
  mesh: THREE.InstancedMesh;
  private moves: (Move & { from: Points; delay: Float32Array; lift: Float32Array })[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private v = new THREE.Vector3();
  private rnd: () => number;

  /** `count` instances of `geometry` with `material`, starting in `start` formation. `size` scales each instance. */
  constructor(public count: number, geometry: THREE.BufferGeometry, material: THREE.Material, public start: Points, public size = 1, seed = 7) {
    this.mesh = new THREE.InstancedMesh(geometry, material, count);
    this.mesh.frustumCulled = false;
    this.rnd = mulberry32(seed);
  }

  /** Queue a formation change; moves chain in time order (each starts from the previous one's target). */
  to(move: Move) {
    const from = this.moves.length ? this.moves[this.moves.length - 1]!.to : this.start;
    const n = this.count, delay = new Float32Array(n), lift = new Float32Array(n);
    const key = (i: number) => {
      const o = move.order ?? 'random';
      if (o === 'x') return (move.to[i * 3]! - minOf(move.to, 0)) / Math.max(1e-6, maxOf(move.to, 0) - minOf(move.to, 0));
      if (o === 'y') return 1 - (move.to[i * 3 + 1]! - minOf(move.to, 1)) / Math.max(1e-6, maxOf(move.to, 1) - minOf(move.to, 1));
      if (o === 'radial') { const r = Math.hypot(move.to[i * 3]!, move.to[i * 3 + 1]!); return r / Math.max(1e-6, maxRadius(move.to)); }
      return this.rnd();
    };
    for (let i = 0; i < n; i++) { delay[i] = key(i) * (move.stagger ?? 0.4); lift[i] = (this.rnd() - 0.5) * 2; }
    this.moves.push({ ...move, from, delay, lift });
    return this;
  }

  /** Place every instance for time t. `spin` tumbles instances while they fly (radians per unit progress). */
  update(t: number, o: { spin?: number; jitter?: number } = {}) {
    const n = this.count;
    for (let i = 0; i < n; i++) {
      let x = this.start[i * 3]!, y = this.start[i * 3 + 1]!, z = this.start[i * 3 + 2]!, fly = 0;
      for (const mv of this.moves) {
        const k = clamp((t - mv.t0 - mv.delay[i]!) / mv.dur);
        if (k <= 0) break;
        const e = (mv.ease ?? E.inOutCubic)(k);
        const ax = mv.from[i * 3]!, ay = mv.from[i * 3 + 1]!, az = mv.from[i * 3 + 2]!;
        const bx = mv.to[i * 3]!, by = mv.to[i * 3 + 1]!, bz = mv.to[i * 3 + 2]!;
        const arc = Math.sin(Math.PI * e) * (mv.arc ?? 1.5);
        x = ax + (bx - ax) * e + mv.lift[i]! * arc * 0.5;
        y = ay + (by - ay) * e + arc;
        z = az + (bz - az) * e + mv.lift[i]! * arc;
        fly = k < 1 ? Math.sin(Math.PI * k) : 0;
      }
      const spin = (o.spin ?? 2) * fly;
      this.e.set(spin * 1.3 + i, spin + i * 0.7, spin * 0.6);
      this.q.setFromEuler(this.e);
      this.s.setScalar(this.size * (1 + 0.15 * fly));
      this.m.compose(this.v.set(x, y, z), this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

const minOf = (p: Points, a: number) => { let m = Infinity; for (let i = a; i < p.length; i += 3) m = Math.min(m, p[i]!); return m; };
const maxOf = (p: Points, a: number) => { let m = -Infinity; for (let i = a; i < p.length; i += 3) m = Math.max(m, p[i]!); return m; };
const maxRadius = (p: Points) => { let m = 0; for (let i = 0; i < p.length; i += 3) m = Math.max(m, Math.hypot(p[i]!, p[i + 1]!)); return m; };

// ---- formations ----

/** `count` points inside a box (w x h x d) centred at the origin. */
export function cloud(count: number, w: number, h: number, d: number, seed = 1): Points {
  const r = mulberry32(seed), p = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { p[i * 3] = (r() - 0.5) * w; p[i * 3 + 1] = (r() - 0.5) * h; p[i * 3 + 2] = (r() - 0.5) * d; }
  return p;
}

/** A flat grid of `count` points, `cols` wide, `gap` apart, centred, in the z = 0 plane. */
export function grid(count: number, cols: number, gap: number): Points {
  const p = new Float32Array(count * 3), rows = Math.ceil(count / cols);
  for (let i = 0; i < count; i++) { p[i * 3] = (i % cols - (cols - 1) / 2) * gap; p[i * 3 + 1] = ((rows - 1) / 2 - Math.floor(i / cols)) * gap; p[i * 3 + 2] = 0; }
  return p;
}

/** Points on a sphere of radius r (golden spiral: even spacing). */
export function sphere(count: number, r: number): Points {
  const p = new Float32Array(count * 3), g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2, rad = Math.sqrt(1 - y * y), th = g * i;
    p[i * 3] = Math.cos(th) * rad * r; p[i * 3 + 1] = y * r; p[i * 3 + 2] = Math.sin(th) * rad * r;
  }
  return p;
}

/**
 * `count` points filling the glyphs of `text` (or any shape drawn by `draw`), `width` world units wide,
 * centred, in the z = 0 plane. Sampled on an even jittered grid, so the shape reads at any count.
 */
export function pointsFromText(text: string, spec: FontSpec, count: number, width: number, weight: number | string = 800, seed = 3): Points {
  return pointsFromCanvas(count, width, seed, (c, W, H) => {
    let px = H * 0.8;
    c.font = font(spec, px, weight);
    const w = c.measureText(text).width;
    if (w > W * 0.96) { px *= (W * 0.96) / w; c.font = font(spec, px, weight); }
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff';
    c.fillText(text, W / 2, H / 2);
  });
}

/** `count` points filling the opaque pixels of an image (a logo), `width` world units wide. */
export function pointsFromImage(img: CanvasImageSource & { width: number; height: number }, count: number, width: number, seed = 5): Points {
  return pointsFromCanvas(count, width, seed, (c, W, H) => {
    const s = Math.min(W / img.width, H / img.height) * 0.96;
    c.drawImage(img, (W - img.width * s) / 2, (H - img.height * s) / 2, img.width * s, img.height * s);
  }, img.height / img.width);
}

function pointsFromCanvas(count: number, width: number, seed: number, draw: (c: CanvasRenderingContext2D, W: number, H: number) => void, aspect = 0.25): Points {
  const W = 1200, H = Math.round(W * aspect);
  const layer = new Layer2D(W, H, 1), c = layer.clear();
  draw(c, W, H);
  const data = c.getImageData(0, 0, W, H).data;
  const inside: number[] = [];
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (data[(y * W + x) * 4 + 3]! > 128) inside.push(x, y);
  const r = mulberry32(seed), p = new Float32Array(count * 3), n = inside.length / 2;
  if (n === 0) throw new Error('pointsFrom*: the shape is empty');
  const scale = width / W;
  for (let i = 0; i < count; i++) {
    const j = Math.floor(((i + r() * 0.999) / count) * n); // even coverage with jitter
    p[i * 3] = (inside[j * 2]! + r() * 2 - W / 2) * scale;
    p[i * 3 + 1] = (H / 2 - inside[j * 2 + 1]! - r() * 2) * scale;
    p[i * 3 + 2] = (r() - 0.5) * scale * 6;
  }
  return p;
}
