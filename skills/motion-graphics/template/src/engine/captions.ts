// Burned-in captions from the voice-over's word timings. Drawn once per output frame after the post
// chain (engine.overlay), so they stay crisp: no bloom, grain or motion blur, like real subtitles.
// One phrase at a time, at most two lines; spoken words in ink, the word being said in the accent,
// the rest of the phrase dimmed. Styled from the brand and placed at the bottom of SAFE (in 9:16
// that is above the platform's caption and button band).
import type * as THREE from 'three';
import { Layer2D } from './gl';
import { W, SAFE } from './format';
import { font } from './type';
import { brand } from '../brand';
import { phrases, type Phrase, type VoCue } from './voice';

export interface CaptionOpts {
  /** Type size in logical px (default from the format). */
  size?: number;
  /** Characters per line before wrapping. */
  maxChars?: number;
  /** A soft dark plate behind the phrase (default true): captions must read over any frame. */
  plate?: boolean;
  /** Baseline of the last line, in logical px (default: the bottom of SAFE). */
  y?: number;
  /** Raise the captions this many logical px above the bottom of SAFE (to clear a readout or a lower third). */
  lift?: number;
}

export class Captions {
  layer = new Layer2D();
  list: Phrase[];
  size: number;
  constructor(cues: VoCue[], public o: CaptionOpts = {}) {
    this.size = o.size ?? Math.round(Math.min(SAFE.w * 0.055, SAFE.h * 0.075, 56));
    this.list = phrases(cues, o.maxChars ?? (SAFE.w / this.size > 24 ? 34 : 26));
  }

  /** The caption layer at time t, or null when nothing is said. */
  draw(t: number): THREE.Texture | null {
    const i = this.list.findIndex((p, k) => t >= p.s - 0.08 && t < Math.min(p.e + 0.4, this.list[k + 1]?.s ?? Infinity));
    if (i < 0) return null;
    const p = this.list[i]!, c = this.layer.clear(), sz = this.size, lh = sz * 1.25;
    const k = Math.min(1, (t - (p.s - 0.08)) / 0.1) * Math.min(1, (Math.min(p.e + 0.4, this.list[i + 1]?.s ?? Infinity) - t) / 0.12);
    c.font = font(brand.fonts.body, sz, 600);
    c.textBaseline = 'alphabetic';
    const yLast = this.o.y ?? SAFE.y + SAFE.h - sz * 0.35 - (this.o.lift ?? 0);
    const widths = p.lines.map((ln) => c.measureText(ln.map((w) => w.w).join(' ')).width);
    const top = yLast - (p.lines.length - 1) * lh - sz;
    if (this.o.plate ?? true) {
      const pw = Math.max(...widths) + sz * 1.1, ph = p.lines.length * lh + sz * 0.45;
      c.globalAlpha = 0.78 * k; c.fillStyle = '#000'; // dense enough to read over the brightest frame, accent word included
      c.beginPath(); c.roundRect(W / 2 - pw / 2, top - sz * 0.2, pw, ph, sz * 0.3); c.fill();
    }
    const now = t - p.cue.t; // seconds into the take
    p.lines.forEach((ln, li) => {
      let x = W / 2 - widths[li]! / 2;
      const y = yLast - (p.lines.length - 1 - li) * lh;
      for (const w of ln) {
        const said = now >= w.s, saying = said && now < w.e + 0.05;
        c.globalAlpha = k * (said ? 1 : 0.5);
        c.fillStyle = saying ? brand.colors.accent : brand.colors.ink;
        c.fillText(w.w, x, y);
        x += c.measureText(w.w + ' ').width;
      }
    });
    c.globalAlpha = 1;
    return this.layer.upload();
  }
}
