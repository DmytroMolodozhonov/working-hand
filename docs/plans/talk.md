# Villagers really talk (session «talk», #89)

## What the player gets

- Talk to any villager by voice (7 m). The answer comes over the head and aloud. Every villager
  remembers the conversation (name, insults, trades, the last order).
- With «Умные жители» on, a small neural net understands **any** words (not a list of phrases) and
  calls game actions (tool calling). The villager says «Хм…» while it thinks.
- The king's orders are obeyed: «собери войско», «в атаку на зомби / паука / Олега», «защищайте
  замок», «за мной», «стой», «отбой». A stranger is refused; only the undead a knight fights for anyone.
- The king's **advisor** stands by the throne (roster number −1) and passes orders to the army.

## How it works

| Part | File |
|---|---|
| Action schema (JSON tools, Russian descriptions), parser of tool calls (Qwen `<tool_call>{json}`, Qwen3.5 XML `<function=…>`, LFM `<\|tool_call_start\|>[f(a=…)]`, bare JSON), validator (the game decides), plain-word army orders | `src/ai/TalkActions.js` |
| The mind: Russian system prompt per role (farmer, builder, merchant, knight, advisor, king; wizard ready for the tower), memory → history, «Хм…», timeout → rules, merge with the rule brain | `src/ai/TalkMind.js` |
| The rule brain (memory, mood, market, fallback) | `src/game/VillagerBrain.js` |
| Carrying out (host): follow, stay, show the way, gather the army (+ knights from the barracks, up to 14), attack (player → the usual castle fight; creatures → hunt and real sword swings, damage when the swing lands), defend (gate + walls, strike creatures near) | `src/game/VillagerOrders.js` |
| Wiring, latency hiding, model loading with fallback | `src/game/CastleTalk.js` |
| The net in a worker (Transformers.js 4.3.1 vendored, `tools` in the chat template) | `src/ai/LocalLLM.js`, `src/ai/llm.worker.js` |

Order of decisions for one sentence:
1. the rule brain answers at once (memory, mood, market prices — never the net);
2. clear army orders in plain words → carried out at once (no waiting for the net);
3. otherwise the net (if ready) gets the prompt + history + the role's tools; its call is validated;
   a call the game refuses becomes a refusal line; junk / numbers / timeout → the rule answer.

## The model and the runtime (research, October 2026)

- **Runtime: in the browser** (Transformers.js + ONNX Runtime Web, WebGPU, WASM fallback). Already
  vendored (`vendor/transformers`, v4.3.1); nothing to install on Windows; the weights are downloaded
  once from Hugging Face with progress and kept in the browser Cache API (GitHub can't hold >100 MB).
  Transformers.js 4.2 added `tools` to the text-generation pipeline; 4.0 added Qwen3.5
  ([releases](https://github.com/huggingface/transformers.js/releases)). The vendored bundle maps
  `qwen3_5_text` → `Qwen3_5ForCausalLM` (checked in the file).
- **Model: Qwen3.5 0.8B** (March 2026; Apache 2.0; 201 languages incl. Russian; tool calling;
  non-thinking by default), text-only ONNX build `onnx-community/Qwen3.5-0.8B-Text-ONNX`.
  Fallback chain: Qwen3 0.6B ONNX (the old «smart») → the rule brain.
- Not chosen: llama.cpp / llama-cpp-python in `server.py` (one more native install on every PC, the
  Mac launcher too; the browser path already works offline after the first download); LFM2.5 1.2B
  (no Russian in the official list); 8B Russian models like T-lite (far too heavy for a gaming PC
  next to the game).
- «Сами решат» (default): the net loads only when the browser gives a real graphics adapter — on a
  processor alone it is too slow next to the game.

## Multiplayer

The host owns the villagers, so the host carries out every action (`vord`, checked again on the
host: army orders only from the castle's owner). Who runs the net: the speaker's own computer if it
has the net loaded; otherwise a guest asks the host's net (`vask` → the host answers, says the line
to everybody, carries out the orders, and sends `vans` back; the market stays the guest's own). The
host tells guests its net is ready (`vai`, also in `welcome`).

## Tests

- `tests/unit/talk-mind.test.js` — schema, parser formats, plain-word orders, permissions, the mind
  with a fake model (tool calls, refusals, junk, timeout, memory).
- `tests/e2e/talk.test.mjs` — in the browser: the advisor, a stranger refused, the king gathers the
  army, the knights cut down a zombie, «отбой»; a fake net in the page: «Хм…», a tool call carried out.
