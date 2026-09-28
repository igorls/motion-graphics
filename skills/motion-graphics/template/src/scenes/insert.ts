// INSERT: a keyed video clip (generated on a green screen, keyed by scripts/prep_clip.ts) composited
// into a designed frame. The "depth sandwich": a huge word sits BEHIND the object, the object floats
// in front with a soft shadow cast from its own alpha, and a small line of type sits in front of both.
// params: { clip: name under public/clips/, word?: string, line?: string, speed?: number,
//           clipStart?: seconds into the scene when the clip starts, scale?: the subject's box as a fraction of SAFE (default 0.7) }
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D } from '../engine/gl';
import { Clip } from '../engine/clip';
import { font, fitSize } from '../engine/type';
import { ease, prog, rgba } from '../engine/util';
import { brand } from '../brand';
import { BgField, brandFill } from './_shared';

export default class Insert extends Scene {
  bg = new BgField();
  back = new Layer2D();
  front = new Layer2D();
  clip!: Clip;
  word: string = this.ctx.params.word ?? '';
  line: string = this.ctx.params.line ?? '';
  wordSize = 0;
  b0 = 0;

  async init() {
    this.clip = await Clip.load(this.ctx.params.clip);
    const { SAFE, audio, start } = this.ctx;
    if (this.word) this.wordSize = fitSize(this.back.ctx, [this.word.toUpperCase()], brand.fonts.display, 800, SAFE.w * 1.0, SAFE.h * 0.3);
    this.b0 = Math.ceil(audio.beatAt(start) - 1e-3);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, SAFE, audio } = this.ctx;
    const B = (i: number) => audio.timeOfBeat(this.b0 + i);
    const cx = SAFE.x + SAFE.w / 2, cy = SAFE.y + SAFE.h * 0.5;
    this.bg.render(renderer, out, { t: f.t, x: cx, y: cy, energy: f.a.low, light: 1.2 });

    // behind: the big word, wiping up on beat 1 and drifting slowly (parallax against the object)
    const b = this.back.clear();
    if (this.word) {
      const k = prog(f.t, B(1), B(1) + 0.5, ease.outExpo);
      b.font = font(brand.fonts.display, this.wordSize, 800);
      b.textAlign = 'center'; b.textBaseline = 'middle';
      const w = b.measureText(this.word.toUpperCase()).width;
      b.save();
      b.beginPath(); b.rect(0, cy - this.wordSize * 0.62, this.ctx.W, this.wordSize * 1.24); b.clip();
      b.fillStyle = brandFill(b, cx - w / 2, cx + w / 2);
      b.globalAlpha = 0.9;
      b.fillText(this.word.toUpperCase(), cx - f.p * 40, cy + (1 - k) * this.wordSize * 1.2);
      b.restore();
    }
    comp.draw(renderer, this.back.upload(), out);

    // the clip, centred in the safe area, with a soft shadow cast from its alpha
    const c = this.front.clear();
    const lt = f.t - f.start - (this.ctx.params.clipStart ?? 0);
    const sc: number = this.ctx.params.scale ?? 0.7;
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.55)';
    c.shadowBlur = 60;
    c.shadowOffsetY = 30;
    this.clip.drawFit(c, Math.max(0, lt), cx - (SAFE.w * sc) / 2, cy - (SAFE.h * sc) / 2, SAFE.w * sc, SAFE.h * sc, { speed: this.ctx.params.speed ?? 1 });
    c.restore();

    // in front: a small line of type at the bottom of the safe area
    if (this.line) {
      const k = prog(f.t, B(3), B(3) + 0.4, ease.outCubic);
      c.font = font(brand.fonts.body, Math.round(SAFE.w * 0.055), 600);
      c.textAlign = 'center'; c.textBaseline = 'alphabetic';
      c.fillStyle = rgba(brand.colors.ink, k);
      c.fillText(this.line, cx, SAFE.y + SAFE.h - (1 - k) * 20);
    }
    comp.draw(renderer, this.front.upload(), out);
    return { bloom: 0.6 };
  }
}
