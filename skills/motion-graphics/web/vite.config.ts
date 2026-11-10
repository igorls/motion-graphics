import { defineConfig, type Plugin, type ViteDevServer } from 'vite';

// Pages are rendered from TypeScript templates (src/site/render.ts), the same function in dev
// (this middleware, re-loaded on every request so copy edits show at once) and in the build
// (scripts/build.ts writes one static HTML file per page and language).
function pages(): Plugin {
  return {
    name: 'site-pages',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        try {
          const url = new URL(req.url ?? '/', 'http://x');
          if (req.method !== 'GET' || /\.[a-z0-9]+$/i.test(url.pathname) || url.pathname.startsWith('/@') || url.pathname.startsWith('/src/') || url.pathname.startsWith('/node_modules/')) return next();
          const mod = await server.ssrLoadModule('/src/site/render.ts');
          const out = mod.renderRoute(url.pathname, { dev: true });
          if (!out) return next();
          const html = await server.transformIndexHtml(url.pathname + url.search, out.html);
          res.statusCode = out.status ?? 200;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(html);
        } catch (e) {
          server.ssrFixStacktrace(e as Error);
          next(e);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [pages()],
  optimizeDeps: { include: ['three'] },
  server: { hmr: process.env.SITE_NO_HMR ? false : true },
  build: {
    target: 'es2022',
    manifest: true,
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: { input: { main: 'src/main.ts' } },
  },
});
