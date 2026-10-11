# Vendored ONNX Runtime Web (JS loader only)

Used by `src/audio/tts.worker.js` (the neural villager voices, Supertonic 3).

| File | From | Version |
| --- | --- | --- |
| `ort.webgpu.min.mjs` | npm `onnxruntime-web` → `dist/ort.webgpu.min.mjs` | **1.31.0-dev.20260914-8d85527a0** (exact) |

Licence: MIT, © Microsoft Corporation (see the header of the file).

It is the same ONNX Runtime version that `vendor/transformers/` bundles, so it
loads the WebAssembly already vendored there
(`vendor/transformers/ort-wasm-simd-threaded.asyncify.{mjs,wasm}`) — no second
26 MB copy and nothing from a CDN. If `vendor/transformers` is updated to a
new ORT version, update this file to the same version.

SHA-256:

```
5dd65363be87d182ce0617665489cab4b78359cea9f04d813b2a423c9be651a1  ort.webgpu.min.mjs
```
