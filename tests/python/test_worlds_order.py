"""A delayed live autosave cannot replace a newer death checkpoint."""
import importlib.util
import pathlib
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("game_server", pathlib.Path(__file__).resolve().parents[2] / "server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


class WorldSaveOrder(unittest.TestCase):
    def test_delayed_alive_save(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(server, "_worlds_dir", return_value=directory):
            self.assertTrue(server._worlds_put({"id": "world", "updated": 20, "dead": True}))
            self.assertTrue(server._worlds_put({"id": "world", "updated": 10, "dead": False}))
            self.assertTrue(server._worlds_get("world")["dead"])
            self.assertTrue(server._worlds_put({"id": "world", "updated": 30, "dead": False}))
            self.assertFalse(server._worlds_get("world")["dead"])
