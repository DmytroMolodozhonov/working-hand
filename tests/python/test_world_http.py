"""The actual local API must acknowledge durable writes and allow grown worlds."""
import importlib.util
import json
import pathlib
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request, urlopen

spec = importlib.util.spec_from_file_location("world_http_server", pathlib.Path(__file__).resolve().parents[2] / "server.py")
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


class WorldHTTP(unittest.TestCase):
    def test_durable_api_recovery_size_and_rejection(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(server, "_worlds_dir", return_value=directory):
            http = server.ThreadingServer(("127.0.0.1", 0), server.GameRequestHandler)
            thread = threading.Thread(target=http.serve_forever, daemon=True)
            thread.start()
            base = f"http://127.0.0.1:{http.server_port}/api/worlds"
            try:
                world = {"id": "world", "seed": 7, "updated": 1, "players": {"id:host": {"mana": {"cells": 250}}}, "edits": "x" * (5 * 1024 * 1024)}
                req = Request(base, data=json.dumps(world).encode(), headers={"Content-Type": "application/json"})
                with urlopen(req) as response:
                    self.assertEqual(json.load(response), {"status": "ok"})
                pathlib.Path(directory, "world.json").write_text("broken")
                with urlopen(base + "?id=world") as response:
                    self.assertEqual(json.load(response), world)
                with urlopen(base) as response:
                    self.assertEqual(len(json.load(response)), 1)
                invalid = Request(base, data=b'{"id":"world"}', headers={"Content-Type": "application/json"})
                with self.assertRaises(HTTPError) as rejected:
                    urlopen(invalid)
                self.assertEqual(rejected.exception.code, 400)
                self.assertEqual(json.load(rejected.exception), {"status": "error"})
            finally:
                http.shutdown()
                http.server_close()
                thread.join(timeout=3)
