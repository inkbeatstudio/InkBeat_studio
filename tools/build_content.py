import json
import re
import subprocess
import sys
from pathlib import PurePosixPath

NOTE = {"c": 0, "d": 2, "e": 4, "f": 5, "g": 7, "a": 9, "b": 11}


def note(v, default=None):
    if v is None:
        return default
    v = str(v).strip()
    if re.fullmatch(r"-?\d+", v):
        return int(v)
    m = re.fullmatch(r"([a-gA-G])([#b]?)(-?\d)", v)
    if not m:
        return default
    return (int(m.group(3)) + 1) * 12 + NOTE[m.group(1).lower()] + (1 if m.group(2) == "#" else -1 if m.group(2) == "b" else 0)


class Repo:
    def __init__(self, path):
        self.path = path
        out = subprocess.run(["git", "-C", path, "ls-tree", "-r", "--name-only", "HEAD"], capture_output=True, text=True).stdout
        self.files = {name: 0 for name in out.splitlines()}
        self.lower = {k.lower(): k for k in self.files}
        self.sha = subprocess.run(["git", "-C", path, "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()

    def text(self, name):
        return subprocess.run(["git", "-C", self.path, "show", f"HEAD:{name}"], capture_output=True).stdout.decode("utf-8", "replace")

    def find(self, name):
        n = str(PurePosixPath(name))
        parts = []
        for p in n.split("/"):
            if p == "..":
                if parts:
                    parts.pop()
            elif p not in (".", ""):
                parts.append(p)
        n = "/".join(parts)
        return n if n in self.files else self.lower.get(n.lower())


def _sub(text, defines):
    for k, v in sorted(defines.items(), key=lambda x: -len(x[0])):
        text = text.replace(k, v)
    return text


def expand(repo, name, defines, depth=0, root=None):
    txt = repo.text(name)
    txt = re.sub(r"/\*.*?\*/", "", txt, flags=re.S)
    txt = re.sub(r"//[^\n]*", "", txt)
    root = root if root is not None else str(PurePosixPath(name).parent)
    out = []
    pos = 0
    for m in re.finditer(r'#define\s+(\$\w+)\s+(\S+)|#include\s+"([^"]+)"', txt):
        out.append(_sub(txt[pos:m.start()], defines))
        pos = m.end()
        if m.group(1):
            defines[m.group(1)] = _sub(m.group(2), defines)
        elif depth < 10:
            inc = _sub(m.group(3), defines)
            cand = repo.find((root + "/" if root not in ("", ".") else "") + inc) or repo.find(inc)
            if cand:
                out.append("\n" + expand(repo, cand, defines, depth + 1, root) + "\n")
    out.append(_sub(txt[pos:], defines))
    return "".join(out)


def regions(repo, sfz):
    text = expand(repo, sfz, {})
    ctrl, glob, master, group, cur = {}, {}, {}, {}, {}
    regs = []
    for tok in re.split(r"(<\w+>)", text):
        if not tok.strip():
            continue
        m = re.fullmatch(r"<(\w+)>", tok.strip())
        if m:
            h = m.group(1).lower()
            if h == "region":
                cur = {}
                regs.append((dict(ctrl), dict(glob), dict(master), dict(group), cur))
            elif h == "group":
                group = {}
                cur = group
            elif h == "master":
                master, group = {}, {}
                cur = master
            elif h == "global":
                glob, master, group = {}, {}, {}
                cur = glob
            elif h == "control":
                ctrl = {}
                cur = ctrl
            else:
                cur = {}
            continue
        for k, v in re.findall(r"(\w+)\s*=\s*(.+?)(?=\s+\w+\s*=|\s*$)", tok, re.S):
            cur[k.lower()] = v.strip()
    out = []
    for c, g, ms, gr, r in regs:
        a = {}
        for d in (g, ms, gr, r):
            a.update(d)
        a["_dp"] = c.get("default_path", "")
        a["_oct"] = int(c.get("octave_offset", 0) or 0)
        a["_nt"] = int(c.get("note_offset", 0) or 0)
        out.append(a)
    return out


def f(r, k, d):
    try:
        return float(r.get(k, d))
    except Exception:
        return d


def zones_of(repo, sfz, drums=False, max_roots=30, layers=(45, 90, 122), max_len=10.0):
    base = str(PurePosixPath(sfz).parent)
    zs = []
    for r in regions(repo, sfz):
        smp = r.get("sample", "")
        if not smp or smp.startswith("*"):
            continue
        if r.get("trigger", "attack") not in ("attack", "first", "legato"):
            continue
        if f(r, "seq_position", 1) > 1 or f(r, "lorand", 0) > 0.001:
            continue
        if any(k.startswith("locc") and k not in ("locc1", "locc11", "locc7") and f(r, k, 0) > 0 for k in r) and not drums:
            continue
        rel = (r["_dp"] + smp).replace("\\", "/")
        path = repo.find((base + "/" if base not in ("", ".") else "") + rel) or repo.find(rel)
        if not path:
            continue
        shift = r["_oct"] * 12 + r["_nt"]
        key = note(r.get("key"))
        lo = note(r.get("lokey"), key if key is not None else 0)
        hi = note(r.get("hikey"), key if key is not None else 127)
        root = note(r.get("pitch_keycenter"), key if key is not None else (lo if drums else 60))
        if lo is None or hi is None:
            continue
        lm = r.get("loop_mode", "")
        ls, le = r.get("loop_start") or r.get("loopstart"), r.get("loop_end") or r.get("loopend")
        z = {"path": path, "lo": lo + shift, "hi": hi + shift, "root": root + shift,
             "vlo": int(f(r, "lovel", 0)), "vhi": int(f(r, "hivel", 127)),
             "tune": f(r, "tune", 0) + 100 * f(r, "transpose", 0),
             "gain": round(10 ** (f(r, "volume", 0) / 20) * (f(r, "amplitude", 100) / 100), 4),
             "pan": max(-1.0, min(1.0, f(r, "pan", 0) / 100)),
             "loop": [int(float(ls)), int(float(le))] if lm in ("loop_continuous", "loop_sustain") and ls and le else None,
             "a": f(r, "ampeg_attack", 0.002), "h": f(r, "ampeg_hold", 0), "d": f(r, "ampeg_decay", 0 if f(r, "ampeg_sustain", 100) >= 99.9 else 1),
             "s": max(0.0, min(1.0, f(r, "ampeg_sustain", 100) / 100)), "r": f(r, "ampeg_release", 0.25),
             "off": int(f(r, "offset", 0)), "end": int(f(r, "end", 0))}
        if f(r, "pitch_keytrack", 100) == 0:
            z["fixed"] = True
        zs.append(z)
    if not zs:
        return []
    seen = set()
    uniq = []
    for z in zs:
        k = (z["path"], z["lo"], z["hi"], z["vlo"], z["vhi"])
        if k not in seen:
            seen.add(k)
            uniq.append(z)
    zs = uniq
    by_root = {}
    for z in zs:
        by_root.setdefault((z["lo"], z["hi"]) if drums else z["root"], []).append(z)
    keep = []
    for k, group in by_root.items():
        ranges = sorted({(z["vlo"], z["vhi"]) for z in group})
        if len(ranges) > len(layers):
            pick = []
            for v in layers:
                best = min(ranges, key=lambda rg: (0 if rg[0] <= v <= rg[1] else min(abs(v - rg[0]), abs(v - rg[1]))))
                if best not in pick:
                    pick.append(best)
            pick.sort()
            new = []
            for i, rg in enumerate(pick):
                lo_v = 0 if i == 0 else (pick[i - 1][1] + rg[0]) // 2 + 1
                hi_v = 127 if i == len(pick) - 1 else (rg[1] + pick[i + 1][0]) // 2
                new.append((rg, lo_v, hi_v))
            for z in group:
                for rg, lo_v, hi_v in new:
                    if (z["vlo"], z["vhi"]) == rg:
                        z2 = dict(z, vlo=lo_v, vhi=hi_v)
                        keep.append(z2)
        else:
            keep.extend(group)
    if not drums:
        roots = sorted({z["root"] for z in keep})
        if len(roots) > max_roots:
            step = len(roots) / max_roots
            chosen = sorted({roots[min(len(roots) - 1, int(round(i * step)))] for i in range(max_roots)})
            keep = [z for z in keep if z["root"] in chosen]
            for i, rt in enumerate(chosen):
                lo_k = 0 if i == 0 else (chosen[i - 1] + rt) // 2 + 1
                hi_k = 127 if i == len(chosen) - 1 else (rt + chosen[i + 1]) // 2
                for z in keep:
                    if z["root"] == rt:
                        z["lo"], z["hi"] = lo_k, hi_k
        else:
            for z in keep:
                if z["root"] == min(roots):
                    z["lo"] = min(z["lo"], max(0, z["lo"] - 12))
                if z["root"] == max(roots):
                    z["hi"] = max(z["hi"], min(127, z["hi"] + 12))
    for z in keep:
        z["max"] = max_len
    return keep


def size_of(repo, zones, slug=None):
    import urllib.request
    from concurrent.futures import ThreadPoolExecutor

    paths = sorted({z["path"] for z in zones})
    if not slug:
        return 0

    def head(p):
        try:
            req = urllib.request.Request(f"https://raw.githubusercontent.com/{slug}/{repo.sha}/" + urllib.request.quote(p), method="HEAD")
            with urllib.request.urlopen(req, timeout=30) as r:
                return int(r.headers.get("Content-Length") or 0)
        except Exception:
            return 0

    with ThreadPoolExecutor(12) as ex:
        return sum(ex.map(head, paths))


if __name__ == "__main__":
    repo = Repo(sys.argv[1])
    for s in sys.argv[2:]:
        zs = zones_of(repo, s, drums="Drums" in s or "drum" in s.lower())
        print(s, len(zs), size_of(repo, zs) // 1024, "KB")
