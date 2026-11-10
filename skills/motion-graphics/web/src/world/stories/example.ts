// EXAMPLE STORY (a technique demo, not a design to ship): the page's chapters drive one world.
//   0 hero      a sphere of a few thousand flat dots turns slowly in daylight over a graphic ground, right of the copy
//   1 build     pinned: as the visitor scrolls, the pieces fly into the product's name (the wow),
//               the light falls to blue hour so the accent can glow, a DOM label lands on the name
//   2 cards     an opaque section: the world sleeps under it
//   3 end       the name at night, breathing; the call to action
// Everything is a function of story time s (chapter + progress) and the ambient clock t.
// A real piece invents its own world, materials and wow; keep the mechanics, replace the content.
// The look is graphic, not realistic (references/lookdev.md): flat marks drawn by shaders in 3D space.
import * as THREE from 'three';
import type { Story, World, WorldFrame } from '../engine/runtime';
import { story } from '../engine/chapters';
import { ease, lerp, prog } from '../engine/util';
import { Labels } from '../engine/labels';
import { light, PRESETS, SkyPass } from '../scenes/light';
import { clearOf } from '../engine/keep';
import { Swarm, pointsFromText, sphere } from '../scenes/swarm';
import { graphicField } from '../scenes/field';

type V3 = [number, number, number];
interface Shot { s: number; pos: V3; look: V3; fov: number; at: [number, number] }

export class ExampleStory implements Story {
  scene = new THREE.Scene();
  cam = new THREE.PerspectiveCamera(35, 1, 0.1, 400);
  sky = new SkyPass();
  world!: World;
  swarm!: Swarm;
  labels!: Labels;
  private mat!: THREE.ShaderMaterial;
  private field!: ReturnType<typeof graphicField>;

  init(world: World) {
    this.world = world;
    const count = world.coarse ? 1800 : 4200;
    const name = document.body.dataset.name ?? 'Brand';
    const family = getComputedStyle(document.body).fontFamily;
    // a graphic look: each piece is a flat disc facing the camera (a 2D mark in 3D space), ink by day with
    // a few accent dots, points of light at night; premultiplied, so by day it covers and at night it adds
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      uniforms: { ...light.uniforms, uAccent: { value: new THREE.Color('#FF5A1F') } },
      vertexShader: /* glsl */ `varying vec2 vUv; varying float vTone;
        void main() { vUv = uv;
          vec4 c = viewMatrix * modelMatrix * vec4(instanceMatrix[3].xyz, 1.0);
          c.xy += position.xy * length(instanceMatrix[0].xyz) * 1.6;
          vTone = fract(sin(float(gl_InstanceID) * 12.9898) * 43758.5453);
          gl_Position = projectionMatrix * c; }`,
      fragmentShader: /* glsl */ `uniform vec3 uAccent; ${light.glsl}
        varying vec2 vUv; varying float vTone;
        void main() {
          float r = length(vUv - 0.5) * 2.0, aa = fwidth(r) * 1.2;
          float disc = 1.0 - smoothstep(0.8 - aa, 0.8 + aa, r);
          vec3 ink = mix(vec3(0.2, 0.19, 0.18), uAccent, step(0.84, vTone));
          // at night each disc is a small light; it keeps some coverage, so thousands overlapping don't sum to a blown-out blob
          vec3 glow = mix(vec3(1.0, 0.78, 0.55), uAccent * 1.3, step(0.7, vTone)) * 0.75;
          vec3 col = mix(ink, glow, smoothstep(0.25, 0.85, uNight));
          gl_FragColor = vec4(col * disc, disc * (1.0 - 0.45 * uNight));
        }`,
    });
    const start = sphere(count, 3.2);
    this.swarm = new Swarm(count, new THREE.PlaneGeometry(1, 1), this.mat, start, 0.11);
    // the wow: from the sphere into the name, staggered left to right, arcing, inside chapter 1's pin
    const width = 9;
    this.swarm.to({ to: pointsFromText(name, (px) => `800 ${px}px ${family}`, count, width), at: 0.08, dur: 0.5, stagger: 0.32, arc: 2.2, order: 'x', ease: ease.outExpo });
    this.scene.add(this.swarm.mesh);
    // the ground: a line grid and a halftone field drawn by one shader (scenes/field.ts)
    this.field = graphicField({ y: -3.6 });
    this.scene.add(this.field.mesh);
    this.labels = new Labels(document.querySelector<HTMLElement>('[data-labels="build"]'));
    this.labels.ensure([{ key: 'name', text: document.querySelector<HTMLElement>('[data-labels="build"]')?.dataset.label ?? '' }]);
    light.set(PRESETS.day);
  }

  private shots(aspect: number): Shot[] {
    const wide = aspect >= 1.1, tall = aspect < 0.8, far = tall ? 1.45 : wide ? 1 : 1.2;
    const side: [number, number] = wide ? [0.7, 0.5] : tall ? [0.5, 0.72] : [0.62, 0.56];
    const centre: [number, number] = wide ? [0.62, 0.5] : tall ? [0.5, 0.68] : [0.58, 0.55];
    const end: [number, number] = wide ? [0.74, 0.36] : tall ? [0.5, 0.8] : [0.66, 0.4];
    const shot = (s: number, look: V3, off: V3, fov: number, at: [number, number]): Shot => ({ s, look, pos: [look[0] + off[0] * far, look[1] + off[1] * far, look[2] + off[2] * far], fov, at });
    return [
      shot(0, [0, 0, 0], [5, 2.5, 13], 36, side),
      shot(1.0, [0, 0, 0], [3, 1.5, 14], 36, centre),
      shot(1.7, [0, 0.2, 0], [0.5, 0.6, 12.5], 38, centre),
      shot(2.6, [0, 0.2, 0], [-1.5, 0.8, 15], 38, end),
      shot(3.6, [0, 0.2, 0], [-1.2, 0.9, 14], 38, end),
    ];
  }

  private kc = new THREE.Vector3();
  private ke = new THREE.Vector3();
  private keepShift = 0;

  private camera(f: WorldFrame) {
    const shots = this.shots(f.aspect);
    let a = shots[0]!, b = shots[0]!, k = 0;
    if (f.s >= shots[shots.length - 1]!.s) a = b = shots[shots.length - 1]!;
    else for (let i = 0; i < shots.length - 1; i++) if (f.s < shots[i + 1]!.s) { a = shots[i]!; b = shots[i + 1]!; k = ease.inOutCubic((f.s - a.s) / (b.s - a.s)); break; }
    const L = (x: V3, y: V3) => [lerp(x[0], y[0], k), lerp(x[1], y[1], k), lerp(x[2], y[2], k)] as V3;
    const pos = L(a.pos, b.pos), look = L(a.look, b.look);
    const drift = f.reduced ? 0 : 1;
    pos[0] += (Math.sin(f.t * 0.21) * 0.2 + f.px * 0.8) * drift;
    pos[1] += (Math.sin(f.t * 0.17 + 1) * 0.12 - f.py * 0.45) * drift;
    const fov = lerp(a.fov, b.fov, k), at: [number, number] = [lerp(a.at[0], b.at[0], k), lerp(a.at[1], b.at[1], k)];
    const cam = this.cam;
    // portrait screens see less sideways: widen the vertical fov so the subject keeps its width
    cam.fov = f.aspect < 1 ? THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(fov) / 2) * Math.min(1.9, 1 / f.aspect))) : fov;
    cam.aspect = f.aspect;
    cam.position.set(...pos);
    cam.lookAt(...look);
    // put the look-at point at a screen anchor: right of the copy on desktop, under it on phones
    cam.setViewOffset(f.w, f.h, (0.5 - at[0]) * f.w, (0.5 - at[1]) * f.h, f.w, f.h);
    cam.updateProjectionMatrix();
    cam.updateMatrixWorld();
    // the copy ([data-keep]) is a keep-out zone in every frame: the subject slides beside it on wide
    // screens and below settled copy on tall ones (fade it under copy still arriving: keep.ts overlapOf)
    let shift = 0;
    if (f.keep.length) {
      const c = this.kc.set(0, 0, 0).project(cam), e = this.ke.set(0, 1, 0).applyQuaternion(cam.quaternion).multiplyScalar(2.6).project(cam);
      const x = (c.x * 0.5 + 0.5) * f.w, y = (0.5 - c.y * 0.5) * f.h, r = Math.hypot((e.x - c.x) * 0.5 * f.w, (e.y - c.y) * 0.5 * f.h);
      shift = f.aspect >= 0.8 ? clearOf(f.keep, x, y, r, 'x') : Math.min(clearOf(f.keep, x, y, r, 'down'), Math.max(0, f.h - r * 0.55 - y));
    }
    this.keepShift = f.still || f.reduced ? shift : this.keepShift + (shift - this.keepShift) * (1 - Math.exp(-f.dt / 0.2));
    if (Math.abs(this.keepShift) > 0.1) {
      const wide = f.aspect >= 0.8;
      cam.setViewOffset(f.w, f.h, (0.5 - at[0]) * f.w - (wide ? this.keepShift : 0), (0.5 - at[1]) * f.h - (wide ? 0 : this.keepShift), f.w, f.h);
      cam.updateProjectionMatrix();
    }
  }

  render(f: WorldFrame, target: THREE.WebGLRenderTarget) {
    const s = f.s, ch = this.world.chapters, bi = ch.index('build'), pe = ch.list[bi]?.pinEnd || 0.6;
    this.camera(f);
    light.along(s, [[0.4, PRESETS.day], [1.0, PRESETS.golden], [1.5, PRESETS.blue], [2.6, PRESETS.night]]);
    const night = light.now.night;
    // publish the world's darkness: copy over the world switches to light ink (see ui.ts and site.css)
    const root = document.documentElement;
    if ((night > 0.45) !== root.classList.contains('world-dark')) { root.classList.toggle('world-dark', night > 0.45); document.dispatchEvent(new Event('world-tone')); }
    // the wow runs inside the pinned part of the build chapter
    const p = bi >= 0 ? story.pin(s, bi, pe) : 0;
    this.swarm.mesh.rotation.y = (1 - prog(s, 0.6, 1.1)) * (f.t * 0.08 + s * 0.6);
    this.swarm.update(p, { spin: 5 });
    this.field.tick(f.t);
    this.labels.place('name', new THREE.Vector3(2.6, 1.6, 0.5), this.cam, prog(p, 0.85, 0.95) * (1 - prog(s, bi + 0.9, bi + 1.0)));
    const r = this.world.renderer;
    this.sky.render(r, this.cam, target);
    r.setRenderTarget(target);
    r.clear(false, true, false);
    r.render(this.scene, this.cam);
    // calm the world behind the copy (defocus, and lean towards the horizon's colour) where the shot can't leave a calm area
    return { bloom: lerp(0.5, 1.1, night), bloomThreshold: 1.0, grain: 0.02, vignette: lerp(0.14, 0.3, night), calm: 0.25, calmColor: [...light.now.horizon] as [number, number, number] };
  }

  restFor(i: number) {
    const rest = [0.3, 0.95, 0.5, 0.5][i] ?? 0.5;
    return i + rest * (this.world.chapters.list[i]?.pinEnd || 1);
  }
}
