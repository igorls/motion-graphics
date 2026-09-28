"""Music -> public/audio.json: the beat grid and envelopes the timeline and scenes sync to.

  * tempo and beats (librosa beat tracker, then regularised to a steady grid when the track
    is steady, which almost all ad music is),
  * downbeats: the bar phase whose beats carry the most low-band onset energy (4/4 assumed;
    pass --beats-per-bar 3 for waltzes, --downbeat-offset N to shift by hand if it guessed wrong),
  * 100 fps envelopes normalised 0..1: rms, low (<150 Hz), mid (150 Hz-2 kHz), high (>4 kHz),
  * onsets by band: kick (low), snare (mid), hat (high), any.

Run from the project root:
  uv run --project scripts python scripts/analyze_audio.py public/audio/music.mp3 [--out public/audio.json]
"""
import argparse
import json

import librosa
import numpy as np

SR = 44100
HOP = 441  # 100 fps
FPS = SR / HOP


def norm(x):
    x = np.nan_to_num(np.asarray(x, dtype=float))
    hi = np.percentile(x, 98) if x.size else 0
    return np.clip(x / hi, 0, 1) if hi > 1e-9 else np.zeros_like(x)


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

    kick, _ = band_onsets(low)
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

    out = {
        "duration": round(dur, 4),
        "bpm": round(tempo, 3),
        "beats": [round(float(b), 4) for b in beats],
        "downbeats": [round(float(b), 4) for b in downbeats],
        "envFps": FPS,
        "env": {k: [round(float(v), 3) for v in norm(e)] for k, e in {"rms": rms, "low": low, "mid": mid, "high": high}.items()},
        "onsets": {"kick": kick, "snare": snare, "hat": hat, "any": anyo},
    }
    with open(a.out, "w") as f:
        json.dump(out, f, separators=(",", ":"))
    print(f"{a.out}: {tempo:.2f} BPM, {len(beats)} beats, {len(downbeats)} bars (downbeat = beat {off}), {dur:.2f} s")


if __name__ == "__main__":
    main()
