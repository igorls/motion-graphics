"""Music -> public/audio.json: the beat grid and envelopes the timeline and scenes sync to.

  * tempo and beats (librosa beat tracker, then regularised to a steady grid when the track
    is steady, which almost all ad music is),
  * downbeats: the bar phase whose beats carry the most low-band onset energy (4/4 assumed;
    pass --beats-per-bar 3 for waltzes, --downbeat-offset N to shift by hand if it guessed wrong),
  * 100 fps envelopes normalised 0..1: rms, low (<150 Hz), mid (150 Hz-2 kHz), high (>4 kHz),
  * onsets by band: kick (low), snare (mid), hat (high), any.

Run from the project root:
  uv run --project scripts python scripts/analyze_audio.py public/audio/music.mp3 [--out public/audio.json]

When you composed the music (a score), you know the tempo and the bar map; say so and the grid is exact:
  ... --bpm 120 --sections "intro:0,build:4,drop:6,outro:10"
  --bpm N           use the score's tempo; only the phase (where beat 1 falls) is fitted to the audio
  --first-beat S    force beat 1 at S seconds (e.g. a measured lead-in); implies nothing else
  --sections MAP    name:bar pairs; reports where each section really starts (the biggest energy step
                    within a beat of the planned downbeat) and writes "sections" into audio.json

Every run also writes the MUSIC MAP (musicmap.py): MUSIC-MAP.md (sections, per-bar energy/density,
moments such as the drop, builds, stops, peak and tail, and edit suggestions) and out/music-map.png
(spectrogram with bars, sections and events). Read both before planning the edit. --no-map skips it.
"""
import argparse
import json
import os

import librosa
import numpy as np

SR = 44100
HOP = 441  # 100 fps
FPS = SR / HOP


def norm(x):
    x = np.nan_to_num(np.asarray(x, dtype=float))
    hi = np.percentile(x, 98) if x.size else 0
    return np.clip(x / hi, 0, 1) if hi > 1e-9 else np.zeros_like(x)


def uniform_smooth(x, n):
    k = np.ones(n) / n
    return np.convolve(x, k, mode="same")


def band_env(S, freqs, lo, hi):
    m = (freqs >= lo) & (freqs < hi)
    return S[m].sum(axis=0) if m.any() else np.zeros(S.shape[1])


def band_onsets(env, delta=0.08):
    o = librosa.onset.onset_strength(S=librosa.amplitude_to_db(env[np.newaxis, :] + 1e-9), sr=SR, hop_length=HOP)
    frames = librosa.onset.onset_detect(onset_envelope=o, sr=SR, hop_length=HOP, delta=delta, units="frames", backtrack=False)
    return [round(float(f) / FPS, 4) for f in frames], o


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("audio")
    ap.add_argument("--out", default="public/audio.json")
    ap.add_argument("--beats-per-bar", type=int, default=4)
    ap.add_argument("--downbeat-offset", type=int, default=None, help="force which beat (0..n-1) is the downbeat")
    ap.add_argument("--bpm", type=float, default=None, help="known tempo (from the score): fit only the phase")
    ap.add_argument("--first-beat", type=float, default=None, help="force the first beat at this time (s)")
    ap.add_argument("--sections", default=None, help='bar map, e.g. "intro:0,build:4,drop:6"')
    ap.add_argument("--no-map", action="store_true", help="skip MUSIC-MAP.md and out/music-map.png")
    ap.add_argument("--map-md", default="MUSIC-MAP.md")
    ap.add_argument("--map-png", default="out/music-map.png")
    a = ap.parse_args()

    y, _ = librosa.load(a.audio, sr=SR, mono=True)
    dur = len(y) / SR
    S = np.abs(librosa.stft(y, n_fft=2048, hop_length=HOP))
    freqs = librosa.fft_frequencies(sr=SR, n_fft=2048)
    rms = librosa.feature.rms(y=y, frame_length=2048, hop_length=HOP)[0]
    low, mid, high = band_env(S, freqs, 20, 150), band_env(S, freqs, 150, 2000), band_env(S, freqs, 4000, 16000)

    onset_env = librosa.onset.onset_strength(y=y, sr=SR, hop_length=HOP)
    tempo, beat_frames = librosa.beat.beat_track(onset_envelope=onset_env, sr=SR, hop_length=HOP)
    beats = librosa.frames_to_time(beat_frames, sr=SR, hop_length=HOP)
    tempo = float(np.atleast_1d(tempo)[0])

    # steady track: fit one period + phase to the tracked beats and extend the grid over the whole file
    if len(beats) > 8:
        idx = np.arange(len(beats))
        period, phase = np.polyfit(idx, beats, 1)
        resid = np.abs(beats - (idx * period + phase))
        if np.median(resid) < 0.02:
            first = phase - np.floor(phase / period) * period
            beats = np.arange(first, dur, period)
            tempo = 60.0 / period

    kick, kick_env = band_onsets(low)
    if a.bpm or a.first_beat is not None:
        period = 60.0 / (a.bpm or tempo)
        if a.first_beat is not None:
            first = a.first_beat % period
        else:
            # phase = circular mean of the strongest kicks' positions within a beat (weighted by their low-band
            # energy). Hats, offbeat bass and envelope smearing would pull a simple envelope fit off the beat.
            kt = np.array(kick)
            if len(kt) >= 4:
                w = np.array([low[int(t * FPS):int(t * FPS) + 8].max() if int(t * FPS) < len(low) else 0 for t in kt])
                keep = w >= np.percentile(w, 60)
                ang = 2 * np.pi * (kt[keep] % period) / period
                first = float((np.arctan2((w[keep] * np.sin(ang)).sum(), (w[keep] * np.cos(ang)).sum()) % (2 * np.pi)) * period / (2 * np.pi))
            else:
                env_t = librosa.frames_to_time(np.arange(len(kick_env)), sr=SR, hop_length=HOP)
                cands = np.arange(0, period, 0.001)
                first = float(cands[int(np.argmax([np.interp(np.arange(c, dur, period), env_t, kick_env).sum() for c in cands]))])
        beats = np.arange(first, dur, period)
        tempo = 60.0 / period

    snare, _ = band_onsets(mid)
    hat, _ = band_onsets(high, delta=0.12)
    anyo = [round(float(t), 4) for t in librosa.onset.onset_detect(onset_envelope=onset_env, sr=SR, hop_length=HOP, units="time")]

    n = a.beats_per_bar
    if a.downbeat_offset is not None:
        off = a.downbeat_offset % n
    else:
        # raw low-band energy just after each beat (the kick / bass hit that marks "one" is the loudest)
        fr = np.clip((beats * FPS).astype(int), 0, len(low) - 1)
        hit = np.array([low[f:f + 8].max() if f < len(low) else 0.0 for f in fr])
        strength = [hit[k::n].mean() if len(hit[k::n]) else 0 for k in range(n)]
        off = int(np.argmax(strength))
    downbeats = beats[off::n]

    sections = []
    if a.sections:
        # energy per frame (low + mid), smoothed; a section starts where it steps up or down the most
        e = uniform_smooth(np.log1p(norm(low) + norm(mid)), 5)
        step = np.abs(np.diff(e, prepend=e[0]))
        beat_len = 60.0 / tempo
        print(f"{'section':<12}{'bar':>4}{'planned':>10}{'measured':>10}{'off (ms)':>10}")
        for item in a.sections.split(","):
            name, bar = item.split(":")
            bar = int(bar)
            if bar >= len(downbeats):
                print(f"{name:<12}{bar:>4}  (past the end of the audio)")
                continue
            planned = float(downbeats[bar])
            lo, hi = int((planned - beat_len) * FPS), int((planned + beat_len) * FPS)
            lo, hi = max(lo, 1), min(hi, len(step) - 1)
            measured = (lo + int(np.argmax(step[lo:hi]))) / FPS if hi > lo else planned
            print(f"{name:<12}{bar:>4}{planned:>10.2f}{measured:>10.2f}{(measured - planned) * 1000:>10.0f}")
            sections.append({"name": name, "bar": bar, "start": round(planned, 4), "measured": round(measured, 4)})

    mm = None
    if not a.no_map:
        import musicmap
        centroid = librosa.feature.spectral_centroid(S=S, sr=SR)[0]
        mm = musicmap.build(
            env={"rms": norm(rms), "low": norm(low), "mid": norm(mid), "high": norm(high)}, fps=FPS,
            beats=beats, downbeats=downbeats, bpm=tempo, dur=dur,
            onsets={"kick": kick, "snare": snare, "hat": hat, "any": anyo}, centroid=centroid,
            beats_per_bar=n, planned=sections)
        musicmap.write_markdown(mm, a.map_md, os.path.basename(a.audio))
        os.makedirs(os.path.dirname(a.map_png) or ".", exist_ok=True)
        musicmap.write_png(mm, a.map_png, y, SR, HOP)

    out = {
        "duration": round(dur, 4),
        "bpm": round(tempo, 3),
        "beats": [round(float(b), 4) for b in beats],
        "downbeats": [round(float(b), 4) for b in downbeats],
        "envFps": FPS,
        "env": {k: [round(float(v), 3) for v in norm(e)] for k, e in {"rms": rms, "low": low, "mid": mid, "high": high}.items()},
        "onsets": {"kick": kick, "snare": snare, "hat": hat, "any": anyo},
        "sections": [{"name": x["name"], "start": x["start"]} for x in sections] if sections
                    else ([{"name": x["name"], "start": x["start"]} for x in mm["sections"]] if mm else []),
        # drops first in the map's wow ranking (moment('drop') = the best candidate), then everything else by time
        "moments": ([{"kind": x["kind"], "time": x["time"], "bar": x["bar"]} for x in mm["drops"]]
                    + [{"kind": x["kind"], "time": x["time"], "bar": x["bar"]} for x in mm["moments"] if x["kind"] != "drop"]) if mm else [],
    }
    with open(a.out, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"{a.out}: {tempo:.2f} BPM, {len(beats)} beats, {len(downbeats)} bars (downbeat = beat {off}), {dur:.2f} s")
    if mm:
        print(f"music map: {a.map_md}, {a.map_png} ({len(mm['sections'])} sections, {len(mm['moments'])} moments; wow candidate: {mm['wow']['kind']} at {mm['wow']['time']:.2f} s)")


if __name__ == "__main__":
    main()
