// Controls: the params of a scene a person may fine-tune, declared on the scene class with a type,
// a range and a unit (`static controls = {...}`). public/tune.json overrides them per timeline entry
// ({ "<entry id>": { "<key>" | "<group>.<key>": value } }). The code stays the source of truth: the
// markup page (scripts/markup.ts) only writes tune.json, and live and offline renders both read it.
//
// A scene's params resolve as: its controls' defaults <- the timeline entry's params <- tune.json.
// Values are checked against the declaration (clamped, snapped, type-checked); an unknown key or a
// wrong type is reported in engine.errors, never silently ignored.

export type Control =
  | { type: 'number' | 'int'; min: number; max: number; step?: number; default: number; unit?: string; label?: string }
  | { type: 'bool'; default: boolean; label?: string }
  | { type: 'enum'; options: readonly string[]; default: string; label?: string }
  | { type: 'color'; default: string; label?: string }
  | { type: 'vec2'; default: readonly [number, number]; label?: string }
  | { type: 'group'; label?: string; controls: Controls };
export type Controls = Record<string, Control>;
export type Leaf = Exclude<Control, { type: 'group' }>;
/** tune.json: overrides per timeline entry id, keyed by dotted control path. */
export type Tune = Record<string, Record<string, unknown>>;
export type Source = 'default' | 'timeline' | 'tune';

/** Every leaf control under its dotted path ('stack.y'). */
export function leaves(c: Controls, prefix = ''): [string, Leaf][] {
  return Object.entries(c).flatMap(([k, v]) => (v.type === 'group' ? leaves(v.controls, `${prefix}${k}.`) : [[`${prefix}${k}`, v] as [string, Leaf]]));
}

const get = (o: any, path: string) => path.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
function set(o: any, path: string, v: unknown) {
  const ks = path.split('.');
  let a = o;
  for (const k of ks.slice(0, -1)) a = a[k] = a[k] && typeof a[k] === 'object' ? { ...a[k] } : {};
  a[ks.at(-1)!] = v;
}

/** A value made to fit its control, or an error message. */
export function coerce(c: Leaf, v: unknown): { value: unknown } | { error: string } {
  switch (c.type) {
    case 'number': case 'int': {
      const n = Number(v);
      if (!Number.isFinite(n)) return { error: `not a number: ${JSON.stringify(v)}` };
      let x = Math.min(c.max, Math.max(c.min, n));
      if (c.type === 'int') x = Math.round(x);
      else if (c.step) x = +(c.min + Math.round((x - c.min) / c.step) * c.step).toFixed(6);
      return { value: x };
    }
    case 'bool': return typeof v === 'boolean' ? { value: v } : { error: `not a boolean: ${JSON.stringify(v)}` };
    case 'enum': return c.options.includes(String(v)) ? { value: String(v) } : { error: `not one of ${c.options.join(', ')}: ${JSON.stringify(v)}` };
    case 'color': return /^#[0-9a-f]{6}$/i.test(String(v)) ? { value: String(v).toLowerCase() } : { error: `not a #rrggbb colour: ${JSON.stringify(v)}` };
    case 'vec2': return Array.isArray(v) && v.length === 2 && v.every((x) => Number.isFinite(+x)) ? { value: [+v[0], +v[1]] } : { error: `not [x, y]: ${JSON.stringify(v)}` };
  }
}

/**
 * The params a scene is built with, plus where each control's value came from.
 * Params that aren't controls (word lists, file names) pass through from the timeline unchanged.
 */
export function resolveParams(controls: Controls | undefined, params: Record<string, any>, tune: Record<string, unknown> | undefined, errors: string[], id: string) {
  const out: Record<string, any> = structuredClone(params ?? {});
  const values: Record<string, unknown> = {}, source: Record<string, Source> = {};
  const known = new Map(leaves(controls ?? {}));
  for (const [path, c] of known) {
    const fromTimeline = get(params, path);
    let v: unknown = c.default, src: Source = 'default';
    if (fromTimeline !== undefined) {
      const r = coerce(c, fromTimeline);
      if ('error' in r) errors.push(`[${id}] timeline param ${path}: ${r.error}`); else { v = r.value; src = 'timeline'; }
    }
    if (tune && path in tune) {
      const r = coerce(c, tune[path]);
      if ('error' in r) errors.push(`[${id}] tune.json ${path}: ${r.error}`); else { v = r.value; src = 'tune'; }
    }
    set(out, path, v);
    values[path] = v; source[path] = src;
  }
  for (const path of Object.keys(tune ?? {})) if (!known.has(path)) errors.push(`[${id}] tune.json ${path}: no such control (declared: ${[...known.keys()].join(', ') || 'none'})`);
  return { params: out, values, source };
}

/** public/tune.json, or {} when there is none (?notune=1 ignores it). */
export async function loadTune(): Promise<Tune> {
  if (new URLSearchParams(location.search).has('notune')) return {};
  try {
    const r = await fetch('tune.json', { cache: 'no-store' });
    if (!r.ok) return {};
    const j = await r.json();
    return j && typeof j === 'object' ? j : {};
  } catch { return {}; }
}
