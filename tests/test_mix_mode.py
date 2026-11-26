import sys, json, glob
import numpy as np, mido
sys.path.insert(0, 'tests'); sys.path.insert(0, '.')
from eval_util import note_f1
import app.engine.separation as S
from app.engine import project as P

BLEED = float(sys.argv[1]) if len(sys.argv) > 1 else 0.1
st = {k: P.load_audio(f'test_song/stems/{k.capitalize()}.wav', 44100)[0] for k in ['drums', 'bass', 'piano', 'vocals']}
rng = np.random.default_rng(0)

def fake_sep(audio, sr, model, progress=None, log=None):
    tot = sum(st.values()); out = {}
    for k, v in st.items():
        out[k] = v * (1 - BLEED) + BLEED * (tot - v) + 0.003 * rng.standard_normal(v.shape).astype(np.float32)
    out['guitar'] = np.zeros_like(st['bass']); out['other'] = 0.02 * (tot - st['vocals'])
    progress(1.0); return out, 44100

S.separate = fake_sep
j = P.Job(id='t', inputs=['test_song/mix.wav'], mode='mix')
pid = P.analyze(j)
r = P.export(pid); d = r['path'] + '/'
mf = mido.MidiFile(glob.glob(d + '*all tracks.mid')[0]); info = json.load(open(d + 'song_info.json'))
pad = info['lead_in_seconds']; spb = 60 / info['bpm']
tr = json.load(open('test_song/truth.json'))
print('bpm', info['bpm'], 'key', info['key'], [s['name'] for s in info['sections']])
for t in mf.tracks:
    name = t[0].name; tick = 0; notes = []
    for m in t:
        tick += m.time
        if m.type == 'note_on' and m.velocity > 0:
            notes.append((tick / mf.ticks_per_beat * spb - pad, m.note))
    key = {'Lead Vocal': 'vocals', 'Drums': 'drums', 'Bass': 'bass', 'Keys': 'piano'}.get(name)
    if key:
        ref = [(r[0], r[1]) if key == 'drums' else (r[0], r[2]) for r in tr['notes'][key]]
        print(f'{name:12s}', len(notes), len(ref), note_f1(notes, ref, 0.05))
    else:
        print(f'{name:12s}', len(notes))
