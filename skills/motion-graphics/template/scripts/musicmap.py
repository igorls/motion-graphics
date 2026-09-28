"""Music map: turn the analysed track into something an agent can read and look at before planning the
edit. Models can't hear audio; this is their ears. Called by analyze_audio.py (or run it standalone on
an existing audio.json + the audio file). Writes:

  MUSIC-MAP.md          tempo, grid, sections, a per-bar table (energy, density, brightness, events),
                        detected moments (drop, builds, stops, fills, peak, tail) and edit suggestions
  out/music-map.png     spectrogram with bar lines, shaded sections, energy per bar and event markers

and returns sections/moments/bars so analyze_audio.py can store them in audio.json.
"""
import math

import numpy as np

BLOCKS = " ▁▂▃▄▅▆▇█"


def _bars_of(beats, downbeats, dur):
    """Bar start times from the downbeats, extended to the end of the audio."""
    d = [float(x) for x in downbeats]
    if len(d) >= 2:
        per = float(np.median(np.diff(d)))
        while d[-1] + per < dur - 1e-3:
            d.append(d[-1] + per)
    return d


def _mean(env, fps, t0, t1):
    a, b = int(t0 * fps), max(int(t0 * fps) + 1, int(t1 * fps))
    seg = env[a:b]
    return float(seg.mean()) if len(seg) else 0.0


def build(*, env, fps, beats, downbeats, bpm, dur, onsets, centroid, beats_per_bar, planned=None):
    """env: dict of 0..1 envelopes at `fps` (rms, low, mid, high); onsets: dict kind -> times; centroid: array at fps."""
    starts = _bars_of(beats, downbeats, dur)
    bar_len = 60.0 / bpm * beats_per_bar
    beat_len = 60.0 / bpm
    anyo = np.array(onsets.get("any", []))
    kick = np.array(onsets.get("kick", []))
    cmax = float(np.percentile(centroid, 98)) if len(centroid) else 1.0

    bars = []
    for i, t0 in enumerate(starts):
        t1 = min(t0 + bar_len, dur)
        if t1 - t0 < beat_len * 0.5:
            break
        beats_in = []
        for k in range(beats_per_bar):
            b0 = t0 + k * beat_len
            beats_in.append(_mean(env["rms"], fps, b0, min(b0 + beat_len, t1)))
        n_on = int(((anyo >= t0) & (anyo < t1)).sum())
        bars.append({
            "bar": i, "start": round(t0, 3), "end": round(t1, 3),
            "loud": _mean(env["rms"], fps, t0, t1), "low": _mean(env["low"], fps, t0, t1),
            "mid": _mean(env["mid"], fps, t0, t1), "high": _mean(env["high"], fps, t0, t1),
            "density": n_on / max(1e-6, (t1 - t0) / beat_len),  # onsets per beat
            "bright": _mean(centroid / max(cmax, 1e-6), fps, t0, t1),
            "beat_loud": beats_in, "events": [],
        })
    if not bars:
        return {"bars": [], "sections": [], "moments": []}

    L = np.array([b["loud"] for b in bars])
    Lmax = max(L.max(), 1e-6)
    for b in bars:
        b["level"] = b["loud"] / Lmax

    # ---- events ----
    moments = []
    med = float(np.median(L))
    for i, b in enumerate(bars):
        prev = max([bars[j]["level"] for j in range(max(0, i - 2), i)], default=b["level"])
        if i >= 1 and b["level"] - prev > 0.22 and b["low"] > 0.3:
            b["events"].append("DROP")
            moments.append({"kind": "drop", "bar": i, "time": b["start"], "strength": round(b["level"] - prev, 3)})
        if i >= 2 and all(bars[j]["level"] < bars[j + 1]["level"] for j in range(i - 2, i)) and bars[i]["bright"] > bars[i - 2]["bright"]:
            b["events"].append("build")
        if i >= 1 and prev - b["level"] > 0.25:
            b["events"].append("breakdown")
            moments.append({"kind": "breakdown", "bar": i, "time": b["start"], "strength": round(prev - b["level"], 3)})
        for k, bl in enumerate(b["beat_loud"]):
            if bl < 0.3 * med and b["level"] > 0.2:
                b["events"].append(f"stop@beat{k + 1}")
                moments.append({"kind": "stop", "bar": i, "time": round(b["start"] + k * beat_len, 3), "strength": round(1 - bl / max(med, 1e-6), 3)})
                break
        last = b["end"] - beat_len
        n_last = int(((anyo >= last) & (anyo < b["end"])).sum())
        if b["density"] > 0 and n_last > 1.8 * b["density"] and n_last >= 3:
            b["events"].append("fill")
    # frame-level gaps: short silences inside the music (a stop before a drop is the classic peak)
    rms = env["rms"]
    quiet = rms < 0.08
    t_first, t_last = bars[0]["start"] + beat_len, bars[-1]["start"]
    i, n = 0, len(quiet)
    while i < n:
        if quiet[i]:
            j = i
            while j < n and quiet[j]:
                j += 1
            t0, t1 = i / fps, j / fps
            before = _mean(rms, fps, max(0.0, t0 - beat_len), t0)
            if t1 - t0 >= 0.15 and t_first < t0 < t_last and before > 0.35:  # a stop needs loud music right before it
                after = _mean(rms, fps, t1, t1 + beat_len)
                bi = max(0, int(np.searchsorted([b["start"] for b in bars], t0, side="right")) - 1)
                bars[bi]["events"].append(f"gap {t0:.2f}-{t1:.2f}")
                moments.append({"kind": "stop", "bar": bi, "time": round(t0, 3), "end": round(t1, 3), "strength": round(t1 - t0, 3)})
                if after > 0.5:
                    bj = max(0, int(np.searchsorted([b["start"] for b in bars], t1 + 0.05, side="right")) - 1)
                    moments.append({"kind": "drop", "bar": bj, "time": round(t1, 3), "strength": round(0.4 + after, 3), "after": "stop"})
                    if "DROP" not in bars[bj]["events"]:
                        bars[bj]["events"].append("DROP")
            i = j
        else:
            i += 1

    peak = int(np.argmax(L))
    bars[peak]["events"].append("PEAK")
    moments.append({"kind": "peak", "bar": peak, "time": bars[peak]["start"], "strength": 1.0})
    # tail: from the last bar whose level is above 25% of the peak
    loud_bars = [i for i, b in enumerate(bars) if b["level"] > 0.25]
    if loud_bars and loud_bars[-1] < len(bars) - 1:
        t = loud_bars[-1] + 1
        bars[t]["events"].append("tail")
        moments.append({"kind": "tail", "bar": t, "time": bars[t]["start"], "strength": 0.0})

    seen, uniq = set(), []
    for mo in sorted(moments, key=lambda x: (x["time"], x["kind"])):
        key = (mo["kind"], round(mo["time"] * 4))
        if key not in seen:
            seen.add(key); uniq.append(mo)
    moments = uniq

    # ---- sections: novelty between consecutive bars on a z-scored feature vector ----
    F = np.array([[b["loud"], b["low"], b["mid"], b["high"], b["density"], b["bright"]] for b in bars])
    Z = (F - F.mean(0)) / (F.std(0) + 1e-6)
    nov = np.r_[0, np.linalg.norm(np.diff(Z, axis=0), axis=1)]
    thr = nov.mean() + 0.6 * nov.std()
    bounds = [0]
    for i in range(1, len(bars)):
        forced = "DROP" in bars[i]["events"] or "breakdown" in bars[i]["events"]
        if (forced and i - bounds[-1] >= 1) or (nov[i] > thr and i - bounds[-1] >= 2):
            bounds.append(i)
    sections = []
    for si, s0 in enumerate(bounds):
        s1 = bounds[si + 1] if si + 1 < len(bounds) else len(bars)
        lvl = float(np.mean([bars[j]["level"] for j in range(s0, s1)]))
        dens = float(np.mean([bars[j]["density"] for j in range(s0, s1)]))
        ev = [e for j in range(s0, s1) for e in bars[j]["events"]]
        if si == 0 and lvl < 0.6:
            name = "intro"
        elif "tail" in ev and s0 >= bounds[-1]:
            name = "outro"
        elif "DROP" in bars[s0]["events"] or (lvl > 0.75):
            name = "drop" if "DROP" in bars[s0]["events"] else "full"
        elif "build" in ev:
            name = "build"
        elif lvl < 0.45:
            name = "intro" if si == 0 else "break"
        else:
            name = "groove"
        sections.append({"name": name, "bar": s0, "bars": s1 - s0, "start": bars[s0]["start"], "end": bars[s1 - 1]["end"], "level": round(lvl, 2), "density": round(dens, 2)})

    # ---- suggestions ----
    def wow_score(mo):
        b = bars[mo["bar"]]
        pos = mo["time"] / max(dur, 1e-6)
        built = any("build" in bars[j]["events"] for j in range(max(0, mo["bar"] - 2), mo["bar"] + 1))
        return mo["strength"] + 0.6 * b["level"] + (0.5 if mo.get("after") == "stop" else 0) + (0.3 if built else 0) + (0.4 if 0.25 < pos < 0.8 else -0.4)
    drops = sorted([m for m in moments if m["kind"] == "drop"], key=lambda m: -wow_score(m))
    wow = drops[0] if drops else {"kind": "peak", "bar": peak, "time": bars[peak]["start"]}
    holds = []
    run = []
    dmed = float(np.median([b["density"] for b in bars]))
    for b in bars:
        if b["density"] <= dmed and 0.15 < b["level"] < 0.85:
            run.append(b)
        else:
            if len(run) >= 2: holds.append((run[0]["bar"], run[-1]["bar"], run[0]["start"], run[-1]["end"]))
            run = []
    if len(run) >= 2: holds.append((run[0]["bar"], run[-1]["bar"], run[0]["start"], run[-1]["end"]))
    hits = []
    if len(kick):
        strength = [ _mean(env["low"], fps, t, t + 0.08) for t in kick ]
        order = np.argsort(strength)[::-1][:8]
        for j in sorted(order, key=lambda j: kick[j]):
            t = float(kick[j]); bi = max(0, int(np.searchsorted([b["start"] for b in bars], t, side="right")) - 1)
            beat_no = 1 + int((t - bars[bi]["start"]) / beat_len)
            hits.append((t, bi, beat_no))

    return {"bars": bars, "sections": sections, "moments": moments, "wow": wow, "drops": drops, "holds": holds, "hits": hits,
            "bpm": bpm, "dur": dur, "beats_per_bar": beats_per_bar, "bar_len": bar_len, "planned": planned or []}


def write_markdown(m, path, audio_name):
    L = []
    L.append(f"# Music map: {audio_name}\n")
    L.append(f"**{m['bpm']:.2f} BPM**, {m['beats_per_bar']}/4, bar = {m['bar_len']:.3f} s, {len(m['bars'])} bars, {m['dur']:.2f} s. "
             "Times are seconds from the start of the file; bars count from 0. Read this before writing the shot list, "
             "and look at `out/music-map.png`.\n")
    L.append("## Sections (detected)\n")
    L.append("| section | bars | start | end | energy | busy |")
    L.append("|---|---|---|---|---|---|")
    for s in m["sections"]:
        L.append(f"| {s['name']} | {s['bar']}-{s['bar'] + s['bars'] - 1} | {s['start']:.2f} | {s['end']:.2f} | {BLOCKS[min(8, int(round(s['level'] * 8)))] * 3} {s['level']:.2f} | {s['density']:.1f}/beat |")
    if m["planned"]:
        L.append("\n## Planned vs measured\n")
        L.append("| planned section | bar | planned | measured | off (ms) |")
        L.append("|---|---|---|---|---|")
        for p in m["planned"]:
            L.append(f"| {p['name']} | {p['bar']} | {p['start']:.2f} | {p['measured']:.2f} | {(p['measured'] - p['start']) * 1000:.0f} |")
    L.append("\n## Moments\n")
    for mo in sorted(m["moments"], key=lambda x: x["time"]):
        L.append(f"- **{mo['kind']}** at {mo['time']:.2f} s (bar {mo['bar']})" + (f", strength {mo['strength']:.2f}" if mo["kind"] not in ("peak", "tail") else ""))
    L.append("\n## Edit suggestions\n")
    w = m["wow"]
    drops = m.get("drops", [])
    how = " (it follows a stop: the silence is the anticipation)" if w.get("after") == "stop" else ""
    L.append(f"- **Wow moment:** land it on the {w['kind']} at **{w['time']:.2f} s** (bar {w['bar']}){how}. Build anticipation before it; let it land after. Other drops: " + (", ".join(f"{d['time']:.2f} s" for d in drops[1:4]) or "none") + ".")
    L.append("- **Cut points:** section starts: " + ", ".join(f"{s['start']:.2f} s ({s['name']})" for s in m["sections"][1:]) + ". Cut on these downbeats; smaller cuts on other downbeats.")
    if m["holds"]:
        L.append("- **Reading holds** (calmer, steady bars: good for text and the end card): " + ", ".join(f"bars {a}-{b} ({t0:.2f}-{t1:.2f} s)" for a, b, t0, t1 in m["holds"]) + ".")
    if m["hits"]:
        L.append("- **Strongest hits** (punch-ins, stamps, flashes): " + ", ".join(f"{t:.2f} s (bar {bi} beat {bn})" for t, bi, bn in m["hits"]) + ".")
    tail = [mo for mo in m["moments"] if mo["kind"] == "tail"]
    if tail:
        L.append(f"- **Tail:** the music thins out from {tail[0]['time']:.2f} s; end the piece (or fade) before or at it.")
    L.append("\n## Bars\n")
    L.append("| bar | time | energy | low | high | busy | bright | events |")
    L.append("|---|---|---|---|---|---|---|---|")
    for b in m["bars"]:
        e = BLOCKS[min(8, int(round(b["level"] * 8)))]
        L.append(f"| {b['bar']} | {b['start']:.2f} | {e * 4} {b['level']:.2f} | {b['low']:.2f} | {b['high']:.2f} | {b['density']:.1f} | {b['bright']:.2f} | {' '.join(b['events'])} |")
    with open(path, "w", encoding="utf8") as f:
        f.write("\n".join(L) + "\n")


def write_png(m, path, y, sr, hop):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import librosa
    import librosa.display

    fig, (ax0, ax1) = plt.subplots(2, 1, figsize=(18, 7.5), sharex=True, gridspec_kw={"height_ratios": [3, 1.2]})
    S = librosa.amplitude_to_db(np.abs(librosa.stft(y, n_fft=2048, hop_length=hop)), ref=np.max)
    librosa.display.specshow(S, sr=sr, hop_length=hop, x_axis="time", y_axis="log", ax=ax0, cmap="magma")
    ax0.set_ylim(30, 12000)
    colors = {"intro": "#4c78a8", "build": "#f58518", "drop": "#e45756", "full": "#e45756", "groove": "#72b7b2", "break": "#54a24b", "outro": "#9d755d"}
    for s in m["sections"]:
        for ax in (ax0, ax1):
            ax.axvspan(s["start"], s["end"], color=colors.get(s["name"], "#888"), alpha=0.12, lw=0)
        ax0.text(s["start"] + 0.05, 10500, s["name"], color="white", fontsize=11, fontweight="bold", va="top")
    for b in m["bars"]:
        for ax in (ax0, ax1):
            ax.axvline(b["start"], color="white" if ax is ax0 else "#555", lw=0.6, alpha=0.5)
        ax0.text(b["start"] + 0.03, 35, str(b["bar"]), color="white", fontsize=8, alpha=0.8)
    xs = [b["start"] for b in m["bars"]]
    ws = [b["end"] - b["start"] for b in m["bars"]]
    ax1.bar(xs, [b["level"] for b in m["bars"]], width=ws, align="edge", color="#f2a93b", alpha=0.85, label="energy")
    ax1.plot([b["start"] + (b["end"] - b["start"]) / 2 for b in m["bars"]], [min(1, b["density"] / 4) for b in m["bars"]], color="#4c78a8", lw=2, label="busy (onsets/beat, /4)")
    marks = {"drop": ("v", "#e45756"), "breakdown": ("^", "#54a24b"), "stop": ("x", "#222"), "peak": ("*", "#b279a2"), "tail": ("s", "#9d755d")}
    for mo in m["moments"]:
        mk, c = marks.get(mo["kind"], ("o", "#000"))
        ax1.scatter([mo["time"]], [1.05], marker=mk, color=c, s=90, zorder=5)
        ax1.text(mo["time"], 1.12, mo["kind"], fontsize=9, ha="center", color=c)
    for t, _, _ in m["hits"]:
        ax1.axvline(t, color="#e45756", lw=1, alpha=0.5, ls="--")
    ax1.set_ylim(0, 1.3)
    ax1.set_ylabel("per bar")
    ax1.legend(loc="upper left", fontsize=8)
    ax0.set_title(f"Music map: {m['bpm']:.1f} BPM, {len(m['bars'])} bars (numbers = bar index; dashed red = strongest hits)")
    fig.tight_layout()
    fig.savefig(path, dpi=110)
    plt.close(fig)
