// EXAMPLE PAGE: four chapters that show the mechanics. A real page has its own structure.
//   hero    (data-tone="light")                 copy left, the world's subject right
//   build   (data-pin, data-tone="world")       a pinned chapter: the world plays the wow; its line waits for it (data-reveal)
//   cards   (data-cover)                        opaque: the world sleeps while it fills the screen
//   end     (data-tone="world")                 the action, over the world again
import { esc, poster, type Ctx } from '../render';
import { site } from '../config';

export function home(x: Ctx) {
  const h = x.c.home;
  const body = `
<section class="ch ch-hero" data-chapter="hero" data-tone="light" aria-labelledby="hero-h">
  ${poster('home', 'hero', true)}
  <div class="hero-copy" data-keep>
    <p class="eyebrow">${esc(h.hero.eyebrow)}</p>
    <h1 id="hero-h" class="display">${h.hero.h1.map((l) => `<span>${esc(l)}</span>`).join(' ')}</h1>
    <p class="lede">${esc(h.hero.lede)}</p>
    <div class="actions"><a class="btn" href="#end">${esc(h.hero.primary)}</a><a class="btn btn-ghost" href="#cards">${esc(h.hero.secondary)}</a></div>
  </div>
</section>

<section class="ch ch-build" data-chapter="build" data-pin data-tone="world" aria-labelledby="build-h">
  <div class="pin">
    <div class="statement" data-steps="0.8" data-reveal data-keep>
      <p class="eyebrow">${esc(h.build.eyebrow)}</p>
      <h2 id="build-h" class="display-s">${esc(h.build.h2)}</h2>
      <p class="lede">${esc(h.build.body)}</p>
    </div>
    <div class="labels" aria-hidden="true" data-labels="build" data-label="${esc(h.build.label)}"></div>
  </div>
</section>

<section class="ch ch-cards" id="cards" data-chapter="cards" data-cover data-tone="light" aria-labelledby="cards-h">
  <div class="wrap">
    <h2 id="cards-h">${esc(h.cards.h2)}</h2>
    <ul class="cards">${h.cards.items.map((it) => `<li class="card"><h3>${esc(it.title)}</h3><p>${esc(it.body)}</p></li>`).join('')}</ul>
  </div>
</section>

<section class="ch ch-end" id="end" data-chapter="end" data-tone="world" aria-labelledby="end-h">
  <div class="wrap end-wrap">
    <h2 id="end-h" class="display" data-keep>${esc(h.end.h2)}</h2>
    <p class="lede" data-keep>${esc(h.end.body)}</p>
    <form class="signup" data-keep method="post" action="${esc(site.signup.endpoint || `mailto:${site.email.hello}`)}" data-endpoint="${esc(site.signup.endpoint)}" data-mailto="${esc(site.email.hello)}" novalidate>
      <label for="email">${esc(h.end.label)}</label>
      <div class="field"><input id="email" name="email" type="email" autocomplete="email" required><button class="btn" type="submit">${esc(h.end.button)}</button></div>
      <p class="fine">${esc(h.end.fine)}</p>
      <p class="form-status" role="status" aria-live="polite"></p>
    </form>
  </div>
</section>`;
  return { body, title: h.title, description: h.description, world: 'home', cls: 'page-home' };
}
