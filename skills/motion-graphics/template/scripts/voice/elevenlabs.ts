// ElevenLabs provider for scripts/voice.ts: voices, voice design and speech with word timings.
// Model specifics (ids, tags, settings, measured behaviour) live in the skill's
// references/adapters/elevenlabs.md; this file only speaks the HTTP API.
import { existsSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { VoWord } from '../../src/engine/voice';

const API = 'https://api.elevenlabs.io';

/** The key: ELEVENLABS_API_KEY, the file named by ELEVENLABS_API_KEY_FILE, or ~/.config/elevenlabs/api_key. Never printed. */
function apiKey() {
  const env = process.env.ELEVENLABS_API_KEY?.trim();
  if (env) return env;
  const file = process.env.ELEVENLABS_API_KEY_FILE ?? path.join(os.homedir(), '.config', 'elevenlabs', 'api_key');
  if (existsSync(file)) { const k = readFileSync(file, 'utf8').trim(); if (k) return k; }
  throw new Error('No ElevenLabs API key: set ELEVENLABS_API_KEY, or save the key as one line in ~/.config/elevenlabs/api_key');
}

async function call(method: string, route: string, body?: unknown) {
  const r = await fetch(`${API}${route}`, {
    method, headers: { 'xi-api-key': apiKey(), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data: any; try { data = JSON.parse(text); } catch { data = { raw: text.slice(0, 500) }; }
  if (!r.ok) throw Object.assign(new Error(`ElevenLabs ${method} ${route.split('?')[0]}: ${r.status} ${JSON.stringify(data?.detail ?? data).slice(0, 400)}`), { status: r.status, data });
  return { data, headers: r.headers };
}

export interface Voice { id: string; name: string; category: string; labels: Record<string, string>; description: string; preview: string }

/** Voices this account can use (premade, library voices it saved, its own). */
export async function listVoices(search = '', limit = 30): Promise<Voice[]> {
  const q = new URLSearchParams({ page_size: String(Math.min(100, limit)), ...(search ? { search } : {}) });
  const { data } = await call('GET', `/v2/voices?${q}`);
  return (data.voices ?? []).map((v: any) => ({ id: v.voice_id, name: v.name, category: v.category, labels: v.labels ?? {}, description: v.description ?? '', preview: v.preview_url ?? '' }));
}

/** Voices designed from a description: a few previews (audio + an id that can be saved as a voice). */
export async function designVoice(description: string, text?: string, model = 'eleven_ttv_v3') {
  const { data } = await call('POST', '/v1/text-to-voice/design', { voice_description: description, model_id: model, ...(text ? { text } : { auto_generate_text: true }) });
  return { text: data.text as string, previews: (data.previews ?? []).map((p: any) => ({ id: p.generated_voice_id as string, audio: Buffer.from(p.audio_base_64, 'base64'), seconds: p.duration_secs as number })) };
}

/** Save a designed preview as a voice of the account. */
export async function saveDesigned(generatedId: string, name: string, description: string) {
  const { data } = await call('POST', '/v1/text-to-voice', { generated_voice_id: generatedId, voice_name: name, voice_description: description });
  return data.voice_id as string;
}

export interface SynthReq {
  text: string; voiceId: string; model: string; settings?: Record<string, number | boolean>;
  language?: string; seed?: number; previous?: string; next?: string;
}
export interface SynthRes { audio: Uint8Array; ext: 'mp3'; words: VoWord[]; requestId: string | null; chars: number | null; usedContext: boolean }

/** Characters + start/end times -> words; bracketed audio tags are direction, not words. */
export function wordsFrom(al: { characters: string[]; character_start_times_seconds: number[]; character_end_times_seconds: number[] }): VoWord[] {
  const out: VoWord[] = [];
  let w = '', s = 0, e = 0, depth = 0;
  const push = () => { if (w.trim()) out.push({ w: w.trim(), s: +s.toFixed(3), e: +e.toFixed(3) }); w = ''; };
  al.characters.forEach((ch, i) => {
    if (ch === '[') { push(); depth++; return; }
    if (ch === ']') { depth = Math.max(0, depth - 1); return; }
    if (depth > 0) return;
    if (/\s/.test(ch)) { push(); return; }
    if (!w) s = al.character_start_times_seconds[i]!;
    w += ch; e = al.character_end_times_seconds[i]!;
  });
  push();
  return out;
}

/** Speech with character timings. Context (neighbouring lines) keeps the read continuous; a model that rejects it is retried without. */
export async function synthesize(req: SynthReq): Promise<SynthRes> {
  const body = (ctx: boolean) => ({
    text: req.text, model_id: req.model, ...(req.language ? { language_code: req.language } : {}),
    ...(req.settings ? { voice_settings: req.settings } : {}), ...(req.seed != null ? { seed: req.seed } : {}),
    ...(ctx && req.previous ? { previous_text: req.previous } : {}), ...(ctx && req.next ? { next_text: req.next } : {}),
  });
  const route = `/v1/text-to-speech/${encodeURIComponent(req.voiceId)}/with-timestamps?output_format=mp3_44100_128`;
  let usedContext = !!(req.previous || req.next), res;
  try { res = await call('POST', route, body(usedContext)); }
  catch (e: any) {
    if (!usedContext || e.status !== 400) throw e;
    usedContext = false; res = await call('POST', route, body(false));
  }
  const { data, headers } = res;
  return {
    audio: Buffer.from(data.audio_base64, 'base64'), ext: 'mp3',
    words: data.alignment ? wordsFrom(data.alignment) : [],
    requestId: headers.get('request-id'), chars: headers.get('character-cost') ? +headers.get('character-cost')! : null, usedContext,
  };
}
