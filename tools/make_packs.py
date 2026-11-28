import json
import re
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from build_content import Repo, zones_of, size_of, note

R = "/tmp/repos/"
OUT = Path(__file__).resolve().parent.parent / "app" / "engine" / "data" / "content_packs.json"

SFZ_PACKS = [
    {"id": "salamander", "name": "Salamander Grand Piano", "category": "Фортепіано", "tag": "keys", "author": "Alexander Holm", "license": "CC-BY 3.0",
     "dir": "sfzinstruments_SalamanderGrandPiano", "repo": "sfzinstruments/SalamanderGrandPiano",
     "desc": "Концертний рояль Yamaha C5: глибокий, природний звук із кількома рівнями сили удару.",
     "insts": [("grand", "Рояль", "Salamander Grand Piano V3.sfz", {"layers": (38, 80, 118), "max_roots": 30, "max_len": 9})]},
    {"id": "splendid", "name": "Splendid Grand Piano", "category": "Фортепіано", "tag": "keys", "author": "AKAI (суспільне надбання)", "license": "Public Domain",
     "dir": "sfzinstruments_SplendidGrandPiano", "repo": "sfzinstruments/SplendidGrandPiano",
     "desc": "Steinway з чотирма рівнями сили: яскравий, класичний поп-рояль.",
     "insts": [("grand", "Рояль", "Splendid Grand Piano.sfz", {"layers": (40, 85, 120), "max_roots": 30, "max_len": 9})]},
    {"id": "weresax", "name": "Weresax", "category": "Саксофони й дерев'яні", "tag": "winds", "author": "Karoryfer Samples", "license": "CC0",
     "dir": "sfzinstruments_karoryfer.weresax", "repo": "sfzinstruments/karoryfer.weresax",
     "desc": "Альт-саксофон: гучна й тиха гра, а також саксакордеон і сакс-синт для незвичних звуків.",
     "insts": [("alto_forte", "Альт-сакс, гучно", "Programs/alto_map_forte_condenser.sfz", {}),
               ("alto_piano", "Альт-сакс, тихо", "Programs/alto_map_piano_condenser.sfz", {}),
               ("saxcordion", "Саксакордеон", "Programs/alto_map_saxcordion.sfz", {}),
               ("sxnth", "Сакс-синт", "Programs/alto_map_sxnth_voice_1.sfz", {})]},
    {"id": "biglittlebass", "name": "Big Little Bass", "category": "Баси", "tag": "bass", "author": "Karoryfer Samples", "license": "CC0",
     "dir": "sfzinstruments_karoryfer.big-little-bass", "repo": "sfzinstruments/karoryfer.big-little-bass",
     "desc": "Величезна бас-гітара, на якій грають як на маленькій: щільний, теплий щипок.",
     "insts": [("pluck", "Щипок", "Programs/01-big_little_pluck.sfz", {}), ("soft", "М'який щипок", "Programs/02-big_little_soft_pluck.sfz", {})]},
    {"id": "blackbluebass", "name": "Black And Blue Basses", "category": "Баси", "tag": "bass", "author": "Karoryfer Samples", "license": "CC0",
     "dir": "sfzinstruments_karoryfer.black-and-blue-basses", "repo": "sfzinstruments/karoryfer.black-and-blue-basses",
     "desc": "Дві бас-гітари: темна й світла, щипок, стакато й повна гра.",
     "insts": [("dark_pluck", "Темний бас, щипок", "Programs/05-darkblack_pluck.sfz", {}), ("dark_stac", "Темний бас, стакато", "Programs/09-darkblack_stac.sfz", {}),
               ("blue", "Світлий бас", "Programs/03-babyblue_all.sfz", {})]},
    {"id": "gmreal", "name": "Живі інструменти GM", "category": "Різне", "tag": "mixed", "author": "Discord SFZ GM Bank (Versilian Studios, Jeff Learman, Greg Sullivan та ін.)", "license": "CC0",
     "dir": "gm", "repo": "sfzinstruments/Discord-SFZ-GM-Bank",
     "desc": "Записані наживо: електропіаніно, сталеві струни, бас-гітара пальцями, тремоло й піцикато струнних, ситар, шехнай і повний акустичний набір ударних.",
     "insts": [("ep1", "Електропіаніно", "Discord GM/Melodic/005-Electric Piano 1.sfz", {}),
               ("bright", "Яскраве піаніно", "Discord GM/Melodic/002-Bright Acoustic Piano.sfz", {}),
               ("egrand", "Електророяль", "Discord GM/Melodic/003-Electric Grand Piano.sfz", {}),
               ("steel", "Акустична гітара (сталь)", "Discord GM/Melodic/026-Acoustic Guitar (steel).sfz", {}),
               ("fingerbass", "Бас-гітара пальцями", "Discord GM/Melodic/034-Electric Bass (finger).sfz", {}),
               ("trem", "Струнні тремоло", "Discord GM/Melodic/045-Tremolo Strings.sfz", {}),
               ("pizz", "Струнні піцикато", "Discord GM/Melodic/046-Pizzicato Strings.sfz", {}),
               ("sitar", "Ситар", "Discord GM/Melodic/105-Sitar.sfz", {}),
               ("shanai", "Шехнай", "Discord GM/Melodic/112-Shanai.sfz", {}),
               ("kit", "Акустичні ударні", "Discord GM/Drums/001-Standard Kit.sfz", {"drums": True})]},
]

VEL = {"ppp": 20, "pp": 35, "p": 50, "mp": 65, "mf": 80, "f": 100, "ff": 115, "fff": 125}
VSCO = {"repo": "sgossner/VSCO-2-CE", "dir": "sgossner_VSCO-2-CE", "author": "Versilian Studios", "license": "CC0"}
VSCO_PACKS = [
    {"id": "vsco_strings", "name": "Оркестрові струнні", "category": "Струнні", "tag": "strings",
     "desc": "Секції скрипок, альтів і віолончелей, контрабас, соло-скрипка й арфа: протяжно, піцикато, тремоло, спіккато.",
     "insts": [("vln_sus", "Скрипки, протяжно", "Strings/Violin Section/susVib"), ("vln_pizz", "Скрипки, піцикато", "Strings/Violin Section/Pizz"),
               ("vln_trem", "Скрипки, тремоло", "Strings/Violin Section/Trem"), ("vln_spic", "Скрипки, спіккато", "Strings/Violin Section/Spic"),
               ("vla_sus", "Альти, протяжно", "Strings/Viola Section/susvib"), ("vc_sus", "Віолончелі, протяжно", "Strings/Cello Section/susvib"),
               ("vc_pizz", "Віолончелі, піцикато", "Strings/Cello Section/pizzT"), ("cb_sus", "Контрабас, протяжно", "Strings/Solo Contrabass/SusVib"),
               ("cb_pizz", "Контрабас, піцикато", "Strings/Solo Contrabass/Pizz"), ("solo_vln", "Соло-скрипка", "Strings/Solo Violin/Arco Vib"),
               ("harp", "Арфа", "Strings/Harp")]},
    {"id": "vsco_brass", "name": "Оркестрові мідні", "category": "Мідні духові", "tag": "brass",
     "desc": "Валторна, труба, тромбон і туба: протяжна гра й стакато.",
     "insts": [("horn", "Валторна", "Brass/F Horn/sus"), ("horn_stac", "Валторна, стакато", "Brass/F Horn/stac"),
               ("tpt", "Труба", "Brass/Trumpet/sus"), ("tpt_stac", "Труба, стакато", "Brass/Trumpet/stac"),
               ("tbn", "Тромбон", "Brass/Tenor Trombone/sus"), ("tuba", "Туба", "Brass/Tuba/sus")]},
    {"id": "vsco_perc", "name": "Оркестрові мелодичні ударні", "category": "Хроматичні ударні", "tag": "mallets",
     "desc": "Дзвіночки, маримба й ксилофон для оркестру, кіно й поп-аранжувань.",
     "insts": [("glock", "Дзвіночки", "Percussion/Glock"), ("marimba", "Маримба", "Percussion/Marimba"), ("xylo", "Ксилофон", "Percussion/Xylo")]},
]


def vsco_zones(names, folder, layers=(45, 90, 122), max_roots=24):
    items = []
    for n in names:
        if not n.startswith(folder + "/") or not n.lower().endswith(".wav") or "/" in n[len(folder) + 1:]:
            continue
        base = Path(n).stem
        m = re.search(r"(?:^|[_\- ])([A-Ga-g][#b]?-?\d)(?=$|[_\- ])", base)
        if not m:
            continue
        p = note(m.group(1))
        if p is None or p < 12 or p > 115:
            continue
        rr = re.search(r"(?:RR|rr|_)(\d+)$", base)
        if rr and int(rr.group(1)) > 1 and re.search(r"(RR|rr)\d+$|_v\d+_\d+$", base):
            continue
        vm = re.search(r"_v(\d+)", base)
        dm = re.search(r"(?:^|_)(ppp|pp|p|mp|mf|f|ff|fff)(?:_|$)", base)
        vel = None
        if vm:
            vel = int(vm.group(1))
        items.append({"path": n, "p": p, "vraw": vel, "dyn": VEL.get(dm.group(1)) if dm else None})
    if not items:
        return []
    vmax = max([i["vraw"] for i in items if i["vraw"]] or [1])
    for i in items:
        i["v"] = i["dyn"] if i["dyn"] else (int(20 + 105 * (i["vraw"] - 1) / max(1, vmax - 1)) if i["vraw"] and vmax > 1 else 100)
    by = {}
    for i in items:
        by.setdefault(i["p"], {}).setdefault(i["v"], i)
    roots = sorted(by)
    if len(roots) > max_roots:
        step = len(roots) / max_roots
        roots = sorted({roots[min(len(roots) - 1, int(round(k * step)))] for k in range(max_roots)})
    zones = []
    for k, rt in enumerate(roots):
        lo = 0 if k == 0 else (roots[k - 1] + rt) // 2 + 1
        hi = 127 if k == len(roots) - 1 else (rt + roots[k + 1]) // 2
        vs = sorted(by[rt])
        pick = []
        for v in layers:
            b = min(vs, key=lambda x: abs(x - v))
            if b not in pick:
                pick.append(b)
        pick.sort()
        for j, v in enumerate(pick):
            vlo = 0 if j == 0 else (pick[j - 1] + v) // 2 + 1
            vhi = 127 if j == len(pick) - 1 else (v + pick[j + 1]) // 2
            zones.append({"path": by[rt][v]["path"], "lo": max(0, lo if k else rt - 12), "hi": min(127, hi if k < len(roots) - 1 else rt + 12),
                          "root": rt, "vlo": vlo, "vhi": vhi, "tune": 0, "gain": 1, "pan": 0, "loop": None,
                          "a": 0.004, "h": 0, "d": 0, "s": 1, "r": 0.35, "off": 0, "end": 0, "max": 8})
    return zones


def head_size(url):
    try:
        req = urllib.request.Request(url, method="HEAD", headers={"User-Agent": "InkBeat"})
        with urllib.request.urlopen(req, timeout=30) as r:
            return int(r.headers.get("Content-Length") or 0)
    except Exception:
        return 0


def main():
    packs = []
    for P in SFZ_PACKS:
        repo = Repo(R + P["dir"])
        insts = []
        for iid, nm, sfz, opt in P["insts"]:
            drums = opt.get("drums", False)
            zs = zones_of(repo, sfz, drums=drums, max_roots=opt.get("max_roots", 30), layers=opt.get("layers", (45, 90, 122)), max_len=opt.get("max_len", 10))
            if not zs:
                print("EMPTY", P["id"], iid)
                continue
            sz = size_of(repo, zs, P["repo"])
            insts.append({"id": iid, "name": nm, "drums": drums, "size": sz, "zones": zs})
            print(P["id"], iid, len(zs), sz // 1048576, "MB", flush=True)
        packs.append({"id": P["id"], "name": P["name"], "category": P["category"], "tag": P["tag"], "author": P["author"], "license": P["license"],
                      "url": f"https://github.com/{P['repo']}", "desc": P["desc"], "source": {"repo": P["repo"], "sha": repo.sha},
                      "size": sum(i["size"] for i in insts), "instruments": insts})
    import subprocess

    vd = R + VSCO["dir"]
    names = subprocess.run(["git", "-C", vd, "ls-tree", "-r", "--name-only", "HEAD"], capture_output=True, text=True).stdout.splitlines()
    sha = subprocess.run(["git", "-C", vd, "rev-parse", "HEAD"], capture_output=True, text=True).stdout.strip()
    for P in VSCO_PACKS:
        insts = []
        for iid, nm, folder in P["insts"]:
            zs = vsco_zones(names, folder)
            if not zs:
                print("EMPTY", P["id"], iid)
                continue
            paths = sorted({z["path"] for z in zs})
            with ThreadPoolExecutor(12) as ex:
                sizes = list(ex.map(lambda p: head_size(f"https://raw.githubusercontent.com/{VSCO['repo']}/{sha}/" + urllib.request.quote(p)), paths))
            insts.append({"id": iid, "name": nm, "drums": False, "size": sum(sizes), "zones": zs})
            print(P["id"], iid, len(zs), sum(sizes) // 1048576, "MB", flush=True)
        packs.append({"id": P["id"], "name": P["name"], "category": P["category"], "tag": P["tag"], "author": VSCO["author"], "license": VSCO["license"],
                      "url": f"https://github.com/{VSCO['repo']}", "desc": P["desc"], "source": {"repo": VSCO["repo"], "sha": sha},
                      "size": sum(i["size"] for i in insts), "instruments": insts})
    OUT.write_text(json.dumps({"version": 1, "packs": packs}, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("total", sum(p["size"] for p in packs) // 1048576, "MB", OUT.stat().st_size // 1024, "KB manifest")


if __name__ == "__main__":
    main()
