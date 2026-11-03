// Draws markup notes onto a 2D canvas sized to the video frame. Shared by the markup page (live overlay)
// and scripts/markup.ts export (burned into the stills), so what the reviewer drew is what the agent sees.
// Shapes are in normalised frame coordinates: x, y in [0, 1] from the frame's top-left.
(function (g) {
  const COLOR = { open: '#ffb21e', resolved: '#7fd69a', active: '#4cc8ff', draft: '#ff5ad1' };

  /** Line width and badge size for a frame of this size (the same look at 540p and 2160p). */
  const unit = (w, h) => Math.max(2, Math.round(Math.min(w, h) / 270));

  function badge(c, x, y, text, color, u) {
    const r = u * 5.5;
    c.font = `700 ${Math.round(r * 1.15)}px ui-sans-serif, system-ui, sans-serif`;
    const tw = c.measureText(text).width;
    const bw = Math.max(r * 2, tw + r * 1.1);
    const bx = Math.min(Math.max(x - bw / 2, 1), c.canvas.width - bw - 1), by = Math.min(Math.max(y - r, 1), c.canvas.height - r * 2 - 1);
    c.fillStyle = 'rgba(0,0,0,0.55)';
    c.beginPath(); c.roundRect(bx - u * 0.6, by - u * 0.6, bw + u * 1.2, r * 2 + u * 1.2, r + u * 0.6); c.fill();
    c.fillStyle = color;
    c.beginPath(); c.roundRect(bx, by, bw, r * 2, r); c.fill();
    c.fillStyle = '#111'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(text, bx + bw / 2, by + r + u * 0.1);
  }

  /** A path stroked twice: a dark halo so the colour reads over any footage, then the colour. */
  function haloStroke(c, build, color, lw, dash) {
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.setLineDash([]);
    c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = lw + Math.max(2, lw * 0.9);
    build(); c.stroke();
    c.setLineDash(dash ? [lw * 3, lw * 2.2] : []);
    c.strokeStyle = color; c.lineWidth = lw;
    build(); c.stroke();
    c.setLineDash([]);
  }

  /** Where a shape's number badge goes (frame px). */
  function anchor(shape, w, h) {
    if (!shape) return null;
    if (shape.type === 'pin') return [shape.x * w, shape.y * h];
    if (shape.type === 'rect') return [shape.x * w, shape.y * h];
    if (shape.type === 'stroke') { const p = shape.paths?.[0]?.[0]; return p ? [p[0] * w, p[1] * h] : null; }
    return null;
  }

  /**
   * Draw one note's shape. opts: { label: '3', color, dashed, alpha }.
   * Notes without a shape (a frame or range note) draw nothing on the frame.
   */
  function drawShape(c, shape, w, h, opts = {}) {
    if (!shape) return;
    const u = unit(w, h), color = opts.color ?? COLOR.open, lw = u * 1.15;
    c.save();
    c.globalAlpha = opts.alpha ?? 1;
    if (shape.type === 'rect') {
      const x = shape.x * w, y = shape.y * h, rw = shape.w * w, rh = shape.h * h;
      haloStroke(c, () => { c.beginPath(); c.rect(x, y, rw, rh); }, color, lw, opts.dashed);
    } else if (shape.type === 'stroke') {
      for (const p of shape.paths ?? []) {
        if (!p.length) continue;
        haloStroke(c, () => {
          c.beginPath(); c.moveTo(p[0][0] * w, p[0][1] * h);
          if (p.length === 1) c.lineTo(p[0][0] * w + 0.1, p[0][1] * h);
          for (let i = 1; i < p.length; i++) c.lineTo(p[i][0] * w, p[i][1] * h);
        }, color, lw, opts.dashed);
      }
    } else if (shape.type === 'pin') {
      const x = shape.x * w, y = shape.y * h, r = u * 7;
      haloStroke(c, () => { c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); }, color, lw, opts.dashed);
      haloStroke(c, () => { c.beginPath(); c.moveTo(x - r * 1.7, y); c.lineTo(x - r * 0.55, y); c.moveTo(x + r * 0.55, y); c.lineTo(x + r * 1.7, y);
        c.moveTo(x, y - r * 1.7); c.lineTo(x, y - r * 0.55); c.moveTo(x, y + r * 0.55); c.lineTo(x, y + r * 1.7); }, color, lw * 0.8, false);
    }
    if (opts.label != null) {
      const a = anchor(shape, w, h);
      if (a) {
        const off = shape.type === 'pin' ? u * 13 : u * 1;
        badge(c, a[0] + (shape.type === 'pin' ? off : 0), a[1] - (shape.type === 'pin' ? off : off), String(opts.label), color, u);
      }
    }
    c.restore();
  }

  /** Hit test in normalised coords: is (x, y) on this shape? tol in normalised units. */
  function hit(shape, x, y, tol, aspect = 1) {
    if (!shape) return false;
    const d = (ax, ay, bx, by) => Math.hypot((ax - bx) * aspect, ay - by);
    if (shape.type === 'pin') return d(x, y, shape.x, shape.y) < tol * 2;
    if (shape.type === 'rect') {
      const inX = x > shape.x - tol && x < shape.x + shape.w + tol, inY = y > shape.y - tol && y < shape.y + shape.h + tol;
      return inX && inY;
    }
    if (shape.type === 'stroke') {
      for (const p of shape.paths ?? []) for (let i = 0; i < p.length; i++) {
        const a = p[i], b = p[Math.min(i + 1, p.length - 1)];
        const vx = b[0] - a[0], vy = b[1] - a[1], L = vx * vx + vy * vy;
        const s = L ? Math.max(0, Math.min(1, ((x - a[0]) * vx + (y - a[1]) * vy) / L)) : 0;
        if (d(x, y, a[0] + vx * s, a[1] + vy * s) < tol) return true;
      }
    }
    return false;
  }

  /** Shape bounds in normalised coords: [x0, y0, x1, y1]. */
  function bounds(shape) {
    if (!shape) return null;
    if (shape.type === 'pin') return [shape.x, shape.y, shape.x, shape.y];
    if (shape.type === 'rect') return [shape.x, shape.y, shape.x + shape.w, shape.y + shape.h];
    const pts = (shape.paths ?? []).flat();
    if (!pts.length) return null;
    return [Math.min(...pts.map((p) => p[0])), Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[1]))];
  }

  g.MarkupDraw = { COLOR, unit, badge, drawShape, hit, bounds };
})(globalThis);
