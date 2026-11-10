// Boots the page: the world behind it (when WebGL2 is there and the visitor hasn't asked to save
// data), and the page's own small interactions (ui.ts). The world loads after first paint.
import './styles/site.css';
import { initUI } from './ui';

const root = document.documentElement;
root.classList.replace('no-js', 'js');
initUI();

async function startWorld() {
  const q = new URLSearchParams(location.search);
  const kind = document.body.dataset.world;
  if (!kind) return;
  // ?world=off takes the same path as a failed world, so reviews see the real fallback
  if (q.get('world') === 'off') { root.classList.add('no-world'); return; }
  if (!document.createElement('canvas').getContext('webgl2')) { root.classList.add('no-world'); return; }
  if ((navigator as any).connection?.saveData === true && !q.has('s')) { root.classList.add('no-world'); return; }
  const [{ World }, stories] = await Promise.all([import('./world/engine/runtime'), import('./world/stories')]);
  const make = stories.STORIES[kind];
  if (!make) return;
  await document.fonts.ready; // the world may set text from the page's fonts (labels, points from text)
  try {
    await new World(make()).start();
    root.classList.add('has-world');
  } catch {
    root.classList.add('no-world');
  }
}

startWorld();
