#!/usr/bin/env bun
// Serve the built site (dist/) the way a static host would: directory index files, a 404 page,
// long caching for hashed assets, and the security headers the site is designed to run under.
//   bun scripts/serve.ts [--port 4180]
import path from 'node:path';

const ROOT = path.resolve(import.meta.dir, '..', 'dist');
const i = process.argv.indexOf('--port');
const port = i >= 0 ? +process.argv[i + 1]! : 4180;
const HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
  // no third parties: scripts, styles, fonts and images come from this origin only
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' mailto:",
};

Bun.serve({
  port,
  async fetch(req) {
    const url = new URL(req.url);
    let p = path.join(ROOT, decodeURIComponent(url.pathname));
    if (!p.startsWith(ROOT)) return new Response('Not found', { status: 404 });
    if (url.pathname.endsWith('/')) p = path.join(p, 'index.html');
    let file = Bun.file(p);
    if (!(await file.exists()) && !path.extname(p)) { file = Bun.file(path.join(p, 'index.html')); }
    if (!(await file.exists())) return new Response(Bun.file(path.join(ROOT, '404.html')), { status: 404, headers: { 'Content-Type': 'text/html; charset=utf-8', ...HEADERS } });
    const immutable = url.pathname.startsWith('/assets/');
    return new Response(file, { headers: { ...HEADERS, 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'public, max-age=300' } });
  },
});
console.log(`serving dist/ on http://localhost:${port}/`);
