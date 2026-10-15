"""llm_native.py: an answer from llama-server's stream (words, tool calls) as the old web worker gave it."""
import http.server
import json
import os
import sys
import threading
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
import llm_native  # noqa: E402


class Fake(http.server.BaseHTTPRequestHandler):
    seen = []

    def log_message(self, *a):
        pass

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        Fake.seen.append((self.headers.get("Authorization"), body))
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.end_headers()
        chunks = [{"content": "Добрый "}, {"content": "день!"}]
        if body.get("tools"):
            chunks += [{"tool_calls": [{"index": 0, "function": {"name": "follow", "arguments": "{\"who\":"}}]},
                       {"tool_calls": [{"index": 0, "function": {"arguments": " \"player\"}"}}]}]
        for c in chunks:
            self.wfile.write(("data: " + json.dumps({"choices": [{"delta": c}]}) + "\n\n").encode())
            self.wfile.flush()
        self.wfile.write(b"data: [DONE]\n\n")


class TestNativeLLM(unittest.TestCase):
    def setUp(self):
        self.srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Fake)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.llm = llm_native.NativeLLM()
        self.llm.state, self.llm.port, self.llm._key = "ready", self.srv.server_address[1], "k"

    def tearDown(self):
        self.srv.shutdown()

    def test_words_streamed_and_tool_calls_as_tags(self):
        parts = []
        text = self.llm.generate({"id": 7, "messages": [{"role": "user", "content": "Привет"}], "maxTokens": 90, "temperature": 0.4,
                                  "tools": [{"name": "follow", "parameters": {}}], "raw": True, "stream": True}, parts.append)
        self.assertEqual([p["text"] for p in parts], ["Добрый ", "день!"])
        self.assertEqual(text, 'Добрый день!<tool_call>{"name": "follow", "arguments": {"who": "player"}}</tool_call>')
        auth, body = Fake.seen[-1]
        self.assertEqual(auth, "Bearer k")  # (only the game may ask it)
        self.assertEqual(body["tools"][0]["type"], "function")
        self.assertFalse(body["chat_template_kwargs"]["enable_thinking"])

    def test_not_ready(self):
        self.llm.state = "loading"
        with self.assertRaises(RuntimeError):
            self.llm.generate({"id": 1, "messages": []}, lambda m: None)

    def test_thoughts_left_out(self):
        self.assertEqual(llm_native.strip_think("<think>хм</think>Да.<end_of_turn>"), "Да.")


if __name__ == "__main__":
    unittest.main()
