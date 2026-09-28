// ASSEMBLE: a wow moment. Thousands of lit, rim-glowing pieces drift in a deep cloud while the
// camera creeps in; on the target downbeat they fly (staggered left to right, tumbling, arcing)
// and lock into the product's name exactly on the beat, with a flash and a punch-in, then breathe.
// This is a technique demo: a piece should invent its own peak (what assembles, from what, into what).
// params: { word?: string, count?: number, landBeat?: beats after the scene start when it locks (default 4) }
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Stage3D, castShadows } from '../engine/stage3d';
import { Swarm, cloud, pointsFromText } from '../engine/swarm';
import { addRim, studioEnvironment } from '../engine/looks';
import { ease, fbm1, prog, pulse } from '../engine/util';
import { brand } from '../brand';

export default class Assemble extends Scene {
  stage = new Stage3D(34);
  swarm!: Swarm;
  landAt = 0;

  init() {
    const { audio, start, renderer } = this.ctx;
    const word: string = this.ctx.params.word ?? brand.name;
    const count: number = this.ctx.params.count ?? 6000;
    this.stage.scene.background = new THREE.Color(brand.colors.bg);
    this.stage.scene.fog = new THREE.Fog(new THREE.Color(brand.colors.bg), 14, 40);
    studioEnvironment(renderer, this.stage.scene, 0.25);
    const mat = addRim(new THREE.MeshStandardMaterial({ color: brand.colors.ink, roughness: 0.35, metalness: 0.6 }), brand.colors.accent, 2.5, 2.2);
    const geo = new THREE.BoxGeometry(1, 1, 1);
    // size the word to 85% of the frame width at the camera's final distance (portrait frames are narrow)
    const cam = this.stage.camera, finalZ = 12;
    const width = 0.85 * 2 * finalZ * Math.tan((cam.fov * Math.PI) / 360) * cam.aspect;
    this.swarm = new Swarm(count, geo, mat, cloud(count, 30, 18, 24, 11), width * 0.016);
    const b0 = Math.ceil(audio.beatAt(start) - 1e-3);
    this.landAt = audio.timeOfBeat(b0 + (this.ctx.params.landBeat ?? 4));
    const dur = 0.9, stagger = 0.45;
    this.swarm.to({ to: pointsFromText(word, brand.fonts.display, count, width), t0: this.landAt - dur - stagger, dur, stagger, arc: 2.5, order: 'x', ease: ease.outExpo });
    castShadows(this.swarm.mesh);
    this.stage.scene.add(this.swarm.mesh);
    this.stage.light('dusk', { extent: 12 });
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp } = this.ctx;
    // before the lock: slow creeping dolly and drift; after: a held, breathing frame
    const approach = prog(f.t, f.start, this.landAt, ease.inOutCubic);
    const z = 26 - 14 * approach; // ends at finalZ = 12, where the word was sized to fit
    const drift = fbm1(f.t * 0.3, 3, 5) * 0.6 * (1 - approach);
    this.stage.look(drift, 0.6 - 0.6 * approach, z, 0, 0, 0, 0.05 * (1 - approach));
    this.swarm.update(f.t, { spin: 6 });
    comp.draw(renderer, this.stage.render(renderer, f), out, { mode: 'replace', srgb: false });
    const hit = pulse(f.t, this.landAt, 0.12);
    return { bloom: 0.9, flash: 0.25 * hit, zoom: 1 + 0.04 * hit, vignette: 0.5 };
  }
}
