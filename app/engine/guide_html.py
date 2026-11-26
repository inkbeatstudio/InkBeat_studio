from __future__ import annotations

import html

CSS = """
:root{--bg:#0c0d11;--p:#15171d;--l:#262a34;--t:#e9ebf1;--m:#8b91a3;--a:#ffb547;--c:#4fd1c5}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--t);font:15px/1.55 "Segoe UI",system-ui,sans-serif}
main{max-width:1000px;margin:0 auto;padding:36px 24px 80px}h1{font-size:30px;margin:0 0 4px}h2{margin:40px 0 14px;font-size:20px}
.sub{color:var(--m)}.ro{display:flex;gap:8px;flex-wrap:wrap;margin:18px 0}.ro div{background:#0a0b0e;border:1px solid var(--l);
border-radius:10px;padding:6px 14px;text-align:center}.ro span{display:block;font-size:10px;letter-spacing:.12em;color:var(--m);text-transform:uppercase}
.ro b{font:600 18px Consolas,monospace;color:var(--a)}ol.steps{padding-left:22px}ol.steps li{margin:8px 0}
code,.k{font:13px Consolas,monospace;background:#1b1e26;border:1px solid var(--l);border-radius:5px;padding:1px 6px}
table{width:100%;border-collapse:collapse;background:var(--p);border:1px solid var(--l);border-radius:12px;overflow:hidden}
th,td{padding:9px 12px;border-top:1px solid var(--l);text-align:left;vertical-align:top;font-size:14px}th{color:var(--m);font-weight:600;border-top:0;font-size:12px;text-transform:uppercase;letter-spacing:.06em}
.dot{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:8px;vertical-align:middle}
.card{background:var(--p);border:1px solid var(--l);border-radius:14px;padding:18px 20px;margin:14px 0;border-left:4px solid var(--a)}
.card h3{margin:0 0 2px;font-size:18px}.chip{display:inline-block;font-size:12px;padding:2px 9px;border-radius:999px;border:1px solid var(--l);color:var(--m);margin:6px 6px 0 0}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:14px}.lbl{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--m);margin-bottom:6px}
.inst b{color:var(--a)}ul{margin:4px 0;padding-left:18px}li{margin:2px 0}.fx{margin-bottom:10px}.fx b{color:var(--c)}
.smp{display:flex;align-items:center;gap:10px;margin:6px 0;font-size:13px}.smp audio{height:30px;width:220px}
.note{color:var(--m);font-size:13px}@media(max-width:760px){.grid{grid-template-columns:1fr}}
"""


def e(x) -> str:
    return html.escape(str(x))


def render(p: dict, b: dict, kit: dict, enabled: list, files: list) -> str:
    tm = b["timing"]
    midi_by_name = {t["name"]: f for t, f in zip(enabled, files)}
    kit_by_id = {t["id"]: t for t in kit["tracks"]}
    rows, cards = [], []
    for t in b["tracks"]:
        if t.get("virtual"):
            k = {"insert": kit["chords"]["insert"], "rec": kit["chords"]["rec"], "samples": [], "color": t["color"]}
        else:
            k = kit_by_id.get(t["id"])
            if not k:
                continue
        rec = k["rec"]
        inst = rec.get("instrument") or {}
        midi = midi_by_name.get(t["name"])
        rows.append(f"<tr><td><b>{k['insert']}</b></td><td><span class=dot style='background:{t['color']}'></span>{e(t['name'])}</td>"
                    f"<td>{e(inst.get('plugin', '—'))}<div class=note>{e(inst.get('preset', ''))}</div></td>"
                    f"<td>{('<code>MIDI/' + e(midi.split('/')[-1]) + '</code>') if midi else '—'}</td></tr>")
        chain = "".join(
            f"<div class=fx><b>{e(c['plugin'])}</b>{' <span class=chip>send → ' + e(c['send']) + '</span>' if c.get('send') else ''}"
            f"<ul>{''.join('<li>' + e(s) + '</li>' for s in c['settings'])}</ul></div>" for c in rec.get("chain", []))
        smp = "".join(
            f"<div class=smp><audio controls preload=none src='Samples/{e(sm['file'])}'></audio><span>{e(sm['name'])}"
            + (f" · root <b>{e(sm['root_name'])}</b>" if sm.get("root_name") else "")
            + (f" · пад {sm['fpc_pad']}" if sm.get("fpc_pad") else "") + "</span></div>" for sm in k.get("samples", []))
        chars = "".join(f"<span class=chip>{e(c)}</span>" for c in rec.get("character", []))
        cards.append(f"""<div class=card style="border-left-color:{t['color']}">
<h3>{k['insert']}. {e(t['name'])}</h3>{chars}
<div class=grid><div><div class=lbl>Рекомендований інструмент</div><div class=inst><b>{e(inst.get('plugin', '—'))}</b> — {e(inst.get('preset', ''))}
<div class=note>Альтернатива: {e(inst.get('alt', '—'))}</div><p class=note>{e(inst.get('how', ''))}</p></div>
{('<div class=lbl>MIDI</div><code>MIDI/' + e(midi.split('/')[-1]) + '</code>') if midi else ''}
{('<div class=lbl style="margin-top:14px">Семпли з пісні</div>' + smp) if smp else ''}</div>
<div><div class=lbl>Ланцюжок ефектів на інсерті {k['insert']}</div>{chain}</div></div></div>""")
    bus_rows = "".join(f"<tr><td><b>{bb['insert']}</b></td><td>Шина {e(bb['name'])}</td><td colspan=2>"
                       + "; ".join(e(c['plugin']) + ': ' + e(', '.join(c['settings'])) for c in bb['chain']) + "</td></tr>"
                       for bb in kit["buses"])
    master = "".join(f"<div class=fx><b>{e(c['plugin'])}</b><ul>{''.join('<li>' + e(s) + '</li>' for s in c['settings'])}</ul></div>"
                     for c in kit["master"])
    secs = " → ".join(e(s["name_ua"]) for s in b["sections"])
    return f"""<!DOCTYPE html><html lang="uk"><head><meta charset="utf-8"><title>{e(p['title'])} — звуковий гід</title>
<style>{CSS}</style></head><body><main>
<div class=sub>INKBEAT · звуковий гід</div><h1>{e(p['title'])}</h1>
<div class=ro><div><span>BPM</span><b>{tm['bpm']:.2f}</b></div><div><span>Тональність</span><b>{e(b['key']['name'])}</b></div>
<div><span>Розмір</span><b>{tm['bpb']}/4</b></div><div><span>Зсув старту</span><b>{tm['pad']:.3f} с</b></div></div>
<p class=sub>Структура: {secs}</p>

<h2>Збірка проєкту за 10 хвилин</h2>
<ol class=steps>
<li>У своїй музичній програмі імпортуйте <code>{e(slug_all(p))}</code> як новий проєкт (у більшості програм — меню «Файл → Імпорт» або просто перетягнути файл у вікно). Темп запишеться з файлу.</li>
<li>Кожна доріжка — окремий інструмент. Поставте на неї рекомендований нижче інструмент або схожий за типом зі своєї бібліотеки.</li>
<li>Барабани: завантажте семпли з <code>Samples/Drums</code> у драм-машину чи семплер — розкладка нот General MIDI (36 бочка, 38 малий, 42 хет). Звучатиме як в оригіналі.</li>
<li>Для звуку «як у пісні» на мелодичних доріжках: завантажте one-shot із <code>Samples/One-shots</code> у семплер і вкажіть кореневу ноту з назви файлу — MIDI заграє цим звуком.</li>
<li>Мікшер: розставте доріжки за таблицею, додайте ефекти з карток. Шини Reverb/Delay — через посили (Send).</li>
<li>Оригінальні доріжки з <code>Stems (aligned)</code> і лупи з <code>Samples/Loops</code> ставте на самий початок — вони точно в темпі й у сітці.</li>
</ol>
<p class=note>Назви плагінів нижче — стандартні плагіни FL Studio, наведені як орієнтир. В Ableton, Logic, Cubase, Reaper та інших програмах беріть аналоги того ж типу: синт-бас, електропіаніно, параметричний еквалайзер, компресор, ревербератор. Налаштування — стартові точки, підібрані за аналізом оригіналу: доводьте на слух, порівнюючи з <code>Reference mix (aligned).wav</code>.</p>

<h2>План мікшера</h2>
<table><tr><th>Інсерт</th><th>Доріжка</th><th>Інструмент</th><th>MIDI-файл</th></tr>{''.join(rows)}{bus_rows}
<tr><td><b>Master</b></td><td colspan=3>див. нижче</td></tr></table>

<h2>Доріжки</h2>{''.join(cards)}

<h2>Майстер</h2><div class=card style="border-left-color:#4fd1c5">{master}</div>
<p class=note>Згенеровано InkBeat {e(p.get('version', ''))}. Семпли вирізано з вашої ж пісні — використовуйте відповідно до прав на оригінал.</p>
</main></body></html>"""


def slug_all(p):
    from .project import slugify

    return f"{slugify(p['title'])} - all tracks.mid"
