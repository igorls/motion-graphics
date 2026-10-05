#!/usr/bin/env bun
// Voice-over: cast, audition and render the lines of the script (public/vo/vo.json) with a TTS model,
// then check where they land on the music's grid (the same placement the engine uses for captions and
// the mix). See the skill's references/voice.md for the craft, and references/adapters/ for the model.
//
//   voices    [--search warm] [--limit 30]             the voices this account can use (id, name, labels)
//   design    --describe "..." [--text "..."]           voices designed from a description: out/vo-design/<n>.mp3 + ids
//   save      --id <generated_voice_id> --name <n> --describe "..."   keep a designed voice
//   audition  --voices id1,id2,id3 [--lines l1,l2]      the same lines in each voice: out/vo-audition/<voice>__<line>.wav
//   render    [--only l1,l2] [--dry]                    the script's lines in its voice: public/vo/<id>.wav + <id>.json
//   cues                                                where each line lands (seconds, bars), overlaps, out/voice.srt
//
// Takes are loudness-matched to -16 LUFS so lines and auditions compare fairly and the mix starts level.
// The API key comes from ELEVENLABS_API_KEY, the file named by ELEVENLABS_API_KEY_FILE, or
// ~/.config/elevenlabs/api_key, and is never printed or written anywhere.
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as eleven from './voice/elevenlabs';
import { Audio } from '../src/engine/audio';
import { project } from '../src/project';
import { resolveCues, overlaps, phrases, stripTags, type VoScript, type VoTake } from '../src/engine/voice';

const argv = process.argv.slice(2);
const mode = argv[0] ?? 'cues';
const opt = (k: string, d?: string) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const flag = (k: string) => argv.includes(`--${k}`);
const APP = path.resolve(import.meta.dir, '..');
const PUB = path.join(APP, 'public');
const OUT = path.join(APP, 'out');
const scriptPath = path.join(PUB, project.voice ?? 'vo/vo.json');
const voDir = path.dirname(scriptPath);

const loadScript = (): VoScript => {
  if (!existsSync(scriptPath)) throw new Error(`no voice script at ${path.relative(APP, scriptPath)} (set project.voice and write it first)`);
  return JSON.parse(readFileSync(scriptPath, 'utf8'));
};
const sentOf = (l: { text: string; direction?: string }) => (l.direction ? `${l.direction} ${l.text}` : l.text);

function ff(args: string[]) {
  const p = Bun.spawnSync(['ffmpeg', '-hide_banner', '-nostats', ...args], { stdout: 'pipe', stderr: 'pipe' });
  if (p.exitCode !== 0) throw new Error(`ffmpeg failed: ${p.stderr.toString().slice(-600)}`);
  return p.stderr.toString();
}
const lufs = (file: string) => { const m = /I:\s+(-?[\d.]+) LUFS/.exec(ff(['-i', file, '-af', 'ebur128=framelog=quiet', '-f', 'null', '-'])); return m ? +m[1]! : NaN; };
const seconds = (file: string) => {
  const p = Bun.spawnSync(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]);
  return +p.stdout.toString().trim();
};
/** Where speech ends: the start of the take's trailing silence (word end times from the alignment run into it). */
function speechEnd(file: string, dur: number) {
  const log = ff(['-i', file, '-af', 'silencedetect=n=-45dB:d=0.12', '-f', 'null', '-']);
  const starts = [...log.matchAll(/silence_start: (-?[\d.]+)/g)].map((m) => +m[1]!);
  const ends = [...log.matchAll(/silence_end: (-?[\d.]+)/g)].map((m) => +m[1]!);
  const last = starts.at(-1);
  return last !== undefined && (ends.length < starts.length || Math.abs(ends.at(-1)! - dur) < 0.05) ? last : dur;
}
/** The raw take -> 48 kHz stereo WAV at -16 LUFS integrated, peaks held under -1 dBFS. */
function master(raw: string, wav: string) {
  const gain = -16 - lufs(raw);
  ff(['-y', '-i', raw, '-af', `volume=${gain.toFixed(2)}dB,alimiter=limit=0.891:level=false`, '-ar', '48000', '-ac', '2', wav]);
  return +gain.toFixed(2);
}

function grid() {
  const f = path.join(PUB, 'audio.json');
  if (project.music && existsSync(f)) return new Audio(JSON.parse(readFileSync(f, 'utf8')), project.beatsPerBar);
  const period = 60 / project.bpm, n = Math.ceil(project.duration / period) + 1, beats = Array.from({ length: n }, (_, i) => i * period);
  return new Audio({ duration: project.duration, bpm: project.bpm, beats, downbeats: beats.filter((_, i) => i % project.beatsPerBar === 0), envFps: 100, env: {}, onsets: {} }, project.beatsPerBar);
}

function provenance(entry: Record<string, unknown>) {
  const f = path.join(APP, 'assets.json');
  const a = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
  a.voice = { ...(a.voice ?? {}), ...entry };
  writeFileSync(f, JSON.stringify(a, null, 1) + '\n');
}

if (mode === 'voices') {
  const vs = await eleven.listVoices(opt('search', ''), +opt('limit', '30')!);
  for (const v of vs) console.log(`${v.id}  ${v.name.padEnd(24)} ${v.category.padEnd(12)} ${Object.values(v.labels).join(', ')}${v.description ? `  | ${v.description.slice(0, 80)}` : ''}`);
  console.log(`${vs.length} voices`);
} else if (mode === 'design') {
  const d = await eleven.designVoice(opt('describe') ?? (() => { throw new Error('design needs --describe "..."'); })(), opt('text'));
  const dir = path.join(OUT, 'vo-design'); mkdirSync(dir, { recursive: true });
  d.previews.forEach((p: { id: string; audio: Buffer; seconds: number }, i: number) => {
    const f = path.join(dir, `${i + 1}.mp3`); writeFileSync(f, p.audio);
    console.log(`${f}  ${p.seconds?.toFixed(1)} s  generated_voice_id ${p.id}`);
  });
  console.log(`text read: ${d.text}`);
} else if (mode === 'save') {
  const id = await eleven.saveDesigned(opt('id')!, opt('name')!, opt('describe') ?? opt('name')!);
  console.log(`saved voice ${opt('name')} as ${id}`);
} else if (mode === 'audition') {
  const script = loadScript();
  const voices = (opt('voices') ?? '').split(',').filter(Boolean);
  if (!voices.length) throw new Error('audition needs --voices id1,id2,...');
  const ids = (opt('lines') ?? script.lines.slice(0, 2).map((l) => l.id).join(',')).split(',');
  const lines = script.lines.filter((l) => ids.includes(l.id));
  const dir = path.join(OUT, 'vo-audition'); mkdirSync(dir, { recursive: true });
  const names = Object.fromEntries((await eleven.listVoices('', 100)).map((v) => [v.id, v.name]));
  for (const v of voices) for (const l of lines) {
    const r = await eleven.synthesize({ text: sentOf(l), voiceId: v, model: script.model, settings: script.settings, language: script.language, seed: script.seed });
    const base = `${(names[v] ?? v).replace(/[^\w-]+/g, '_')}__${l.id}`;
    const raw = path.join(dir, `${base}.mp3`), wav = path.join(dir, `${base}.wav`);
    writeFileSync(raw, r.audio); master(raw, wav);
    console.log(`${path.relative(APP, wav)}  ${seconds(wav).toFixed(2)} s  ${r.words.length} words`);
  }
} else if (mode === 'render') {
  const script = loadScript();
  const only = opt('only')?.split(',');
  const todo = script.lines.filter((l) => !only || only.includes(l.id));
  const chars = todo.reduce((n, l) => n + sentOf(l).length, 0);
  console.log(`${todo.length} lines, ${chars} characters, ${script.provider} ${script.model}, voice ${script.voice.name ?? script.voice.id}`);
  if (flag('dry')) { for (const l of todo) console.log(`  ${l.id}: ${sentOf(l)}`); process.exit(0); }
  if (script.provider !== 'elevenlabs') throw new Error(`no provider "${script.provider}" in scripts/voice/ yet`);
  mkdirSync(path.join(OUT, 'vo-raw'), { recursive: true });
  const record: Record<string, unknown> = {};
  for (const l of todo) {
    const i = script.lines.indexOf(l);
    const r = await eleven.synthesize({
      text: sentOf(l), voiceId: script.voice.id, model: script.model, settings: { ...(script.settings ?? {}), ...(l.settings ?? {}) }, language: script.language, seed: l.seed ?? script.seed,
      previous: script.lines.slice(0, i).map((x) => stripTags(x.text)).join(' ') || undefined,
      next: script.lines[i + 1] ? stripTags(script.lines[i + 1]!.text) : undefined,
    });
    const raw = path.join(OUT, 'vo-raw', `${l.id}.mp3`), wav = path.join(voDir, `${l.id}.wav`);
    writeFileSync(raw, r.audio);
    const gain = master(raw, wav);
    const dur = seconds(wav), end = speechEnd(wav, dur);
    const words = r.words.map((w) => ({ ...w, e: +Math.min(w.e, Math.max(w.s + 0.05, end)).toFixed(3) }));
    const take: VoTake & Record<string, unknown> = {
      id: l.id, sent: sentOf(l), file: path.relative(PUB, wav).replace(/\\/g, '/'), duration: +dur.toFixed(3), words, speechEnd: +end.toFixed(3),
      model: script.model, voice: script.voice, settings: { ...(script.settings ?? {}), ...(l.settings ?? {}) }, seed: l.seed ?? script.seed ?? null,
      requestId: r.requestId, characters: r.chars, context: r.usedContext, gainDb: gain, rendered: new Date().toISOString(),
    };
    writeFileSync(path.join(voDir, `${l.id}.json`), JSON.stringify(take, null, 1) + '\n');
    record[l.id] = { sent: take.sent, requestId: r.requestId, characters: r.chars, seed: script.seed ?? null, file: take.file };
    console.log(`${take.file}  ${take.duration.toFixed(2)} s  ${r.words.length} words${r.usedContext ? '' : '  (no context)'}`);
  }
  provenance({ provider: script.provider, model: script.model, voice: script.voice, settings: script.settings ?? null, language: script.language ?? null,
    lines: { ...((existsSync(path.join(APP, 'assets.json')) && JSON.parse(readFileSync(path.join(APP, 'assets.json'), 'utf8')).voice?.lines) || {}), ...record } });
} else if (mode === 'cues') {
  const script = loadScript();
  const takes: Record<string, VoTake> = {};
  for (const l of script.lines) { const f = path.join(voDir, `${l.id}.json`); if (existsSync(f)) takes[l.id] = JSON.parse(readFileSync(f, 'utf8')); }
  const g = grid();
  const cues = resolveCues(script, takes, g);
  for (const c of cues) {
    const s = c.t + (c.words[0]?.s ?? 0), e = c.t + (c.words.at(-1)?.e ?? c.duration);
    console.log(`${c.id.padEnd(8)} ${s.toFixed(2).padStart(6)}-${e.toFixed(2).padStart(6)} s  bar ${g.barAt(s).toFixed(2)}-${g.barAt(e).toFixed(2)}  ${(c.words.length / Math.max(0.1, e - s)).toFixed(1)} w/s  ${stripTags(c.sent)}`);
    if (e > project.duration) console.log(`  ! ends after the piece (${project.duration} s)`);
  }
  for (const [a, b] of overlaps(cues)) console.log(`! ${a} and ${b} overlap`);
  const list = phrases(cues, 42);
  const srt = list.map((p, i) => {
    const ts = (x: number) => new Date(Math.max(0, x) * 1000).toISOString().slice(11, 23).replace('.', ',');
    const end = Math.min(p.e + 0.3, (list[i + 1]?.s ?? Infinity) - 0.02); // a caption leaves before the next arrives
    return `${i + 1}\n${ts(p.s)} --> ${ts(end)}\n${p.lines.map((ln) => ln.map((w) => w.w).join(' ')).join('\n')}\n`;
  }).join('\n');
  mkdirSync(OUT, { recursive: true }); writeFileSync(path.join(OUT, 'voice.srt'), srt);
  console.log(`out/voice.srt (${srt ? srt.split('\n\n').length : 0} captions)`);
} else throw new Error(`unknown mode ${mode}`);
