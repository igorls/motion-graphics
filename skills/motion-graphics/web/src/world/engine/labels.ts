// DOM labels pinned to points in the 3D world: crisp, real text (any font, any language) that
// follows the camera. Each frame, project the anchors and move the elements; the elements are
// decorative (the container is aria-hidden), the meaning lives in the page's own copy.
import * as THREE from 'three';

export interface LabelSpec { key: string; time?: string; text: string }

export class Labels {
  private els = new Map<string, HTMLElement>();
  private widths = new Map<string, number>();
  private v = new THREE.Vector3();
  constructor(private root: HTMLElement | null) {}

  /** Create (once) a label for each spec: an optional <time> and its text, set as text (never HTML). */
  ensure(specs: LabelSpec[], cls = 'pin-label') {
    if (!this.root) return;
    for (const s of specs) {
      if (this.els.has(s.key)) continue;
      const el = document.createElement('span');
      el.className = cls;
      if (s.time) { const t = document.createElement('time'); t.textContent = s.time; el.append(t, ' '); }
      el.append(s.text);
      this.root.appendChild(el);
      this.els.set(s.key, el);
    }
  }

  /**
   * Place a label: project `pos` with the camera into the container's box, offset by (dx, dy) px,
   * with opacity `alpha` (0 hides it). Labels behind the camera are hidden, and a label never runs
   * past the viewport's edges (it slides inside them instead of being cut).
   */
  /** `avoid`: boxes the label must keep off (the copy's, WorldFrame.keep): it slides to the right of one it would sit under. */
  place(key: string, pos: THREE.Vector3, cam: THREE.Camera, alpha: number, dx = 12, dy = -14, avoid?: { x0: number; y0: number; x1: number; y1: number }[], side: 'right' | 'left' = 'right') {
    const el = this.els.get(key);
    if (!el || !this.root) return;
    const r = this.root.getBoundingClientRect();
    this.v.copy(pos).project(cam);
    const behind = this.v.z > 1;
    let w = this.widths.get(key);
    if (!w && alpha > 0) { w = el.offsetWidth; if (w) this.widths.set(key, w); }
    let px = (this.v.x * 0.5 + 0.5) * innerWidth + (side === 'left' ? -dx - (w ?? 0) : dx);
    const py = (-this.v.y * 0.5 + 0.5) * innerHeight + dy;
    for (const b of avoid ?? []) if (px < b.x1 && px + (w ?? 0) > b.x0 && py < b.y1 && py + 34 > b.y0) px = b.x1 + 10;
    const vx = Math.min(Math.max(px, 8), innerWidth - (w ?? 0) - 8);
    const vy = Math.min(Math.max(py, 8), innerHeight - 44);
    const x = vx - r.left, y = vy - r.top;
    const a = behind ? 0 : Math.max(0, Math.min(1, alpha));
    el.style.opacity = a.toFixed(3);
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${(y + (1 - a) * 6).toFixed(1)}px, 0)`;
  }
}

/**
 * Dock page elements to a world object: write the object's place on screen (CSS px) and the screen
 * radius of a sphere of `radius` around it as CSS variables on `el` (`--<name>-x`, `--<name>-y`,
 * `--<name>-r`). The page's CSS positions and sizes a control from them: a button inside a ring, a
 * caption beside a planet. Values are written only when they move, so a still camera costs no style work.
 */
export class Dock {
  private last = [NaN, NaN, NaN];
  private frozen = false;
  private c = new THREE.Vector3();
  private e = new THREE.Vector3();
  /**
   * `rel`: publish positions relative to this element's box (a sticky pin that clips the control), else to the
   * viewport. With `rel`, the control rides in already docked (revealed by the pin's edge) and, once the pin
   * scrolls up past the top, leaves with it.
   */
  constructor(private el: HTMLElement | null, private name: string, private rel: HTMLElement | null = null) {}

  place(pos: THREE.Vector3, radius: number, cam: THREE.Camera) {
    if (!this.el) return;
    const c = this.c.copy(pos).project(cam);
    const e = this.e.set(0, 1, 0).applyQuaternion(cam.quaternion).multiplyScalar(radius).add(pos).project(cam);
    const o = this.rel?.getBoundingClientRect();
    // once `rel` scrolls up past the top, the control keeps its place in it and leaves with its section
    // (placed once from the pin's stuck position, so a page opened mid-scroll still has it docked)
    if (o && o.top < -0.5) { if (this.frozen) return; this.frozen = true; } else this.frozen = false;
    const x = (c.x * 0.5 + 0.5) * innerWidth - (o?.left ?? 0), y = (0.5 - c.y * 0.5) * innerHeight - Math.max(0, o?.top ?? 0);
    const r = Math.hypot((e.x - c.x) * 0.5 * innerWidth, (e.y - c.y) * 0.5 * innerHeight);
    const l = this.last;
    if (Math.abs(x - l[0]!) + Math.abs(y - l[1]!) + Math.abs(r - l[2]!) < 0.4) return;
    l[0] = x; l[1] = y; l[2] = r;
    const st = this.el.style, n = this.name;
    st.setProperty(`--${n}-x`, `${x.toFixed(1)}px`);
    st.setProperty(`--${n}-y`, `${y.toFixed(1)}px`);
    st.setProperty(`--${n}-r`, `${r.toFixed(1)}px`);
  }
}
