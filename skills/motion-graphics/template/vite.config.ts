import { defineConfig } from 'vite';

// MG_NO_HMR=1: no live reload. The offline renderer starts its own server this way, so a file
// saved mid-render cannot reload the page and splice two versions of a scene into one video.
export default defineConfig({
  server: { hmr: process.env.MG_NO_HMR ? false : true },
  build: { target: 'es2022' },
});
