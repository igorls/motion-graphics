// The markup page: play a render (or the live engine), scrub frame by frame, and pin notes to exact
// frames, regions and ranges. Notes are saved one by one to the .markup.json next to the video by
// scripts/markup.ts; the page polls it, so notes the agent resolves show up here.
import { loopRange, startFrame, wrapTime, playAt } from './loop.js';
const D = globalThis.MarkupDraw;
const $ = (id) => document.getElementById(id);
const API = '/__markup/api';

const S = {
  doc: null, mode: 'video', version: 0, mediaVersion: 0, codeVersion: 0,
  fps: 30, frames: 1, width: 1920, height: 1080,
  frame: 0, playing: false, tool: 'select', draft: null, editing: null, selected: null,
  inF: null, outF: null, loop: true, view: [0, 1], hoverF: null, showResolved: false,
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
/** The in→out range playback loops over, or null (a mark missing, or looping off). */
const curLoop = () => loopRange(S.inF, S.outF, S.loop);
const sceneLabel = (f) => { const s = sceneAt(f); return s ? `${s.id} +${(tOf(f) - s.start).toFixed(2)}s` : ''; };

// ---------- media adapters: a finished MP4, or the project's live engine ----------
function videoMedia(src) {
  const v = document.createElement('video');
  v.src = src; v.preload = 'auto'; v.playsInline = true; v.crossOrigin = 'anonymous';
  $('wrap').prepend(v);
  // looping: at the end of the out frame, seek back to in (with the overshoot, so the sound stays on
  // the picture). Checked on every presented frame and every tick, so it overshoots by under a tick.
  const wrap = () => {
    const lp = S.playing && curLoop();
    if (!lp || v.seeking) return false;
    const w = wrapTime(v.currentTime, lp, S.fps);
    if (!w.wraps) return false;
    v.currentTime = w.t + 1e-3; setFrame(w.frame, false);
    return true;
  };
  const onFrame = (_now, meta) => {
    if (S.playing && !wrap()) { const lp = curLoop(), f = Math.round(meta.mediaTime * S.fps); setFrame(lp && f >= lp[0] ? Math.min(f, lp[1]) : f, false); }
    v.requestVideoFrameCallback(onFrame);
  };
  v.requestVideoFrameCallback?.(onFrame);
  v.addEventListener('ended', () => {
    const lp = S.playing && curLoop();
    if (lp) { v.currentTime = tOf(lp[0]) + 1e-3; setFrame(lp[0], false); v.play(); return; }
    S.playing = false; syncPlayButton();
  });
  return {
    el: v,
    ready: new Promise((res, rej) => { v.addEventListener('loadedmetadata', res, { once: true }); v.addEventListener('error', () => rej(new Error('the video did not load')), { once: true }); }),
    // the middle of the frame's interval: robust against rounding in the decoder's timestamps
    seek(f) { v.currentTime = (f + 0.5) / S.fps; },
    // play from the start of the frame, so its sound is heard from its first sample; on pause, land
    // exactly on the last frame shown (its number came from requestVideoFrameCallback)
    play() { v.currentTime = tOf(S.frame) + 1e-3; v.play(); }, pause() { v.pause(); this.seek(S.frame); },
    tick() { wrap(); },
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
    api.info = { fps: m.fps, duration: m.duration, width: m.width, height: m.height, format: m.format, scenes: m.timeline, title: m.title, music: m.music };
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
        // the music is the clock while it plays; else wall time since the last (re)start, at the rate
        const onMusic = music && !music.paused;
        const p = playAt({ from: onMusic ? music.currentTime : t0, elapsed: onMusic ? 0 : (performance.now() - clock0) / 1000, rate, fps: S.fps, frames: S.frames, loop: curLoop() });
        if (p.ended) { togglePlay(false); setFrame(S.frames - 1, true); return; }
        if (p.wraps) {
          // back to in: re-seek the music and restart the voice clips there, and restart the wall clock
          t0 = p.t; clock0 = performance.now();
          if (music) { music.currentTime = p.t; if (music.paused) music.play(); }
          for (const { el } of voice) el.pause();
        }
        syncVoice(p.t);
        setFrame(p.frame, false);
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
  for (const [c, cw, ch] of [[$('ov'), w, h], [$('tl'), $('tl').clientWidth, $('tl').clientHeight], [$('spec'), $('spec').clientWidth, $('spec').clientHeight]]) {
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
  if (on) { const f = startFrame(S.frame, curLoop(), S.frames); if (f !== S.frame) setFrame(f); media.play(); } else media.pause();
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
  const a = S.inF, b = S.outF, both = a != null && b != null;
  $('marks').textContent = a == null && b == null ? '' : `in ${a ?? '–'} · out ${b ?? '–'}${both ? ` · ${((b - a) / S.fps).toFixed(2)} s` : ''} ✕`;
  $('marks').hidden = a == null && b == null;
  $('bRangeNote').disabled = !both;
  $('bLoop').classList.toggle('on', S.loop);
  $('bLoop').classList.toggle('armed', S.loop && both);
}
/** Set in→out (a note's range, a word's span); Play then loops it. */
function setRange(a, b) { S.inF = a; S.outF = b; marksText(); }
function clearRange() { S.inF = S.outF = null; marksText(); }

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
    if (r.audioVersion !== SP.version) { SP.version = r.audioVersion; await loadAudio(); }
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
/** Go to a note; a range note's range becomes in→out, so Play loops it. */
function selectNote(n) {
  S.selected = n.id; togglePlay(false);
  if (n.range) setRange(n.range.inFrame, n.range.outFrame);
  setFrame(n.range?.inFrame ?? n.frame); renderList();
}
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
      selectNote(n);
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
  // in/out; while Play loops it, a bar along the top and its length
  if (S.inF != null || S.outF != null) {
    const a = tlX(S.inF ?? S.outF, w), b = tlX((S.outF ?? S.inF) + 1, w), lp = curLoop();
    x.fillStyle = lp ? 'rgba(76,200,255,0.2)' : 'rgba(76,200,255,0.12)'; x.fillRect(Math.min(a, b), TL.ruler, Math.abs(b - a), h - TL.ruler);
    x.fillStyle = '#4cc8ff';
    if (S.inF != null) x.fillRect(tlX(S.inF, w), TL.ruler, 2, h - TL.ruler);
    if (S.outF != null) x.fillRect(tlX(S.outF + 1, w) - 2, TL.ruler, 2, h - TL.ruler);
    if (lp) {
      const la = tlX(lp[0], w), lb = tlX(lp[1] + 1, w), lab = `⟲ ${lp[1] + 1 - lp[0]} f`;
      x.fillRect(la, TL.ruler, lb - la, 3);
      x.fillText(lab, Math.max(la, 0) + 4, TL.ruler + TL.scenes - 6);
    }
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

// ---------- the audio strip: spectrogram, beats and sung words, locked to the playhead ----------
// The server computes the spectrogram once (scripts/markup/spec.ts): bytes, column-major, ROWS log bands
// from fmin (row 0) to fmax; column c is centred on t0 + c * hop / sr. Words and beats are times in s.
const SP = { version: null, sources: [], marks: null, src: 'main', data: new Map(), win: 4, drag: null, hover: null, hits: [], img: null, key: '' };
const STRIP = { words: 18, notes: 8 };
// magma-like, dark to light: quiet is near black, the loudest partials near white
const LUT = (() => {
  const stops = ['000004', '1c1044', '4f127b', '812581', 'b5367a', 'e55964', 'fb8761', 'fec287', 'fcfdbf'].map((h) => [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)));
  return Array.from({ length: 256 }, (_, v) => {
    const x = (v / 255) * (stops.length - 1), i = Math.min(stops.length - 2, Math.floor(x)), f = x - i;
    return stops[i].map((c, k) => Math.round(c + (stops[i + 1][k] - c) * f));
  });
})();
async function loadAudio() {
  const r = await api('GET', '/audio');
  SP.sources = r.sources; SP.marks = r.marks; SP.data.clear(); SP.key = '';
  if (!SP.sources.some((s) => s.id === SP.src)) SP.src = SP.sources[0]?.id ?? 'main';
  const sel = $('sSrc'); sel.textContent = '';
  for (const s of SP.sources) sel.append(Object.assign(document.createElement('option'), { value: s.id, textContent: s.id === 'main' ? s.label : `${s.label} (--audio)`, selected: s.id === SP.src }));
  sel.disabled = SP.sources.length < 2;
  const m = SP.marks, warn = [...SP.sources.map((s) => s.warn).filter(Boolean), ...m.warnings];
  $('sWarn').textContent = warn.length ? `⚠ ${warn[0]}${warn.length > 1 ? ` (+${warn.length - 1})` : ''}` : '';
  $('sWarn').title = warn.join('\n');
  $('sBeats').disabled = !m.beats.length; $('sWords').disabled = !m.words.length;
  $('sInfo').textContent = `${SP.sources.length ? '80 Hz–8 kHz, log' : 'no audio track'}${m.beatsFile ? ` · ${m.beats.length} beats (${m.beatsFile})` : ''}${m.lyricsFile ? ` · ${m.words.length} words (${m.lyricsFile}${m.zero ? `, zero ${m.zero} s` : ''})` : ''}`;
  await specData();
}
async function specData() {
  if (SP.data.has(SP.src) || !SP.sources.some((s) => s.id === SP.src)) return;
  const r = await fetch(`${API}/spec/${SP.src}`);
  if (r.ok) { SP.data.set(SP.src, new Uint8Array(await r.arrayBuffer())); SP.key = ''; }
}
/** The strip's time window [a, b] in seconds: SP.win around the playhead, or the whole piece. */
function stripView() {
  const dur = S.frames / S.fps, w = SP.win && SP.win < dur ? SP.win : dur;
  const a = Math.max(0, Math.min(dur - w, (S.frame + 0.5) / S.fps - w / 2));
  return [a, a + w];
}
/** Frames a sung span [t0, t1) is heard in: the first whose interval holds t0 to the last that starts before t1. */
const spanFrames = (t0, t1) => { const a = clampF(Math.floor(t0 * S.fps + 1e-6)); return [a, clampF(Math.max(a, Math.ceil(t1 * S.fps - 1e-6) - 1))]; };
function drawStrip() {
  const c = $('spec'); if (!c.width || $('strip').hidden) return;
  const x = c.getContext('2d'), dpr = devicePixelRatio || 1, w = c.width / dpr, h = c.height / dpr;
  x.setTransform(dpr, 0, 0, dpr, 0, 0); x.clearRect(0, 0, w, h);
  const [a, b] = stripView(), X = (t) => ((t - a) / (b - a)) * w, y0 = STRIP.words, y1 = h - STRIP.notes, sh = y1 - y0;
  x.font = '11px ui-monospace, monospace'; x.textBaseline = 'middle';
  const src = SP.sources.find((s) => s.id === SP.src), data = SP.data.get(SP.src);
  if (src && data) {
    const m = src.meta, px = Math.max(1, Math.round(w * dpr)), key = `${SP.src}|${a}|${b}|${px}`;
    if (key !== SP.key) {
      // one image column per device pixel: the loudest analysis column under it (none skipped when zoomed out)
      const img = new ImageData(px, m.rows), cps = m.sr / m.hop;
      for (let i = 0; i < px; i++) {
        const ca = (a + ((b - a) * i) / px - m.t0) * cps, cb = (a + ((b - a) * (i + 1)) / px - m.t0) * cps;
        let lo = Math.round((ca + cb) / 2), hi = lo + 1;
        if (cb - ca >= 1) { lo = Math.floor(ca); hi = Math.ceil(cb); }
        lo = Math.max(0, lo); hi = Math.min(m.cols, hi);
        for (let r = 0; r < m.rows; r++) {
          let v = 0;
          for (let k = lo; k < hi; k++) v = Math.max(v, data[k * m.rows + r]);
          const o = ((m.rows - 1 - r) * px + i) * 4, col = LUT[v];
          img.data[o] = col[0]; img.data[o + 1] = col[1]; img.data[o + 2] = col[2]; img.data[o + 3] = 255;
        }
      }
      SP.img ??= document.createElement('canvas');
      SP.img.width = px; SP.img.height = m.rows;
      SP.img.getContext('2d').putImageData(img, 0, 0);
      SP.key = key;
    }
    x.imageSmoothingEnabled = true;
    x.drawImage(SP.img, 0, y0, w, sh);
    // frequency ticks
    x.fillStyle = 'rgba(255,255,255,0.55)';
    for (const f of [100, 200, 500, 1000, 2000, 4000]) {
      const y = y1 - (Math.log(f / m.fmin) / Math.log(m.fmax / m.fmin)) * sh;
      x.fillRect(0, y, 5, 1); x.fillText(f >= 1000 ? `${f / 1000}k` : String(f), 7, y);
    }
  } else { x.fillStyle = '#555'; x.fillText(SP.sources.length ? 'loading the spectrogram…' : 'no audio to show (the video has no audio track; --audio adds one)', 8, y0 + sh / 2); }
  const m = SP.marks;
  // beats (amber, so they read over the music's own hits): a faint line and a tick at the foot;
  // downbeats a full line with their bar number
  if (m && $('sBeats').checked) {
    for (const t of m.beats) if (t >= a && t <= b) {
      x.fillStyle = 'rgba(255,178,30,0.28)'; x.fillRect(X(t), y0, 1, sh);
      x.fillStyle = 'rgba(255,178,30,0.95)'; x.fillRect(X(t) - 1, y1 - 6, 3, 6);
    }
    const roomy = m.downbeats.length > 1 && ((m.downbeats[1] - m.downbeats[0]) / (b - a)) * w > 24;
    m.downbeats.forEach((t, i) => {
      if (t < a || t > b) return;
      x.fillStyle = 'rgba(255,178,30,0.75)'; x.fillRect(X(t), y0, 1, sh);
      if (!roomy) return;
      const lab = `bar ${i + 1}`, tw = x.measureText(lab).width;
      x.fillStyle = 'rgba(0,0,0,0.6)'; x.fillRect(X(t) + 2, y1 - 20, tw + 6, 13);
      x.fillStyle = '#ffd27a'; x.fillText(lab, X(t) + 5, y1 - 13);
    });
  }
  // words: onset line through the spectrogram, the word and its sung span in the band above
  SP.hits = [];
  if (m && $('sWords').checked) {
    let free = -Infinity;
    for (const wd of m.words) {
      const end = wd.end ?? wd.start;
      if (end < a || wd.start > b) continue;
      const xa = X(wd.start), xb = Math.max(xa + 2, X(end));
      x.fillStyle = 'rgba(76,200,255,0.9)'; x.fillRect(xa, y0, 1, sh);
      x.fillStyle = 'rgba(76,200,255,0.35)'; x.fillRect(xa, y0 - 4, xb - xa, 3);
      const tw = x.measureText(wd.text).width;
      if (xa >= free) { x.fillStyle = '#bfefff'; x.fillText(wd.text, xa + 2, 7); free = xa + tw + 8; }
      SP.hits.push({ wd, a: xa - 2, b: Math.max(xb, xa + tw + 4) });
    }
  }
  // in/out, a drag in progress, notes along the bottom
  const F = (f) => X(f / S.fps);
  if (S.inF != null || S.outF != null) {
    const ia = F(S.inF ?? S.outF), ib = F((S.outF ?? S.inF) + 1), lo = Math.min(ia, ib), hi = Math.max(ia, ib);
    x.fillStyle = 'rgba(76,200,255,0.16)'; x.fillRect(lo, y0, hi - lo, sh);
    // the loop's edges: what Play repeats
    if (curLoop()) { x.fillStyle = '#4cc8ff'; x.fillRect(lo, y0, 2, sh); x.fillRect(hi - 2, y0, 2, sh); x.fillRect(lo, y0, hi - lo, 2); }
  }
  if (SP.drag?.moved) {
    const [fa, fb] = spanFrames(Math.min(SP.drag.t0, SP.drag.t1), Math.max(SP.drag.t0, SP.drag.t1));
    x.fillStyle = 'rgba(76,200,255,0.3)'; x.fillRect(F(fa), y0, F(fb + 1) - F(fa), sh);
  }
  for (const n of S.doc.notes) {
    if (n.status === 'resolved' && !S.showResolved) continue;
    x.fillStyle = n.id === S.selected ? D.COLOR.active : n.status === 'resolved' ? D.COLOR.resolved : D.COLOR.open;
    const na = F(n.range?.inFrame ?? n.frame), nb = Math.max(na + 2, F((n.range?.outFrame ?? n.frame) + 1));
    if (nb >= 0 && na <= w) x.fillRect(na, y1 + 2, nb - na, STRIP.notes - 3);
  }
  // hover and playhead: the current frame's interval, its start as the line
  if (SP.hover != null) { x.fillStyle = 'rgba(255,255,255,0.35)'; x.fillRect(X(SP.hover), y0, 1, sh); }
  const pa = F(S.frame);
  x.fillStyle = 'rgba(255,255,255,0.16)'; x.fillRect(pa, 0, Math.max(1, F(S.frame + 1) - pa), h);
  x.fillStyle = '#fff'; x.fillRect(pa, 0, 1.5, h);
  // the window's span, top right over the word band
  const span = `${fmt(a)} – ${fmt(b)}`, sw = x.measureText(span).width;
  x.fillStyle = 'rgba(13,13,13,0.85)'; x.fillRect(w - sw - 10, 0, sw + 10, STRIP.words - 4);
  x.fillStyle = 'rgba(255,255,255,0.5)'; x.fillText(span, w - sw - 5, 7);
}
/** Next or previous word onset (or beat) from the playhead, landing on the frame it is heard in. */
function markJump(kind, dir) {
  const m = SP.marks; if (!m) return;
  const ts = kind === 'word' && m.words.length ? m.words.map((w) => w.start) : m.beats;
  const fs = [...new Set(ts.map((t) => spanFrames(t, t)[0]))].sort((p, q) => p - q);
  const f = dir > 0 ? fs.find((k) => k > S.frame) : [...fs].reverse().find((k) => k < S.frame);
  if (f != null) { togglePlay(false); setFrame(f); }
}
function bindStrip() {
  const c = $('spec');
  const tAt = (e) => { const r = c.getBoundingClientRect(), [a, b] = stripView(); return a + ((e.clientX - r.left) / r.width) * (b - a); };
  c.addEventListener('pointerdown', (e) => {
    const r = c.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
    togglePlay(false);
    // a word in the band above: its sung span becomes in→out (R makes the note)
    const hit = py < STRIP.words && SP.hits.find((hh) => px >= hh.a && px <= hh.b);
    if (hit) { setRange(...spanFrames(hit.wd.start, hit.wd.end ?? hit.wd.start)); setFrame(S.inF); return; }
    c.setPointerCapture(e.pointerId);
    SP.drag = { x: e.clientX, t0: tAt(e), t1: tAt(e), moved: false };
  });
  c.addEventListener('pointermove', (e) => {
    SP.hover = tAt(e);
    if (!SP.drag) return;
    SP.drag.t1 = SP.hover;
    if (Math.abs(e.clientX - SP.drag.x) > 4) SP.drag.moved = true;
  });
  c.addEventListener('pointerup', () => {
    const d = SP.drag; SP.drag = null;
    if (!d) return;
    // a click seeks; a drag marks the frames the dragged sound is heard in and opens a range note on them
    if (!d.moved) { setFrame(Math.floor(d.t0 * S.fps + 1e-6)); return; }
    setRange(...spanFrames(Math.min(d.t0, d.t1), Math.max(d.t0, d.t1)));
    rangeNote();
  });
  c.addEventListener('pointerleave', () => { SP.hover = null; });
  c.addEventListener('wheel', (e) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      const dur = S.frames / S.fps, cur = SP.win || dur;
      const nw = Math.max(1, Math.min(dur, cur * Math.exp(e.deltaY * 0.002)));
      SP.win = nw >= dur ? 0 : nw;
      $('sZoom').value = [...$('sZoom').options].find((o) => Math.abs(+o.value - SP.win) < 0.01)?.value ?? '';
      return;
    }
    const n = wheelFrames(e);
    if (n) { togglePlay(false); setFrame(S.frame + n * (e.shiftKey ? S.fps : 1)); }
  }, { passive: false });
  $('sSrc').onchange = () => { SP.src = $('sSrc').value; SP.key = ''; specData(); };
  $('sZoom').onchange = () => { SP.win = +$('sZoom').value; };
  const show = (on) => { $('strip').hidden = !on; $('bStrip').classList.toggle('on', on); layout(); try { localStorage.setItem('markup.strip', on ? '1' : '0'); } catch {} };
  $('bStrip').onclick = () => show($('strip').hidden);
  let on = true; try { on = localStorage.getItem('markup.strip') !== '0'; } catch {}
  show(on);
  return show;
}
// a mouse notch is one event of ~100 px; a trackpad sends many small ones, summed to 30 px a frame
let wheelAcc = 0;
function wheelFrames(e) {
  if (e.deltaMode !== 0 || Math.abs(e.deltaY) >= 50) return Math.sign(e.deltaY);
  wheelAcc += e.deltaY; const n = Math.trunc(wheelAcc / 30); wheelAcc -= n * 30;
  return n;
}

// ---------- input ----------
function bindTimeline() {
  const c = $('tl');
  const fAt = (e) => { const r = c.getBoundingClientRect(); return tlF(e.clientX - r.left, r.width); };
  let drag = false;
  c.addEventListener('pointerdown', (e) => {
    const r = c.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
    if (py > TL.ruler + TL.scenes) {
      const hit = (S.hits ?? []).find((h) => px >= h.a && px <= h.b);
      if (hit) { selectNote(S.doc.notes.find((m) => m.id === hit.id)); return; }
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
    const n = wheelFrames(e);
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
      '.': () => markJump('word', 1), ',': () => markJump('word', -1), '>': () => markJump('beat', 1), '<': () => markJump('beat', -1),
      a: () => $('bStrip').click(), l: () => toggleLoop(),
      Escape: () => { if (S.draft) closeComposer(); else if (S.inF != null || S.outF != null) clearRange(); else S.selected = null; renderList(); },
      Delete: () => { const n = S.doc.notes.find((m) => m.id === S.selected); if (n && confirm(`Delete note ${n.id}?`)) api('DELETE', `/notes/${n.id}`).then(accept); },
    }[k.length === 1 ? k.toLowerCase() : k];
    if (act && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); act(); }
  });
}
function toggleLoop() { S.loop = !S.loop; marksText(); }
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
  $('bLoop').onclick = toggleLoop; $('marks').onclick = clearRange;
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
  drawOverlay(); drawTimeline(); drawStrip();
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
  bindTimeline(); bindStrip(); bindOverlay(); bindKeys(); setTool('select'); marksText();
  SP.version = r.audioVersion;
  loadAudio().catch((e) => toast('audio strip: ' + e.message, true));
  addEventListener('resize', layout); new ResizeObserver(layout).observe($('stage'));
  layout();
  const f0 = +(new URLSearchParams(location.search).get('f') ?? 0);
  setFrame(f0);
  saved(`${d.notes.length} notes saved`);
  requestAnimationFrame(loop);
  setTimeout(poll, 2000);
}
main().catch((e) => { saved(e.message, true); console.error(e); });
