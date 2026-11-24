from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import numpy as np
import scipy.signal

MODEL_PATH = Path(__file__).resolve().parent.parent / "models" / "notes.onnx"

SR = 22050
FFT_HOP = 256
ANNOT_FPS = SR // FFT_HOP
WINDOW_SAMPLES = SR * 2 - FFT_HOP
ANNOT_N_FRAMES = ANNOT_FPS * 2
N_OVERLAP_FRAMES = 30
OVERLAP_LEN = N_OVERLAP_FRAMES * FFT_HOP
HOP_SIZE = WINDOW_SAMPLES - OVERLAP_LEN
MIDI_OFFSET = 21
MAX_FREQ_IDX = 87


@dataclass
class Note:
    start: float
    end: float
    pitch: int
    amp: float
    bend: float = 0.0

    def to_list(self):
        return [round(self.start, 4), round(self.end, 4), int(self.pitch), round(float(self.amp), 4)]


PROFILES = {
    "lead": dict(onset=0.50, frame=0.30, min_ms=90, lo=40, hi=91, mono=True, poly=1, melodia=True),
    "bass": dict(onset=0.45, frame=0.30, min_ms=70, lo=23, hi=64, mono=True, poly=1, melodia=True),
    "keys": dict(onset=0.50, frame=0.30, min_ms=60, lo=28, hi=104, mono=False, poly=8, melodia=True),
    "guitar": dict(onset=0.50, frame=0.30, min_ms=60, lo=38, hi=96, mono=False, poly=6, melodia=True),
    "pad": dict(onset=0.45, frame=0.28, min_ms=120, lo=28, hi=100, mono=False, poly=8, melodia=True),
    "mono_inst": dict(onset=0.50, frame=0.30, min_ms=70, lo=34, hi=100, mono=True, poly=1, melodia=True),
    "poly": dict(onset=0.50, frame=0.30, min_ms=60, lo=24, hi=104, mono=False, poly=8, melodia=True),
}


class Transcriber:
    _session = None

    def __init__(self):
        if Transcriber._session is None:
            import onnxruntime as ort

            opts = ort.SessionOptions()
            opts.log_severity_level = 3
            providers = [p for p in ("CUDAExecutionProvider", "CoreMLExecutionProvider", "CPUExecutionProvider")
                         if p in ort.get_available_providers()]
            try:
                Transcriber._session = ort.InferenceSession(str(MODEL_PATH), opts, providers=providers)
            except Exception:
                Transcriber._session = ort.InferenceSession(str(MODEL_PATH), opts, providers=["CPUExecutionProvider"])
        self.sess = Transcriber._session

    def activations(self, audio_22k: np.ndarray, progress=None, batch=8) -> dict:
        audio = np.asarray(audio_22k, dtype=np.float32)
        original_length = audio.shape[0]
        audio = np.concatenate([np.zeros(OVERLAP_LEN // 2, np.float32), audio])
        starts = list(range(0, audio.shape[0], HOP_SIZE))
        outs = {"note": [], "onset": [], "contour": []}
        for bi in range(0, len(starts), batch):
            chunk = []
            for s in starts[bi: bi + batch]:
                w = audio[s: s + WINDOW_SAMPLES]
                if len(w) < WINDOW_SAMPLES:
                    w = np.pad(w, (0, WINDOW_SAMPLES - len(w)))
                chunk.append(w)
            x = np.stack(chunk)[:, :, None]
            contour, note, onset = None, None, None
            res = self.sess.run(["StatefulPartitionedCall:1", "StatefulPartitionedCall:2",
                                 "StatefulPartitionedCall:0"], {"serving_default_input_2:0": x})
            note, onset, contour = res
            outs["note"].append(note)
            outs["onset"].append(onset)
            outs["contour"].append(contour)
            if progress:
                progress(min(1.0, (bi + batch) / len(starts)))
        n_frames = int(np.floor(original_length * (ANNOT_FPS / SR)))
        result = {}
        h = N_OVERLAP_FRAMES // 2
        for k, v in outs.items():
            v = np.concatenate(v)[:, h:-h, :]
            result[k] = v.reshape(-1, v.shape[2])[:n_frames].astype(np.float16)
        return result

    @staticmethod
    def frames_to_time(n_frames: int) -> np.ndarray:
        original = np.arange(n_frames) * FFT_HOP / SR
        window_numbers = np.floor(np.arange(n_frames) / ANNOT_N_FRAMES)
        window_offset = (FFT_HOP / SR) * (ANNOT_N_FRAMES - (WINDOW_SAMPLES / FFT_HOP)) + 0.0018
        return original - window_offset * window_numbers

    @staticmethod
    def notes(acts: dict, role: str = "poly", sensitivity: float = 0.5, min_ms: float | None = None,
              mono: bool | None = None) -> list[Note]:
        prof = dict(PROFILES.get(role, PROFILES["poly"]))
        shift = (sensitivity - 0.5) * 0.5
        onset_t = float(np.clip(prof["onset"] - shift, 0.12, 0.9))
        frame_t = float(np.clip(prof["frame"] - shift * 0.7, 0.10, 0.8))
        min_ms = prof["min_ms"] if min_ms is None else min_ms
        min_len = max(2, int(round(min_ms / 1000 * ANNOT_FPS)))
        frames = acts["note"].astype(np.float32)
        onsets = acts["onset"].astype(np.float32)
        contour = acts["contour"].astype(np.float32)
        lo_idx = max(0, prof["lo"] - MIDI_OFFSET)
        hi_idx = min(88, prof["hi"] - MIDI_OFFSET + 1)
        frames[:, :lo_idx] = 0
        frames[:, hi_idx:] = 0
        onsets[:, :lo_idx] = 0
        onsets[:, hi_idx:] = 0
        events = _output_to_notes(frames, onsets, onset_t, frame_t, min_len, prof["melodia"])
        times = Transcriber.frames_to_time(frames.shape[0])
        out = []
        for s, e, p, a in events:
            bend = _mean_bend(contour, s, e, p)
            out.append(Note(float(times[s]), float(times[min(e, len(times) - 1)]), int(p), float(a), bend))
        out.sort(key=lambda n: (n.start, n.pitch))
        return out


def _mean_bend(contour, s, e, pitch):
    c = 3 * (pitch - MIDI_OFFSET) + 1
    lo, hi = max(0, c - 3), min(contour.shape[1], c + 4)
    seg = contour[s:e, lo:hi]
    if seg.size == 0:
        return 0.0
    idx = np.argmax(seg, axis=1) + lo
    return float(np.median((idx - c) / 3.0))


def _inferred_onsets(onsets, frames, n_diff=2):
    diffs = []
    for n in range(1, n_diff + 1):
        app = np.concatenate([np.zeros((n, frames.shape[1]), frames.dtype), frames])
        diffs.append(app[n:, :] - app[:-n, :])
    fd = np.min(diffs, axis=0)
    fd[fd < 0] = 0
    fd[:n_diff, :] = 0
    m = np.max(fd)
    if m > 0:
        fd = np.max(onsets) * fd / m
    return np.maximum(onsets, fd)


def _output_to_notes(frames, onsets, onset_thresh, frame_thresh, min_note_len, melodia=True, energy_tol=11):
    n_frames = frames.shape[0]
    if n_frames < 3:
        return []
    onsets = _inferred_onsets(onsets, frames)
    peak = np.zeros_like(onsets)
    peaks = scipy.signal.argrelmax(onsets, axis=0)
    peak[peaks] = onsets[peaks]
    t_idx, f_idx = np.where(peak >= onset_thresh)
    order = np.argsort(-t_idx, kind="stable")
    remaining = frames.copy()
    events = []
    for ns, fi in zip(t_idx[order], f_idx[order]):
        if ns >= n_frames - 1:
            continue
        i, k = ns + 1, 0
        while i < n_frames - 1 and k < energy_tol:
            k = k + 1 if remaining[i, fi] < frame_thresh else 0
            i += 1
        i -= k
        if i - ns <= min_note_len:
            continue
        remaining[ns:i, max(0, fi - 1): min(88, fi + 2)] = 0
        events.append((int(ns), int(i), int(fi + MIDI_OFFSET), float(np.mean(frames[ns:i, fi]))))

    if melodia:
        guard = 0
        while guard < 20000:
            guard += 1
            flat = int(np.argmax(remaining))
            i_mid, fi = divmod(flat, remaining.shape[1])
            if remaining[i_mid, fi] <= frame_thresh:
                break
            remaining[i_mid, fi] = 0
            lo, hi = max(0, fi - 1), min(88, fi + 2)
            i, k = i_mid + 1, 0
            while i < n_frames - 1 and k < energy_tol:
                k = k + 1 if remaining[i, fi] < frame_thresh else 0
                remaining[i, lo:hi] = 0
                i += 1
            i_end = i - 1 - k
            i, k = i_mid - 1, 0
            while i > 0 and k < energy_tol:
                k = k + 1 if remaining[i, fi] < frame_thresh else 0
                remaining[i, lo:hi] = 0
                i -= 1
            i_start = i + 1 + k
            if i_end - i_start <= min_note_len:
                continue
            events.append((int(i_start), int(i_end), int(fi + MIDI_OFFSET),
                           float(np.mean(frames[i_start:i_end, fi]))))
    return events
