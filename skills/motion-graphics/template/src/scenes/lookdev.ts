// LOOKDEV: a turntable of materials under one light, for designing a piece's material language in
// isolation (render stills of it while developing looks; it's a tool, not a shot to ship).
// Shows the starting-point looks from engine/looks.ts next to lit paper and physical materials.
// params: { looks?: string[] } (subset of the names below, in order)
import * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Stage3D, castShadows, paper, ground, textPlane } from '../engine/stage3d';
import { halftone, gooch, rimGlow, holo, glass, metal, iridescent, addRim, addGrain, studioEnvironment } from '../engine/looks';
import { brand } from '../brand';

const LOOKS: Record<string, () => THREE.Material> = {
  paper: () => paper('#efe9dd', { repeat: 2 }),
  halftone: () => halftone('#1d2a5c', '#f1ebdd', { dotPx: 6 }),
  gooch: () => gooch('#ffb46b', '#3a4f9c'),
  rimGlow: () => rimGlow('#10131c', brand.colors.accent, { glow: 2.5 }),
  holo: () => holo(),
  glass: () => glass('#e9f4ff'),
  metal: () => metal('#c9ccd6', 0.28),
  iridescent: () => iridescent('#20242e'),
  'standard+rim+grain': () => addGrain(addRim(new THREE.MeshStandardMaterial({ color: '#b86b4b', roughness: 0.7 }), '#ffd9a8', 3, 1.2), 0.25, 5),
};

export default class LookDev extends Scene {
  stage = new Stage3D(30);
  knots: THREE.Mesh[] = [];

  init() {
    const { renderer } = this.ctx;
    this.stage.scene.background = new THREE.Color('#d8d2c6');
    studioEnvironment(renderer, this.stage.scene, 0.3); // with stage.light() on top, keep the environment low or everything washes out
    const names: string[] = this.ctx.params.looks ?? Object.keys(LOOKS);
    const cols = Math.ceil(Math.sqrt(names.length)), rows = Math.ceil(names.length / cols);
    const geo = new THREE.TorusKnotGeometry(0.55, 0.2, 220, 36);
    names.forEach((name, i) => {
      const cx = (i % cols - (cols - 1) / 2) * 2.4, cz = (Math.floor(i / cols) - (rows - 1) / 2) * 2.4;
      const knot = new THREE.Mesh(geo, LOOKS[name]!());
      knot.position.set(cx, 1.0, cz);
      castShadows(knot);
      this.stage.scene.add(knot);
      this.knots.push(knot);
      const label = textPlane(name, brand.fonts.mono, { color: '#3b3a36', height: 0.22, weight: 500 });
      label.rotation.x = -Math.PI / 2;
      label.position.set(cx, 0.01, cz + 1.0);
      this.stage.scene.add(label);
    });
    // a striped backdrop so glass shows refraction and metal shows reflection
    for (let i = 0; i < 12; i++) {
      const bar = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3, 0.1), paper(i % 2 ? '#1d2a5c' : '#efe9dd'));
      bar.position.set(-4 + i * 0.75, 1.5, -cols * 1.2 - 1.5);
      castShadows(bar);
      this.stage.scene.add(bar);
    }
    this.stage.scene.add(ground(paper('#e4ddd0', { repeat: 10 })));
    this.stage.light('studio', { extent: 8 });
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    this.knots.forEach((k, i) => { k.rotation.set(0.3, f.t * 0.6 + i * 0.7, 0); });
    this.stage.look(0, 7.5, 9.5, 0, 0.6, -0.3);
    this.ctx.comp.draw(this.ctx.renderer, this.stage.render(this.ctx.renderer, f), out, { mode: 'replace', srgb: false });
    return { bloom: 0.6, vignette: 0.2, grain: 0.015 };
  }
}
