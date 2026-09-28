// END CARD: logo, tagline, call to action. Everything lands on beats and then SETTLES: the last
// ~1.5 s hold still, because this is the frame people screenshot and the natural poster.
// params: { tagline?: string, cta?: string, url?: string, step?: beats between entrances (default 1; 0.5 at fast tempos
//           so the card still holds >= 1.5 s), fadeOut?: boolean }
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, loadImage } from '../engine/gl';
import { font, fitSize } from '../engine/type';
import { ease, prog, springStep, rgba } from '../engine/util';
import { brand } from '../brand';
import { BgField, brandFill, glow } from './_shared';

export default class EndCard extends Scene {
  bg = new BgField();
  text = new Layer2D();
  glowL = new Layer2D();
  logo: HTMLImageElement | null = null;
  tagline: string = this.ctx.params.tagline ?? brand.tagline;
  cta: string = this.ctx.params.cta ?? brand.cta;
  url: string = this.ctx.params.url ?? brand.url;
  nameSize = 0;
  tagSize = 0;
  b0 = 0;

  async init() {
    if (brand.logo) this.logo = await loadImage(brand.logo).catch(() => null);
    const c = this.text.ctx, { SAFE } = this.ctx;
    this.nameSize = fitSize(c, [brand.name], brand.fonts.display, 400, SAFE.w * 0.8, SAFE.w * 0.2);
    this.tagSize = fitSize(c, [this.tagline], brand.fonts.body, 500, SAFE.w * 0.92, SAFE.w * 0.065, 24);
    // without a logo mark the wordmark leads, so the first beat is never empty
    this.b0 = Math.ceil(this.ctx.audio.beatAt(this.ctx.start) - 1e-3) - (this.logo ? 0 : 1);
  }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, SAFE, audio } = this.ctx;
    const step: number = this.ctx.params.step ?? 1;
    const B = (i: number) => audio.timeOfBeat(this.b0 + i * step);
    const cx = SAFE.x + SAFE.w / 2;
    const cy = SAFE.y + SAFE.h * 0.42;

    this.bg.render(renderer, out, { t: f.t, x: cx, y: cy, energy: f.a.rms, light: 1.4 });
    const c = this.text.clear(), g = this.glowL.clear();

    // logo mark pops in on beat 0 with a spring
    const s0 = springStep(f.t - B(0), 2.2, 0.45);
    const markH = this.nameSize * 1.1;
    if (this.logo && s0 > 0) {
      const w = markH * (this.logo.width / this.logo.height);
      c.save(); c.translate(cx, cy - this.nameSize * 1.15); c.scale(s0, s0);
      c.drawImage(this.logo, -w / 2, -markH / 2, w, markH);
      c.restore();
    }
    // wordmark wipes up on beat 1
    const k1 = prog(f.t, B(1), B(1) + 0.45, ease.outExpo);
    if (k1 > 0) {
      c.font = g.font = font(brand.fonts.display, this.nameSize, 400);
      c.textAlign = g.textAlign = 'center';
      c.textBaseline = g.textBaseline = 'middle';
      const w = c.measureText(brand.name).width;
      c.save();
      c.beginPath(); c.rect(cx - w, cy - this.nameSize, w * 2, this.nameSize * 1.6); c.clip();
      c.fillStyle = brandFill(c, cx - w / 2, cx + w / 2);
      c.fillText(brand.name, cx, cy + (1 - k1) * this.nameSize);
      c.restore();
      g.globalAlpha = 0.35 * k1;
      g.filter = `blur(${this.nameSize * 0.3}px)`;
      g.fillStyle = '#fff';
      g.fillText(brand.name, cx, cy);
      g.filter = 'none';
    }
    // tagline on beat 2
    const k2 = prog(f.t, B(2), B(2) + 0.4, ease.outCubic);
    c.font = font(brand.fonts.body, this.tagSize, 500);
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillStyle = rgba(brand.colors.ink, 0.9 * k2);
    c.fillText(this.tagline, cx, cy + this.nameSize * 0.95 + (1 - k2) * 20);

    // CTA pill springs in on beat 3, url under it
    const s3 = springStep(f.t - B(3), 2.5, 0.5);
    if (s3 > 0) {
      const px = this.tagSize * 0.95;
      c.font = font(brand.fonts.body, px, 700);
      const tw = c.measureText(this.cta).width;
      const pw = tw + px * 2.2, ph = px * 2.3, py = cy + this.nameSize * 2.0;
      c.save(); c.translate(cx, py); c.scale(s3, s3);
      c.fillStyle = brand.colors.accent;
      c.beginPath(); c.roundRect(-pw / 2, -ph / 2, pw, ph, ph / 2); c.fill();
      c.fillStyle = brand.colors.bg;
      c.fillText(this.cta, 0, 2);
      c.restore();
      g.save(); g.translate(cx, py); g.scale(s3, s3);
      g.globalAlpha = 0.5; g.filter = `blur(${ph * 0.35}px)`; g.fillStyle = '#fff';
      g.beginPath(); g.roundRect(-pw / 2, -ph / 2, pw, ph, ph / 2); g.fill();
      g.restore();
      c.font = font(brand.fonts.mono, px * 0.75, 500);
      c.fillStyle = rgba(brand.colors.muted, prog(f.t, B(3.5), B(3.5) + 0.3));
      c.fillText(this.url, cx, py + ph * 1.1);
    }
    comp.draw(renderer, this.glowL.upload(), out, { mode: 'add', tint: glow('accent', 1.4) });
    comp.draw(renderer, this.text.upload(), out);
    return { bloom: 0.7, fade: prog(f.t, f.end - 0.25, f.end) * (this.ctx.params.fadeOut ? 1 : 0) };
  }
}
