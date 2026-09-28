#!/usr/bin/env bun
// Generic ComfyUI batch runner: submit an API-format workflow with overrides, one job per varied
// value (seeds, prompts, scores), wait for them, download every output, and write a provenance
// record. Works with any model's workflow; the adapters in references/adapters/ say which inputs
// matter for each model.
//
//   bun scripts/comfy.ts <workflow_api.json> --out gen/music
//        [--set 2.style="Instrumental, ..."]      fixed override (value parsed as JSON, else a string)
//        [--set-file 2.abc=music/score.abc]        fixed override from a file's text
//        [--vary 2.seed=11,23,37,58]               one job per value (several --vary = every combination)
//        [--vary-file 2.abc=a.abc,b.abc]           one job per file
//        [--url http://127.0.0.1:8188]             (or COMFYUI_URL)  [--timeout 1800]
//
// Paths are <node id>.<input> (or <node id>.inputs.<input>). Outputs land in --out as
// <take label>__<original filename>; --out/takes.json records every take's overrides, prompt id,
// files and timing (copy the used take into assets.json).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const argv = process.argv.slice(2);
const wfPath = argv[0];
if (!wfPath || wfPath.startsWith('--')) throw new Error('usage: bun scripts/comfy.ts <workflow_api.json> --out <dir> [--set ...] [--vary ...]');
const all = (k: string) => argv.flatMap((a, i) => (a === `--${k}` && argv[i + 1] ? [argv[i + 1]!] : []));
const opt = (k: string, d?: string) => all(k)[0] ?? d;
const url = (opt('url') ?? process.env.COMFYUI_URL ?? 'http://127.0.0.1:8188').replace(/\/$/, '');
const outDir = path.resolve(opt('out', 'gen')!);
const timeout = +opt('timeout', '1800')! * 1000;
mkdirSync(outDir, { recursive: true });

const parse = (v: string): unknown => { try { return JSON.parse(v); } catch { return v; } };
const split = (spec: string) => { const i = spec.indexOf('='); if (i < 0) throw new Error(`expected path=value: ${spec}`); return [spec.slice(0, i), spec.slice(i + 1)] as const; };

type Override = { path: string; value: unknown; label?: string };
const fixed: Override[] = [
  ...all('set').map((s) => { const [p, v] = split(s); return { path: p, value: parse(v) }; }),
  ...all('set-file').map((s) => { const [p, f] = split(s); return { path: p, value: readFileSync(f, 'utf8') }; }),
];
const axes: Override[][] = [
  ...all('vary').map((s) => { const [p, v] = split(s); return v.split(',').map((x) => ({ path: p, value: parse(x), label: `${p.split('.').pop()}${x}` })); }),
  ...all('vary-file').map((s) => { const [p, v] = split(s); return v.split(',').map((f) => ({ path: p, value: readFileSync(f, 'utf8'), label: path.parse(f).name })); }),
];
const combos: Override[][] = axes.reduce<Override[][]>((acc, axis) => acc.flatMap((c) => axis.map((o) => [...c, o])), [[]]);

function apply(wf: any, o: Override) {
  const parts = o.path.split('.');
  const node = wf[parts[0]!];
  if (!node) throw new Error(`no node ${parts[0]} in the workflow`);
  const key = parts[1] === 'inputs' ? parts.slice(2) : parts.slice(1);
  let t = node.inputs;
  for (const k of key.slice(0, -1)) t = t[k] ??= {};
  t[key.at(-1)!] = o.value;
}

const base = JSON.parse(readFileSync(wfPath, 'utf8'));
const clientId = crypto.randomUUID();
const takes: any[] = [];

async function submit(combo: Override[]) {
  const wf = structuredClone(base);
  for (const o of [...fixed, ...combo]) apply(wf, o);
  const label = combo.map((o) => o.label).filter(Boolean).join('_') || 'take';
  const r = await fetch(`${url}/prompt`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prompt: wf, client_id: clientId }) });
  const body: any = await r.json();
  if (!r.ok || body.error) throw new Error(`submit failed for ${label}: ${JSON.stringify(body.error ?? body.node_errors ?? body).slice(0, 800)}`);
  console.log(`queued ${label}: ${body.prompt_id}`);
  return { label, promptId: body.prompt_id as string, overrides: [...fixed.map((o) => ({ path: o.path, value: typeof o.value === 'string' && o.value.length > 200 ? `${o.value.slice(0, 200)}…` : o.value })), ...combo.map((o) => ({ path: o.path, value: o.value }))], t0: Date.now() };
}

async function collect(job: Awaited<ReturnType<typeof submit>>) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const h: any = await (await fetch(`${url}/history/${job.promptId}`)).json();
    const entry = h[job.promptId];
    if (entry?.status?.completed || entry?.status?.status_str === 'error') {
      if (entry.status.status_str === 'error') {
        const msg = (entry.status.messages ?? []).find((m: any) => m[0] === 'execution_error')?.[1];
        throw new Error(`${job.label} failed: ${msg?.exception_message ?? 'see ComfyUI log'}`);
      }
      const files: string[] = [];
      for (const out of Object.values<any>(entry.outputs ?? {})) {
        for (const list of Object.values<any>(out)) {
          if (!Array.isArray(list)) continue;
          for (const it of list) {
            if (!it?.filename) continue;
            const q = new URLSearchParams({ filename: it.filename, subfolder: it.subfolder ?? '', type: it.type ?? 'output' });
            const dest = path.join(outDir, `${job.label}__${it.filename}`);
            await Bun.write(dest, await (await fetch(`${url}/view?${q}`)).arrayBuffer());
            files.push(path.relative(outDir, dest));
          }
        }
      }
      const seconds = (Date.now() - job.t0) / 1000;
      console.log(`done ${job.label} (${seconds.toFixed(1)} s since submit): ${files.join(', ')}`);
      return { label: job.label, promptId: job.promptId, overrides: job.overrides, files, secondsSinceSubmit: seconds };
    }
    if (Date.now() > deadline) throw new Error(`${job.label} timed out`);
    await Bun.sleep(1500);
  }
}

// submit everything (ComfyUI queues and runs them in order), then collect in order
const jobs = [];
for (const c of combos) jobs.push(await submit(c));
for (const j of jobs) {
  try { takes.push(await collect(j)); } catch (e) { console.error(String(e)); takes.push({ label: j.label, promptId: j.promptId, overrides: j.overrides, error: String(e) }); }
}
writeFileSync(path.join(outDir, 'takes.json'), JSON.stringify({ workflow: path.resolve(wfPath), url, date: new Date().toISOString(), takes }, null, 2));
console.log(`${takes.filter((t) => !t.error).length}/${takes.length} takes in ${outDir} (takes.json written)`);
