// Typography helpers for Canvas2D layers. Brand fonts load through the FontFace API before the
// first frame, so no frame is ever rendered in a fallback font.
import type { FontSpec } from '../brand';

export async function loadFonts(specs: FontSpec[]) {
  const faces = specs.flatMap((s) => s.files.map((f) => new FontFace(s.family, `url(${f.url})`, {
    weight: f.weight ?? 'normal', style: f.style ?? 'normal', stretch: f.stretch ?? 'normal',
  })));
  const loaded = await Promise.all(faces.map((f) => f.load()));
  for (const f of loaded) document.fonts.add(f);
  await document.fonts.ready;
}

/** A Canvas2D font string for a brand font spec. */
export const font = (spec: FontSpec, px: number, weight: number | string = 400, style = 'normal') =>
  `${style} ${weight} ${px}px "${spec.family}", ${spec.fallback}`;

/**
 * x offset of each glyph when `text` is drawn in one piece, kerning included: glyph i starts at
 * width(text[0..i]) - width(text[i]), so the kern pair before it is kept. Use this to animate
 * letters individually without the spacing drifting from the whole-word setting.
 */
export function glyphLayout(c: CanvasRenderingContext2D, text: string) {
  const chars = [...text];
  let prefix = '';
  return chars.map((ch) => {
    prefix += ch;
    const w = c.measureText(ch).width;
    return { ch, x: c.measureText(prefix).width - w, w };
  });
}

/** Largest size (<= maxPx) at which every line fits maxW. Set `c.font` from the result. */
export function fitSize(c: CanvasRenderingContext2D, lines: string[], spec: FontSpec, weight: number | string, maxW: number, maxPx: number, minPx = 12) {
  let lo = minPx, hi = maxPx;
  for (let i = 0; i < 18; i++) {
    const mid = (lo + hi) / 2;
    c.font = font(spec, mid, weight);
    const w = Math.max(...lines.map((l) => c.measureText(l).width));
    if (w <= maxW) lo = mid; else hi = mid;
  }
  c.font = font(spec, lo, weight);
  return lo;
}

/** Greedy word wrap at the current c.font. A '\n' in the text forces a break (break by meaning). */
export function wrap(c: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  if (text.includes('\n')) return text.split('\n').flatMap((p) => wrap(c, p, maxW));
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && c.measureText(next).width > maxW) { out.push(line); line = word; } else line = next;
  }
  if (line) out.push(line);
  return out;
}

/**
 * Word wrap with even line lengths: the same number of lines as a greedy wrap at maxW, but at
 * the narrowest width that still fits, so a caption never ends on a lone word.
 */
export function wrapBalanced(c: CanvasRenderingContext2D, text: string, maxW: number) {
  const n = wrap(c, text, maxW).length;
  let lo = 0, hi = maxW;
  for (let i = 0; i < 16; i++) {
    const mid = (lo + hi) / 2;
    if (wrap(c, text, mid).length <= n) hi = mid; else lo = mid;
  }
  return wrap(c, text, hi);
}

/** Typographic punctuation for display strings: straight quotes -> curly, ... -> ellipsis. */
export const smart = (s: string) =>
  s.replace(/(^|[\s(\[{"“])'/g, '$1‘').replace(/'/g, '’').replace(/(^|[\s(\[{‘])"/g, '$1“').replace(/"/g, '”').replace(/\.\.\./g, '…');
