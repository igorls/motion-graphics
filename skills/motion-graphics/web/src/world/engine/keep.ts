// The page's words as keep-out zones for the world. Each frame the runtime measures the on-screen
// boxes of the [data-keep] elements (css px, from the viewport's top-left) and hands them to the
// story (WorldFrame.keep). A story slides its subject clear of them (clearOf), and the post pass
// can calm the world behind them (PostParams.calm) where a shot can't leave a calm area.
// Elements that are waiting for their event ([data-reveal] at phase 0) don't count yet.

export interface Box { x0: number; y0: number; x1: number; y1: number }

export function measureKeep(els: HTMLElement[], out: Box[], max = 6): Box[] {
  out.length = 0;
  const W = innerWidth, H = innerHeight;
  for (const el of els) {
    if (out.length >= max) break;
    if (el.closest('[data-reveal][data-phase="0"]')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.bottom <= 0 || r.top >= H || r.right <= 0 || r.left >= W) continue;
    out.push({ x0: r.left, y0: r.top, x1: r.right, y1: r.bottom });
  }
  return out;
}

/** The shift along one axis that moves a circle (centre x, y, radius r) off box b; 0 when it's already clear. */
function needed(b: Box, x: number, y: number, r: number, axis: 'x' | 'y') {
  if (axis === 'x') {
    const d = y < b.y0 ? b.y0 - y : y > b.y1 ? y - b.y1 : 0;
    if (d >= r) return 0;
    const half = Math.sqrt(r * r - d * d);
    if (x - half >= b.x1 || x + half <= b.x0) return 0;
    return x >= (b.x0 + b.x1) / 2 ? b.x1 + half - x : b.x0 - half - x;
  }
  const d = x < b.x0 ? b.x0 - x : x > b.x1 ? x - b.x1 : 0;
  if (d >= r) return 0;
  const half = Math.sqrt(r * r - d * d);
  if (y - half >= b.y1 || y + half <= b.y0) return 0;
  return y >= (b.y0 + b.y1) / 2 ? b.y1 + half - y : b.y0 - half - y;
}

/**
 * How far to slide a round subject (centre cx, cy and radius r, css px) so that it clears the boxes by
 * `margin`: along x (wide screens: beside the copy; each box pushes it away from its own centre), or
 * 'down' (tall screens: below the copy that has settled above it; copy still arriving from below is
 * left to overlapOf). Returns the shift in px; 0 when nothing overlaps.
 */
export function clearOf(boxes: Box[], cx: number, cy: number, r: number, dir: 'x' | 'down', margin = 28): number {
  let shift = 0;
  for (let pass = 0; pass < 4; pass++) {
    let moved = false;
    for (const b of boxes) {
      if (dir === 'down' && (b.y0 + b.y1) / 2 > cy + shift) continue;
      const n = needed(b, dir === 'x' ? cx + shift : cx, dir === 'down' ? cy + shift : cy, r + margin, dir === 'x' ? 'x' : 'y');
      if (dir === 'down' ? n > 0 : n !== 0) { shift += n; moved = true; }
    }
    if (!moved) break;
  }
  return shift;
}

/**
 * How much of a round subject's box (centre cx, cy, radius r) the copy covers, 0..1 (the largest
 * share under any one box). Tall screens fade the subject by it (pass the inner part of the subject,
 * after clearOf's push) while copy scrolls across it in a hand-off.
 */
export function overlapOf(boxes: Box[], cx: number, cy: number, r: number): number {
  let m = 0;
  for (const b of boxes) {
    const w = Math.min(cx + r, b.x1) - Math.max(cx - r, b.x0), h = Math.min(cy + r, b.y1) - Math.max(cy - r, b.y0);
    if (w > 0 && h > 0) m = Math.max(m, (w * h) / (4 * r * r));
  }
  return Math.min(1, m);
}
