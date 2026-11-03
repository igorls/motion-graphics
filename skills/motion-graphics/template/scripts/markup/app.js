// The markup page: play a render (or the live engine), scrub frame by frame, and pin notes to exact
// frames, regions and ranges. Notes are saved one by one to the .markup.json next to the video by
// scripts/markup.ts; the page polls it, so notes the agent resolves show up here.
const D = globalThis.MarkupDraw;
const $ = (id) => document.getElementById(id);
const API = '/__markup/api';

const S = {
  doc: null, mode: 'video', version: 0, mediaVersion: 0, codeVersion: 0,
  fps: 30, frames: 1, width: 1920, height: 1080,
  frame: 0, playing: false, tool: 'select', draft: null, editing: null, selected: null,
  inF: null, outF: null, view: [0, 1], hoverF: null, showResolved: false,
};
let media = null;

// ---------- time and scenes ----------
const tOf = (f) => f / S.fps;
const clampF = (f) => Math.max(0, Math.min(S.frames - 1, Math.round(f)));
function fmt(t) {
  const m = Math.floor(t / 60), s = t - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
}
/** The scene a frame falls in (compared at mid-frame, so a cut frame belongs to the scene it starts). */
function sceneAt(f) {
  const t = (f + 0.5) / S.fps;
  return (S.doc?.scenes ?? []).find((s) => t >= s.start && t < s.end) ?? null;
}
const sceneLabel = (f) => { const s = sceneAt(f); return s ? `${s.id} +${(tOf(f) - s.start).toFixed(2)}s` : ''; };

// ---------- media adapters: a finished MP4, or the project's live engine ----------
function videoMedia(src) {
  const v = document.createElement('video');
  v.src = src; v.preload = 'auto'; v.playsInline = true; v.crossOrigin = 'anonymous';
  $('wrap').prepend(v);
  const onFrame = (_now, meta) => {
    if (S.playing) setFrame(Math.round(meta.mediaTime * S.fps), false);
    v.requestVideoFrameCallback(onFrame);
  };
  v.requestVideoFrameCallback?.(onFrame);
  v.addEventListener('ended', () => { S.playing = false; syncPlayButton(); });
  return {
    el: v,
    ready: new Promise((res, rej) => { v.addEventListener('loadedmetadata', res, { once: true }); v.addEventListener('error', () => rej(new Error('the video did not load')), { once: true }); }),
    // the middle of the frame's interval: robust against rounding in the decoder's timestamps
    seek(f) { v.currentTime = (f + 0.5) / S.fps; },
    // on pause, land exactly on the last frame shown (its number came from requestVideoFrameCallback)
    play() { v.play(); }, pause() { v.pause(); this.seek(S.frame); },
    tick() {},
    rate(r) { v.playbackRate = r; },
    reload(src2) { const f = S.frame; v.src = src2; v.addEventListener('loadedmetadata', () => this.seek(f), { once: true }); },
  };
}

function liveMedia(src) {
  const fr = document.createElement('iframe');
  fr.src = src; $('wrap').prepend(fr);
  let mg = null, music = null, voice = [], clock0 = 0, t0 = 0, last = -1, rate = 1;
  const boot = () => new Promise((res, rej) => {
    const poll = () => {
      const m = fr.contentWindow?.__mg;
      if (m?.error) return rej(new Error(m.error));
      if (m?.ready) return res(m);
      setTimeout(poll, 100);
    };
    fr.addEventListener('load', poll, { once: true });
  });
  const draw = (f) => { if (mg && f !== last) { last = f; try { mg.still(tOf(f), 1, 0.5); } catch (e) { console.error(e); } } };
  const syncVoice = (t) => {
    for (const { c, el } of voice) {
      const inside = S.playing && t >= c.t && t < c.t + c.duration;
      if (inside && el.paused) { el.currentTime = t - c.t; el.playbackRate = rate; el.play(); } else if (!inside && !el.paused) el.pause();
    }
  };
  // a (re)loaded engine brings its own audio, size, length and timeline
  const adopt = (m) => {
    mg = m;
    music?.pause(); for (const { el } of voice) el.pause();
    music = m.music ? Object.assign(new Audio('/' + m.music), { preload: 'auto' }) : null;
    voice = (m.voice ?? []).map((c) => ({ c, el: new Audio('/' + c.file) }));
    fr.width = m.width; fr.height = m.height;
    api.info = { fps: m.fps, duration: m.duration, width: m.width, height: m.height, format: m.format, scenes: m.timeline, title: m.title };
  };
  const api = {
    el: fr, info: null,
    /** The engine's window.__mg (null while it reloads). */
    get mg() { return mg; },
    /** Render the current frame again (after a control changed). */
    redraw() { last = -1; },
    ready: boot().then(adopt),
    seek(f) { last = -1; draw(f); if (music) music.currentTime = tOf(f); t0 = tOf(f); clock0 = performance.now(); },
    play() { t0 = tOf(S.frame); clock0 = performance.now(); if (music) { music.currentTime = t0; music.playbackRate = rate; music.play(); } },
    pause() { music?.pause(); syncVoice(-1); },
    tick() {
      if (S.playing) {
        const t = music && !music.paused ? music.currentTime : t0 + ((performance.now() - clock0) / 1000) * rate;
        if (t >= tOf(S.frames - 1)) { togglePlay(false); setFrame(S.frames - 1, true); return; }
        syncVoice(t);
        setFrame(Math.floor(t * S.fps), false);
      }
      draw(S.frame);
    },
    rate(r) {
      rate = r; if (music) music.playbackRate = r;
      for (const { el } of voice) el.playbackRate = r;
      t0 = tOf(S.frame); clock0 = performance.now();
    },
    reload() {
      const f = S.frame; togglePlay(false); mg = null; last = -1;
      fr.src = fr.src;
      boot()
        .then(async (m) => { adopt(m); await engineChanged(f); toast('engine reloaded after a code change'); })
        .catch((e) => toast('engine error: ' + e.message, true));
    },
  };
  return api;
}

// ---------- layout ----------
function layout() {
  const st = $('stage').getBoundingClientRect(), pad = 12;
  const k = Math.min((st.width - pad * 2) / S.width, (st.height - pad * 2) / S.height);
  const w = Math.max(1, Math.floor(S.width * k)), h = Math.max(1, Math.floor(S.height * k));
  Object.assign($('wrap').style, { width: `${w}px`, height: `${h}px`, left: `${(st.width - w) / 2}px`, top: `${(st.height - h) / 2}px` });
  if (S.mode === 'live' && media) media.el.style.transform = `scale(${w / S.width})`;
  const dpr = devicePixelRatio || 1;
  for (const [c, cw, ch] of [[$('ov'), w, h], [$('tl'), $('tl').clientWidth, $('tl').clientHeight]]) {
    c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr);
  }
}

// ---------- state changes ----------
function setFrame(f, seek = true) {
  f = clampF(f);
  if (f === S.frame && !seek) return;
  S.frame = f;
  if (seek && media) media.seek(f);
  const v = S.view, span = v[1] - v[0];
  if (f < v[0] || f > v[1]) { S.view = [Math.max(0, f - span * 0.1), 0]; S.view[1] = S.view[0] + span; }
}
function togglePlay(on = !S.playing) {
  if (on === S.playing) return;
  if (on && S.draft) return;
  S.playing = on;
  if (on) { if (S.frame >= S.frames - 1) setFrame(0); media.play(); } else media.pause();
  syncPlayButton();
}
const syncPlayButton = () => { $('bPlay').textContent = S.playing ? '❚❚' : '▶︎'; };
function setTool(t) {
  S.tool = t;
  for (const b of document.querySelectorAll('[data-tool]')) b.classList.toggle('on', b.dataset.tool === t);
  $('ov').className = `tool-${t}`;
}
function sceneJump(dir) {
  const sc = S.doc.scenes ?? [];
  if (!sc.length) return setFrame(dir > 0 ? S.frames - 1 : 0);
  const starts = sc.map((s) => Math.round(s.start * S.fps));
  const f = dir > 0 ? starts.find((x) => x > S.frame) ?? S.frames - 1 : [...starts].reverse().find((x) => x < S.frame) ?? 0;
  setFrame(f);
}
function marksText() {
  const a = S.inF, b = S.outF;
  $('marks').textContent = a == null && b == null ? '' : `in ${a ?? '–'} · out ${b ?? '–'}${a != null && b != null ? ` · ${((b - a) / S.fps).toFixed(2)} s` : ''}`;
  $('bRangeNote').disabled = a == null || b == null;
}

// ---------- the doc and saving ----------
let saveTimer = 0;
function saved(msg, err = false) { const el = $('saved'); el.textContent = msg; el.classList.toggle('err', err); }
function toast(msg, err = false) { saved(msg, err); clearTimeout(saveTimer); saveTimer = setTimeout(() => saved(`${S.doc.notes.length} notes saved`), 3500); }
async function api(method, url, body) {
  const r = await fetch(API + url, { method, headers: body ? { 'content-type': 'application/json' } : {}, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}
function accept(res) {
  S.doc = res.doc; S.version = res.version;
  if (S.selected && !S.doc.notes.some((n) => n.id === S.selected)) S.selected = null;
  renderList();
}
async function putNote(n) {
  saved('saving…');
  try { accept(await api('PUT', `/notes/${n.id}`, n)); saved(`saved ${n.id}`); } catch (e) { saved('save failed: ' + e.message, true); throw e; }
}
async function poll() {
  try {
    const r = await api('GET', '/doc');
    if (r.version !== S.version) accept(r);
    if (r.mediaVersion !== S.mediaVersion && S.mode === 'video') {
      const b = $('banner'); b.hidden = false;
      b.innerHTML = 'The video was re-rendered. <button>Reload it</button>';
      b.querySelector('button').onclick = () => { S.mediaVersion = r.mediaVersion; media.reload(r.media); b.hidden = true; };
    }
    if (r.codeVersion !== S.codeVersion && S.mode === 'live') { S.codeVersion = r.codeVersion; media.reload(); }
  } catch { saved('server unreachable', true); }
  setTimeout(poll, 2000);
}
const nextId = () => `n${1 + Math.max(0, ...S.doc.notes.map((n) => +n.id.slice(1) || 0))}`;

// ---------- composer ----------
function openComposer(d) {
  S.draft = d; togglePlay(false);
  const kind = kindOf(d);
  $('cCtx').textContent = `${S.editing ? `Edit ${S.editing}` : `New ${kind} note`} · f${d.frame} · ${fmt(tOf(d.frame))}${sceneAt(d.frame) ? ' · ' + sceneAt(d.frame).id : ''}`;
  const haveRange = S.inF != null && S.outF != null;
  const r = d.range ?? (haveRange ? { inFrame: Math.min(S.inF, S.outF), outFrame: Math.max(S.inF, S.outF) } : null);
  $('cRangeRow').hidden = !r;
  $('cRange').checked = !!d.range || kind === 'range';
  $('cRange').disabled = kind === 'range';
  if (r) $('cRangeLbl').textContent = `spans in→out: f${r.inFrame}–f${r.outFrame} (${((r.outFrame - r.inFrame) / S.fps).toFixed(2)} s)`;
  d._range = r;
  $('composer').hidden = false;
  if (!$('cText').value && d.text) $('cText').value = d.text;
  $('cText').focus();
}
function closeComposer() { S.draft = null; S.editing = null; $('composer').hidden = true; $('cText').value = ''; $('cText').blur(); }
const kindOf = (n) => (n.tune ? 'change' : n.variants ? 'proposal' : n.shape ? { rect: 'box', stroke: 'drawing', pin: 'pin' }[n.shape.type] : n.range ? 'range' : 'frame');
async function saveDraft() {
  const d = S.draft; if (!d) return;
  const text = $('cText').value.trim();
  if (!text) { $('cText').placeholder = 'Write the note first.'; $('cText').focus(); return; }
  const old = S.editing ? S.doc.notes.find((n) => n.id === S.editing) : null;
  const r = $('cRange').checked ? d._range : null;
  const note = {
    ...(old ?? {}),
    id: old?.id ?? nextId(),
    frame: d.frame, t: tOf(d.frame),
    range: r ? { inFrame: r.inFrame, outFrame: r.outFrame, in: tOf(r.inFrame), out: tOf(r.outFrame) } : null,
    shape: d.shape ?? null,
    text, author: old?.author ?? ($('author').value.trim() || 'reviewer'),
    status: old?.status ?? 'open', created: old?.created ?? new Date().toISOString(),
  };
  closeComposer();
  S.selected = note.id;
  S.doc.notes = [...S.doc.notes.filter((n) => n.id !== note.id), note];
  renderList();
  await putNote(note).catch(() => {});
}
function editNote(n) {
  S.editing = n.id; setFrame(n.frame);
  $('cText').value = n.text;
  openComposer({ frame: n.frame, shape: n.shape, range: n.range, text: n.text });
}

// ---------- blocks: the controls a scene declares (live mode; see src/engine/controls.ts) ----------
const fmtV = (v) => (v === null ? '(code)' : typeof v === 'number' ? String(+v.toFixed(4)) : Array.isArray(v) ? `[${v.map((x) => +(+x).toFixed(3)).join(', ')}]` : String(v));
const changeLine = (set, was) => Object.keys(set).map((k) => `${k} ${fmtV(was[k])} → ${fmtV(set[k])}`).join('\n');
function leaves(c, prefix = '') {
  return Object.entries(c).flatMap(([k, v]) => (v.type === 'group' ? [{ group: v.label ?? k }, ...leaves(v.controls, `${prefix}${k}.`)] : [{ key: `${prefix}${k}`, c: v }]));
}
function refreshBlocks() {
  S.blocks = media?.mg?.blocks?.() ?? [];
  S.blockShown = undefined;
}
const blockById = (id) => (S.blocks ?? []).find((b) => b.id === id);
/** The block whose controls show: the one with unsaved changes, else the one under the playhead. */
const currentBlock = () => blockById(S.pending?.block ?? sceneAt(S.frame)?.id);

function renderBlock() {
  const b = currentBlock(), box = $('block');
  box.hidden = S.mode !== 'live' || !b;
  S.blockShown = b?.id ?? null;
  if (!b) return;
  $('bName').textContent = b.id;
  $('bMeta').textContent = `${b.scene} · ${fmt(b.start)}–${fmt(b.end)}`;
  const ctl = $('bCtl'); ctl.textContent = '';
  const items = leaves(b.controls);
  if (!items.length) { const d = document.createElement('div'); d.className = 'none'; d.textContent = `${b.scene} declares no controls (static controls on the scene class).`; ctl.append(d); }
  for (const it of items) {
    if (it.group) { const g = document.createElement('div'); g.className = 'grp'; g.textContent = it.group; ctl.append(g); continue; }
    const { key, c } = it, row = document.createElement('div');
    const v = b.values[key], pending = S.pending && key in S.pending.set;
    row.className = `ctl${b.source[key] === 'tune' || pending ? ' set' : ''}`;
    row.dataset.key = key;
    row.title = `${key}${c.unit ? ` (${c.unit})` : ''} · from ${pending ? 'this change' : b.source[key]}`;
    const lab = document.createElement('label'); lab.textContent = c.label ?? key;
    let input, val = document.createElement('span');
    val.className = 'val';
    const show = (x) => { val.textContent = c.type === 'color' || c.type === 'enum' || c.type === 'bool' ? '' : `${fmtV(x)}${c.unit && c.unit.length < 6 ? ' ' + c.unit : ''}`; };
    if (c.type === 'number' || c.type === 'int') {
      input = Object.assign(document.createElement('input'), { type: 'range', min: c.min, max: c.max, step: c.type === 'int' ? 1 : c.step ?? (c.max - c.min) / 200, value: v });
      input.oninput = () => { show(+input.value); setControl(b, key, +input.value); };
    } else if (c.type === 'bool') {
      input = Object.assign(document.createElement('input'), { type: 'checkbox', checked: !!v });
      input.onchange = () => setControl(b, key, input.checked);
    } else if (c.type === 'enum') {
      input = document.createElement('select');
      for (const o of c.options) input.append(Object.assign(document.createElement('option'), { value: o, textContent: o, selected: o === v }));
      input.onchange = () => setControl(b, key, input.value);
    } else if (c.type === 'color') {
      input = Object.assign(document.createElement('input'), { type: 'color', value: String(v).toLowerCase() });
      input.oninput = () => setControl(b, key, input.value);
    } else if (c.type === 'vec2') {
      input = Object.assign(document.createElement('input'), { type: 'text', value: (v ?? []).join(', ') });
      input.onchange = () => setControl(b, key, input.value.split(',').map(Number));
    }
    show(v);
    input.id = `ctl-${b.id}-${key}`; lab.htmlFor = input.id;
    const rst = Object.assign(document.createElement('button'), { className: 'rst', textContent: '↺', title: 'Back to the value in the code' });
    rst.setAttribute('aria-label', `Reset ${c.label ?? key} to the value in the code`);
    rst.onclick = () => setControl(b, key, null, true);
    row.append(lab, input, val, rst);
    ctl.append(row);
  }
  const p = S.pending;
  $('bPending').hidden = !p;
  if (p) $('bDiff').textContent = changeLine(p.set, p.was);
}

/** Change a control live: rebuild the block in the engine and re-render the frame. Nothing is written until Keep. */
function setControl(b, key, value, rerender = false) {
  // the frame where tuning began is the change's frame: it is inside the block, wherever the playhead goes next
  if (!S.pending) S.pending = { block: b.id, frame: S.frame, set: {}, was: {}, wasSource: {} };
  const p = S.pending;
  if (!(key in p.was)) { p.was[key] = b.values[key]; p.wasSource[key] = b.source[key]; }
  p.set[key] = value;
  [...$('bCtl').querySelectorAll('.ctl')].find((r) => r.dataset.key === key)?.classList.add('set');
  $('bPending').hidden = false; $('bDiff').textContent = changeLine(p.set, p.was);
  togglePlay(false);
  queueTune(b, { [key]: value }, rerender);
}
// patches run one rebuild at a time, in order, each on its own block; a slider drag coalesces into one
const tuneQ = [];
let tuneRun = null;
/** Resolves once this patch (and any queued before it) is live in the engine. */
function queueTune(b, patch, rerender) {
  const tail = tuneQ.at(-1);
  if (tail?.b.id === b.id) Object.assign(tail.patch, patch); else tuneQ.push({ b, patch: { ...patch } });
  tuneRun ??= (async () => {
    try {
      await null; // start after tuneRun is set, even when tune() throws synchronously (engine reloading)
      while (tuneQ.length) {
        const { b, patch } = tuneQ.shift();
        try {
          const r = await media.mg.tune(b.id, patch);
          b.values = r.values; b.source = r.source;
          if (r.errors.length) toast(r.errors[0], true);
        } catch (e) { toast(String(e.message ?? e), true); }
        media.redraw();
      }
    } finally { tuneRun = null; }
  })();
  return rerender ? tuneRun.then(renderBlock) : tuneRun;
}
async function keepChange() {
  const p = S.pending; if (!p) return;
  const body = { ...p, frame: p.frame ?? S.frame, text: $('bWhy').value.trim(), author: $('author').value.trim() || 'reviewer' };
  try {
    accept(await api('POST', '/tune', body));
    S.pending = null; $('bWhy').value = ''; refreshBlocks();
    toast(`kept: ${changeLine(body.set, body.was).replace(/\n/g, ', ')}`);
  } catch (e) { saved('keep failed: ' + e.message, true); }
}
async function revertPending() {
  const p = S.pending; if (!p) return;
  const back = Object.fromEntries(Object.keys(p.set).map((k) => [k, p.wasSource[k] === 'tune' ? p.was[k] : null]));
  S.pending = null;
  const b = blockById(p.block);
  if (b) await queueTune(b, back, true);
  refreshBlocks();
}
/** Undo a kept change: the engine goes back now, the server rewrites tune.json and marks the record reverted. */
async function undoChange(n) {
  const back = Object.fromEntries(Object.keys(n.tune.set).map((k) => [k, n.tune.wasSource[k] === 'tune' ? n.tune.was[k] : null]));
  try {
    accept(await api('POST', `/revert/${n.id}`));
    const b = blockById(n.block ?? n.scene);
    if (b) await queueTune(b, back, false);
    refreshBlocks();
  } catch (e) { toast('undo failed: ' + e.message, true); }
}

/** Preview one option of an agent's proposal as a pending change; Keep records the pick. */
async function pickOption(n, key) {
  if (S.pending) await revertPending();
  togglePlay(false); setFrame(n.frame);
  const b = blockById(n.block ?? n.scene);
  if (!b) { toast(`no block ${n.block ?? n.scene} in the engine`, true); return; }
  const entries = Object.entries(n.variants.options[key]);
  entries.forEach(([k, v], i) => setControl(b, k, v, i === entries.length - 1));
  S.pending.pick = { note: n.id, option: key };
  $('bWhy').value = `picked ${key} for ${n.id}`;
  S.selected = n.id; renderList();
}

// ---------- the notes list ----------
function renderList() {
  const ol = $('notes'); ol.textContent = '';
  const all = [...S.doc.notes].sort((a, b) => (a.range?.inFrame ?? a.frame) - (b.range?.inFrame ?? b.frame) || +a.id.slice(1) - +b.id.slice(1));
  const open = all.filter((n) => n.status !== 'resolved').length;
  $('counts').textContent = `${open} open · ${all.length - open} resolved`;
  const shown = all.filter((n) => S.showResolved || n.status !== 'resolved');
  if (!shown.length) { const li = document.createElement('li'); li.className = 'empty'; li.textContent = all.length ? 'All notes are resolved.' : 'No notes yet. Pick a tool, mark the frame, write what should change.'; ol.append(li); }
  for (const n of shown) {
    const li = document.createElement('li');
    li.className = `${n.status === 'resolved' ? 'resolved' : 'open'}${n.id === S.selected ? ' sel' : ''}`;
    const kind = kindOf(n);
    const where = n.range ? `f${n.range.inFrame}–${n.range.outFrame} · ${fmt(n.range.in)}–${fmt(n.range.out)}` : `f${n.frame} · ${fmt(n.t)}`;
    const sc = sceneAt(n.range?.inFrame ?? n.frame);
    li.innerHTML = `<span class="num"></span><div class="m"></div><div class="text"></div>${n.resolution ? '<div class="res"></div>' : ''}<div class="acts"><span class="who"></span><span class="grow"></span><button class="st"></button>${n.tune && !n.tune.reverted && S.mode === 'live' ? '<button class="un" title="Put the earlier values back in tune.json">Undo</button>' : ''}<button class="ed">Edit</button><button class="del">✕</button></div>`;
    li.querySelector('.num').textContent = n.id.slice(1);
    li.querySelector('.m').textContent = `${where} · ${kind}${sc ? ' · ' + sc.id : ''}${n.tune ? `\n${changeLine(n.tune.set, n.tune.was)}${n.tune.reverted ? ' (reverted)' : ''}` : ''}`;
    li.querySelector('.text').textContent = n.text;
    if (n.resolution) li.querySelector('.res').textContent = `✓ ${n.resolution}`;
    if (n.variants && !n.variants.picked && S.mode === 'live') {
      const row = document.createElement('div'); row.className = 'opts';
      for (const [k, v] of Object.entries(n.variants.options)) {
        const btn = Object.assign(document.createElement('button'), { className: 'opt', textContent: k, title: changeLine(v, {}).replace(/ undefined →/g, ' →') });
        if (S.pending?.pick?.note === n.id && S.pending.pick.option === k) btn.classList.add('on');
        btn.onclick = (e) => { e.stopPropagation(); pickOption(n, k).then(renderList); };
        row.append(btn);
      }
      li.querySelector('.text').after(row);
    }
    li.querySelector('.who').textContent = `${n.author} · ${new Date(n.created).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;
    li.querySelector('.st').textContent = n.status === 'resolved' ? 'Reopen' : 'Resolve';
    li.onclick = (e) => {
      const b = e.target.closest('button');
      if (b?.classList.contains('st')) { putNote({ ...n, status: n.status === 'resolved' ? 'open' : 'resolved', resolved: n.status === 'resolved' ? null : new Date().toISOString() }); return; }
      if (b?.classList.contains('un')) { undoChange(n); return; }
      if (b?.classList.contains('ed')) { editNote(n); return; }
      if (b?.classList.contains('del')) { if (confirm(`Delete note ${n.id}?`)) api('DELETE', `/notes/${n.id}`).then(accept); return; }
      S.selected = n.id; togglePlay(false); setFrame(n.range?.inFrame ?? n.frame); renderList();
    };
    ol.append(li);
  }
}

// ---------- the overlay: notes near this frame, the draft ----------
function visible(n) {
  if (n.status === 'resolved' && !S.showResolved && n.id !== S.selected) return 0;
  if (n.range && S.frame >= n.range.inFrame && S.frame <= n.range.outFrame) return 1;
  const d = Math.abs(S.frame - n.frame);
  if (d === 0) return 1;
  const hold = Math.round(S.fps * 0.5);
  return d <= hold ? 0.35 : 0;
}
function drawOverlay() {
  const c = $('ov'), x = c.getContext('2d'), w = c.width, h = c.height;
  x.clearRect(0, 0, w, h);
  for (const n of S.doc.notes) {
    if (S.editing === n.id) continue;
    const a = visible(n); if (!a) continue;
    const color = n.id === S.selected ? D.COLOR.active : n.status === 'resolved' ? D.COLOR.resolved : D.COLOR.open;
    D.drawShape(x, n.shape, w, h, { label: n.id.slice(1), color, alpha: a, dashed: n.status === 'resolved' });
  }
  if (S.draft?.shape) D.drawShape(x, S.draft.shape, w, h, { label: S.editing ? S.editing.slice(1) : nextId().slice(1), color: D.COLOR.draft });
}

// ---------- the timeline: ruler, scene blocks, notes, in/out, playhead ----------
const TL = { ruler: 20, scenes: 34, notes: 32 };
function tlX(f, w) { const [a, b] = S.view; return ((f - a) / Math.max(1, b - a)) * w; }
function tlF(x, w) { const [a, b] = S.view; return a + (x / w) * (b - a); }
function drawTimeline() {
  const c = $('tl'), x = c.getContext('2d'), dpr = devicePixelRatio || 1;
  const w = c.width / dpr, h = c.height / dpr;
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  x.clearRect(0, 0, w, h);
  x.font = '11px ui-monospace, monospace'; x.textBaseline = 'middle';
  // ruler: a tick step that keeps labels ~70 px apart
  const secPerPx = (S.view[1] - S.view[0]) / S.fps / w;
  const steps = [1 / S.fps, 0.1, 0.25, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
  const step = steps.find((s) => s / secPerPx >= 70) ?? 600;
  const t0 = Math.ceil(tOf(S.view[0]) / step) * step;
  x.fillStyle = '#777'; x.strokeStyle = '#444';
  for (let t = t0; t <= tOf(S.view[1]) + 1e-9; t += step) {
    const px = tlX(t * S.fps, w);
    x.beginPath(); x.moveTo(px + 0.5, 12); x.lineTo(px + 0.5, TL.ruler); x.stroke();
    x.fillText(step < 1 ? (step === 1 / S.fps ? `f${Math.round(t * S.fps)}` : t.toFixed(2)) : fmt(t).replace(/\.000$/, ''), px + 3, 7);
  }
  // scene blocks
  const sy = TL.ruler, sc = S.doc.scenes ?? [], cur = sceneAt(S.frame);
  sc.forEach((s, i) => {
    const a = tlX(s.start * S.fps, w), b = tlX(s.end * S.fps, w);
    if (b < 0 || a > w) return;
    x.fillStyle = s === cur ? '#3a3326' : i % 2 ? '#2a2a2a' : '#313131';
    x.fillRect(a, sy + 2, b - a - 1, TL.scenes - 4);
    x.save(); x.beginPath(); x.rect(a, sy, b - a - 4, TL.scenes); x.clip();
    const tuned = Object.keys(blockById(s.id)?.tune ?? {}).length;
    x.fillStyle = s === cur ? '#ffd27a' : '#bbb'; x.fillText(`${tuned ? '● ' : ''}${s.id}`, Math.max(a, 0) + 5, sy + TL.scenes / 2);
    x.restore();
  });
  if (!sc.length) { x.fillStyle = '#555'; x.fillText('no scene track (pass --scenes)', 6, sy + TL.scenes / 2); }
  // in/out
  if (S.inF != null || S.outF != null) {
    const a = tlX(S.inF ?? S.outF, w), b = tlX((S.outF ?? S.inF) + 1, w);
    x.fillStyle = 'rgba(76,200,255,0.14)'; x.fillRect(Math.min(a, b), TL.ruler, Math.abs(b - a), h - TL.ruler);
    x.fillStyle = '#4cc8ff';
    if (S.inF != null) x.fillRect(tlX(S.inF, w), TL.ruler, 2, h - TL.ruler);
    if (S.outF != null) x.fillRect(tlX(S.outF + 1, w) - 2, TL.ruler, 2, h - TL.ruler);
  }
  // notes
  const ny = TL.ruler + TL.scenes + 4;
  S.hits = [];
  for (const n of S.doc.notes) {
    if (n.status === 'resolved' && !S.showResolved) continue;
    const color = n.id === S.selected ? D.COLOR.active : n.status === 'resolved' ? D.COLOR.resolved : D.COLOR.open;
    x.fillStyle = color;
    let a, b;
    if (n.range) {
      a = tlX(n.range.inFrame, w); b = Math.max(a + 3, tlX(n.range.outFrame + 1, w));
      x.globalAlpha = 0.45; x.fillRect(a, ny + 18, b - a, 6); x.globalAlpha = 1;
      x.fillRect(a, ny + 14, 2, 14); x.fillRect(b - 2, ny + 14, 2, 14);
    } else { a = tlX(n.frame, w); b = a; x.fillRect(a - 1, ny + 12, 2, 16); }
    const lab = n.id.slice(1), tw = x.measureText(lab).width + 8;
    x.beginPath(); x.roundRect(a - tw / 2, ny, tw, 13, 6); x.fill();
    x.fillStyle = '#111'; x.textAlign = 'center'; x.fillText(lab, a, ny + 7); x.textAlign = 'left';
    S.hits.push({ id: n.id, a: a - tw / 2 - 2, b: Math.max(b, a + tw / 2) + 2 });
  }
  // hover and playhead
  if (S.hoverF != null) { x.fillStyle = 'rgba(255,255,255,0.25)'; x.fillRect(tlX(S.hoverF, w), TL.ruler, 1, h - TL.ruler); }
  const px = tlX(S.frame, w), fw = Math.max(2, tlX(S.frame + 1, w) - px);
  x.fillStyle = 'rgba(255,255,255,0.18)'; x.fillRect(px, TL.ruler, fw, h - TL.ruler);
  x.fillStyle = '#fff'; x.fillRect(px, 10, 2, h - 10);
  x.beginPath(); x.moveTo(px - 5, 8); x.lineTo(px + 7, 8); x.lineTo(px + 1, 15); x.fill();
}

// ---------- input ----------
function bindTimeline() {
  const c = $('tl');
  const fAt = (e) => { const r = c.getBoundingClientRect(); return tlF(e.clientX - r.left, r.width); };
  let drag = false, acc = 0;
  c.addEventListener('pointerdown', (e) => {
    const r = c.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
    if (py > TL.ruler + TL.scenes) {
      const hit = (S.hits ?? []).find((h) => px >= h.a && px <= h.b);
      if (hit) { const n = S.doc.notes.find((m) => m.id === hit.id); S.selected = n.id; togglePlay(false); setFrame(n.range?.inFrame ?? n.frame); renderList(); return; }
    }
    drag = true; c.setPointerCapture(e.pointerId); togglePlay(false); setFrame(Math.floor(fAt(e)));
  });
  c.addEventListener('pointermove', (e) => { S.hoverF = Math.floor(fAt(e)); if (drag) setFrame(S.hoverF); });
  c.addEventListener('pointerup', () => { drag = false; });
  c.addEventListener('pointerleave', () => { S.hoverF = null; });
  c.addEventListener('wheel', (e) => {
    e.preventDefault();
    const span = S.view[1] - S.view[0];
    if (e.ctrlKey || e.metaKey) {
      const f = fAt(e), k = Math.exp(e.deltaY * 0.002), ns = Math.min(S.frames, Math.max(S.fps * 0.5, span * k));
      const a = Math.max(0, Math.min(S.frames - ns, f - ((f - S.view[0]) / span) * ns));
      S.view = [a, a + ns]; return;
    }
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      const d = (e.deltaX / c.clientWidth) * span, a = Math.max(0, Math.min(S.frames - span, S.view[0] + d));
      S.view = [a, a + span]; return;
    }
    // plain wheel: step frames (a notch is one frame; Shift: one second)
    // (a mouse notch is one event of ~100 px; a trackpad sends many small ones, summed to 30 px a frame)
    let n;
    if (e.deltaMode !== 0 || Math.abs(e.deltaY) >= 50) n = Math.sign(e.deltaY);
    else { acc += e.deltaY; n = Math.trunc(acc / 30); acc -= n * 30; }
    if (!n) return;
    togglePlay(false); setFrame(S.frame + n * (e.shiftKey ? S.fps : 1));
  }, { passive: false });
}

function bindOverlay() {
  const c = $('ov');
  const pt = (e) => { const r = c.getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))]; };
  let mode = null, start = null;
  c.addEventListener('pointerdown', (e) => {
    const [px, py] = pt(e);
    if (S.tool === 'select') {
      const aspect = S.width / S.height;
      const n = [...S.doc.notes].reverse().find((m) => visible(m) && D.hit(m.shape, px, py, 0.015, aspect));
      S.selected = n?.id ?? null; renderList(); return;
    }
    togglePlay(false);
    if (S.tool === 'pin') { openComposer({ frame: S.frame, shape: { type: 'pin', x: px, y: py } }); return; }
    c.setPointerCapture(e.pointerId);
    if (S.tool === 'box') {
      if (S.draft && !S.editing) closeComposer();
      mode = 'box'; start = [px, py];
      S.draft = { frame: S.frame, shape: { type: 'rect', x: px, y: py, w: 0, h: 0 } };
    } else if (S.tool === 'draw') {
      mode = 'draw';
      if (S.draft?.shape?.type === 'stroke') S.draft.shape.paths.push([[px, py]]);
      else { if (S.draft && !S.editing) closeComposer(); S.draft = { frame: S.frame, shape: { type: 'stroke', paths: [[[px, py]]] } }; }
    }
  });
  c.addEventListener('pointermove', (e) => {
    if (!mode) return;
    const [px, py] = pt(e);
    if (mode === 'box') Object.assign(S.draft.shape, { x: Math.min(px, start[0]), y: Math.min(py, start[1]), w: Math.abs(px - start[0]), h: Math.abs(py - start[1]) });
    else {
      const p = S.draft.shape.paths.at(-1), q = p.at(-1);
      if (Math.hypot(px - q[0], py - q[1]) > 0.002) p.push([+px.toFixed(4), +py.toFixed(4)]);
    }
  });
  c.addEventListener('pointerup', () => {
    if (!mode) return;
    const m = mode; mode = null;
    if (m === 'box') {
      const s = S.draft.shape;
      if (s.w < 0.008 || s.h < 0.008) { S.draft = null; return; }
      for (const k of ['x', 'y', 'w', 'h']) s[k] = +s[k].toFixed(4);
    }
    if ($('composer').hidden) openComposer(S.draft); else $('cText').focus();
  });
}

function bindKeys() {
  addEventListener('keydown', (e) => {
    const typing = e.target.closest?.('input, textarea, select');
    if (e.target === $('cText')) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveDraft(); }
      else if (e.key === 'Escape') { e.preventDefault(); closeComposer(); }
      return;
    }
    if (typing && !(e.target.matches('input[type=range], input[type=checkbox]') && !e.key.startsWith('Arrow'))) return;
    const k = e.key, step = e.shiftKey ? S.fps : 1;
    const act = {
      ' ': () => togglePlay(), ArrowRight: () => { togglePlay(false); setFrame(S.frame + step); }, ArrowLeft: () => { togglePlay(false); setFrame(S.frame - step); },
      Home: () => setFrame(0), End: () => setFrame(S.frames - 1), ']': () => sceneJump(1), '[': () => sceneJump(-1),
      i: () => { S.inF = S.frame; if (S.outF != null && S.outF < S.inF) S.outF = null; marksText(); },
      o: () => { S.outF = S.frame; if (S.inF != null && S.inF > S.outF) S.inF = null; marksText(); },
      v: () => setTool('select'), p: () => setTool('pin'), b: () => setTool('box'), d: () => setTool('draw'),
      n: () => openComposer({ frame: S.frame, shape: null }), r: () => rangeNote(),
      Escape: () => { if (S.draft) closeComposer(); else if (S.inF != null || S.outF != null) { S.inF = S.outF = null; marksText(); } else S.selected = null; renderList(); },
      Delete: () => { const n = S.doc.notes.find((m) => m.id === S.selected); if (n && confirm(`Delete note ${n.id}?`)) api('DELETE', `/notes/${n.id}`).then(accept); },
    }[k.length === 1 ? k.toLowerCase() : k];
    if (act && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); act(); }
  });
}
function rangeNote() {
  if (S.inF == null || S.outF == null) { toast('mark in (I) and out (O) first', true); return; }
  const a = Math.min(S.inF, S.outF), b = Math.max(S.inF, S.outF);
  setFrame(a);
  openComposer({ frame: a, shape: null, range: { inFrame: a, outFrame: b } });
}

function bindButtons() {
  $('bPlay').onclick = () => togglePlay();
  $('bPrev').onclick = (e) => { togglePlay(false); setFrame(S.frame - (e.shiftKey ? S.fps : 1)); };
  $('bNext').onclick = (e) => { togglePlay(false); setFrame(S.frame + (e.shiftKey ? S.fps : 1)); };
  $('bScenePrev').onclick = () => sceneJump(-1); $('bSceneNext').onclick = () => sceneJump(1);
  $('bIn').onclick = () => { S.inF = S.frame; marksText(); }; $('bOut').onclick = () => { S.outF = S.frame; marksText(); };
  $('bFit').onclick = () => { S.view = [0, S.frames]; };
  $('rate').onchange = () => media.rate(+$('rate').value);
  for (const b of document.querySelectorAll('[data-tool]')) b.onclick = () => setTool(b.dataset.tool);
  $('bFrameNote').onclick = () => openComposer({ frame: S.frame, shape: null });
  $('bRangeNote').onclick = rangeNote;
  $('cSave').onclick = saveDraft; $('cCancel').onclick = closeComposer;
  $('bKeep').onclick = keepChange; $('bRevert').onclick = revertPending;
  $('bWhy').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); keepChange(); } };
  $('showResolved').onchange = () => { S.showResolved = $('showResolved').checked; renderList(); };
  const au = $('author');
  try { au.value = localStorage.getItem('markup.author') ?? au.value; } catch {}
  au.onchange = () => { try { localStorage.setItem('markup.author', au.value.trim()); } catch {} };
}

function loop() {
  media.tick();
  drawOverlay(); drawTimeline();
  $('clock').textContent = fmt(tOf(S.frame));
  $('frameNo').textContent = `f ${S.frame} / ${S.frames - 1}`;
  const sc = sceneAt(S.frame);
  $('sceneNow').textContent = sc ? `${sc.id}  +${(tOf(S.frame) - sc.start).toFixed(2)} s · f${S.frame - Math.round(sc.start * S.fps)}` : '';
  $('sceneNow').hidden = !sc;
  if (S.mode === 'live' && (currentBlock()?.id ?? null) !== S.blockShown) renderBlock();
  requestAnimationFrame(loop);
}

/** Frame rate, length and size from the doc; the zoom resets when the length changed. */
function applyMeta() {
  const d = S.doc, changed = d.frames !== S.frames;
  Object.assign(S, { fps: d.fps, frames: d.frames, width: d.width, height: d.height });
  if (changed) S.view = [0, d.frames];
  $('meta').textContent = `${d.width}×${d.height} · ${d.fps} fps · ${d.frames} frames · ${fmt(d.duration)}${S.mode === 'live' ? ' · live engine' : ''}`;
}
/** After the live engine reloads: its timeline, length or size may have changed with the code. */
async function engineChanged(f) {
  accept(await api('PUT', '/meta', media.info));
  applyMeta(); layout();
  S.pending = null; refreshBlocks();
  setFrame(f);
}

async function main() {
  const r = await api('GET', '/doc');
  S.mode = r.mode; S.mediaVersion = r.mediaVersion; S.codeVersion = r.codeVersion;
  accept(r);
  $('author').value = r.author;
  $('file').textContent = r.name; document.title = `Markup · ${r.name}`;
  media = S.mode === 'live' ? liveMedia(r.app) : videoMedia(r.media);
  bindButtons();
  saved('loading media…');
  await media.ready;
  if (S.mode === 'live') { accept(await api('PUT', '/meta', media.info)); refreshBlocks(); }
  applyMeta();
  const d = S.doc;
  bindTimeline(); bindOverlay(); bindKeys(); setTool('select'); marksText();
  addEventListener('resize', layout); new ResizeObserver(layout).observe($('stage'));
  layout();
  const f0 = +(new URLSearchParams(location.search).get('f') ?? 0);
  setFrame(f0);
  saved(`${d.notes.length} notes saved`);
  requestAnimationFrame(loop);
  setTimeout(poll, 2000);
}
main().catch((e) => { saved(e.message, true); console.error(e); });
