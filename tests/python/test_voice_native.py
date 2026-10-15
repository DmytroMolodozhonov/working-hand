"""voice_native.py: the sound's timeline (no devices, no networks needed).

The microphone's packets come late now and then, then several at once — that must never put holes
of silence into the voice; the speakers' copy («loopback») stops while nothing plays — that pause
must be silence on the line, so that what plays later sits where it really was (the echo canceller
needs the speakers' sound at the right moment to take it out of the microphone).
"""

import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

try:
    import numpy as np
except Exception:  # noqa: BLE001
    np = None

import voice_native as vn  # noqa: E402

SR = vn.SR


@unittest.skipIf(np is None, "numpy is not installed")
class StreamTimeline(unittest.TestCase):
    def packets(self, n, step=160, start=100.0, jitter=None, stall_at=None, stall=0.08):
        """(samples, arrival time) of n packets of `step` samples: on time, late, or after a stall."""
        out = []
        for i in range(n):
            due = start + (i + 1) * step / SR
            late = 0.0
            if jitter is not None:
                late = jitter[i % len(jitter)]
            if stall_at is not None and stall_at <= i < stall_at + int(stall * SR / step):
                late = max(late, start + (stall_at + int(stall * SR / step)) * step / SR - due)
            x = (np.ones(step) * 1000 * (1 + i % 3)).astype(np.int16)
            out.append((x, due + late))
        return out

    def test_microphone_late_packets_and_a_stall_add_no_silence(self):
        s = vn.Stream(SR, "mic", continuous=True)
        for x, t in self.packets(300, jitter=[0, 0.004, 0.012, 0.001], stall_at=100):
            s.push(x, t)
        self.assertEqual(s.n, 300 * 160)  # every sample, nothing more
        line = s.read(0, s.n)
        self.assertFalse((line == 0).any(), "a hole of silence in the microphone")
        # the clock is the earliest the packets allow: sample 0 at 100.0
        self.assertAlmostEqual(s.t0, 100.0, places=3)

    def test_speakers_pause_is_silence_and_what_plays_after_sits_in_its_place(self):
        s = vn.Stream(SR, "ref", continuous=False)
        for x, t in self.packets(100, start=50.0):  # 1 s of sound
            s.push(x, t)
        # 2 s with nothing played (no packets at all), then sound again
        for x, t in self.packets(50, start=53.0):
            s.push(x, t)
        self.assertAlmostEqual(s.n / SR, 3.5, delta=0.02)
        i = s.now_index(52.0)  # in the pause
        self.assertTrue((s.read(i, i + 160) == 0).all())
        i = s.now_index(53.2)  # sound again
        self.assertTrue((s.read(i, i + 160) != 0).all())

    def test_small_jitter_of_the_speakers_is_no_pause(self):
        s = vn.Stream(SR, "ref", continuous=False)
        for x, t in self.packets(200, start=10.0, jitter=[0, 0.03, 0.01, 0.045]):
            s.push(x, t)
        self.assertEqual(s.n, 200 * 160)

    def test_rows_packed_for_the_page(self):
        lp = np.log(np.full((3, vn.LETTERS), 1.0 / vn.LETTERS, dtype=np.float32))
        import base64
        b = base64.b64decode(vn._pack(np, lp))
        self.assertEqual(len(b), 3 * vn.LETTERS)
        self.assertTrue(all(v == round(-float(lp[0, 0]) * 10) for v in b))


class Paths(unittest.TestCase):
    def test_models_live_outside_the_game_folder(self):
        os.environ.pop("ZNS_VOICE_MODELS", None)
        d = vn.models_dir()
        self.assertNotIn(os.path.abspath(vn.ROOT), os.path.abspath(d))
        os.environ["ZNS_VOICE_MODELS"] = "/tmp/x"
        self.assertEqual(vn.models_dir(), "/tmp/x")
        os.environ.pop("ZNS_VOICE_MODELS", None)


class Integrity(unittest.TestCase):
    """A model file is used only if it is the published one (SHA-256); checked once, then remembered."""

    def setUp(self):
        import tempfile
        self.dir = tempfile.mkdtemp()
        os.environ["ZNS_VOICE_MODELS"] = self.dir
        self.saved = dict(vn.FILES)
        self.good = b"tokens of the network\n"
        import hashlib
        vn.FILES["tokens.txt"] = (len(self.good), hashlib.sha256(self.good).hexdigest())

    def tearDown(self):
        import shutil
        vn.FILES.clear()
        vn.FILES.update(self.saved)
        os.environ.pop("ZNS_VOICE_MODELS", None)
        shutil.rmtree(self.dir, ignore_errors=True)

    def write(self, name, data):
        path = os.path.join(self.dir, name)
        with open(path, "wb") as f:
            f.write(data)
        return path

    def test_the_published_file_is_used_and_remembered(self):
        path = self.write("tokens.txt", self.good)
        self.assertTrue(vn.CHECK.ok(path, "tokens.txt"))
        self.assertTrue(os.path.isfile(os.path.join(self.dir, vn.CHECKED)))
        real = vn.sha256_of
        vn.sha256_of = lambda p: self.fail("checked again although nothing changed")
        try:
            self.assertTrue(vn.CHECK.ok(path, "tokens.txt"))
        finally:
            vn.sha256_of = real

    def test_a_changed_file_is_never_used_and_is_deleted(self):
        path = self.write("tokens.txt", self.good)
        self.assertTrue(vn.CHECK.ok(path, "tokens.txt"))
        bad = bytearray(self.good)
        bad[0] ^= 1  # one byte, same size
        st = os.stat(path)
        self.write("tokens.txt", bytes(bad))
        os.utime(path, ns=(st.st_atime_ns, st.st_mtime_ns + 1_000_000))
        self.assertFalse(vn.CHECK.ok(path, "tokens.txt"))
        self.assertFalse(os.path.exists(path))

    def test_a_download_that_differs_is_deleted_with_an_error(self):
        final = os.path.join(self.dir, "tokens.txt")
        part = self.write("tokens.txt.part", self.good[:-1] + b"?")
        with self.assertRaises(ValueError):
            vn.save_checked(part, final, "tokens.txt")
        self.assertFalse(os.path.exists(part))
        self.assertFalse(os.path.exists(final))
        part = self.write("tokens.txt.part", self.good)
        vn.save_checked(part, final, "tokens.txt")
        self.assertTrue(vn.CHECK.ok(final, "tokens.txt"))

    def test_the_real_hashes_are_written_down(self):
        for name, (size, sha) in self.saved.items():
            self.assertGreater(size, 0, name)
            self.assertRegex(sha, r"^[0-9a-f]{64}$", name)


class OnlyThisComputer(unittest.TestCase):
    """The microphone and the camera: only the game page of this very computer."""

    def test_who_may_listen(self):
        import server
        own = {"Host": "localhost:8000", "Sec-Fetch-Site": "same-origin"}
        self.assertTrue(server.is_own_page("127.0.0.1", own))
        self.assertTrue(server.is_own_page("::1", {"Host": "[::1]:8000"}))
        self.assertTrue(server.is_own_page("127.0.0.1", {"Host": "127.0.0.1:8001"}))
        # another computer on the network
        self.assertFalse(server.is_own_page("192.168.1.20", own))
        self.assertFalse(server.is_own_page("10.0.0.5", {"Host": "192.168.1.10:8000"}))
        # another site's page in this computer's browser
        self.assertFalse(server.is_own_page("127.0.0.1", {"Host": "localhost:8000", "Sec-Fetch-Site": "cross-site"}))
        self.assertFalse(server.is_own_page("127.0.0.1", {"Host": "localhost:8000", "Origin": "https://evil.example"}))
        # a site that points its own name at this computer (DNS rebinding)
        self.assertFalse(server.is_own_page("127.0.0.1", {"Host": "evil.example:8000"}))
        self.assertFalse(server.is_own_page("127.0.0.1", {}))
        self.assertTrue(all(p in server.PRIVATE_PATHS for p in ("/api/voice/", "/api/pose/")))


if __name__ == "__main__":
    unittest.main()


class MicChoice(unittest.TestCase):
    """«Микрофон для заклинаний»: the chosen one by its key; gone — the system's default listens."""
    DEVS = [{"key": "Микрофон (Realtek)", "default": True}, {"key": "Гарнитура USB", "default": False}]

    def test_default_when_nothing_chosen(self):
        for key in (None, "", "default"):
            d, fell = vn.pick_device(self.DEVS, key)
            self.assertEqual(d["key"], "Микрофон (Realtek)")
            self.assertFalse(fell)

    def test_chosen_by_key(self):
        d, fell = vn.pick_device(self.DEVS, "Гарнитура USB")
        self.assertEqual(d["key"], "Гарнитура USB")
        self.assertFalse(fell)

    def test_unplugged_falls_back_to_default(self):
        d, fell = vn.pick_device(self.DEVS, "Веб-камера")
        self.assertEqual(d["key"], "Микрофон (Realtek)")
        self.assertTrue(fell)

    def test_no_devices(self):
        self.assertEqual(vn.pick_device([], "x"), (None, True))

    def test_set_mic_restarts_only_on_change(self):
        v = vn.NativeVoice()
        v.state = "running"
        self.assertTrue(v.set_mic("Гарнитура USB"))
        self.assertTrue(v._mic_change.is_set())
        v._mic_change.clear()
        self.assertFalse(v.set_mic("Гарнитура USB"))
        self.assertFalse(v._mic_change.is_set())
        self.assertTrue(v.set_mic("default"))
        self.assertEqual(v.mic_wanted, "")
