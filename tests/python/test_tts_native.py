"""tts_native.py: the voice program reads the Russian words it is sent — even with Windows' console code
page (cp1251) on its stdin, which turned them into «РЎРІРµР¶РёР№» and the villagers spoke gibberish —
and a phrase lasts as long as its words. (Skipped when the model is not downloaded.)"""
import base64
import os
import sys
import time
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
import tts_native  # noqa: E402

try:
    import sherpa_onnx  # noqa: F401
    HAVE = tts_native.model_ready()
except Exception:  # noqa: BLE001
    HAVE = False


@unittest.skipUnless(HAVE, "the voice model is not downloaded here")
class TestNativeTTS(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        os.environ["PYTHONIOENCODING"] = "cp1251"  # (as a Windows console: the program must not depend on it)
        cls.tts = tts_native.NativeTTS()
        cls.tts.start()
        t0 = time.time()
        while cls.tts.state not in ("ready", "error") and time.time() - t0 < 120:
            time.sleep(0.2)
        os.environ.pop("PYTHONIOENCODING", None)

    @classmethod
    def tearDownClass(cls):
        cls.tts.stop()

    def test_russian_read_as_sent_and_lasts_as_its_words(self):
        self.assertEqual(self.tts.state, "ready", self.tts.error)
        short = self.tts.synth({"id": 1, "text": "Эй!", "voice": "M3"})
        long = self.tts.synth({"id": 2, "text": "Свежий хлеб, только из печи! Заходи, путник, не стесняйся.", "voice": "M3"})
        sec = lambda a: len(base64.b64decode(a["pcm"])) / 2 / a["sr"]  # noqa: E731
        self.assertEqual(long["sr"], 44100)
        self.assertTrue(1.5 < sec(long) < 7, sec(long))  # (a broken text was nearly twice as long)
        self.assertLess(sec(short), sec(long))

    def test_nothing_to_say_is_silence_at_its_rate(self):
        a = self.tts.synth({"id": 3, "text": "", "voice": "F1"})
        self.assertEqual(a["pcm"], "")
        self.assertEqual(a["sr"], 44100)


if __name__ == "__main__":
    unittest.main()
