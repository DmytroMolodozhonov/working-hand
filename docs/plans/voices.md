# Villager voices (TTS) — what was chosen and why (October 2026)

## Chosen: Supertonic 3 in the browser

- Model: Supertone **Supertonic 3** (released 2026-04-29), ~99M parameters, 31 languages incl. Russian,
  ten fixed voices **F1–F5 (women) and M1–M5 (men)**. Model licence: BigScience **OpenRAIL-M**
  (free use incl. commercial, with the usual use restrictions); sample code MIT.
  <https://huggingface.co/Supertone/supertonic-3>
- Files used: the sherpa-onnx **int8** package (k2-fsa, Apache-2.0 conversion), **~145 MB** in total:
  `duration_predictor.int8.onnx`, `text_encoder.int8.onnx`, `vector_estimator.int8.onnx` (78 MB),
  `vocoder.int8.onnx` (26 MB), `tts.json`, `unicode_indexer.bin`, `voice.bin` (speakers 0–4 = F1–F5,
  5–9 = M1–M5 — checked by measuring the pitch: F 176–236 Hz, M 87–134 Hz).
  Sources in `src/audio/NeuralVoice.js` `VOICE_SOURCES`: `csukuangfj2/sherpa-onnx-supertonic-3-tts-int8-2026-05-11`,
  the mirror `Grit-Labs/…`, then the original Supertone files (~400 MB) as the last resort.
- Nothing is committed to git (GitHub's 100 MB limit): the browser downloads from the Hugging Face hub
  once (CORS, progress in the HUD) and keeps the files in the Cache API (`zns-voices-v1`).
- Runtime: `src/audio/tts.worker.js` (a Web Worker) with ONNX Runtime Web from `vendor/onnxruntime/`
  (same version as `vendor/transformers`, sharing its 26 MB wasm). Character-based model — no espeak
  phonemizer needed. Each sentence is played as soon as it is synthesized.
- Pitch variety without leaving the gender: playback rate ±5 % (speed compensated), clamped so a man
  stays ≤ 145 Hz and a woman ≥ 168 Hz (`src/audio/VoiceCast.js`).

## Fallback: Web Speech API

Gender read from the voice name (Windows Irina/Pavel, Edge Svetlana/Dmitry/Dariya, macOS Milena/Yuri/Katya,
Chrome «Google русский» = female). A voice of the other gender is never used; with no fitting voice the
villager answers with text only.

## Not chosen

- **Piper** ru_RU (denis, dmitri, ruslan — men; irina — the only woman; ~63 MB each): one female voice
  only, needs the espeak-ng phonemizer (GPL) in WASM; voice data licence of irina is unclear (RHVoice).
- **Silero** v4/v5: many Russian voices, but **CC BY-NC** (non-commercial) and needs PyTorch.
- **MMS-TTS rus** (Meta): one speaker, CC BY-NC.
- **Vosk TTS** ru 0.9 multi (3 women, 2 men, Apache-2.0): about 1 GB with its BERT part, Python only.
- A Python server engine (`server.py`): not needed — the browser runs the model fast enough and works
  the same on every computer, without installing Python packages.

## For other sessions

Every speaker must pass its gender: `speech.say(text, { voiceKey, role, female: true|false })`
(or `gender: 'female'|'male'`); without it the speaker is a man. Roles with their own voice
character: `king`, `knight`, `builder`, `farmer`, `merchant`, `wizard`, `sailor` (others: `villager`).
