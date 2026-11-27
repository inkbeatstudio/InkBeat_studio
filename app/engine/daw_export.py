from __future__ import annotations

import struct
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape, quoteattr

TPQ = 960


def _hex_rgb(c: str) -> tuple[int, int, int]:
    c = (c or "#888888").lstrip("#")
    if len(c) == 3:
        c = "".join(ch * 2 for ch in c)
    try:
        return int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16)
    except Exception:
        return 136, 136, 136


def _wav_seconds(path: Path) -> float:
    try:
        import soundfile as sf

        i = sf.info(str(path))
        return float(i.frames) / float(i.samplerate)
    except Exception:
        return 0.0


def _midi_events(notes, drums: bool):
    ch = 9 if drums else 0
    ev = []
    for n in notes:
        t0 = max(0, int(round(float(n[0]) * TPQ)))
        t1 = max(t0 + 1, int(round((float(n[0]) + max(0.01, float(n[1]))) * TPQ)))
        p = int(max(0, min(127, n[2])))
        v = int(max(1, min(127, n[3] if len(n) > 3 else 96)))
        ev.append((t0, 1, 0x90 | ch, p, v))
        ev.append((t1, 0, 0x80 | ch, p, 0))
    ev.sort()
    return ev


def write_rpp(path: Path, title: str, bpm: float, bpb: int, tracks: list[dict], end_beat: float):
    sec_per_beat = 60.0 / bpm
    L = ['<REAPER_PROJECT 0.1 "6.0/InkBeat" 0', f'  TITLE {quoteattr(title)}', f"  TEMPO {bpm:.6f} {int(bpb)} 4", "  SAMPLERATE 44100 0 0"]
    for t in tracks:
        r, g, b = _hex_rgb(t.get("color"))
        vol = 10 ** (float(t.get("vol_db", 0)) / 20)
        L += ["  <TRACK", f"    NAME {quoteattr(t['name'])}", f"    PEAKCOL {0x1000000 | (b << 16) | (g << 8) | r}",
              f"    VOLPAN {vol:.6f} {float(t.get('pan', 0)):.4f} -1 -1 1", f"    MUTESOLO {1 if t.get('mute') else 0} 0 0"]
        if t.get("wav"):
            dur = t.get("wav_dur") or _wav_seconds(t["wav_abs"])
            L += ["    <ITEM", "      POSITION 0", f"      LENGTH {dur:.6f}", f"      NAME {quoteattr(t['name'])}",
                  "      <SOURCE WAVE", f"        FILE {quoteattr(t['wav'])}", "      >", "    >"]
        if t.get("notes"):
            length = max(end_beat, max(float(n[0]) + float(n[1]) for n in t["notes"])) * sec_per_beat
            L += ["    <ITEM", "      POSITION 0", f"      LENGTH {length:.6f}", f"      NAME {quoteattr(t['name'])}",
                  "      <SOURCE MIDI", f"        HASDATA 1 {TPQ} QN"]
            last = 0
            for tick, _, st, d1, d2 in _midi_events(t["notes"], t.get("is_drums")):
                L.append(f"        E {tick - last} {st:02x} {d1:02x} {d2:02x}")
                last = tick
            end_tick = int(round(length / sec_per_beat * TPQ))
            L.append(f"        E {max(0, end_tick - last)} b0 7b 00")
            L += ["      >", "    >"]
        L.append("  >")
    L.append(">")
    path.write_text("\n".join(L) + "\n", encoding="utf-8")


def write_dawproject(path: Path, title: str, bpm: float, bpb: int, tracks: list[dict], end_beat: float, version: str = ""):
    ids = iter(range(1, 1_000_000))
    nid = lambda: f"id{next(ids)}"
    st, ar = [], []
    files = []
    master = nid()
    for t in tracks:
        tid, cid = nid(), nid()
        r, g, b = _hex_rgb(t.get("color"))
        kind = "audio" if t.get("wav") else "notes"
        vol = 10 ** (float(t.get("vol_db", 0)) / 20)
        pan = (float(t.get("pan", 0)) + 1) / 2
        st.append(f'    <Track contentType="{kind}" loaded="true" id="{tid}" name={quoteattr(t["name"])} color="#{r:02x}{g:02x}{b:02x}">\n'
                  f'      <Channel audioChannels="2" destination="#{master}" role="regular" solo="false" id="{cid}">\n'
                  f'        <Mute value="{"true" if t.get("mute") else "false"}" id="{nid()}" name="Mute"/>\n'
                  f'        <Pan max="1.0" min="0.0" unit="normalized" value="{pan:.4f}" id="{nid()}" name="Pan"/>\n'
                  f'        <Volume max="2.0" min="0.0" unit="linear" value="{vol:.5f}" id="{nid()}" name="Volume"/>\n'
                  f'      </Channel>\n    </Track>')
        if t.get("wav"):
            dur = t.get("wav_dur") or _wav_seconds(t["wav_abs"])
            beats = dur * bpm / 60.0
            name = f"audio/{Path(t['wav']).name}"
            files.append((t["wav_abs"], name))
            ar.append(f'      <Lanes track="{tid}" id="{nid()}">\n        <Clips id="{nid()}">\n'
                      f'          <Clip time="0.0" duration="{beats:.6f}" playStart="0.0" name={quoteattr(t["name"])}>\n'
                      f'            <Warps contentTimeUnit="seconds" timeUnit="beats" id="{nid()}">\n'
                      f'              <Audio algorithm="stretch" channels="2" duration="{dur:.6f}" sampleRate="44100" id="{nid()}">\n'
                      f'                <File path={quoteattr(name)}/>\n              </Audio>\n'
                      f'              <Warp time="0.0" contentTime="0.0"/>\n              <Warp time="{beats:.6f}" contentTime="{dur:.6f}"/>\n'
                      f'            </Warps>\n          </Clip>\n        </Clips>\n      </Lanes>')
        else:
            length = max(end_beat, max(float(n[0]) + float(n[1]) for n in t["notes"]))
            ch = 9 if t.get("is_drums") else 0
            notes = "\n".join(f'              <Note time="{float(n[0]):.5f}" duration="{max(0.01, float(n[1])):.5f}" channel="{ch}" key="{int(n[2])}" vel="{min(1.0, (n[3] if len(n) > 3 else 96) / 127):.4f}" rel="0.5"/>' for n in t["notes"])
            ar.append(f'      <Lanes track="{tid}" id="{nid()}">\n        <Clips id="{nid()}">\n'
                      f'          <Clip time="0.0" duration="{length:.5f}" playStart="0.0" name={quoteattr(t["name"])}>\n'
                      f'            <Notes id="{nid()}">\n{notes}\n            </Notes>\n          </Clip>\n        </Clips>\n      </Lanes>')
    st.append(f'    <Track contentType="audio notes" loaded="true" id="{nid()}" name="Master">\n'
              f'      <Channel audioChannels="2" role="master" solo="false" id="{master}">\n'
              f'        <Volume max="2.0" min="0.0" unit="linear" value="1.0" id="{nid()}" name="Volume"/>\n      </Channel>\n    </Track>')
    xml = (f'<?xml version="1.0" encoding="UTF-8"?>\n<Project version="1.0">\n  <Application name="InkBeat" version={quoteattr(version)}/>\n'
           f'  <Transport>\n    <Tempo max="666.0" min="20.0" unit="bpm" value="{bpm:.6f}" id="{nid()}" name="Tempo"/>\n'
           f'    <TimeSignature denominator="4" numerator="{int(bpb)}" id="{nid()}"/>\n  </Transport>\n'
           f'  <Structure>\n' + "\n".join(st) + '\n  </Structure>\n'
           f'  <Arrangement id="{nid()}">\n    <Lanes timeUnit="beats" id="{nid()}">\n' + "\n".join(ar) + '\n    </Lanes>\n  </Arrangement>\n</Project>\n')
    meta = f'<?xml version="1.0" encoding="UTF-8"?>\n<MetaData>\n  <Title>{escape(title)}</Title>\n  <Comment>InkBeat</Comment>\n</MetaData>\n'
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("project.xml", xml)
        z.writestr("metadata.xml", meta)
        for src, name in files:
            z.write(src, name, compress_type=zipfile.ZIP_STORED)


def _id3_frame(fid: str, payload: bytes) -> bytes:
    return fid.encode() + struct.pack(">I", len(payload)) + b"\x00\x00" + payload


def _id3_text(fid: str, text: str) -> bytes:
    return _id3_frame(fid, b"\x01" + "﻿".encode("utf-16-le") + text.encode("utf-16-le"))


def id3_tag(meta: dict, cover: Path | None = None) -> bytes:
    frames = b""
    for k, fid in (("title", "TIT2"), ("artist", "TPE1"), ("album", "TALB"), ("year", "TYER"), ("genre", "TCON"), ("isrc", "TSRC"), ("composer", "TCOM")):
        v = str(meta.get(k) or "").strip()
        if v:
            frames += _id3_text(fid, v)
    if meta.get("comment"):
        c = str(meta["comment"])
        frames += _id3_frame("COMM", b"\x01" + b"ukr" + "﻿".encode("utf-16-le") + b"\x00\x00" + "﻿".encode("utf-16-le") + c.encode("utf-16-le"))
    if cover and cover.exists():
        data = cover.read_bytes()
        mime = b"image/png" if data[:4] == b"\x89PNG" else b"image/jpeg"
        frames += _id3_frame("APIC", b"\x00" + mime + b"\x00" + b"\x03" + b"\x00" + data)
    if not frames:
        return b""
    size = len(frames)
    syn = bytes([(size >> 21) & 0x7F, (size >> 14) & 0x7F, (size >> 7) & 0x7F, size & 0x7F])
    return b"ID3\x03\x00\x00" + syn + frames


def tag_mp3(path: Path, meta: dict, cover: Path | None = None):
    tag = id3_tag(meta, cover)
    if tag:
        data = path.read_bytes()
        path.write_bytes(tag + data)


def tag_wav(path: Path, meta: dict):
    items = b""
    for k, cid in (("title", b"INAM"), ("artist", b"IART"), ("album", b"IPRD"), ("year", b"ICRD"), ("genre", b"IGNR"), ("comment", b"ICMT"), ("isrc", b"ISRC")):
        v = str(meta.get(k) or "").strip()
        if not v:
            continue
        b = v.encode("utf-8") + b"\x00"
        if len(b) % 2:
            b += b"\x00"
        items += cid + struct.pack("<I", len(b)) + b
    if not items:
        return
    chunk = b"LIST" + struct.pack("<I", len(items) + 4) + b"INFO" + items
    data = bytearray(path.read_bytes())
    if data[:4] != b"RIFF":
        return
    data += chunk
    struct.pack_into("<I", data, 4, len(data) - 8)
    path.write_bytes(bytes(data))
