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
_WAND_CHECKED = set()  # worlds already searched for a lost wand in this run: the backups are read ONCE (the author 20.11: starting a world took seconds — every load read every backup)
RECENT_SLOTS = 12  # first checkpoint in each five-minute interval (~one hour)
DAILY_SLOTS = 7   # first checkpoint each day (~one week)
PREVIOUS_EVERY = 60  # s between two writes of the hot spare «previous.json»
_LAST = {}  # wid -> what this run wrote last: {stamp, seed, text, prev_at} (see put)


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
        """The hero's own wand is gone from the save (it was deleted by mistake: a won arena wand cleared at the next duel) and a plain stand-in was given: the wand comes back
        from the newest backup of the SAME player that has it (the author 20.11: «я хочу, чтобы она просто появилась в игре»). Only for a player who holds a stand-in (`spare`);
        which wand: his `ownWand` if a backup has it, else the strongest one he carried (slots / hands) that is missing now."""
        if not isinstance(w, dict) or not isinstance(w.get("players"), dict) or wid in _WAND_CHECKED:
            return
        has_stand_in = any(isinstance(pl, dict) and isinstance(pl.get("slots"), list) and (any(x.get("spare") for x in _hand_wands(pl)) or any(isinstance(x, dict) and x.get("kind") == "wand" and x.get("spare") for x in pl["slots"])) for pl in w["players"].values())
        if not has_stand_in:
            return  # (nothing to look for: a cheap check on every load)
        _WAND_CHECKED.add(wid)
        changed = False
        files = None
        for key, pl in w["players"].items():
            if not isinstance(pl, dict) or not isinstance(pl.get("slots"), list):
                continue
            slots = pl["slots"]
            hand_spare = any(x.get("spare") for x in _hand_wands(pl))
            has_spare = hand_spare or any(isinstance(x, dict) and x.get("kind") == "wand" and x.get("spare") for x in slots)
            if not has_spare:
                continue
            present = {x.get("uid") for x in _wands(w)}
            if files is None:
                files = sorted(self._history(wid).glob("*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
            own = pl.get("ownWand") if isinstance(pl.get("ownWand"), str) else None
            found = None
            for f in files:
                b = _read(f, wid)
                bp = b.get("players", {}).get(key) if b and isinstance(b.get("players"), dict) else None
                if not isinstance(bp, dict):
                    continue
                cand = [x for x in _wands(bp) if not x.get("spare") and x.get("uid") not in present]
                if not cand:
                    continue
                pick = next((x for x in cand if x.get("uid") == own), None) or max(cand, key=lambda x: x.get("power") or 0)
                found = dict(pick)
                break
            if not found:
                continue
            found.pop("spare", None)
            found.pop("arenaWand", None)
            i = next((k for k, x in enumerate(slots) if isinstance(x, dict) and x.get("kind") == "wand" and x.get("spare")), None)
            if i is None:
                i = next((k for k, x in enumerate(slots) if not x), None)
            if i is None:
                slots.append(found)
                pl["extraSlots"] = max(0, len(slots) - 5)
            else:
                slots[i] = found
            gear = pl.get("gear")
            if isinstance(gear, dict) and isinstance(gear.get("held"), list):
                gear["held"] = [None if isinstance(h, dict) and h.get("kind") == "wand" and h.get("spare") else h for h in gear["held"]]
            pl["ownWand"] = found["uid"]
            changed = True
            print(f"  [Миры] {wid}: потерянная палочка {found['uid']} (сила {found.get('power')}) вернулась из резервной копии", flush=True)
        if changed:
            # (the page keeps its own copy in the browser and takes the disk one only if it is NEWER: the returned wand must win over it — the author 20.11, the first version did not)
            w["updated"] = _stamp(w) + 1
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
            # (the author 21.11: «мини-фризы, голос доходит через 2 секунды» — every autosave read the whole previous world back, parsed it and wrote it out
            #  again: seconds of the server's Python holding the lock that also serves the voice and the camera. What this process wrote last is remembered
            #  — its stamp, seed and text — and used as «previous»; the disk is read only for a world not written yet in this run.)
            last = _LAST.get(wid)
            if last is not None and not (self.root / (wid + ".json")).exists():
                last = None
            if last is not None:
                p_stamp, p_seed, old_text = last["stamp"], last["seed"], last["text"]
            else:
                previous = self._get(wid)
                p_stamp, p_seed, old_text = (_stamp(previous), previous.get("seed"), _text(previous)) if previous else (None, None, text)
            if p_stamp is not None and p_stamp > _stamp(w):
                return True
            if p_stamp is not None and p_seed != w.get("seed"):
                return False  # Same ID cannot silently become a different world.
            history = self._history(wid)
            now = time.time()
            # Hot spare: the state before this one, at most every PREVIOUS_EVERY s (it was every save: a multi-megabyte write and sync each time).
            if last is None or now - last.get("prev_at", 0) >= PREVIOUS_EVERY:
                _atomic(history / "previous.json", old_text)
                prev_at = now
            else:
                prev_at = last.get("prev_at", 0)
            for label, period, count in (("recent", 300, RECENT_SLOTS), ("daily", 86400, DAILY_SLOTS)):
                bucket = int(now // period)
                target = history / f"{label}-{bucket % count}.json"
                if not target.exists() or target.stat().st_mtime < bucket * period:
                    _atomic(target, old_text)
            _atomic(self.root / (wid + ".json"), text)
            _LAST[wid] = {"stamp": _stamp(w), "seed": w.get("seed"), "text": text, "prev_at": prev_at}
        return True

    def delete(self, wid):
        if not safe_id(wid):
            return
        with _LOCK:
            _LAST.pop(wid, None)
            w = self._get(wid)
            # A recoverable tombstone hides the world, including its backup copies.
            _atomic(self.root / "deleted" / (wid + ".json"), _text(w or {"id": wid}))
            (self.root / (wid + ".json")).unlink(missing_ok=True)
