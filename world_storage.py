"""Durable world files, bounded history and recovery, independent of browser profiles.

Never infer a world from its seed or substitute another player's snapshot. Only
validated copies of the same world ID may repair a missing/corrupt primary file.
"""
import json
import math
import os
from pathlib import Path
import re
import threading
import time

_LOCK = threading.RLock()
RECENT_SLOTS = 12  # first checkpoint in each five-minute interval (~one hour)
DAILY_SLOTS = 7   # first checkpoint each day (~one week)


def safe_id(value):
    return value if isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9_-]{1,64}", value) else None


def _reject_constant(value):
    raise ValueError("Non-finite JSON number: " + value)


def _valid(w, wid):
    seed = w.get("seed") if isinstance(w, dict) else None
    return isinstance(w, dict) and w.get("id") == wid and isinstance(seed, (int, float)) and not isinstance(seed, bool) and math.isfinite(seed)


def _read(path, wid):
    try:
        with open(path, encoding="utf-8") as f:
            w = json.load(f, parse_constant=_reject_constant)
        if _valid(w, wid):
            return w
    except (OSError, ValueError, TypeError):
        pass
    return None


def _stamp(w):
    n = w.get("updated", 0)
    return n if isinstance(n, (int, float)) and math.isfinite(n) else 0


def _atomic(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + ".tmp")
    try:
        with open(temp, "w", encoding="utf-8") as f:
            f.write(text)
            f.flush()
            os.fsync(f.fileno())
        os.replace(temp, path)
    finally:
        try:
            temp.unlink(missing_ok=True)
        except OSError:
            pass


def _text(w):
    return json.dumps(w, ensure_ascii=False, allow_nan=False, separators=(",", ":"))


def _wands(node):
    """Every wand (a dict with kind wand and a uid) anywhere in a world."""
    if isinstance(node, dict):
        if node.get("kind") == "wand" and node.get("uid"):
            yield node
        for v in node.values():
            yield from _wands(v)
    elif isinstance(node, list):
        for v in node:
            yield from _wands(v)


def _players(node):
    """The player snapshots: dicts that have `slots` (the hero's cells) and `extraSlots`."""
    if isinstance(node, dict):
        if isinstance(node.get("slots"), list) and "extraSlots" in node:
            yield node
        for v in node.values():
            yield from _players(v)
    elif isinstance(node, list):
        for v in node:
            yield from _players(v)


def _hand_wands(pl):
    g = pl.get("gear")
    held = g.get("held") if isinstance(g, dict) else None
    return [h for h in (held or []) if isinstance(h, dict) and h.get("kind") == "wand"]


class WorldStorage:
    def __init__(self, directory):
        self.root = Path(directory)

    def _deleted(self, wid):
        return (self.root / "deleted" / (wid + ".json")).exists()

    def _history(self, wid):
        return self.root / "backups" / wid

    def _get(self, wid):
        w = self._get_raw(wid)
        if w is not None:
            try:
                self._rescue_wand(w, wid)
            except Exception as e:  # a rescue never breaks a load
                print(f"  [Миры] {wid}: поиск потерянной палочки не удался: {e}", flush=True)
        return w

    def _rescue_wand(self, w, wid):
        """The hero's own wand is gone from the save (it was deleted by mistake) and a plain stand-in was given: the wand comes back from the newest backup that has it
        (the author 20.11: «я хочу, чтобы она просто появилась в игре»). Only for a player who holds a stand-in (`spare`) and whose `ownWand` is nowhere in the world."""
        if not isinstance(w, dict):
            return
        present = {x.get("uid") for x in _wands(w)}
        todo = []
        for pl in _players(w):
            own = pl.get("ownWand")
            slots = pl.get("slots")
            if not isinstance(own, str) or not isinstance(slots, list) or own in present:
                continue
            if not any(isinstance(x, dict) and x.get("kind") == "wand" and x.get("spare") for x in slots) and not any(x.get("spare") for x in _hand_wands(pl)):
                continue
            todo.append((pl, own))
        if not todo:
            return
        files = sorted(self._history(wid).glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
        changed = False
        for pl, own in todo:
            found = None
            for f in files:
                b = _read(f, wid)
                if b is None:
                    continue
                for x in _wands(b):
                    if x.get("uid") == own and not x.get("spare"):
                        found = dict(x)
                        break
                if found:
                    break
            if not found:
                continue
            found.pop("spare", None)
            found.pop("arenaWand", None)
            slots = pl["slots"]
            i = next((k for k, x in enumerate(slots) if isinstance(x, dict) and x.get("kind") == "wand" and x.get("spare")), None)
            if i is None:
                i = next((k for k, x in enumerate(slots) if not x), None)
            if i is None:
                slots.append(found)
                pl["extraSlots"] = max(0, len(slots) - 5)
            else:
                slots[i] = found
            # (a stand-in held in a hand goes too: one wand, the own one)
            gear = pl.get("gear")
            if isinstance(gear, dict) and isinstance(gear.get("held"), list):
                gear["held"] = [None if isinstance(h, dict) and h.get("kind") == "wand" and h.get("spare") else h for h in gear["held"]]
            changed = True
            print(f"  [Миры] {wid}: потерянная палочка {own} вернулась из резервной копии", flush=True)
        if changed:
            _atomic(self.root / (wid + ".json"), _text(w))

    def _get_raw(self, wid):
        if self._deleted(wid):
            return None
        primary = self.root / (wid + ".json")
        w = _read(primary, wid)
        if w is not None:
            return w
        # A killed process may leave a fully flushed temporary file before replace.
        paths = [primary.with_name(primary.name + ".tmp")]
        paths.extend(self._history(wid).glob("*.json"))
        candidates = [w for p in paths if (w := _read(p, wid)) is not None]
        if not candidates:
            return None
        w = max(candidates, key=_stamp)
        if primary.exists():
            # Keep the damaged bytes for diagnosis; never overwrite a healthy backup.
            _atomic(self._history(wid) / "damaged.txt", primary.read_text(encoding="utf-8", errors="replace"))
        _atomic(primary, _text(w))
        print(f"  [Миры] {wid}: восстановлен из резервной копии", flush=True)
        return w

    def get(self, wid=None):
        with _LOCK:
            if wid is not None:
                return self._get(wid) if safe_id(wid) else None
            ids = {p.stem for p in self.root.glob("*.json") if safe_id(p.stem)}
            ids.update(p.name for p in (self.root / "backups").glob("*") if p.is_dir() and safe_id(p.name))
            ids.update(p.name[:-9] for p in self.root.glob("*.json.tmp") if safe_id(p.name[:-9]))
            return [w for wid in sorted(ids) if (w := self._get(wid)) is not None]

    def put(self, w):
        if not isinstance(w, dict) or not safe_id(w.get("id")) or not _valid(w, w["id"]):
            return False
        text = _text(w)  # Validate/serialise before touching the last healthy file.
        wid = w["id"]
        with _LOCK:
            if self._deleted(wid):
                return False  # A stale browser copy must not undo an explicit deletion.
            previous = self._get(wid)
            if previous and _stamp(previous) > _stamp(w):
                return True
            if previous and previous.get("seed") != w.get("seed"):
                return False  # Same ID cannot silently become a different world.
            history = self._history(wid)
            now = time.time()
            old_text = _text(previous) if previous else text
            # Hot spare every save; history is bounded, independent of world age.
            _atomic(history / "previous.json", old_text)
            for label, period, count in (("recent", 300, RECENT_SLOTS), ("daily", 86400, DAILY_SLOTS)):
                bucket = int(now // period)
                target = history / f"{label}-{bucket % count}.json"
                if not target.exists() or target.stat().st_mtime < bucket * period:
                    _atomic(target, old_text)
            _atomic(self.root / (wid + ".json"), text)
        return True

    def delete(self, wid):
        if not safe_id(wid):
            return
        with _LOCK:
            w = self._get(wid)
            # A recoverable tombstone hides the world, including its backup copies.
            _atomic(self.root / "deleted" / (wid + ".json"), _text(w or {"id": wid}))
            (self.root / (wid + ".json")).unlink(missing_ok=True)
