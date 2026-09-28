// Output formats and safe areas. Scenes lay out in logical px (W x H) and must read their
// positions from W, H and SAFE, never from hard-coded 1080/1920, so one timeline renders in
// every format. `scale` renders the same layout at N x the pixels (sharper, not bigger).
import { project } from '../project';

export const FORMATS = {
  /** Reels, Stories, TikTok, Shorts. */
  vertical: { w: 1080, h: 1920 },
  /** Instagram/Facebook feed (the tallest feed crop). */
  portrait: { w: 1080, h: 1350 },
  square: { w: 1080, h: 1080 },
  /** YouTube, web, presentations. */
  landscape: { w: 1920, h: 1080 },
} as const;
export type FormatName = keyof typeof FORMATS;

export interface Rect { x: number; y: number; w: number; h: number }

/**
 * Where text, logos and faces may go. Vertical keeps clear of the platform UI that sits on
 * top of a Reel/Story/TikTok (top bar, the caption and buttons at the bottom, the action rail
 * on the right): Meta's Reels-ad guidance is roughly 14% top, 35% bottom and 6% sides.
 * The feed formats only need a title-safe margin.
 */
function safeArea(name: FormatName, w: number, h: number): Rect {
  if (name === 'vertical') {
    const top = Math.round(h * 0.14), bottom = Math.round(h * 0.35), side = Math.round(w * 0.06);
    return { x: side, y: top, w: w - 2 * side, h: h - top - bottom };
  }
  const m = Math.round(Math.min(w, h) * 0.06);
  return { x: m, y: m, w: w - 2 * m, h: h - 2 * m };
}

const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const requested = (q.get('format') ?? project.format) as FormatName;

export const FORMAT_NAME: FormatName = requested in FORMATS ? requested : project.format;
export const W: number = FORMATS[FORMAT_NAME].w;
export const H: number = FORMATS[FORMAT_NAME].h;
export const SAFE: Rect = safeArea(FORMAT_NAME, W, H);
/** Output scale (1 or 2). Scenes never need it: Layer2D and makeRT handle it. */
export const SCALE = Math.max(1, Math.round(+(q.get('scale') ?? 1)));
export const PW = W * SCALE;
export const PH = H * SCALE;
export const FPS: number = +(q.get('fps') ?? project.fps);
export const IS_VERTICAL = H > W;
