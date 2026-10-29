/**
 * Pictures made on the video card at loading (src/core/GpuTexture.js) are the processor's pictures: the trees' leaf
 * atlas (TreeMaterials.bakeLeafAtlas) and the animals' hides (AnimalModels.bakeHide) — read back and compared with the
 * processor's way pixel by pixel. Alpha the same to the bit; a colour may differ by one step of 255 in a pixel here and
 * there (float on the card, double on the processor; the canvas's own un-premultiplying), no more.
 * Run: node --test tests/e2e/gpu-textures.test.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { startServer, launch, sleep } from './harness.mjs';

const PORT = Number(process.env.ZNS_TEST_PORT) || 8193;
let srv, browser;

test.before(async () => { srv = await startServer(PORT); browser = await launch({}); });
test.after(async () => { await browser?.close(); srv?.stop(); });

test('the leaf atlas and the hides made on the card are the processor\'s pictures', async () => {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(srv.url);
    await sleep(1000);
    const r = await page.evaluate(async () => {
        const THREE = await import('three');
        const T = await import('/src/world/TreeLeaves.js');
        const M = await import('/src/world/TreeMaterials.js');
        const A = await import('/src/game/AnimalModels.js');
        const G = await import('/src/core/GpuTexture.js');
        const ren = new THREE.WebGLRenderer({ canvas: document.createElement('canvas') });
        const back = (tex, w, h) => {
            const rt = G.bakeTarget(w, h);
            G.runPasses(ren, [{ target: rt, fragmentShader: 'uniform sampler2D t; out highp vec4 o; void main() { o = texelFetch(t, ivec2(gl_FragCoord.xy), 0); }', uniforms: { t: { value: tex } } }]);
            const px = new Uint8Array(w * h * 4);
            ren.readRenderTargetPixels(rt, 0, 0, w, h, px);
            rt.dispose();
            return px;
        };
        const cmp = (a, b) => {
            let diff = 0, alpha = 0, mx = 0;
            for (let i = 0; i < a.length; i++) {
                const d = Math.abs(a[i] - b[i]);
                if (!d) continue;
                diff++; mx = Math.max(mx, d);
                if (i % 4 === 3) alpha++;
            }
            return { diff, alpha, mx, n: a.length };
        };
        const out = {};
        // the leaf atlas: the processor's way as it was (getImageData, bleedLeafPixels, rows flipped)
        const W = T.LEAF_ATLAS.CELL * T.LEAF_ATLAS.KINDS, H = T.LEAF_ATLAS.CELL;
        const c1 = new OffscreenCanvas(W, H).getContext('2d');
        T.drawLeafAtlas(c1);
        const px = T.bleedLeafPixels(c1.getImageData(0, 0, W, H).data, W, H);
        const cpu = new Uint8Array(px.length);
        for (let y = 0; y < H; y++) cpu.set(px.subarray((H - 1 - y) * W * 4, (H - y) * W * 4), y * W * 4);
        const cv = new OffscreenCanvas(W, H);
        T.drawLeafAtlas(cv.getContext('2d'));
        out.leaf = cmp(back(M.bakeLeafAtlas(ren, cv, W, H), W, H), cpu);
        // the hides: the same random numbers drawn for both ways
        const rnd = (seed) => { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; };
        const prep = (L, seed) => {
            const r = rnd(seed);
            const grid = (n) => { const a = new Float32Array(n * n * 2); for (let i = 0; i < a.length; i++) a[i] = r(); return a; };
            const g1 = grid(8), g2 = grid(16), g3 = grid(32), spots = [], [s0, s1] = L.spotR || [0.06, 0.16];
            for (let i = 0; i < L.spots; i++) { const ru = s0 + r() * (s1 - s0); spots.push({ u: 0.06 + r() * 0.88, v: r(), ru, rv: ru * (0.6 + r() * 0.5) }); }
            return [r, g1, g2, g3, spots];
        };
        const hides = [];
        A.PEGASUS_COATS.forEach((C, i) => hides.push([{ ...C, spotC: C.spotC || [1, 1, 1], hairLen: [3, 7] }, 7001 + i * 104729]));
        A.COW_LOOKS.forEach((L, i) => hides.push([L, 5003 + i * 104729]));
        A.PIG_LOOKS.forEach((L, i) => hides.push([L, 9001 + i * 7919]));
        const sum = { diff: 0, alpha: 0, mx: 0, n: 0 };
        for (const [L, seed] of hides) {
            const c = A.hideOnCpu(128, 256, L, ...prep(L, seed)).image.data;
            const g = back(A.bakeHide(ren, 128, 256, L, ...prep(L, seed)), 128, 256);
            const d = cmp(g, c);
            sum.diff += d.diff; sum.alpha += d.alpha; sum.mx = Math.max(sum.mx, d.mx); sum.n += d.n;
        }
        out.hides = sum;
        return out;
    });
    assert.deepEqual(errors, []);
    for (const k of ['leaf', 'hides']) {
        const d = r[k];
        assert.equal(d.alpha, 0, `${k}: alpha the same`);
        assert.ok(d.mx <= 1, `${k}: no colour off by more than one step (${d.mx})`);
        assert.ok(d.diff <= d.n * 0.0001, `${k}: ${d.diff} of ${d.n} off by one — at most one in 10 000`);
    }
    await page.close();
});
