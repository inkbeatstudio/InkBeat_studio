from __future__ import annotations

import json
import re
import shutil
import struct
import uuid
from pathlib import Path

import numpy as np

GEN_KEYRANGE, GEN_VELRANGE, GEN_INSTRUMENT, GEN_SAMPLEID = 43, 44, 41, 53
GEN_ROOT, GEN_COARSE, GEN_FINE, GEN_MODES, GEN_ATTEN, GEN_PAN = 58, 51, 52, 54, 48, 17
GEN_ATTACK, GEN_HOLD, GEN_DECAY, GEN_SUSTAIN, GEN_RELEASE = 34, 35, 36, 37, 38
OFFS = {0: ("start", 1), 4: ("start", 32768), 1: ("end", 1), 12: ("end", 32768), 2: ("lstart", 1), 45: ("lstart", 32768), 3: ("lend", 1), 50: ("lend", 32768)}


def lib_dir(pdir: Path) -> Path:
    d = pdir / "samples" / "_instruments"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _chunks(data: bytes, off: int, end: int):
    while off + 8 <= end:
        cid = data[off:off + 4]
        size = struct.unpack_from("<I", data, off + 4)[0]
        yield cid, off + 8, size
        off += 8 + size + (size & 1)


class SF2:
    def __init__(self, path: Path):
        self.path = Path(path)
        data = self.path.read_bytes()
        if data[:4] != b"RIFF" or data[8:12] != b"sfbk":
            raise ValueError("Це не файл SoundFont (.sf2).")
        self.smpl_off = self.smpl_len = 0
        pd = {}
        for cid, o, sz in _chunks(data, 12, len(data)):
            if cid != b"LIST":
                continue
            kind = data[o:o + 4]
            for sid, so, ssz in _chunks(data, o + 4, o + sz):
                if kind == b"sdta" and sid == b"smpl":
                    self.smpl_off, self.smpl_len = so, ssz
                elif kind == b"pdta":
                    pd[sid.decode("latin-1")] = data[so:so + ssz]
        self.data = data
        need = ["phdr", "pbag", "pgen", "inst", "ibag", "igen", "shdr"]
        if any(k not in pd for k in need) or not self.smpl_len:
            raise ValueError("Файл SoundFont пошкоджений або неповний.")
        name = lambda b: b.split(b"\x00", 1)[0].decode("latin-1", "replace").strip()
        self.phdr = [(name(pd["phdr"][i:i + 20]),) + struct.unpack_from("<HHH", pd["phdr"], i + 20) for i in range(0, len(pd["phdr"]), 38)]
        self.pbag = [struct.unpack_from("<HH", pd["pbag"], i) for i in range(0, len(pd["pbag"]), 4)]
        self.pgen = [struct.unpack_from("<Hh", pd["pgen"], i) + (pd["pgen"][i + 2], pd["pgen"][i + 3]) for i in range(0, len(pd["pgen"]), 4)]
        self.inst = [(name(pd["inst"][i:i + 20]), struct.unpack_from("<H", pd["inst"], i + 20)[0]) for i in range(0, len(pd["inst"]), 22)]
        self.ibag = [struct.unpack_from("<HH", pd["ibag"], i) for i in range(0, len(pd["ibag"]), 4)]
        self.igen = [struct.unpack_from("<Hh", pd["igen"], i) + (pd["igen"][i + 2], pd["igen"][i + 3]) for i in range(0, len(pd["igen"]), 4)]
        self.shdr = []
        for i in range(0, len(pd["shdr"]), 46):
            s = struct.unpack_from("<IIIIIBbHH", pd["shdr"], i + 20)
            self.shdr.append({"name": name(pd["shdr"][i:i + 20]), "start": s[0], "end": s[1], "ls": s[2], "le": s[3], "sr": s[4],
                              "pitch": s[5], "corr": s[6], "type": s[8]})

    def presets(self):
        out = []
        for i, (nm, prog, bank, _) in enumerate(self.phdr[:-1]):
            out.append({"index": i, "name": nm or f"Preset {i}", "program": prog, "bank": bank})
        out.sort(key=lambda p: (p["bank"], p["program"]))
        return out

    def _zones(self, bags, gens, a, b):
        zones = []
        for z in range(a, b):
            g0, g1 = bags[z][0], bags[z + 1][0] if z + 1 < len(bags) else len(gens)
            gd = {}
            for op, amt, lo, hi in gens[g0:g1]:
                gd[op] = (lo, hi) if op in (GEN_KEYRANGE, GEN_VELRANGE) else amt
            zones.append(gd)
        return zones

    def zones(self, index: int):
        _, _, _, b0 = self.phdr[index]
        b1 = self.phdr[index + 1][3]
        pz = self._zones(self.pbag, self.pgen, b0, b1)
        pglob = pz[0] if pz and GEN_INSTRUMENT not in pz[0] else {}
        result = []
        for p in pz:
            if GEN_INSTRUMENT not in p:
                continue
            pp = dict(pglob)
            pp.update(p)
            ii = p[GEN_INSTRUMENT]
            if ii >= len(self.inst) - 1:
                continue
            ia, ib = self.inst[ii][1], self.inst[ii + 1][1]
            iz = self._zones(self.ibag, self.igen, ia, ib)
            iglob = iz[0] if iz and GEN_SAMPLEID not in iz[0] else {}
            for z in iz:
                if GEN_SAMPLEID not in z:
                    continue
                g = dict(iglob)
                g.update(z)
                sh = self.shdr[g[GEN_SAMPLEID]] if g[GEN_SAMPLEID] < len(self.shdr) else None
                if not sh or sh["end"] <= sh["start"]:
                    continue
                klo, khi = g.get(GEN_KEYRANGE, (0, 127))
                plo, phi = pp.get(GEN_KEYRANGE, (0, 127))
                vlo, vhi = g.get(GEN_VELRANGE, (0, 127))
                qlo, qhi = pp.get(GEN_VELRANGE, (0, 127))
                klo, khi, vlo, vhi = max(klo, plo), min(khi, phi), max(vlo, qlo), min(vhi, qhi)
                if klo > khi or vlo > vhi:
                    continue
                off = {"start": 0, "end": 0, "lstart": 0, "lend": 0}
                for op, (k, mul) in OFFS.items():
                    if op in g:
                        off[k] += g[op] * mul
                root = g.get(GEN_ROOT, -1)
                root = sh["pitch"] if root is None or root < 0 or root > 127 else root
                tune = (g.get(GEN_COARSE, 0) + pp.get(GEN_COARSE, 0)) * 100 + g.get(GEN_FINE, 0) + pp.get(GEN_FINE, 0) + sh["corr"]
                atten = (g.get(GEN_ATTEN, 0) + pp.get(GEN_ATTEN, 0)) / 10.0
                tc = lambda v, d: float(2 ** (v / 1200.0)) if v is not None else d
                pan = g.get(GEN_PAN, 0) / 500.0
                if sh["type"] & 4:
                    pan = -1.0 if pan == 0 else pan
                elif sh["type"] & 2:
                    pan = 1.0 if pan == 0 else pan
                result.append({"sid": g[GEN_SAMPLEID], "lo": klo, "hi": khi, "vlo": vlo, "vhi": vhi, "root": int(root), "tune": round(tune, 2),
                               "gain": round(10 ** (-atten / 20 * 0.4), 4), "pan": round(max(-1, min(1, pan)), 3),
                               "loop": int(g.get(GEN_MODES, 0)) & 3 in (1, 3), "off": off,
                               "a": round(min(5.0, tc(g.get(GEN_ATTACK), 0.002)), 4), "r": round(min(6.0, tc(g.get(GEN_RELEASE), 0.25)), 4),
                               "d": round(min(20.0, tc(g.get(GEN_DECAY), 1.0)), 4),
                               "s": round(float(10 ** (-max(0, min(1440, g.get(GEN_SUSTAIN, 0))) / 200.0)), 4)})
        return result

    def sample(self, sid: int, off: dict):
        sh = self.shdr[sid]
        a = max(0, sh["start"] + off.get("start", 0))
        b = max(a + 2, sh["end"] + off.get("end", 0))
        raw = np.frombuffer(self.data, dtype="<i2", count=b - a, offset=self.smpl_off + 2 * a).astype(np.float32) / 32768.0
        ls = sh["ls"] + off.get("lstart", 0) - a
        le = sh["le"] + off.get("lend", 0) - a
        return raw, sh["sr"], (max(0, ls), min(len(raw), le)) if le > ls + 8 else None


def _save(y: np.ndarray, sr: int, path: Path):
    import soundfile as sf

    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(str(path), y, sr, subtype="PCM_16")


def import_file(pdir: Path, src: Path, name: str | None = None) -> dict:
    src = Path(src)
    nm = name or src.stem
    ext = src.suffix.lower()
    lid = "lib" + uuid.uuid4().hex[:8]
    d = lib_dir(pdir) / lid
    d.mkdir(parents=True, exist_ok=True)
    if ext == ".sf2":
        shutil.copy(src, d / "bank.sf2")
        sf = SF2(d / "bank.sf2")
        meta = {"id": lid, "kind": "sf2", "name": nm, "presets": sf.presets()}
    elif ext in (".sfz", ".zip"):
        root = d / "sfz"
        if ext == ".zip":
            import zipfile

            with zipfile.ZipFile(src) as z:
                for n in z.namelist():
                    rel = Path(n)
                    if rel.is_absolute() or ".." in rel.parts or n.endswith("/"):
                        continue
                    out = root / rel
                    out.parent.mkdir(parents=True, exist_ok=True)
                    with z.open(n) as fi, open(out, "wb") as fo:
                        shutil.copyfileobj(fi, fo)
            files = sorted(root.rglob("*.sfz"))
            if not files:
                raise ValueError("В архіві немає файлу .sfz.")
        else:
            base = src.parent
            root.mkdir(parents=True, exist_ok=True)
            shutil.copy(src, root / src.name)
            text = src.read_text(encoding="utf-8", errors="replace")
            for s in set(re.findall(r"sample\s*=\s*([^\r\n]+?\.(?:wav|flac|ogg|aif|aiff))", text, re.I)):
                dp = re.search(r"default_path\s*=\s*([^\r\n]+)", text)
                rel = Path((dp.group(1).strip() if dp else "") + s.strip().replace("\\", "/"))
                srcf = base / rel
                if srcf.exists():
                    out = root / rel
                    out.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy(srcf, out)
            files = [root / src.name]
        meta = {"id": lid, "kind": "sfz", "name": nm, "presets": [{"index": i, "name": f.stem, "program": i, "bank": 0, "file": str(f.relative_to(root))} for i, f in enumerate(files)]}
    else:
        raise ValueError("Підтримуються файли .sf2, .sfz або .zip з .sfz і семплами.")
    (d / "meta.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    return meta


def _sfz_regions(path: Path):
    text = path.read_text(encoding="utf-8", errors="replace")
    text = re.sub(r"//[^\n]*", "", text)
    for k, v in re.findall(r"#define\s+(\$\w+)\s+(\S+)", text):
        text = text.replace(k, v)
    text = re.sub(r"#define[^\n]*", "", text)
    ctrl, glob, master, group = {}, {}, {}, {}
    regions = []
    target = {}
    for tok in re.split(r"(<\w+>)", text):
        tok = tok.strip()
        if not tok:
            continue
        m = re.fullmatch(r"<(\w+)>", tok)
        if m:
            h = m.group(1).lower()
            if h == "region":
                target = {}
                regions.append((dict(glob), dict(master), dict(group), target))
            elif h == "group":
                group = {}
                target = group
            elif h == "master":
                master, group = {}, {}
                target = master
            elif h == "global":
                glob = {}
                target = glob
            elif h == "control":
                target = ctrl
            else:
                target = {}
            continue
        for k, v in re.findall(r"(\w+)\s*=\s*(.+?)(?=\s+\w+\s*=|$)", tok, re.S):
            target[k.lower()] = v.strip()
    out = []
    for parts in regions:
        a = {}
        for src_ in parts:
            a.update(src_)
        out.append(a)
    return ctrl, out


def _note(v, default):
    if v is None:
        return default
    v = str(v).strip()
    if re.fullmatch(r"-?\d+", v):
        return int(v)
    m = re.fullmatch(r"([a-gA-G])([#b]?)(-?\d)", v)
    if not m:
        return default
    pc = {"c": 0, "d": 2, "e": 4, "f": 5, "g": 7, "a": 9, "b": 11}[m.group(1).lower()] + (1 if m.group(2) == "#" else -1 if m.group(2) == "b" else 0)
    return (int(m.group(3)) + 1) * 12 + pc


def load_preset(pdir: Path, lid: str, index: int) -> dict:
    import soundfile as sf

    d = lib_dir(pdir) / lid
    meta = json.loads((d / "meta.json").read_text(encoding="utf-8"))
    pr = next((p for p in meta["presets"] if p["index"] == index), None)
    if pr is None:
        raise ValueError("Пресет не знайдено.")
    outd = d / f"p{index}"
    zones = []
    if meta["kind"] == "sf2":
        bank = SF2(d / "bank.sf2")
        cache = {}
        for z in bank.zones(index):
            key = (z["sid"], json.dumps(z["off"], sort_keys=True))
            if key not in cache:
                y, sr, lp = bank.sample(z["sid"], z["off"])
                fn = outd / f"s{len(cache)}.wav"
                _save(y, sr, fn)
                cache[key] = (str(fn.relative_to(pdir / "samples")).replace("\\", "/"), sr, lp)
            f, sr, lp = cache[key]
            zones.append({"file": f, "lo": z["lo"], "hi": z["hi"], "vlo": z["vlo"], "vhi": z["vhi"], "root": z["root"], "tune": z["tune"],
                          "gain": z["gain"], "pan": z["pan"], "loop": [lp[0] / sr, lp[1] / sr] if z["loop"] and lp else None,
                          "a": z["a"], "r": z["r"], "d": z["d"], "s": z["s"]})
    else:
        root = d / "sfz"
        sfz = root / pr["file"]
        ctrl, regs = _sfz_regions(sfz)
        dpath = ctrl.get("default_path", "")
        for i, r in enumerate(regs):
            smp = r.get("sample")
            if not smp:
                continue
            p = (sfz.parent / (dpath + smp.replace("\\", "/"))).resolve()
            if not p.exists():
                continue
            y, sr = sf.read(str(p), dtype="float32", always_2d=True)
            fn = outd / f"r{i}.wav"
            _save(y, sr, fn)
            key = _note(r.get("key"), None)
            lo = _note(r.get("lokey"), key if key is not None else 0)
            hi = _note(r.get("hikey"), key if key is not None else 127)
            rootk = _note(r.get("pitch_keycenter"), key if key is not None else 60)
            lm = r.get("loop_mode", "")
            ls, le = r.get("loop_start") or r.get("loopstart"), r.get("loop_end") or r.get("loopend")
            loop = [float(ls) / sr, float(le) / sr] if lm in ("loop_continuous", "loop_sustain") and ls and le else None
            vol = float(r.get("volume", 0) or 0)
            zones.append({"file": str(fn.relative_to(pdir / "samples")).replace("\\", "/"), "lo": lo, "hi": hi,
                          "vlo": int(r.get("lovel", 0)), "vhi": int(r.get("hivel", 127)), "root": rootk,
                          "tune": float(r.get("tune", 0) or 0) + 100 * float(r.get("transpose", 0) or 0), "gain": round(10 ** (vol / 20), 4),
                          "pan": max(-1, min(1, float(r.get("pan", 0) or 0) / 100)), "loop": loop,
                          "a": float(r.get("ampeg_attack", 0.002) or 0.002), "r": float(r.get("ampeg_release", 0.25) or 0.25),
                          "d": float(r.get("ampeg_decay", 1.0) or 1.0),
                          "s": max(0.0, min(1.0, float(r.get("ampeg_sustain", 100) or 100) / 100))})
    if not zones:
        raise ValueError("У цьому пресеті немає звуків, які вдалося прочитати.")
    res = {"lib": lid, "preset": index, "name": f"{meta['name']} — {pr['name']}", "drums": bool(pr.get("bank") == 128), "zones": zones}
    (outd / "zones.json").write_text(json.dumps(res, ensure_ascii=False), encoding="utf-8")
    return res


def list_libs(pdir: Path) -> list[dict]:
    out = []
    for m in sorted(lib_dir(pdir).glob("*/meta.json")):
        try:
            out.append(json.loads(m.read_text(encoding="utf-8")))
        except Exception:
            pass
    return out
