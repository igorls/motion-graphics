// Swarm: thousands of instances that move between formations (a cloud, the product's name, a grid,
// a sphere) with per-instance stagger and arcing paths, as a closed-form function of a progress
// value (on the web: a chapter's pinned progress). The classic "how did they do that" moment, here
// driven by the scroll. Adapted from the video template's engine/swarm.ts.
import * as THREE from 'three';
import { clamp, ease as E, mulberry32, type Ease } from '../engine/util';

export type Points = Float32Array; // xyz triplets, world units

export interface Move { to: Points; at: number; dur: number; ease?: Ease; stagger?: number; arc?: number; order?: 'random' | 'x' | 'y' | 'radial' }

export class Swarm {
  mesh: THREE.InstancedMesh;
  private moves: (Move & { from: Points; delay: Float32Array; lift: Float32Array })[] = [];
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private s = new THREE.Vector3();
  private v = new THREE.Vector3();
  private rnd: () => number;

  constructor(public count: number, geometry: THREE.BufferGeometry, material: THREE.Material, public start: Points, public size = 1, seed = 7) {
    this.mesh = new THREE.InstancedMesh(geometry, material, count);
    this.mesh.frustumCulled = false;
    this.rnd = mulberry32(seed);
  }

  /** Queue a formation change at progress `at` (any unit: story time, chapter progress). Moves chain. */
  to(move: Move) {
    const from = this.moves.length ? this.moves[this.moves.length - 1]!.to : this.start;
    const n = this.count, delay = new Float32Array(n), lift = new Float32Array(n);
    const ext = (a: number) => { let lo = Infinity, hi = -Infinity; for (let i = a; i < move.to.length; i += 3) { lo = Math.min(lo, move.to[i]!); hi = Math.max(hi, move.to[i]!); } return [lo, hi] as const; };
    const [x0, x1] = ext(0), [y0, y1] = ext(1);
    for (let i = 0; i < n; i++) {
      const o = move.order ?? 'random';
      const k = o === 'x' ? (move.to[i * 3]! - x0) / Math.max(1e-6, x1 - x0)
        : o === 'y' ? 1 - (move.to[i * 3 + 1]! - y0) / Math.max(1e-6, y1 - y0)
        : o === 'radial' ? Math.hypot(move.to[i * 3]!, move.to[i * 3 + 1]!) / Math.max(1e-6, Math.max(Math.abs(x0), x1))
        : this.rnd();
      delay[i] = k * (move.stagger ?? 0.4);
      lift[i] = (this.rnd() - 0.5) * 2;
    }
    this.moves.push({ ...move, from, delay, lift });
    return this;
  }

  /** Place every instance for progress p. `spin` tumbles instances in flight. */
  update(p: number, o: { spin?: number } = {}) {
    const n = this.count;
    for (let i = 0; i < n; i++) {
      let x = this.start[i * 3]!, y = this.start[i * 3 + 1]!, z = this.start[i * 3 + 2]!, fly = 0;
      for (const mv of this.moves) {
        const k = clamp((p - mv.at - mv.delay[i]!) / mv.dur);
        if (k <= 0) break;
        const e = (mv.ease ?? E.inOutCubic)(k), arc = Math.sin(Math.PI * e) * (mv.arc ?? 1.5);
        x = mv.from[i * 3]! + (mv.to[i * 3]! - mv.from[i * 3]!) * e + mv.lift[i]! * arc * 0.5;
        y = mv.from[i * 3 + 1]! + (mv.to[i * 3 + 1]! - mv.from[i * 3 + 1]!) * e + arc;
        z = mv.from[i * 3 + 2]! + (mv.to[i * 3 + 2]! - mv.from[i * 3 + 2]!) * e + mv.lift[i]! * arc;
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

/** `count` points inside a box (w x h x d) centred at the origin. */
export function cloud(count: number, w: number, h: number, d: number, seed = 1): Points {
  const r = mulberry32(seed), p = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) { p[i * 3] = (r() - 0.5) * w; p[i * 3 + 1] = (r() - 0.5) * h; p[i * 3 + 2] = (r() - 0.5) * d; }
  return p;
}

/** Points on a sphere of radius r (golden spiral). */
export function sphere(count: number, r: number): Points {
  const p = new Float32Array(count * 3), g = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < count; i++) {
    const y = 1 - (i / (count - 1)) * 2, rad = Math.sqrt(1 - y * y), th = g * i;
    p[i * 3] = Math.cos(th) * rad * r; p[i * 3 + 1] = y * r; p[i * 3 + 2] = Math.sin(th) * rad * r;
  }
  return p;
}

/** `count` points filling `text` set in a CSS font (load it first: document.fonts.ready), `width` world units wide. */
export function pointsFromText(text: string, cssFont: (px: number) => string, count: number, width: number, seed = 3): Points {
  const W = 1400, H = 360, cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const c = cv.getContext('2d', { willReadFrequently: true })!;
  let px = H * 0.78;
  c.font = cssFont(px);
  const w = c.measureText(text).width;
  if (w > W * 0.96) { px *= (W * 0.96) / w; c.font = cssFont(px); }
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = '#fff';
  c.fillText(text, W / 2, H / 2);
  const data = c.getImageData(0, 0, W, H).data, inside: number[] = [];
  for (let y = 0; y < H; y += 2) for (let x = 0; x < W; x += 2) if (data[(y * W + x) * 4 + 3]! > 128) inside.push(x, y);
  const r = mulberry32(seed), p = new Float32Array(count * 3), n = inside.length / 2, scale = width / W;
  if (n === 0) throw new Error('pointsFromText: nothing drawn (is the font loaded?)');
  for (let i = 0; i < count; i++) {
    const j = Math.floor(((i + r() * 0.999) / count) * n);
    p[i * 3] = (inside[j * 2]! + r() * 2 - W / 2) * scale;
    p[i * 3 + 1] = (H / 2 - inside[j * 2 + 1]! - r() * 2) * scale;
    p[i * 3 + 2] = (r() - 0.5) * scale * 6;
  }
  return p;
}
