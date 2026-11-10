import type { Story } from '../engine/runtime';
import { ExampleStory } from './example';

/** One story per page kind (body[data-world]). Add a story per page that needs its own world. */
export const STORIES: Record<string, () => Story> = {
  home: () => new ExampleStory(),
};
