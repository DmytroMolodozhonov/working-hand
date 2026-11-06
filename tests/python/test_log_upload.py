"""log_upload.py: the author's journals onto the branch `logs` — a real git, a bare repository standing for GitHub."""
import os
import subprocess
import sys
import tempfile
import time
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
import log_upload  # noqa: E402


def git(cwd, *a):
    return subprocess.run(["git", *a], cwd=cwd, capture_output=True, text=True, check=True).stdout.strip()


def name_at(t):
    return "game-" + time.strftime("%Y%m%d-%H%M%S", time.localtime(t)) + ".log"


class LogUploadTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        base = self.tmp.name
        self.remote = os.path.join(base, "remote.git")
        self.game = os.path.join(base, "game")
        git(base, "init", "-q", "--bare", self.remote)
        git(base, "init", "-q", self.game)
        git(self.game, "remote", "add", "origin", self.remote)
        with open(os.path.join(self.game, "server.py"), "w") as f:
            f.write("# the game\n")
        git(self.game, "-c", "user.name=a", "-c", "user.email=a@b", "add", "server.py")
        git(self.game, "-c", "user.name=a", "-c", "user.email=a@b", "commit", "-qm", "game")
        self.games = os.path.join(self.game, "logs", "games")
        os.makedirs(self.games)
        os.environ.pop("ZNS_LOG_UPLOAD", None)

    def tearDown(self):
        self.tmp.cleanup()

    def put(self, t, text):
        p = os.path.join(self.games, name_at(t))
        with open(p, "w", encoding="utf-8") as f:
            f.write(text)
        return os.path.basename(p)

    def remote_files(self):
        out = git(self.remote, "ls-tree", "-r", "--name-only", "logs")
        return sorted(x for x in out.split("\n") if x)

    def test_goes_up_merges_and_old_ones_go(self):
        now = time.time()
        a = self.put(now - 3600, "=== игра началась\nпервая\n")
        self.assertTrue(log_upload.enabled(self.game))
        self.assertTrue(log_upload.upload(self.game, self.games, now))
        self.assertEqual(self.remote_files(), [f"games/{a}"])
        self.assertEqual(git(self.remote, "show", f"logs:games/{a}"), "=== игра началась\nпервая")
        # the player's folder untouched: its branch, its files, nothing staged
        self.assertEqual(git(self.game, "status", "--porcelain", "--untracked-files=no"), "")
        self.assertNotIn("logs", git(self.game, "branch"))
        # nothing new: no new commit
        head = git(self.remote, "rev-parse", "logs")
        self.assertTrue(log_upload.upload(self.game, self.games, now))
        self.assertEqual(git(self.remote, "rev-parse", "logs"), head)
        # the journal grew + a second game: both, one commit more
        with open(os.path.join(self.games, a), "a", encoding="utf-8") as f:
            f.write("ещё\n")
        b = self.put(now - 60, "вторая\n")
        self.assertTrue(log_upload.upload(self.game, self.games, now))
        self.assertEqual(self.remote_files(), sorted([f"games/{a}", f"games/{b}"]))
        self.assertIn("ещё", git(self.remote, "show", f"logs:games/{a}"))
        self.assertEqual(git(self.remote, "rev-list", "--count", "logs"), "2")
        # three days on: the old ones go from the branch (the local folder deletes its own — server.append_game_log)
        os.remove(os.path.join(self.games, a))
        c = self.put(now + 3 * 24 * 3600, "третья\n")
        self.assertTrue(log_upload.upload(self.game, self.games, now + 3 * 24 * 3600 + 10))
        self.assertEqual(self.remote_files(), [f"games/{c}"])

    def test_off_and_no_rights_never_raise(self):
        self.put(time.time(), "x\n")
        os.environ["ZNS_LOG_UPLOAD"] = "0"
        self.assertFalse(log_upload.enabled(self.game))
        os.environ.pop("ZNS_LOG_UPLOAD")
        git(self.game, "remote", "set-url", "origin", os.path.join(self.tmp.name, "nowhere.git"))
        self.assertFalse(log_upload.upload(self.game, self.games))  # (no GitHub: quietly no)
        plain = os.path.join(self.tmp.name, "plain")
        os.makedirs(plain)
        self.assertFalse(log_upload.enabled(plain))  # (not a clone: the archive install)

    def test_names(self):
        self.assertIsNotNone(log_upload.stamp("game-20261106-153000.log"))
        self.assertIsNone(log_upload.stamp("zns-all.log"))


if __name__ == "__main__":
    unittest.main()
