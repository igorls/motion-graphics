// HOOK: kinetic type. One word lands per beat, stacked to fill the safe area; the accent word
// glows. It holds long enough to read, then the whole stack whips up and out into the next cut.
// params: { words: string[] } plus the controls below (tunable from the markup page; see engine/controls.ts)
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { font, fitSize } from '../engine/type';
import { ease, prog, pulse } from '../engine/util';
import { brand } from '../brand';
import { BgField, glow } from './_shared';
import type { Controls } from '../engine/controls';

export default class Hook extends Scene {
  static controls = {
    step: { type: 'number', min: 0.25, max: 2, step: 0.25, default: 1, unit: 'beats', label: 'Beats between words' },
    accent: { type: 'int', min: 0, max: 7, default: 2, label: 'Accent word (index)' },
    snap: { type: 'number', min: 0.08, max: 0.8, step: 0.01, default: 0.32, unit: 's', label: 'Snap-in time' },
    ease: { type: 'enum', options: ['outExpo', 'outBack', 'outCubic'], default: 'outExpo', label: 'Snap-in ease' },
    glow: { type: 'number', min: 0, max: 3, step: 0.05, default: 1.6, label: 'Accent glow' },
    stack: { type: 'group', label: 'Word stack', controls: {
      y: { type: 'number', min: -0.25, max: 0.25, step: 0.005, default: 0, unit: 'frame h', label: 'Vertical offset' },
      size: { type: 'number', min: 0.5, max: 1.2, step: 0.01, default: 1, unit: '×', label: 'Size' },
    } },
  } satisfies Controls;

  bg = new BgField();
  text = new Layer2D();
  glowL = new Layer2D();
  words: string[] = this.ctx.params.words ?? ['Make', 'it', 'move.'];
  accent: number = Math.min(this.ctx.params.accent, this.words.length - 1);
  size = 0;
  lineH = 0;
  landAt: number[] = [];

  init() {
    const { SAFE, audio, start } = this.ctx;
    const step: number = this.ctx.params.step;
    // word i lands on beat i (after the first beat at/after the cut); times come from the grid, never hard-coded
    const b0 = Math.ceil(audio.beatAt(start) - 1e-3);
    this.landAt = this.words.map((_, i) => audio.timeOfBeat(b0 + i * step));
    const c = this.text.ctx;
    const maxByHeight = (SAFE.h * 0.9) / this.words.length / 0.92;
    this.size = fitSize(c, this.words.map((w) => w.toUpperCase()), brand.fonts.display, 800, SAFE.w, Math.min(maxByHeight, SAFE.w * 0.42)) * this.ctx.params.stack.size;
    this.lineH = this.size * 0.92;
  }

  // a control change rebuilds the block, so its GPU resources go with the old instance
  dispose() { this.bg.dispose(); this.text.dispose(); this.glowL.dispose(); }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, SAFE, end } = this.ctx;
    const cx = SAFE.x + SAFE.w / 2;
    const blockH = this.lineH * this.words.length;
    const top = SAFE.y + (SAFE.h - blockH) / 2 + this.ctx.params.stack.y * this.ctx.H;

    // exit: the stack accelerates upward over the last 0.35 s (motion blur turns it into a streak)
    const exit = prog(f.t, end - 0.35, end, ease.inExpo);
    const exitY = -exit * (this.ctx.H * 0.9);

    this.bg.render(renderer, out, { t: f.t, x: cx, y: top + blockH * 0.6, energy: f.a.low + f.a.kick * 0.5 });

    const c = this.text.clear(), g = this.glowL.clear();
    c.font = g.font = font(brand.fonts.display, this.size, 800);
    c.textAlign = g.textAlign = 'center';
    c.textBaseline = g.textBaseline = 'alphabetic';
    this.words.forEach((w, i) => {
      const t0 = this.landAt[i]!;
      if (f.t < t0 - 0.02) return;
      const k = prog(f.t, t0, t0 + this.ctx.params.snap, ease[this.ctx.params.ease as keyof typeof ease]); // snap in, then hold still
      const scale = 1.35 - 0.35 * k;
      const y = top + this.lineH * (i + 0.82) + (1 - k) * this.size * 0.35 + exitY;
      c.save();
      c.globalAlpha = prog(f.t, t0 - 0.02, t0 + 0.05);
      c.translate(cx, y);
      c.scale(scale, scale);
      c.fillStyle = i === this.accent ? brand.colors.accent : brand.colors.ink;
      c.fillText(w.toUpperCase(), 0, 0);
      c.restore();
      if (i === this.accent) {
        g.save();
        g.globalAlpha = 0.55 + 0.45 * pulse(f.t, t0, 0.25);
        g.filter = `blur(${this.size * 0.18}px)`;
        g.translate(cx, y);
        g.scale(scale, scale);
        g.fillStyle = '#fff';
        g.fillText(w.toUpperCase(), 0, 0);
        g.restore();
      }
    });
    comp.draw(renderer, this.glowL.upload(), out, { mode: 'add', tint: glow('accent', this.ctx.params.glow) });
    comp.draw(renderer, this.text.upload(), out);

    // punctuation: a punch-in and a small flash when the accent word lands
    const hit = pulse(f.t, this.landAt[this.accent] ?? -1, 0.09);
    return { zoom: 1 + 0.035 * hit + 0.01 * f.a.kick, flash: 0.08 * hit, flashColor: glow('accent', 0.6), shake: [0, 6 * hit * Math.sin(f.t * 90)] as [number, number], bloom: 0.8 };
  }
}
