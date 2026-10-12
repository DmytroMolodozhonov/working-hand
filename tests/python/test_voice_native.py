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


if __name__ == "__main__":
    unittest.main()
