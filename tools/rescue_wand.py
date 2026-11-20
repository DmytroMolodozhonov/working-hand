#!/usr/bin/env python3
"""Достать потерянную палочку из резервной копии мира (игра НЕ должна быть запущена).

  python tools/rescue_wand.py                 — показать палочки во всех копиях всех миров (мощность, любимые заклинания)
  python tools/rescue_wand.py --world ID      — только этот мир
  python tools/rescue_wand.py --give ФАЙЛ UID — положить палочку UID из копии ФАЙЛ в ячейку героя в ТЕКУЩЕМ сохранении мира
                                                (перед этим текущее сохранение копируется рядом: *.before-rescue.json)

Копии мира лежат в <папка игры>/worlds/backups/<id мира>/ (previous, recent-0..11 ≈ последний час, daily-0..6 ≈ неделя)."""
import argparse, json, os, shutil, sys, time
from pathlib import Path


def worlds_dir():
    home = os.environ.get("ZNS_LAUNCHER_HOME") or (os.path.join(os.environ.get("LOCALAPPDATA") or os.path.expanduser("~"), "Volshebstvo") if sys.platform == "win32" else os.path.join(os.path.expanduser("~"), ".volshebstvo"))
    return Path(home) / "worlds"


def load(p):
    try:
        return json.loads(Path(p).read_text(encoding="utf-8"))
    except Exception:
        return None


def wands(node, path=()):
    """Все палочки в сохранении: (путь, словарь). Ищет и в ячейках, и в руках."""
    if isinstance(node, dict):
        if node.get("kind") == "wand" and node.get("uid"):
            yield path, node
        for k, v in node.items():
            yield from wands(v, path + (k,))
    elif isinstance(node, list):
        for i, v in enumerate(node):
            yield from wands(v, path + (i,))


def describe(w):
    bits = [f"id {w.get('uid')}"]
    if w.get("power") is not None: bits.append(f"сила {w['power']}%")
    if w.get("fav"): bits.append(f"любимое: {w['fav']}")
    if w.get("dir"): bits.append(f"направление: {w['dir']}")
    if w.get("spare"): bits.append("простая (запасная)")
    if w.get("arenaWand"): bits.append("трофей арены")
    return ", ".join(bits)


def files_of(root, wid):
    out = [root / f"{wid}.json"]
    h = root / "backups" / wid
    if h.is_dir():
        out += sorted(h.glob("*.json"))
    return [p for p in out if p.exists()]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--world"); ap.add_argument("--dir"); ap.add_argument("--give", nargs=2, metavar=("ФАЙЛ", "UID"))
    a = ap.parse_args()
    root = Path(a.dir) if a.dir else worlds_dir()
    if not root.is_dir():
        sys.exit(f"Нет папки {root} — укажите --dir")
    ids = [a.world] if a.world else sorted({p.stem for p in root.glob("*.json") if not p.name.endswith(".tmp")} | {p.name for p in (root / "backups").glob("*") if p.is_dir()})
    if a.give:
        src, uid = Path(a.give[0]), a.give[1]
        wid = a.world or (src.parent.name if src.parent.name != "worlds" else src.stem)
        old = load(src)
        if old is None: sys.exit("Не читается копия")
        found = [w for _, w in wands(old) if w.get("uid") == uid]
        if not found: sys.exit("В этой копии нет палочки с таким id")
        cur_path = root / f"{wid}.json"
        cur = load(cur_path)
        if cur is None: sys.exit("Не читается текущее сохранение мира " + wid)
        shutil.copy2(cur_path, cur_path.with_suffix(".before-rescue.json"))
        wand = dict(found[0]); wand.pop("spare", None); wand.pop("arenaWand", None)
        done = False
        for path, node in list(wands(cur)):
            if node.get("uid") == uid: sys.exit("Эта палочка уже есть в текущем сохранении")
        # ячейки героя: ищем список slots рядом с players
        def slot_lists(n):
            if isinstance(n, dict):
                if isinstance(n.get("slots"), list) and "extraSlots" in n: yield n
                for v in n.values(): yield from slot_lists(v)
            elif isinstance(n, list):
                for v in n: yield from slot_lists(v)
        for pl in slot_lists(cur):
            s = pl["slots"]
            i = next((k for k, x in enumerate(s) if not x), None)
            if i is None: s.append(wand); pl["extraSlots"] = len(s) - 5
            else: s[i] = wand
            pl["ownWand"] = uid
            done = True; break
        if not done: sys.exit("Не нашёл ячейки героя в сохранении")
        cur["updatedAt"] = int(time.time() * 1000) if "updatedAt" in cur else cur.get("updatedAt")
        cur_path.write_text(json.dumps(cur, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"Готово: палочка {describe(wand)} лежит в ячейке героя (мир {wid}). Копия прежнего сохранения: {cur_path.with_suffix('.before-rescue.json')}")
        return
    for wid in ids:
        print(f"\n== мир {wid}")
        for p in files_of(root, wid):
            w = load(p)
            if w is None: continue
            ws = {x["uid"]: x for _, x in wands(w)}
            t = time.strftime("%d.%m %H:%M", time.localtime(p.stat().st_mtime))
            print(f"  {p.name:18} ({t}): " + ("; ".join(describe(x) for x in ws.values()) if ws else "палочек нет"))


if __name__ == "__main__":
    main()
