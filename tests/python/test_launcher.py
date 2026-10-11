"""Unit tests for the app launcher's logic (launcher/zns_launcher.py) and server.py's logs.
Run: python3 -m unittest discover -s tests/python   (npm test runs them too)."""
import json
import os
import sys
import tempfile
import unittest
import zipfile

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
sys.path.insert(0, os.path.join(ROOT, "launcher"))
import zns_launcher as L  # noqa: E402

SHA = "0123456789abcdef0123456789abcdef01234567"


class Refs(unittest.TestCase):
    def test_branch_commit_from_git_refs(self):
        text = ("001e# service=git-upload-pack\n0000015a" + "f" * 40 + " HEAD\0multi_ack\n"
                "003f" + "e" * 40 + " refs/heads/main\n003f" + SHA + " refs/heads/main-fbxy0j\n0000")
        self.assertEqual(L.parse_refs(text), SHA)

    def test_no_branch(self):
        self.assertEqual(L.parse_refs("003f" + SHA + " refs/heads/other\n"), "")
        self.assertEqual(L.parse_refs(""), "")


class Folder(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def test_empty_or_new_folder_is_used_as_is(self):
        self.assertEqual(L.resolve_install_dir(self.tmp), self.tmp)
        new = os.path.join(self.tmp, "Новая")
        self.assertEqual(L.resolve_install_dir(new), new)

    def test_folder_with_other_things_gets_a_game_folder_inside(self):
        open(os.path.join(self.tmp, "photo.jpg"), "w").close()
        self.assertEqual(L.resolve_install_dir(self.tmp), os.path.join(self.tmp, "Volshebstvo"))

    def test_folder_with_the_game_is_kept(self):
        open(os.path.join(self.tmp, "server.py"), "w").close()
        open(os.path.join(self.tmp, "index.html"), "w").close()
        self.assertEqual(L.resolve_install_dir('  "' + self.tmp + '" '), self.tmp)

    def test_writable(self):
        self.assertEqual(L.check_writable(os.path.join(self.tmp, "a", "b")), "")
        self.assertTrue(os.path.isdir(os.path.join(self.tmp, "a", "b")))
        self.assertIn("нельзя", L.check_writable("/proc/zns-no-such"))


class Files(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()

    def write(self, rel, text):
        p = os.path.join(self.tmp, rel)
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w", encoding="utf-8") as fh:
            fh.write(text)
        return p

    def test_update_keeps_own_maps(self):
        self.write("game/maps/моя карта.json", "{}")
        self.write("game/server.py", "old")
        self.write("new/server.py", "new")
        self.write("new/maps/built-in.json", "{}")
        L.copy_over(os.path.join(self.tmp, "new"), os.path.join(self.tmp, "game"))
        with open(os.path.join(self.tmp, "game/server.py")) as fh:
            self.assertEqual(fh.read(), "new")
        self.assertTrue(os.path.isfile(os.path.join(self.tmp, "game/maps/моя карта.json")))
        self.assertTrue(os.path.isfile(os.path.join(self.tmp, "game/maps/built-in.json")))

    def test_self_update_copies_launcher_and_logo_once(self):
        game, home = os.path.join(self.tmp, "game"), os.path.join(self.tmp, "home")
        for f in L.LAUNCHER_FILES:
            self.write("game/launcher/" + f, f)
        self.write("game/assets/logo/logo.ico", "ICO")
        self.assertTrue(L.self_update(game, home))
        self.assertFalse(L.self_update(game, home), "nothing changed the second time")
        self.assertTrue(os.path.isfile(os.path.join(home, "launcher", "logo.ico")))
        self.write("game/launcher/zns_launcher.py", "v2")
        self.assertTrue(L.self_update(game, home))
        with open(os.path.join(home, "launcher", "zns_launcher.py")) as fh:
            self.assertEqual(fh.read(), "v2")

    def test_config_roundtrip_and_broken_config(self):
        L.save_config({"install_dir": "D:\\Игры"}, self.tmp)
        self.assertEqual(L.load_config(self.tmp), {"install_dir": "D:\\Игры"})
        with open(L.config_path(self.tmp), "w") as fh:
            fh.write("{broken")
        self.assertEqual(L.load_config(self.tmp), {})

    def test_shortcut_runs_pythonw_with_launcher(self):
        home = self.tmp
        self.write("launcher/logo.ico", "ICO")
        spec = L.shortcut_spec(home)
        self.assertEqual(spec["args"], '"' + os.path.join(home, "launcher", "launcher.pyw") + '"')
        self.assertEqual(spec["icon"], os.path.join(home, "launcher", "logo.ico"))
        self.assertEqual(spec["description"], "Волшебство только начинается")

    def test_window_is_an_app_window_on_the_strong_gpu(self):
        a = L.window_args("msedge.exe", "http://localhost:8000/")
        self.assertIn("--app=http://localhost:8000/", a)
        self.assertIn("--force_high_performance_gpu", a)

    def test_old_install_is_kept_as_default(self):
        old = os.environ.get("ZNS_DEFAULT_INSTALL")
        os.environ["ZNS_DEFAULT_INSTALL"] = self.tmp
        try:
            self.assertEqual(L.default_install_dir(), self.tmp)
        finally:
            if old is None:
                del os.environ["ZNS_DEFAULT_INSTALL"]
            else:
                os.environ["ZNS_DEFAULT_INSTALL"] = old


class Steps(unittest.TestCase):
    def test_status_steps(self):
        st = L.Status()
        st.step("update", "run", "", title="x")
        s = st.snapshot()
        self.assertEqual(s["step"], "update")
        self.assertEqual([x["state"] for x in s["steps"]], ["wait", "run", "wait", "wait", "wait"])
        st.step("update", "ok", "свежая")
        self.assertEqual(st.snapshot()["steps"][1]["note"], "свежая")
        json.dumps(st.snapshot())


class ServerLogs(unittest.TestCase):
    def test_logs_for_the_settings_tab(self):
        tmp = tempfile.mkdtemp()
        a = os.path.join(tmp, "launcher.log")
        with open(a, "w", encoding="utf-8") as fh:
            fh.write("x" * 300_000 + "КОНЕЦ")
        old = os.environ.get("ZNS_LOG_FILES")
        os.environ["ZNS_LOG_FILES"] = os.pathsep.join([a, os.path.join(tmp, "missing.log")])
        cwd = os.getcwd()
        try:
            sys.path.insert(0, ROOT)
            import server
            logs = server.read_logs()
        finally:
            os.chdir(cwd)
            if old is None:
                os.environ.pop("ZNS_LOG_FILES", None)
            else:
                os.environ["ZNS_LOG_FILES"] = old
        self.assertEqual(logs[0]["title"], "Запуск и игра")
        self.assertTrue(logs[0]["text"].endswith("КОНЕЦ"), "the newest lines are shown")
        self.assertLessEqual(len(logs[0]["text"]), 200_005)
        self.assertNotIn("missing.log", [x["name"] for x in logs])


class AdoptFromOldBat(unittest.TestCase):
    def test_any_old_bat_install_gets_the_new_icon(self):
        """«Обновить и запустить игру.bat» keeps the game in its own folder (no
        %LOCALAPPDATA%\\ZombieNeSpyat\\start.bat): the new icon must still be made."""
        sys.path.insert(0, ROOT)
        import server
        calls = []
        old_adopt, old_name = L.adopt_existing_install, server.os.name
        old_env, old_lad = os.environ.pop("ZNS_LAUNCHER", None), os.environ.get("LOCALAPPDATA")
        os.environ["LOCALAPPDATA"] = tempfile.mkdtemp()  # (nothing of the old installer there)
        L.adopt_existing_install = lambda game, home=None: calls.append(game)
        server.os.name = "nt"
        try:
            server.adopt_app_launcher()
        finally:
            server.os.name = old_name
            L.adopt_existing_install = old_adopt
            if old_env is not None:
                os.environ["ZNS_LAUNCHER"] = old_env
            if old_lad is None:
                os.environ.pop("LOCALAPPDATA", None)
            else:
                os.environ["LOCALAPPDATA"] = old_lad
        self.assertEqual(calls, [server.ROOT])


if __name__ == "__main__":
    unittest.main()


class SecondStart(unittest.TestCase):
    """The icon clicked again right after closing the game: the old launcher (still waiting
    its last seconds) steps aside, so the new start checks for a new version."""

    def serve(self, pages):
        import threading
        la = L.Launcher(home=tempfile.mkdtemp())
        la.pages = pages
        la.httpd = L.Server(("127.0.0.1", 0), L.make_handler(la))
        port = la.httpd.server_address[1]
        t = threading.Thread(target=la.httpd.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True)
        t.start()
        return la, port, t

    def test_no_window_open_steps_aside(self):
        la, port, t = self.serve(0)
        self.assertTrue(L.handover(port))
        t.join(5)
        self.assertFalse(t.is_alive(), "the old launcher stopped")
        la.httpd.server_close()

    def test_a_window_open_keeps_running(self):
        la, port, t = self.serve(1)
        self.assertFalse(L.handover(port))
        self.assertTrue(t.is_alive())
        la.httpd.shutdown()
        la.httpd.server_close()

    def test_the_exact_version_is_downloaded(self):
        self.assertTrue(L.zip_url(SHA).endswith(f"/archive/{SHA}.zip"))
        self.assertTrue(L.zip_url().endswith("/archive/refs/heads/main-fbxy0j.zip"))
