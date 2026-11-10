// All copy for one language. Add a file per language with the same shape (see render.ts).
// Every visible word lives here: the world never carries the only copy of anything.
export const en = {
  lang: 'en',
  htmlLang: 'en',
  common: {
    skip: 'Skip to content',
    nav: { features: 'Features', about: 'About' },
    cta: 'Get started',
    tagline: 'One sharp line about the product.',
  },
  home: {
    title: 'Brand: one sharp line about the product',
    description: 'What it is, who it is for, and why it matters, in one sentence.',
    hero: { eyebrow: 'What it is', h1: ['The message,', 'big and short.'], lede: 'One or two sentences that say what the product does for the reader, in their words.', primary: 'Get started', secondary: 'How it works' },
    build: { eyebrow: 'The idea', h2: 'The wow moment lands on the scroll’s peak.', body: 'Pin a chapter, put the motion inside its pinned part, and let the visitor scroll it.', label: 'Assembled from real pieces' },
    cards: { h2: 'Then the page reads like a page.', items: [
      { title: 'Real HTML', body: 'Every word is in the page: it indexes, translates and reads without WebGL.' },
      { title: 'One world', body: 'A fixed canvas behind the content renders the story as a function of scroll.' },
      { title: 'Asleep when covered', body: 'Opaque sections pause the world while they fill the screen.' },
    ] },
    end: { h2: 'Ask for the one action.', body: 'Leave an email and we’ll write when it’s ready.', label: 'Your email', button: 'Get started', fine: 'No trackers on this site.' },
  },
};
export type Copy = typeof en;
