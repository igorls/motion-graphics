// Video clips as frame sequences (made by scripts/prep_clip.ts). Frames are preloaded in init()
// and picked by time, so a clip is a pure function of t like everything else: seeking, stills and
// motion-blur sub-frames all show exactly the right frame. (A <video> element can't guarantee that.)
import { clamp } from './util';

export interface ClipManifest {
  name: string; fps: number; count: number; width: number; height: number; ext: string; alpha: boolean; duration: number;
  /** Union bounding box of the keyed subject over the whole clip (the full frame for unkeyed clips). */
  bbox?: { x: number; y: number; w: number; h: number };
}

export class Clip {
  private constructor(public m: ClipManifest, private frames: ImageBitmap[]) {}

  /** Load public/clips/<name>/ (clip.json + frames). Memory: width x height x 4 bytes per frame. */
  static async load(name: string): Promise<Clip> {
    const base = `clips/${name}/`;
    const m = (await (await fetch(`${base}clip.json`)).json()) as ClipManifest;
    const frames = await Promise.all(Array.from({ length: m.count }, async (_, i) => {
      const r = await fetch(`${base}f_${String(i + 1).padStart(4, '0')}.${m.ext}`);
      if (!r.ok) throw new Error(`clip ${name}: frame ${i + 1} missing`);
      return createImageBitmap(await r.blob(), { premultiplyAlpha: 'default' });
    }));
    return new Clip(m, frames);
  }

  get duration() { return this.m.count / this.m.fps; }
  /** The subject's box over the whole clip: size and place THIS, not the frame, so green margins don't shrink it. */
  get bbox() { return this.m.bbox ?? { x: 0, y: 0, w: this.m.width, h: this.m.height }; }

  /**
   * Draw the frame at `lt` so the subject's box fits (contain) the rect x, y, w, h, centred.
   * The whole frame is drawn, so the subject moves inside its box exactly as it does in the clip.
   */
  drawFit(c: CanvasRenderingContext2D, lt: number, x: number, y: number, w: number, h: number, o: Parameters<Clip['frame']>[1] = {}) {
    const b = this.bbox, s = Math.min(w / b.w, h / b.h);
    const ox = x + (w - b.w * s) / 2 - b.x * s, oy = y + (h - b.h * s) / 2 - b.y * s;
    c.drawImage(this.frame(lt, o), ox, oy, this.m.width * s, this.m.height * s);
  }
  get width() { return this.m.width; }
  get height() { return this.m.height; }

  /**
   * The frame at local time `lt` (seconds from the clip's start, scaled by `speed`).
   * mode 'hold' freezes on the last frame, 'loop' wraps, 'pingpong' plays back and forth.
   */
  frame(lt: number, o: { speed?: number; mode?: 'hold' | 'loop' | 'pingpong'; offset?: number } = {}) {
    const n = this.m.count;
    let i = Math.floor((lt * (o.speed ?? 1) + (o.offset ?? 0)) * this.m.fps + 1e-6);
    if (o.mode === 'loop') i = ((i % n) + n) % n;
    else if (o.mode === 'pingpong') { const p = 2 * n - 2; i = ((i % p) + p) % p; if (i >= n) i = p - i; }
    else i = clamp(i, 0, n - 1);
    return this.frames[i]!;
  }
}
