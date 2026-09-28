# Brand profiles

The skill is brand-neutral; everything brand-specific lives in one Markdown file per brand in `<skill-dir>/profiles/` (publishable, e.g. open-source projects) or `<skill-dir>/profiles/local/` (private and client brands, never shared). A profile is what you copy into `src/brand.ts` plus the judgement that code can't hold (voice, what the brand never does, which assets are the good ones).

## When there is no profile

Build one from the source before designing, and offer to save it: `profiles/local/<brand>.md` by default, `profiles/<brand>.md` only when the user says it can be public (an open-source project's public brand is a good candidate):

- **Code:** the global stylesheet and Tailwind/theme config (exact colours, the background, gradients), `@font-face` rules and font files, the logo files the header uses, the product name and tagline from i18n or the landing page, real outputs and screenshots in assets.
- **Website:** the rendered CSS (colours, fonts it loads), logo, OG image, headline/tagline, product screenshots or demo videos.
- If you have to invent anything (a palette role, a font pairing), say so and keep it close to what exists.

## Template

```markdown
# <Brand> — motion profile

## Product
One sentence: what it is, for whom, the outcome. The proof it can show (real outputs, UI moments).

## Voice
3-5 adjectives, words it uses, words it never uses. Tagline(s). CTA wording. Hashtags if any.

## Tokens (-> src/brand.ts)
- name, tagline, cta, url
- colors: bg, bg2, ink, muted, accent, accent2 (hex, with the role each plays)
- gradient: stops, if the brand uses one (wordmark, glows)
- fonts: display / body / mono (family, file paths to copy into public/fonts/, fallback)
- logo: file path (transparent), minimum size, clear space

## Assets
Where the good material is (paths/URLs), which pairs or screens are the strongest, what needs permission (faces of real users, customer logos).

## Look
Default tone preset, motion personality, the brand's signature visual (a shape, a light, a transition) to use as the motif, and the things it never does.

## Formats
Where the brand posts, the formats it needs, anything platform-specific (e.g. always a 4:5 feed cut).
```

## Rules

- The profile's accent colour is the one that glows; if the brand has a gradient, use it for the wordmark and the motif, not for every element.
- Brand fonts must be files you can copy and are licensed for video; if they aren't available, pick the closest open font and note the substitution.
- Real people in product outputs: only use images the brand has rights to show in ads.
