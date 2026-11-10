// The scroll is the playhead. Every element with [data-chapter] is one chapter of the story,
// in document order; chapter i spans story time [i, i + 1) from the moment its top reaches the
// top of the viewport until the next chapter's top does. The world renders as a pure function of
// story time, so any scroll position (and any ?s= deep link) shows the same frame every time.
//
// A pinned chapter ([data-pin]: a tall section with a position: sticky child of one viewport)
// holds still for the first `pinEnd` of its span; the rest is the hand-off, while the next chapter
// scrolls in over it. Author the world's events inside the pinned part.

export interface Chapter {
  id: string;
  el: HTMLElement;
  /** Document y of the top, and the height (css px). */
  top: number;
  height: number;
  /** Fraction of the chapter's span that is pinned (0 for chapters that just scroll). */
  pinEnd: number;
}

export class Chapters {
  list: Chapter[] = [];
  private anchors: number[] = [0];

  constructor(private root: ParentNode = document) { this.measure(); }

  /** Re-read positions (call on resize and after layout changes such as font loading). */
  measure() {
    const els = [...this.root.querySelectorAll<HTMLElement>('[data-chapter]')];
    const y = window.scrollY, vh = window.innerHeight;
    const max = Math.max(0, document.documentElement.scrollHeight - vh);
    this.list = els.map((el) => {
      const r = el.getBoundingClientRect();
      const height = r.height;
      const pinEnd = el.hasAttribute('data-pin') && height > vh ? (height - vh) / height : 0;
      return { id: el.dataset.chapter!, el, top: r.top + y, height, pinEnd };
    });
    const a = this.list.map((c) => Math.min(c.top, max));
    a.push(max);
    for (let i = 1; i < a.length; i++) a[i] = Math.max(a[i]!, a[i - 1]! + 1); // strictly increasing
    this.anchors = a;
  }

  get count() { return this.list.length; }

  /** Story time at a scroll position. */
  storyAt(y: number) {
    const a = this.anchors, n = this.list.length;
    if (n === 0 || y <= a[0]!) return 0;
    for (let i = 0; i < n; i++) if (y < a[i + 1]!) return i + (y - a[i]!) / (a[i + 1]! - a[i]!);
    return n;
  }

  /** Scroll position for a story time (the inverse; for deep links and screenshots). */
  scrollFor(s: number) {
    const a = this.anchors, n = this.list.length;
    if (n === 0) return 0;
    const i = Math.min(n - 1, Math.max(0, Math.floor(s))), k = Math.min(1, Math.max(0, s - i));
    return a[i]! + (a[i + 1]! - a[i]!) * k;
  }

  index(id: string) { return this.list.findIndex((c) => c.id === id); }
}

/** Progress helpers for authoring a chapter's events in story time. */
export const story = {
  /** 0..1 through the pinned part of chapter i (holds at 1 during the hand-off). */
  pin(s: number, i: number, pinEnd: number) { return Math.min(1, Math.max(0, (s - i) / Math.max(1e-3, pinEnd))); },
  /** 0..1 through the hand-off after chapter i's pin releases. */
  release(s: number, i: number, pinEnd: number) { return Math.min(1, Math.max(0, (s - i - pinEnd) / Math.max(1e-3, 1 - pinEnd))); },
};
