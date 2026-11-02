"""Long pieces (a whole song) built in consecutive parts: plan the frames, crop each part's audio, join.

Every part is its own project (a copy of the template) that covers one span of the master, downbeat to
downbeat. The music is never re-cut, faded or levelled: each part gets an exact PCM crop of the master,
the parts render SILENT, and the joined film gets ONE exact crop of the whole span, muxed once.

A manifest (parts.json, paths relative to it) lists the parts in order:

  {"master": "song.wav", "audioJson": "song-audio.json", "fps": 30,
   "parts": [{"name": "p1", "from": 0, "to": 16.49, "dir": "p1", "video": "p1/out/p1-silent.mp4"},
             {"name": "p2", "from": 16.49, "to": 33.02, "dir": "p2", "video": "p2/out/p2-silent.mp4"}]}

"audioJson" is the whole-song analysis (analyze_audio.py on the master). Run with the scripts' uv project:

  uv run --project scripts python scripts/parts.py plan --manifest ../parts.json
      contiguity, downbeat check, and each part's frame count and render command (no drift)
  uv run --project scripts python scripts/parts.py crop --manifest ../parts.json --part p2
      <dir>/public/audio/song.wav: the exact sample range, unchanged bytes
      <dir>/public/audio.json: the edit-time music map (beats, downbeats, onsets, sections and moments
      shifted by the part's start, envelopes sliced; editZero records the shift)
  uv run --project scripts python scripts/parts.py join --manifest ../parts.json --out ../joined/film.mp4
      concatenates the silent renders (no re-encode), muxes one exact crop of the whole span, then
      checks the frame count, the picture/audio drift (< 1 frame) and the decoded audio against the source

Frames: with S0 the first part's start, a part from S to E renders round((E-S0)*fps) - round((S-S0)*fps)
frames, not round((E-S)*fps): the rounding telescopes, so at every seam and at the end the joined picture
is within half a frame of the music. Rendering each part at round((E-S)*fps) instead drifts up to half a
frame per part, and five parts can be two frames out by the end.
"""
import argparse
import hashlib
import json
import pathlib
import subprocess
import sys
import wave

import numpy as np


def load(manifest):
    m = pathlib.Path(manifest).resolve()
    d = json.loads(m.read_text(encoding="utf-8"))
    d["_root"] = m.parent
    return d


def path(d, p):
    return (d["_root"] / p).resolve()


def frames(d, part):
    """Frames on one grid anchored at the first part's start, so per-part rounding never accumulates."""
    fps, s0 = d["fps"], d["parts"][0]["from"]
    return round((part["to"] - s0) * fps) - round((part["from"] - s0) * fps)


def read_info(master):
    try:
        with wave.open(str(master), "rb") as f:
            return {"sr": f.getframerate(), "ch": f.getnchannels(), "width": f.getsampwidth(), "n": f.getnframes()}
    except wave.Error:
        import soundfile as sf
        i = sf.info(str(master))
        return {"sr": i.samplerate, "ch": i.channels, "width": None, "n": i.frames, "subtype": i.subtype}


def write_crop(master, s0, s1, out):
    """Samples [s0, s1) of the master, byte for byte (PCM WAV), or sample for sample in its own subtype."""
    out.parent.mkdir(parents=True, exist_ok=True)
    try:
        with wave.open(str(master), "rb") as f:
            params = f.getparams()
            f.setpos(s0)
            pcm = f.readframes(s1 - s0)
        with wave.open(str(out), "wb") as g:
            g.setparams(params)
            g.writeframes(pcm)
    except wave.Error:  # float or other non-PCM WAV, FLAC
        import soundfile as sf
        info = sf.info(str(master))
        x, sr = sf.read(str(master), start=s0, stop=s1, dtype="float64" if "FLOAT" in info.subtype or "DOUBLE" in info.subtype else "int32", always_2d=True)
        sf.write(str(out), x, sr, subtype=info.subtype)


def decode(p, sr, ch):
    raw = subprocess.check_output(["ffmpeg", "-v", "error", "-i", str(p), "-map", "0:a:0", "-ar", str(sr), "-ac", str(ch), "-f", "f32le", "-"])
    return np.frombuffer(raw, dtype="<f4")


def probe_frames(p):
    out = subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v:0", "-count_frames", "-show_entries",
                                   "stream=nb_read_frames,r_frame_rate,codec_name,width,height,pix_fmt", "-of", "json", str(p)])
    return json.loads(out)["streams"][0]


def nearest(xs, t):
    return min(xs, key=lambda x: abs(x - t)) if xs else None


def cmd_plan(d, a):
    song = json.loads(path(d, d["audioJson"]).read_text(encoding="utf-8")) if d.get("audioJson") else None
    ok = True
    total = 0
    for i, p in enumerate(d["parts"]):
        n = frames(d, p)
        total += n
        notes = []
        if i and abs(d["parts"][i - 1]["to"] - p["from"]) > 1e-9:
            notes.append(f"NOT CONTIGUOUS with {d['parts'][i - 1]['name']} (ends {d['parts'][i - 1]['to']})")
            ok = False
        if song:
            for edge in ("from", "to"):
                db = nearest(song["downbeats"], p[edge])
                if p[edge] > 0 and (db is None or abs(db - p[edge]) > 0.03):
                    notes.append(f"{edge} {p[edge]} is not on a downbeat (nearest {db})")
        print(f"{p['name']}: {p['from']:.3f}-{p['to']:.3f} s, {n} frames -> bun scripts/render.ts video --to {n / d['fps']:.6f} "
              f"--noaudio --out <abs>/{p.get('video', 'out/silent.mp4')}" + ("".join(f"\n    ! {x}" for x in notes)))
    span = (d["parts"][0]["from"], d["parts"][-1]["to"])
    drift = total / d["fps"] - (span[1] - span[0])
    print(f"joined: {total} frames, {span[0]}-{span[1]} s, picture - music = {drift * 1000:+.1f} ms (limit {500 / d['fps']:.1f} ms)")
    return 0 if ok else 1


def cmd_crop(d, a):
    p = next((x for x in d["parts"] if x["name"] == a.part), None)
    if not p:
        raise SystemExit(f"no part named {a.part}")
    master = path(d, d["master"])
    info = read_info(master)
    sr = info["sr"]
    s0, s1 = round(p["from"] * sr), round(p["to"] * sr)
    pdir = path(d, p.get("dir", p["name"]))
    write_crop(master, s0, s1, pdir / "public/audio/song.wav")
    rec = {"part": p["name"], "master": d["master"], "masterSha256": hashlib.sha256(master.read_bytes()).hexdigest(),
           "sampleRange": [s0, s1], "sampleRate": sr, "from": p["from"], "to": p["to"], "frames": frames(d, p), "fps": d["fps"],
           "treatment": "exact PCM crop of the master: no fades, gain, limiting or retime"}
    if d.get("audioJson"):
        song = json.loads(path(d, d["audioJson"]).read_text(encoding="utf-8"))
        S, E = p["from"], p["to"]
        shift = lambda xs: [round(x - S, 4) for x in xs if S - 1e-6 <= x < E]
        fps = song["envFps"]
        i0, i1 = round(S * fps), round(E * fps)
        edit = {**song, "duration": round(E - S, 4), "beats": shift(song["beats"]), "downbeats": shift(song["downbeats"]),
                "onsets": {k: shift(v) for k, v in song.get("onsets", {}).items()},
                "env": {k: v[i0:i1] for k, v in song.get("env", {}).items()},
                "sections": [{**s, "start": round(s["start"] - S, 4)} for s in song.get("sections", []) if S - 1e-6 <= s["start"] < E],
                "moments": [{**m, "time": round(m["time"] - S, 4)} for m in song.get("moments", []) if S - 1e-6 <= m["time"] < E],
                "editZero": S}
        (pdir / "public/audio.json").write_text(json.dumps(edit, separators=(",", ":")), encoding="utf-8", newline="\n")
        rec["musicMap"] = f"{len(edit['beats'])} beats, {len(edit['downbeats'])} downbeats in edit time (editZero {S})"
    (pdir / "part.json").write_text(json.dumps(rec, indent=2), encoding="utf-8", newline="\n")
    print(json.dumps(rec, indent=2))
    return 0


def cmd_join(d, a):
    fps = d["fps"]
    master = path(d, d["master"])
    info = read_info(master)
    sr, ch = info["sr"], info["ch"]
    out = pathlib.Path(a.out).resolve()
    work = out.parent
    work.mkdir(parents=True, exist_ok=True)
    vids = [path(d, p["video"]) for p in d["parts"]]
    report = {"parts": []}
    seam = 0
    for p, v in zip(d["parts"], vids):
        st = probe_frames(v)
        n, want = int(st["nb_read_frames"]), frames(d, p)
        seam += n
        report["parts"].append({"name": p["name"], "video": str(v), "frames": n, "expected": want, "codec": st["codec_name"],
                                "size": f"{st['width']}x{st['height']}", "pix_fmt": st["pix_fmt"], "rate": st["r_frame_rate"],
                                "seamDriftMs": round((seam / fps - (p["to"] - d["parts"][0]["from"])) * 1000, 2)})
    lst = work / (out.stem + "-list.txt")
    lst.write_text("".join(f"file '{v.as_posix()}'\n" for v in vids), encoding="utf-8", newline="\n")
    silent = work / (out.stem + "-silent.mp4")
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy", str(silent)], check=True)
    S, E = d["parts"][0]["from"], d["parts"][-1]["to"]
    s0, s1 = round(S * sr), round(E * sr)
    crop = work / (out.stem + "-music.wav")
    write_crop(master, s0, s1, crop)
    subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(silent), "-i", str(crop), "-map", "0:v:0", "-map", "1:a:0",
                    "-c:v", "copy", "-c:a", "aac", "-b:a", a.bitrate, "-movflags", "+faststart", str(out)], check=True)
    n = int(probe_frames(out)["nb_read_frames"])
    src, dec = decode(crop, sr, ch), decode(out, sr, ch)
    m = min(src.size, dec.size)
    corr = float(np.corrcoef(src[:m], dec[:m])[0, 1]) if m else 0.0
    drift = n / fps - (E - S)
    report.update({"video": str(out), "frames": n, "expectedFrames": sum(p["expected"] for p in report["parts"]),
                   "span": [S, E], "sampleRange": [s0, s1], "pictureMinusMusicMs": round(drift * 1000, 2),
                   "decodedCorrelation": round(corr, 5)})
    problems = [f"{p['name']}: {p['frames']} frames, expected {p['expected']}" for p in report["parts"] if p["frames"] != p["expected"]]
    if len({(p["codec"], p["size"], p["pix_fmt"], p["rate"]) for p in report["parts"]}) > 1:
        problems.append("parts differ in codec, size, pixel format or frame rate: concat without re-encode needs them equal")
    if abs(drift) >= 1 / fps:
        problems.append(f"picture and music differ by {drift * 1000:.1f} ms (a frame or more)")
    if corr < 0.99:
        problems.append(f"decoded audio correlates {corr:.4f} with the source crop (< 0.99)")
    report["problems"] = problems
    (work / (out.stem + "-validation.json")).write_text(json.dumps(report, indent=2), encoding="utf-8", newline="\n")
    print(json.dumps(report, indent=2))
    return 1 if problems else 0


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    for name in ("plan", "crop", "join"):
        s = sub.add_parser(name)
        s.add_argument("--manifest", required=True)
        if name == "crop":
            s.add_argument("--part", required=True)
        if name == "join":
            s.add_argument("--out", required=True)
            s.add_argument("--bitrate", default="256k")
    a = ap.parse_args()
    d = load(a.manifest)
    sys.exit({"plan": cmd_plan, "crop": cmd_crop, "join": cmd_join}[a.cmd](d, a))


if __name__ == "__main__":
    main()
