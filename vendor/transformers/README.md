# Vendored Transformers.js

Used only by `src/ai/llm.worker.js` (the optional local villager LLM). Nothing
here is fetched from a CDN at runtime; only the model weights are downloaded
from huggingface.co (once, then kept in the browser Cache API, key
`transformers-cache`).

| File | From | Version |
| --- | --- | --- |
| `transformers.min.js` | npm `@huggingface/transformers` → `dist/transformers.min.js` (browser ESM bundle, onnxruntime-web is bundled in) | **4.3.1** (exact) |
| `ort-wasm-simd-threaded.asyncify.mjs` | npm `onnxruntime-web` → `dist/` | **1.31.0-dev.20260914-8d85527a0** (the exact version 4.3.1 depends on and bundles) |
| `ort-wasm-simd-threaded.asyncify.wasm` | npm `onnxruntime-web` → `dist/` | same |
| `LICENSE` | `@huggingface/transformers` (Apache-2.0). onnxruntime-web is MIT (Microsoft). | |

Total ≈ 27 MB (the .wasm is 26.9 MB; it contains both the CPU/WASM and the WebGPU execution providers).

The asyncify build is the one Transformers.js 4.x picks itself for every browser
except Safari < 26 without WebGPU (that browser would want the plain
`ort-wasm-simd-threaded.{mjs,wasm}`, 14 MB, not vendored; the LLM is optional,
so it just fails to load there and the rule-based villagers keep talking).

## How the paths are set (no CDN)

By default the bundle points `env.backends.onnx.wasm.wasmPaths` at
`cdn.jsdelivr.net`. The worker overrides it **before the first model load**:

```js
const VENDOR = new URL('../../vendor/transformers/', import.meta.url);
const tf = await import(new URL('transformers.min.js', VENDOR).href);
tf.env.backends.onnx.wasm.wasmPaths = {
    mjs: new URL('ort-wasm-simd-threaded.asyncify.mjs', VENDOR).href,
    wasm: new URL('ort-wasm-simd-threaded.asyncify.wasm', VENDOR).href,
};
tf.env.backends.onnx.wasm.numThreads = self.crossOriginIsolated ? 4 : 1;
```

(Module workers do not see the page's import map, so the worker imports the
bundle by relative URL.)

## Updating

```sh
npm view @huggingface/transformers dist-tags
npm pack @huggingface/transformers@<ver>          # read package.json → "onnxruntime-web" version
npm pack onnxruntime-web@<that exact version>
# copy dist/transformers.min.js and dist/ort-wasm-simd-threaded.asyncify.{mjs,wasm}
```

The ORT files must match the ORT version bundled inside `transformers.min.js`
(search the bundle for `versions, "web"`), otherwise the wasm/mjs pair fails to load.

SHA-256:

```
8d6716d9086f57c30a4bf367dba61b887593573c770c454465e8019b2703e743  transformers.min.js
0966b6105cd936744498aa60df7a22cbd47af3374dbc64a9ab561c08a71e3611  ort-wasm-simd-threaded.asyncify.mjs
49871f5a4409519797e127440868a6d1923339d9185907f301a5b2a1d90af082  ort-wasm-simd-threaded.asyncify.wasm
```


## Local patch

`transformers.min.js` is patched in one place: the 32-letter identifier of the Mistral 3 model class was split (`"Mistral3"+"ForConditionalGeneration"`, export `Mistral3_ForConditionalGeneration`) because GitHub's secret scanning mistook it for an API key. Nothing else changed; the game does not use that model. SHA-256 sums above are of the original files.
