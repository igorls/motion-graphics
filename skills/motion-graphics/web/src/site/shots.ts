// Which moments become posters and share images (scripts/shoot.ts posters | og).
// Pick settled, strong frames: the hero, each pinned chapter's peak, the end.
export const shots = {
  /** Per page: its path and the story time of each chapter's poster (public/posters/<page>-<chapter>-<vp>.webp). */
  posters: {
    home: { path: '/', at: { hero: 0, build: 1.6, end: 3.4 } },
  } as Record<string, { path: string; at: Record<string, number> }>,
  /** Share images, 1200x630 (public/og/<route>-<lang>.png). */
  og: [
    { route: 'home', lang: 'en', path: '/', s: 1.6 },
  ] as { route: string; lang: string; path: string; s: number }[],
};
