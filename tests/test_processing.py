import sys, time, numpy as np
sys.path.insert(0, '.'); sys.path.insert(0, 'tests')
import make_test_song as M
from app.engine import processing as PR
sr = 44100
rng = np.random.default_rng(3)

notes = [69, 67, 64, 67, 69, 72, 71, 69, 72, 74, 76, 74]
y = np.zeros(int(sr * (len(notes) * 0.5 + 1)))
truth = []
for i, m in enumerate(notes):
    off = rng.choice([-1, 1]) * rng.uniform(0.25, 0.45)
    seg = M.voice_note(m + off, 0.46, 0.8) if False else None
    n = int(0.46 * sr); t = np.arange(n) / sr
    vib = 1 + 0.004 * np.sin(2 * np.pi * 5.5 * t)
    ph = 2 * np.pi * np.cumsum(M.hz(m + off) * vib) / sr
    sig = sum((0.5 ** k) * np.sin((k + 1) * ph) for k in range(8)) * M.env(n, 0.03, 2, 0.8, 0.05) * 0.3
    y[int(i * 0.5 * sr): int(i * 0.5 * sr) + n] += sig
    truth.append(m)
Y = np.stack([y, y]).astype(np.float32)
def err(x):
    times, f0 = PR.track_pitch(x.mean(0), sr)
    m = PR.hz_to_midi(f0[f0 > 0]); return float(np.median(np.abs(m - np.round(m))) * 100)
print('before cents err', round(err(Y), 1))
for speed in (0, 30):
    t = time.time(); out, st = PR.autotune(Y, sr, 9, 'minor', 1.0, speed, 0.3); dt = time.time() - t
    print(f'speed {speed}: after cents err', round(err(out), 1), st, f'{dt:.1f}s', 'rms ratio', round(float(np.sqrt((out**2).mean())/np.sqrt((Y**2).mean())), 3))
out, _ = PR.pitch_shift(Y, sr, 3, 'voice'); times, f0 = PR.track_pitch(out.mean(0), sr)
print('shift +3 median midi', round(float(np.median(PR.hz_to_midi(f0[f0>0]))), 2), 'orig', round(float(np.median(PR.hz_to_midi(PR.track_pitch(Y.mean(0), sr)[1][PR.track_pitch(Y.mean(0), sr)[1]>0]))),2))
noise = (Y + 0.02 * rng.standard_normal(Y.shape)).astype(np.float32)
dn, st = PR.denoise(noise, sr, 18)
quiet = slice(int(len(notes)*0.5*sr)+2000, Y.shape[1])
print('denoise: noise floor before', round(20*np.log10(np.sqrt((noise[:,quiet]**2).mean())),1), 'after', round(20*np.log10(np.sqrt((dn[:,quiet]**2).mean())+1e-9),1), 'signal kept', round(float(np.sqrt((dn[:, :sr]**2).mean())/np.sqrt((Y[:, :sr]**2).mean())),3))
