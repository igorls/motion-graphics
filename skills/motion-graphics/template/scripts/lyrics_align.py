"""Sung lyrics -> public/lyrics.json: a start and end time for every word, from a LOCAL Whisper model.

Never invent word timing from beats or energy: a sung word lands where the singer puts it, often off
the grid. This takes the timing from speech recognition and keeps the text from the lyrics:

  * two overlapping crops of the master are transcribed with word timestamps (transformers pipeline,
    return_timestamps='word'), so every word gets two independent estimates and a spread,
  * the canonical lyrics are aligned to each pass's words in order, with a small lookahead (a line's
    first word looks further, to skip ad-libs that are not in the lyrics); matching ignores case and
    apostrophes (I'm = I’m = im), and a word the ASR split in two ("sun light") still matches,
  * names the ASR mishears go in an explicit sound-alike table (--alias "zayda=zeta"); those
    words are marked status 'soundalike',
  * when the passes disagree by more than --later-over (0.15 s), the later start wins (alignment drags
    a start back into the silence before the word); by more than --conflict-over (0.6 s), they matched
    different sung words, and the candidate between the neighbouring agreed words is kept,
  * words neither pass matched are interpolated between their neighbours and marked 'interpolated'.

The output keeps the exact canonical text (punctuation included) and is PROVISIONAL: ASR alignment of
singing, not verified phonetic sync. Check the words that matter by ear in the preview.

Offline only: the model must already be on disk (a local folder or a cached hub id); nothing is
downloaded. Needs a Python with transformers + torch (not in scripts/pyproject.toml, which stays light),
plus numpy and ffmpeg on PATH. Run from the project root:

  python scripts/lyrics_align.py public/audio/song.wav --lyrics lyrics.txt --model <whisper dir> --window 28,56
  python scripts/lyrics_align.py song.wav --lyrics lyrics.json --model <dir> --crops 26-54,29-58 --alias "zeta=zayda"
  python scripts/lyrics_align.py song.wav --lyrics lyrics.txt --passes-in out/asr-passes.json   # re-align, no ASR

  --lyrics FILE     .txt: one sung line per text line ("id | text" to name it; blank lines and # comments
                    skipped); .json: {"lines": [{"id", "text", "window"?: [s, e]}]}
  --window A,B      song seconds the lines are sung in; the two crops default to [A-3, B+2] and [A-1, B+4]
                    (a line sung within ~2 s of a crop's start can be dragged to that start: words
                    pinned to a crop's first instant are ignored when the other pass has them)
  --crops LIST      explicit crops "a-b,c-d" (song seconds); two or more
  --alias LIST      canonical=heard[|heard2],...  (normalised forms: lowercase, no apostrophes); also for
                    spelling variants the ASR writes its own way (harbour=harbor)
  --passes-in/out   cache the ASR passes, so a new alias table or rule re-aligns in a second
  --out FILE        default public/lyrics.json (times in song seconds; the engine shifts by a part's start)
"""
import os

os.environ.update(HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1", HF_HUB_DISABLE_TELEMETRY="1")

import argparse
import hashlib
import json
import os
import pathlib
import subprocess
import sys

import numpy as np

SCHEMA = "lyrics_word_timing_v1"
LIMIT = ("Provisional: ASR word alignment of singing, not verified phonetic sync. The text is the canonical "
         "lyric; ASR words were used only for timing. 'soundalike' words took the timing of a mis-heard word; "
         "'interpolated' words were not matched and sit evenly between their neighbours.")


def norm(w):
    """Case- and apostrophe-insensitive form: I'm = I’m = im; sun-lit = sunlit."""
    return "".join(ch for ch in w.lower() if ch.isalnum())


def load_lyrics(path):
    p = pathlib.Path(path)
    if p.suffix.lower() == ".json":
        lines = json.loads(p.read_text(encoding="utf-8"))["lines"]
        return [{"id": l.get("id", f"L{i + 1:02d}"), "text": l["text"], **({"window": l["window"]} if "window" in l else {})}
                for i, l in enumerate(lines)]
    out = []
    for raw in p.read_text(encoding="utf-8").splitlines():
        s = raw.strip()
        if not s or s.startswith("#"):
            continue
        cols = [c.strip() for c in s.split(" | ")]
        # "text", "id | text", or "id | voice | text" for a song with more than one singer
        if len(cols) >= 3 and len(cols[1]) <= 3:
            out.append({"id": cols[0], "voice": cols[1], "text": " | ".join(cols[2:])})
        elif len(cols) >= 2:
            out.append({"id": cols[0], "text": " | ".join(cols[1:])})
        else:
            out.append({"id": f"L{len(out) + 1:02d}", "text": s})
    return out


def parse_alias(s):
    table = {}
    for item in filter(None, (x.strip() for x in (s or "").split(","))):
        canon, _, heard = item.partition("=")
        table[norm(canon)] = [norm(h) for h in heard.split("|") if norm(h)]
    return table


def crop16k(audio, a, b):
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-ss", str(a), "-i", str(audio), "-t", str(b - a),
                                   "-ar", "16000", "-ac", "1", "-f", "f32le", "-"])
    return np.frombuffer(raw, dtype="<f4").copy()


def transcribe(audio, crops, model, device, language):
    import torch
    from transformers import pipeline
    kw = dict(model=model, device=device)
    try:
        asr = pipeline("automatic-speech-recognition", dtype=torch.float32, **kw)
    except TypeError:  # older transformers
        asr = pipeline("automatic-speech-recognition", torch_dtype=torch.float32, **kw)
    passes = {}
    for a, b in crops:
        x = crop16k(audio, a, b)
        extra = {"chunk_length_s": 30} if b - a > 30 else {}
        r = asr({"raw": x, "sampling_rate": 16000}, return_timestamps="word",
                generate_kwargs={"language": language, "task": "transcribe"}, **extra)
        words = []
        for c in r["chunks"]:
            s, e = c["timestamp"]
            if s is None:
                continue
            # a word pinned to the crop's first instant was dragged there from later: an edge hit
            words.append({"w": norm(c["text"]), "raw": c["text"].strip(), "s": round(a + s, 3),
                          "e": round(a + (e if e is not None else s + 0.3), 3), **({"edge": True} if s < 0.05 else {})})
        passes[f"{a:g}-{b:g}"] = words
        print(f"pass {a:g}-{b:g} s: {len(words)} words", file=sys.stderr)
    return passes


def match_pass(canon, ws, alias, look, first_look):
    """Canonical words -> one pass's words, in order. Returns one hit (or None) per canonical word."""
    out, j = [], 0
    for idx, (li, w) in enumerate(canon):
        n, hit = norm(w), None
        first = idx == 0 or canon[idx - 1][0] != li
        for k in range(j, min(j + (first_look if first else look), len(ws))):
            heard = ws[k]["w"]
            if heard == n or heard in alias.get(n, []):
                hit, j = dict(ws[k], alias=heard != n), k + 1
                break
            if k + 1 < len(ws) and heard + ws[k + 1]["w"] == n:  # the ASR split the word in two
                hit, j = {**ws[k], "e": ws[k + 1]["e"], "alias": False}, k + 2
                break
        out.append(hit)
    return out


def align(lines, passes, alias, look=6, first_look=40, later_over=0.15, conflict_over=0.6):
    canon = [(li, w) for li, l in enumerate(lines) for w in l["text"].split()]
    per = [match_pass(canon, ws, alias, look, first_look) for ws in passes.values()]
    hits_all = [[p[i] for p in per if p[i]] for i in range(len(canon))]
    # a start pinned to a crop's first instant is not a start: use the other passes when they have the word
    hits_all = [[h for h in hs if not h.get("edge")] or hs for hs in hits_all]
    spread = lambda hs: max(h["s"] for h in hs) - min(h["s"] for h in hs)
    agreed = [float(np.median([h["s"] for h in hs])) if hs and spread(hs) <= conflict_over else None for hs in hits_all]
    words = []
    for i, (li, w) in enumerate(canon):
        hits = hits_all[i]
        if not hits:
            words.append({"line": li, "text": w, "start": None, "end": None, "status": "interpolated", "passes": 0})
            continue
        sp = spread(hits)
        if sp > conflict_over:
            # the passes matched different sung words: keep the one between the neighbouring agreed words
            lo = next((agreed[k] for k in range(i - 1, -1, -1) if agreed[k] is not None), -1e9)
            hi = next((agreed[k] for k in range(i + 1, len(canon)) if agreed[k] is not None), 1e9)
            hits = [h for h in hits if lo < h["s"] < hi] or hits
        starts = [h["s"] for h in hits]
        # alignment drags a start back into the silence before the word: when the passes disagree, the
        # later start is the one that skipped the gap
        s = max(starts) if max(starts) - min(starts) > later_over else float(np.median(starts))
        e = max(float(np.median([h["e"] for h in hits])), s + 0.08)
        words.append({"line": li, "text": w, "start": round(s, 3), "end": round(e, 3),
                      "status": "soundalike" if any(h["alias"] for h in hits) else "asr",
                      "passes": len(hits), "spread": round(sp, 3), **({"conflict": True} if sp > conflict_over else {})})
    interpolate(words, lines)
    return words


def interpolate(words, lines):
    """Unmatched runs sit evenly between the previous word's end and the next word's start (or the line's
    window, or 0.3 s per word at the very ends)."""
    i = 0
    while i < len(words):
        if words[i]["start"] is not None:
            i += 1
            continue
        j = i
        while j < len(words) and words[j]["start"] is None:
            j += 1
        n = j - i
        win = lines[words[i]["line"]].get("window")
        a = words[i - 1]["end"] if i else (win[0] if win else None)
        b = words[j]["start"] if j < len(words) else (win[1] if win else None)
        if a is None and b is None:
            raise SystemExit("no word matched at all: check the crops, the language and the lyrics")
        if a is None:
            a = b - 0.3 * n
        if b is None:
            b = a + 0.3 * n
        b = max(b, a + 0.08 * n)
        for k in range(n):
            words[i + k]["start"] = round(a + (b - a) * k / n, 3)
            words[i + k]["end"] = round(a + (b - a) * (k + 1) / n, 3)
        i = j


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")  # Windows consoles default to a legacy code page
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("audio")
    ap.add_argument("--lyrics", required=True)
    ap.add_argument("--model", default=os.environ.get("MOTION_WHISPER"), help="local Whisper folder or a cached hub id (offline); default $MOTION_WHISPER")
    ap.add_argument("--window", help="A,B song seconds")
    ap.add_argument("--crops", help='"a-b,c-d" song seconds')
    ap.add_argument("--alias", default="")
    ap.add_argument("--language", default="en")
    ap.add_argument("--device", default="cpu")
    ap.add_argument("--lookahead", type=int, default=6)
    ap.add_argument("--first-lookahead", type=int, default=40)
    ap.add_argument("--later-over", type=float, default=0.15)
    ap.add_argument("--conflict-over", type=float, default=0.6)
    ap.add_argument("--passes-in")
    ap.add_argument("--passes-out")
    ap.add_argument("--out", default="public/lyrics.json")
    a = ap.parse_args()

    lines = load_lyrics(a.lyrics)
    alias = parse_alias(a.alias)
    if a.passes_in:
        cached = json.loads(pathlib.Path(a.passes_in).read_text(encoding="utf-8"))
        passes, crops, model = cached["passes"], cached.get("crops"), cached.get("model")
    else:
        if not a.model:
            ap.error("--model or $MOTION_WHISPER is required (or --passes-in)")
        if a.crops:
            crops = [tuple(float(v) for v in c.split("-")) for c in a.crops.split(",")]
        elif a.window:
            s, e = (float(v) for v in a.window.split(","))
            c0 = max(0.0, s - 3)
            crops = [(c0, e + 2), (c0 + 2, e + 4)]  # different starts: chunk edges and context differ
        else:
            ap.error("--window or --crops is required")
        if len(crops) < 2:
            ap.error("give at least two overlapping crops: the spread between passes is the quality signal")
        model = a.model
        passes = transcribe(a.audio, crops, model, a.device, a.language)
        if a.passes_out:
            pathlib.Path(a.passes_out).parent.mkdir(parents=True, exist_ok=True)
            pathlib.Path(a.passes_out).write_text(json.dumps({"model": model, "crops": crops, "passes": passes},
                                                             indent=1, ensure_ascii=False), encoding="utf-8", newline="\n")

    words = align(lines, passes, alias, a.lookahead, a.first_lookahead, a.later_over, a.conflict_over)
    out_lines = []
    for li, l in enumerate(lines):
        ws = [{k: v for k, v in w.items() if k != "line"} for w in words if w["line"] == li]
        assert " ".join(w["text"] for w in ws) == " ".join(l["text"].split()), "canonical text changed"
        out_lines.append({**l, "words": ws})
    # a stray ASR word can pin a word far from the rest of its line; show it instead of stretching the line quietly
    stray = []
    for l in out_lines:
        ws = l["words"]
        gaps = [b["start"] - a_["start"] for a_, b in zip(ws, ws[1:])]
        if len(gaps) >= 2:
            med = float(np.median(gaps))
            stray += [ws[i]["text"] for i, g in enumerate(gaps) if g > max(1.0, 6 * med)]
    # what the model heard that the lyrics never say: the raw material for the alias table
    known = {norm(w) for l in lines for w in l["text"].split()} | {norm(k) for k in alias}
    heard = {}
    for ws in passes.values():
        for w in ws:
            if w["w"] and w["w"] not in known:
                heard[w["w"]] = heard.get(w["w"], 0) + 1
    status = [w["status"] for w in words]
    order = [w for k, w in enumerate(words[1:]) if w["start"] < words[k]["start"] - 1e-6]
    summary = {"words": len(words), **{s: status.count(s) for s in ("asr", "soundalike", "interpolated")},
               "conflicts": sum(1 for w in words if w.get("conflict")),
               "maxSpread": max((w.get("spread", 0) for w in words), default=0),
               "outOfOrder": [w["text"] for w in order], "stray": stray}
    doc = {"schema": SCHEMA, "provisional": True, "limit": LIMIT,
           "audio": {"file": pathlib.Path(a.audio).name, "sha256": hashlib.sha256(pathlib.Path(a.audio).read_bytes()).hexdigest()},
           "method": {"model": str(model), "crops": crops, "lookahead": a.lookahead, "firstLookahead": a.first_lookahead,
                      "laterOver": a.later_over, "conflictOver": a.conflict_over, "aliases": alias},
           "summary": summary, "lines": out_lines, "passes": passes}
    out = pathlib.Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(doc, indent=1, ensure_ascii=False), encoding="utf-8", newline="\n")

    mark = {"asr": "", "soundalike": "~", "interpolated": "?"}
    for l in out_lines:
        print(f"{l['id']}: " + " ".join(f"{w['text']}@{w['start']:.2f}{mark[w['status']]}"
                                        + (f"±{w['spread']:.2f}" if w.get("spread", 0) > a.later_over else "") for w in l["words"]))
    print(f"{out}: {summary['words']} words, {summary['asr']} asr, {summary['soundalike']} soundalike (~), "
          f"{summary['interpolated']} interpolated (?), {summary['conflicts']} conflicts, max spread {summary['maxSpread']:.2f} s"
          + (f"; OUT OF ORDER: {', '.join(summary['outOfOrder'])}" if order else "") + ". Provisional, not verified sync.")
    if stray:
        print(f"STRAY: far from the next word in their line, check by ear: {', '.join(stray)}")
    if heard:
        print("Heard but not in the lyrics (candidates for --alias): " + ", ".join(f"{k} x{v}" for k, v in sorted(heard.items(), key=lambda kv: -kv[1])[:24]))


if __name__ == "__main__":
    main()
