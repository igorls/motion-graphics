// Page interactions that don't need the world: still mode for screenshots, the header's glass and
// ink, scroll-stepped phases ([data-steps]) for restaged UI, and the sign-up form. Everything works
// with a keyboard and announces its result.

export function initUI() {
  const q = new URLSearchParams(location.search);
  if (q.has('still')) document.documentElement.classList.add('still');
  if (q.has('og')) document.documentElement.classList.add('og');
  header();
  stepped();
  signup();
}

/** The header's glass appears on scroll; its ink follows what is under it (data-tone light | dark | world). */
function header() {
  const el = document.querySelector<HTMLElement>('.site-header');
  if (!el) return;
  const set = () => {
    el.style.setProperty('--hdr', String(Math.min(1, scrollY / 120)));
    const under = document.elementsFromPoint(innerWidth / 2, 44).map((n) => (n as HTMLElement).closest?.('[data-chapter], .site-footer') as HTMLElement | null).find(Boolean);
    const tone = under?.dataset.tone ?? 'light';
    el.classList.toggle('on-dark', tone === 'dark' || (tone === 'world' && document.documentElement.classList.contains('world-dark')));
  };
  addEventListener('scroll', () => requestAnimationFrame(set), { passive: true });
  document.addEventListener('world-tone', set);
  set();
}

/**
 * Restaged UI that steps with the scroll: an element with data-steps="0.1,0.3,0.6" inside a pinned
 * chapter gets data-phase = the number of thresholds its chapter's pinned progress has passed, and
 * --q (0..1). Style each phase in CSS; the state is exact at any scroll position.
 */
function stepped() {
  const els = [...document.querySelectorAll<HTMLElement>('[data-steps]')];
  const update = () => {
    for (const el of els) {
      const ch = el.closest<HTMLElement>('[data-chapter]');
      if (!ch) continue;
      const r = ch.getBoundingClientRect();
      const q = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - innerHeight)));
      let phase = 0;
      for (const t of el.dataset.steps!.split(',').map(Number)) if (q >= t) phase++;
      if (el.dataset.phase !== String(phase)) el.dataset.phase = String(phase);
      el.style.setProperty('--q', q.toFixed(3));
    }
  };
  addEventListener('scroll', () => requestAnimationFrame(update), { passive: true });
  addEventListener('resize', update);
  update();
  (window as any).__ui = { update };
}

/** Posts to the configured endpoint; without one, opens a short email instead. */
function signup() {
  const form = document.querySelector<HTMLFormElement>('.signup');
  if (!form) return;
  const input = form.querySelector<HTMLInputElement>('input[type=email]')!, status = form.querySelector<HTMLElement>('.form-status')!;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = input.value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { status.textContent = 'Please enter an email address.'; input.focus(); return; }
    if (!form.dataset.endpoint) { location.href = `mailto:${form.dataset.mailto}?subject=${encodeURIComponent('Sign me up')}&body=${encodeURIComponent(email)}`; return; }
    status.textContent = 'Sending…';
    try {
      const res = await fetch(form.dataset.endpoint, { method: 'POST', body: new URLSearchParams({ email, lang: document.body.dataset.lang ?? 'en' }) });
      if (!res.ok) throw new Error(String(res.status));
      status.textContent = 'Thank you.';
      document.dispatchEvent(new CustomEvent('joined'));
    } catch {
      status.textContent = 'That didn’t go through. Please try again.';
    }
  });
}
