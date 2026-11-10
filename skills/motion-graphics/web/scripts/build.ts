#!/usr/bin/env bun
// Production build: Vite bundles the script and the styles (hashed), then every page is rendered
// to static HTML in every language with those assets, plus a sitemap with language alternates,
// robots.txt and a 404 page. The output in dist/ is a plain static site: any host serves it.
import { build } from 'vite';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { allPages, renderPage, ROUTES, type Assets } from '../src/site/render';
import { site } from '../src/site/config';

const ROOT = path.resolve(import.meta.dir, '..');
const DIST = path.join(ROOT, 'dist');

await build({ root: ROOT, logLevel: 'warn' });
const manifest = JSON.parse(readFileSync(path.join(DIST, '.vite', 'manifest.json'), 'utf8')) as Record<string, { file: string; css?: string[]; isEntry?: boolean }>;
const entry = manifest['src/main.ts'];
if (!entry) throw new Error('no entry for src/main.ts in the manifest');
const assets: Assets = { css: (entry.css ?? []).map((f) => `/${f}`), js: [`/${entry.file}`] };

const pages = allPages();
for (const p of pages) {
  const html = renderPage(p.route, p.lang, assets);
  const dir = path.join(DIST, ...p.path.split('/').filter(Boolean));
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'index.html'), html);
}

// 404: the home page's header and footer around a way back
writeFileSync(path.join(DIST, '404.html'), renderPage('home', 'en', assets).replace(/<main id="main">[\s\S]*<\/main>/, `<main id="main"><section class="ch ch-hero" data-tone="light"><div class="hero-copy"><p class="eyebrow">404</p><h1 class="display">This page isn’t here.</h1><p class="lede"><a href="/">Go back home</a>.</p></div></section></main>`).replace('data-world="home"', 'data-world=""'));

// sitemap with hreflang alternates, and robots.txt
// every route in every language, each listing all its language versions
const routes = Object.values(ROUTES) as Record<string, string>[];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${routes.flatMap((byLang) => Object.values(byLang).map((p) => `  <url><loc>${site.origin}${p}</loc>${Object.entries(byLang).map(([l, q]) => `<xhtml:link rel="alternate" hreflang="${l}" href="${site.origin}${q}"/>`).join('')}</url>`)).join('\n')}
</urlset>
`;
writeFileSync(path.join(DIST, 'sitemap.xml'), sitemap);
writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${site.origin}/sitemap.xml\n`);

console.log(`built ${pages.length} pages into dist/ (${assets.js[0]}, ${assets.css.join(', ')})`);
