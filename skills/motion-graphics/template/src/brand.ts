// Brand tokens. Fill this from a brand profile (see the skill's profiles/). Scenes read colours
// and fonts only from here, so a re-brand is one file.

export interface FontFile { url: string; weight?: string; style?: string; stretch?: string }
export interface FontSpec { family: string; files: FontFile[]; fallback: string }

export const brand = {
  name: 'Brand',
  tagline: 'One sharp line about the product.',
  cta: 'Try it free',
  url: 'example.com',
  /** Logo under public/ (a transparent PNG/SVG), or null to set the name as a wordmark. */
  logo: null as string | null,
  colors: {
    bg: '#0B0B0F', // background
    bg2: '#17171F', // raised panels, the background's second tone
    ink: '#F2EFE8', // primary type
    muted: '#8B8897', // secondary type, hairlines
    accent: '#FF5A1F', // the one signal colour: highlights, the active word, glows
    accent2: '#FFB14A', // hot core of the accent (glows only)
  },
  /** Gradient stops for wordmarks and glows, left to right (empty = solid accent). */
  gradient: [] as string[],
  fonts: {
    display: { family: 'Display', files: [], fallback: '"Segoe UI", "Helvetica Neue", Arial, sans-serif' } as FontSpec,
    body: { family: 'Body', files: [], fallback: '"Segoe UI", "Helvetica Neue", Arial, sans-serif' } as FontSpec,
    mono: { family: 'Mono', files: [], fallback: 'ui-monospace, Consolas, monospace' } as FontSpec,
  },
};

export type ColorKey = keyof typeof brand.colors;
