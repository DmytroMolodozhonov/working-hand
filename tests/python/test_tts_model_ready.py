"""tts_native.model_ready: an empty model file (an unpacking cut short) is no model — it is downloaded anew,
not «ready» for ever with the villagers' voices never starting (found in a container: vocoder.int8.onnx 0 bytes)."""
import os
import sys
import tempfile
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
import tts_native  # noqa: E402


class TestModelReady(unittest.TestCase):
    def test_empty_file_is_not_ready(self):
        with tempfile.TemporaryDirectory() as d:
            old = os.environ.get("ZNS_TTS_DIR")
            os.environ["ZNS_TTS_DIR"] = d
            try:
                os.makedirs(tts_native.model_dir())
                for f in tts_native.FILES:
                    with open(os.path.join(tts_native.model_dir(), f), "wb") as h:
                        h.write(b"x")
                self.assertTrue(tts_native.model_ready())
                open(os.path.join(tts_native.model_dir(), "vocoder.int8.onnx"), "wb").close()
                self.assertFalse(tts_native.model_ready())
            finally:
                if old is None:
                    os.environ.pop("ZNS_TTS_DIR", None)
                else:
                    os.environ["ZNS_TTS_DIR"] = old


if __name__ == "__main__":
    unittest.main()
