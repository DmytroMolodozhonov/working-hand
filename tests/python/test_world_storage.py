"""Real files and injected interruptions: never replace a healthy save with a partial one."""
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from world_storage import WorldStorage, RECENT_SLOTS, DAILY_SLOTS


def world(updated=1, mana=100):
    return {"id": "wtest", "seed": 123, "updated": updated, "players": {"id:host": {"mana": {"cells": mana}}, "id:friend": {"mana": {"cells": 54}}}}


class WorldStorageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.store = WorldStorage(self.root)
        self.primary = self.root / "wtest.json"

    def test_corruption_recovers_same_world_and_both_players(self):
        self.store.put(world(1, 150))
        self.store.put(world(2, 160))
        self.primary.write_text('{"id":')
        recovered = self.store.get("wtest")
        self.assertEqual(recovered, world(1, 150))
        self.assertEqual(json.loads(self.primary.read_text()), recovered)
        self.assertTrue((self.root / "backups/wtest/damaged.txt").exists())

    def test_missing_primary_recovers_in_world_list(self):
        self.store.put(world())
        self.primary.unlink()
        self.assertEqual(self.store.get(), [world()])

    def test_failed_replace_keeps_current_and_recovers_flushed_temp(self):
        self.store.put(world())
        replace = os.replace
        def fail_primary(src, dest):
            if Path(dest) == self.primary:
                raise OSError("disk full")
            return replace(src, dest)
        with patch("world_storage.os.replace", side_effect=fail_primary):
            with self.assertRaises(OSError):
                self.store.put(world(2))
        self.assertEqual(self.store.get("wtest"), world())
        # A real power loss (no finally executed) may leave a newer, complete temp.
        self.primary.unlink()
        self.primary.with_name("wtest.json.tmp").write_text(json.dumps(world(3)))
        self.assertEqual(self.store.get(), [world(3)])

    def test_delayed_save_and_bad_identity_cannot_overwrite(self):
        self.store.put(world(20))
        self.store.put(world(10))
        self.assertEqual(self.store.get("wtest"), world(20))
        self.assertFalse(self.store.put({**world(30), "seed": 999}))
        self.assertFalse(self.store.put({"id": "wtest"}))
        self.assertFalse(self.store.put({**world(), "id": "../wtest"}))
        with self.assertRaises(ValueError):
            self.store.put({**world(), "hp": float("nan")})
        self.assertEqual(self.store.get("wtest"), world(20))

    def test_deleted_world_stays_hidden_from_stale_upload_and_backups(self):
        self.store.put(world())
        self.store.delete("wtest")
        self.assertEqual(self.store.get(), [])
        self.assertIsNone(self.store.get("wtest"))
        self.assertFalse(self.store.put(world(2)))
        self.assertEqual(json.loads((self.root / "deleted/wtest.json").read_text()), world())

    def test_history_is_bounded_and_retains_daily_progress(self):
        # Simulate 9 days of autosaves, with a real mtime corresponding to each time.
        start = 1800000000
        import world_storage
        atomic = world_storage._atomic
        def timed_atomic(path, text):
            atomic(path, text)
            os.utime(path, (now, now))
        with patch("world_storage._atomic", side_effect=timed_atomic):
            for i in range(9 * 24):
                now = start + i * 3600
                with patch("world_storage.time.time", return_value=now):
                    self.store.put(world(i + 1, i))
        files = list((self.root / "backups/wtest").glob("*.json"))
        self.assertLessEqual(len(files), RECENT_SLOTS + DAILY_SLOTS + 1)
        self.assertEqual(len([p for p in files if p.name.startswith("daily-")]), DAILY_SLOTS)
        self.assertTrue(any(_mana(json.loads(p.read_text())) < 9 * 24 - 24 for p in files))

    def test_wrong_world_backup_is_never_used(self):
        history = self.root / "backups/wtest"
        history.mkdir(parents=True)
        (history / "previous.json").write_text(json.dumps({**world(), "id": "someone-else"}))
        self.assertEqual(self.store.get(), [])


def _mana(w):
    return w["players"]["id:host"]["mana"]["cells"]
