// REVEAL: before/after. The "before" photo fills the frame and pushes in; a glowing divider
// teases a third of the way, holds, then sweeps the rest on the next downbeat to reveal "after".
// A caption lands word by word once the result has had a beat to be seen.
// params: { before: url, after: url, labels?: [string, string], caption?: string ('\n' = line break) }
import type * as THREE from 'three';
import { Scene, type Frame } from '../engine/scene';
import { Layer2D, loadImage, drawCover } from '../engine/gl';
import { font, wrapBalanced } from '../engine/type';
import { ease, keys, prog, pulse, rgba } from '../engine/util';
import { brand } from '../brand';
import { glow } from './_shared';

type Img = HTMLImageElement | HTMLCanvasElement;

/** A stand-in when a photo is missing, so the layout can be judged before the real media exists. */
function placeholder(label: string, hue: number): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = 900; cv.height = 1200;
  const c = cv.getContext('2d')!;
  const g = c.createLinearGradient(0, 0, 900, 1200);
  g.addColorStop(0, `hsl(${hue} 30% 22%)`); g.addColorStop(1, `hsl(${hue + 40} 45% 42%)`);
  c.fillStyle = g; c.fillRect(0, 0, 900, 1200);
  c.fillStyle = 'rgba(255,255,255,0.5)'; c.font = '600 48px sans-serif'; c.textAlign = 'center';
  c.fillText(label, 450, 600);
  return cv;
}

export default class Reveal extends Scene {
  photo = new Layer2D();
  text = new Layer2D();
  glowL = new Layer2D();
  before!: Img;
  after!: Img;
  labels: [string, string] = this.ctx.params.labels ?? ['Before', 'After'];
  caption: string = this.ctx.params.caption ?? '';
  captionLines: string[] = [];
  captionSize = 0;
  b0 = 0;

  async init() {
    const p = this.ctx.params;
    [this.before, this.after] = await Promise.all([
      loadImage(p.before).catch(() => placeholder(`missing: ${p.before}`, 220)),
      loadImage(p.after).catch(() => placeholder(`missing: ${p.after}`, 20)),
    ]);
    this.b0 = Math.ceil(this.ctx.audio.beatAt(this.ctx.start) - 1e-3);
    const c = this.text.ctx;
    const { SAFE } = this.ctx;
    this.captionSize = Math.round(SAFE.w * 0.1);
    c.font = font(brand.fonts.display, this.captionSize, 700);
    this.captionLines = wrapBalanced(c, this.caption, SAFE.w);
  }

  /** Time of beat `i` counted from this scene's first beat. */
  private beat(i: number) { return this.ctx.audio.timeOfBeat(this.b0 + i); }

  render(f: Frame, out: THREE.WebGLRenderTarget) {
    const { renderer, comp, W, H, SAFE } = this.ctx;
    const B = (i: number) => this.beat(i);

    // divider position 0..1: tease, hold, sweep on the downbeat
    const split = keys(f.t, [[B(0), 0], [B(1), 0], [B(1.5), 0.36, ease.outExpo], [B(3), 0.36], [B(4), 1, ease.inOutExpo]]);
    const x = split * W;
    const zoom = 1.08 - 0.08 * prog(f.t, f.start, f.start + 0.6, ease.outExpo) + 0.04 * f.p; // land, then a slow push

    const c = this.photo.clear();
    drawCover(c, this.before, 0, 0, W, H, zoom, 0.5, 0.4);
    if (x > 0) {
      c.save();
      c.beginPath(); c.rect(0, 0, x, H); c.clip();
      drawCover(c, this.after, 0, 0, W, H, zoom, 0.5, 0.4);
      c.restore();
    }
    // darken the bottom so the caption reads over any photo
    const shade = c.createLinearGradient(0, SAFE.y + SAFE.h * 0.45, 0, SAFE.y + SAFE.h + this.captionSize);
    shade.addColorStop(0, rgba(brand.colors.bg, 0)); shade.addColorStop(0.6, rgba(brand.colors.bg, 0.6)); shade.addColorStop(1, rgba(brand.colors.bg, 0.9));
    c.fillStyle = shade; c.fillRect(0, 0, W, H);
    comp.draw(renderer, this.photo.upload(), out, { mode: 'replace' });

    // the divider: a crisp line plus an HDR glow that flares while it moves
    const g = this.glowL.clear();
    const speed = Math.abs(keys(f.t + 0.02, [[B(0), 0], [B(1), 0], [B(1.5), 0.36, ease.outExpo], [B(3), 0.36], [B(4), 1, ease.inOutExpo]]) - split) * 50;
    if (split > 0 && split < 1) {
      g.fillStyle = '#fff';
      g.fillRect(x - 2, 0, 4, H);
      g.filter = `blur(${18 + 40 * Math.min(1, speed)}px)`;
      g.globalAlpha = 0.6 + 0.4 * Math.min(1, speed);
      g.fillRect(x - 10, 0, 20, H);
    }
    comp.draw(renderer, this.glowL.upload(), out, { mode: 'add', tint: glow('accent', 2.2) });

    // labels ride the top of the safe area; each fades as the divider passes it
    const t = this.text.clear();
    const labelPx = Math.round(SAFE.w * 0.05);
    t.font = font(brand.fonts.mono, labelPx, 600);
    t.letterSpacing = `${labelPx * 0.15}px`;
    t.textBaseline = 'top';
    const lbIn = prog(f.t, f.start + 0.1, f.start + 0.4);
    t.fillStyle = rgba(brand.colors.ink, lbIn * (1 - prog(split, 0.05, 0.2)));
    t.textAlign = 'left';
    t.fillText(this.labels[0].toUpperCase(), SAFE.x, SAFE.y);
    t.fillStyle = rgba(brand.colors.ink, prog(split, 0.6, 0.9));
    t.textAlign = 'right';
    t.fillText(this.labels[1].toUpperCase(), SAFE.x + SAFE.w, SAFE.y);
    t.letterSpacing = '0px';

    // caption: one word per beat after the reveal settles, at the bottom of the safe area
    if (this.caption) {
      t.font = font(brand.fonts.display, this.captionSize, 700);
      t.textAlign = 'left';
      t.textBaseline = 'alphabetic';
      const lh = this.captionSize * 1.08;
      let wi = 0;
      this.captionLines.forEach((line, li) => {
        const y = SAFE.y + SAFE.h - (this.captionLines.length - 1 - li) * lh;
        let cx = SAFE.x;
        for (const word of line.split(' ')) {
          const t0 = B(5 + wi * 0.5);
          const k = prog(f.t, t0, t0 + 0.3, ease.outExpo);
          t.fillStyle = rgba(brand.colors.ink, k);
          t.fillText(word, cx, y + (1 - k) * this.captionSize * 0.4);
          cx += t.measureText(word + ' ').width;
          wi++;
        }
      });
    }
    comp.draw(renderer, this.text.upload(), out);

    const landed = pulse(f.t, B(4), 0.1);
    return { flash: 0.1 * landed, zoom: 1 + 0.02 * landed, vignette: 0.4 };
  }
}
