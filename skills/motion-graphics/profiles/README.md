# Brand profiles

One Markdown file per brand: the tokens that go into a piece's `src/brand.ts` plus the judgement code can't hold (voice, the good assets, what the brand never does). The template is in [../references/brand-profiles.md](../references/brand-profiles.md).

- `profiles/<brand>.md`: profiles you are happy to publish with the skill (open-source projects, your own public brand).
- `profiles/local/<brand>.md`: gitignored. Private, client or work brands.

When a request names a product, look for its profile in both places; if there is none, build one from the source (see brand-profiles.md) and offer to save it (in `local/` unless the user says it can be public).
