// FLYTHROUGH: a 3D camera move through depth. The product's real items (features, commands, names)
// stand in space at different depths and offsets; the camera dollies between them in beat-timed
// snaps (hold, then a fast eased move), banking slightly, through fog and drifting dust, and lands
// face-on to the hero word on the scene's last downbeat. Shows: perspective, parallax, fog as depth,
// camera choreography on the grid, text and images as planes in space, HDR glow on the hero only.
// params: { items: string[], hero: string, step?: beats per move (default 1) }
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Stage3D, textPlane } from '../engine/stage3d';
import { ease, fbm1, keys, mulberry32, prog, type Key } from '../engine/util';
import { brand } from '../brand';
import { LIN } from './_shared';

const SPACING = 14; // world units between items along -z

export default class Flythrough extends Scene {
  stage = new Stage3D(38).fog(brand.colors.bg, 8, 60);
  items: string[] = this.ctx.params.items ?? ['one', 'two', 'three', 'four'];
  hero: string = this.ctx.params.hero ?? 'Hero.';
  stops: { x: number; y: number; z: number }[] = [];
  heroMesh!: THREE.Mesh;
  b0 = 0;

  init() {
    const rnd = mulberry32(7);
    // items alternate sides and heights so each one passes the camera with parallax
    this.items.forEach((text, i) => {
      const side = i % 2 ? 1 : -1;
      const p = { x: side * (2.2 + rnd() * 1.2), y: (rnd() - 0.5) * 3, z: -i * SPACING - 6 };
      const m = textPlane(text, brand.fonts.mono, { color: brand.colors.ink, height: 1.1, weight: 600 });
      m.position.set(p.x, p.y, p.z);
      m.rotation.y = -side * 0.35; // angled towards the corridor centre
      this.stage.scene.add(m);
      this.stops.push({ x: p.x * 0.35, y: p.y * 0.35, z: p.z + 7 }); // camera stop: in front, slightly off-axis
    });
    // the hero: big, centred, glowing (the only HDR element)
    this.heroMesh = textPlane(this.hero, brand.fonts.display, { color: brand.colors.accent, height: 3.2, weight: 800, glow: 1.8 });
    // park where the hero fills ~80% of the frame width (portrait frames are narrow: fit width, not height)
    this.heroMesh.geometry.computeBoundingBox();
    const bb = this.heroMesh.geometry.boundingBox!, heroW = bb.max.x - bb.min.x, heroH = bb.max.y - bb.min.y;
    const cam = this.stage.camera, tanHalf = Math.tan((cam.fov * Math.PI) / 360);
    const dist = Math.max(heroW / (0.8 * 2 * tanHalf * cam.aspect), heroH / (0.5 * 2 * tanHalf));
    // place the hero beyond that distance from the last item, so the parked camera has passed every item
    const lastZ = -(this.items.length - 1) * SPACING - 6;
    const hz = lastZ - dist - 4;
    this.heroMesh.position.set(0, 0, hz);
    this.stage.scene.add(this.heroMesh);
    this.stops.push({ x: 0, y: 0, z: hz + dist });
    this.stage.fog(brand.colors.bg, dist * 0.8, dist + 30); // the hero is always inside the clear zone
    // dust: a seeded point field along the corridor, the cheapest way to make depth legible
    const n = 1800, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (rnd() - 0.5) * 30; pos[i * 3 + 1] = (rnd() - 0.5) * 20; pos[i * 3 + 2] = 10 - rnd() * (Math.abs(hz) + 30);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const dust = new THREE.Points(g, new THREE.PointsMaterial({ color: new THREE.Color(...LIN.muted), size: 0.06, sizeAttenuation: true, transparent: true, opacity: 0.7 }));
    this.stage.scene.add(dust);
    this.b0 = Math.ceil(this.ctx.audio.beatAt(this.ctx.start) - 1e-3);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, audio } = this.ctx;
    const step: number = this.ctx.params.step ?? 1;
    // one move per `step` beats: hold 40% of the beat, then an inOutCubic dolly to the next stop
    const ks = (axis: 'x' | 'y' | 'z'): Key[] => {
      const start = { x: 0, y: 0, z: 14 };
      const out: Key[] = [[audio.timeOfBeat(this.b0), start[axis]]];
      this.stops.forEach((s, i) => {
        const tb = audio.timeOfBeat(this.b0 + (i + 1) * step);
        out.push([tb - 0.6 * step * audio.period, out[out.length - 1]![1]]); // hold
        out.push([tb, s[axis], ease.inOutCubic]); // snap
      });
      return out;
    };
    const x = keys(f.t, ks('x')), y = keys(f.t, ks('y')), z = keys(f.t, ks('z'));
    // handheld-ish drift and a bank into each move (organic, deterministic)
    const drift = fbm1(f.t * 0.6, 3, 11) * 0.15;
    const bank = Math.max(-0.12, Math.min(0.12, (keys(f.t + 0.05, ks('x')) - x) * 0.25)); // bank into lateral moves, limited
    this.stage.look(x + drift, y + drift * 0.5, z, x * 0.6, y * 0.6, z - 20, bank);
    // the hero breathes with the kick once we've arrived
    const arrived = prog(f.t, f.end - step * audio.period * 1.2, f.end - step * audio.period * 0.5, ease.outCubic);
    (this.heroMesh.material as THREE.MeshBasicMaterial).color.setScalar(1.4 + 0.6 * arrived + 0.4 * f.a.kick);
    comp.draw(renderer, this.stage.render(renderer), out, { mode: 'replace', srgb: false });
    return { bloom: 0.9, vignette: 0.45 };
  }
}
