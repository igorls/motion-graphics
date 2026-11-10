// Renders every page to static HTML from the copy. Used by the dev middleware (vite.config.ts) and
// by the build (scripts/build.ts). All content is real HTML, so the site reads without WebGL or
// JavaScript; the world is decoration behind it (body[data-world] picks its story).
import { en, type Copy } from './content/en';
import { site } from './config';
import { home } from './pages/home';

export interface Assets { css: string[]; js: string[] }
export interface Ctx { c: Copy; lang: Lang; route: RouteId; path: string; assets: Assets; dev: boolean }
/** Add languages here (and a content file with the same shape as en.ts). */
export type Lang = 'en';
export type RouteId = 'home';

const COPY: Record<Lang, Copy> = { en };

/** Path of each route in each language (translate the slugs too: /pt-br/como-funciona/). */
export const ROUTES: Record<RouteId, Record<Lang, string>> = {
  home: { en: '/' },
};

const PAGES: Record<RouteId, (x: Ctx) => { body: string; title: string; description: string; world: string; cls: string }> = { home };

export function allPages() {
  const out: { path: string; lang: Lang; route: RouteId }[] = [];
  for (const route of Object.keys(ROUTES) as RouteId[]) for (const lang of Object.keys(COPY) as Lang[]) out.push({ path: ROUTES[route][lang], lang, route });
  return out;
}

const DEV_ASSETS: Assets = { css: ['/src/styles/site.css'], js: ['/src/main.ts'] };

export function renderRoute(path: string, o: { dev?: boolean; assets?: Assets } = {}) {
  const p = path.endsWith('/') ? path : `${path}/`;
  const hit = allPages().find((x) => x.path === p);
  if (!hit) return null;
  return { html: renderPage(hit.route, hit.lang, o.assets ?? DEV_ASSETS, !!o.dev), status: 200 };
}

export const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A chapter's frame baked from the world (shoot.ts posters): the first paint under the canvas, and the picture without WebGL. */
export function poster(page: string, chapter: string, high = false) {
  return `<picture class="poster" aria-hidden="true"><source media="(max-width: 700px)" srcset="/posters/${page}-${chapter}-phone.webp"><img src="/posters/${page}-${chapter}-desktop.webp" alt="" width="1440" height="900" decoding="async"${high ? ' fetchpriority="high"' : ' loading="lazy"'}></picture>`;
}

export function renderPage(route: RouteId, lang: Lang, assets: Assets, dev = false) {
  const c = COPY[lang];
  const x: Ctx = { c, lang, route, path: ROUTES[route][lang], assets, dev };
  const page = PAGES[route](x);
  const alt = (l: Lang) => `${site.origin}${ROUTES[route][l]}`;
  return `<!doctype html>
<html lang="${c.htmlLang}" class="no-js">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(page.title)}</title>
<meta name="description" content="${esc(page.description)}">
<link rel="canonical" href="${alt(lang)}">
${(Object.keys(COPY) as Lang[]).map((l) => `<link rel="alternate" hreflang="${COPY[l].htmlLang}" href="${alt(l)}">`).join('\n')}
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(page.title)}">
<meta property="og:description" content="${esc(page.description)}">
<meta property="og:url" content="${alt(lang)}">
<meta property="og:image" content="${site.origin}/og/${route}-${lang}.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
${assets.css.map((h) => `<link rel="stylesheet" href="${h}">`).join('\n')}
${assets.js.map((h) => `<script type="module" src="${h}"></script>`).join('\n')}
</head>
<body class="${page.cls}" data-world="${page.world}" data-name="${esc(site.name)}" data-lang="${lang}">
<a class="skip" href="#main">${esc(c.common.skip)}</a>
<header class="site-header">
  <a class="brand" href="${ROUTES.home[lang]}">${esc(site.name)}</a>
  <nav class="nav" aria-label="Main"><a href="#cards">${esc(c.common.nav.features)}</a></nav>
  <a class="btn btn-small" href="#end">${esc(c.common.cta)}</a>
</header>
<main id="main">
${page.body}
</main>
<footer class="site-footer"><p>${esc(site.name)}. ${esc(c.common.tagline)}</p></footer>
</body>
</html>`;
}
