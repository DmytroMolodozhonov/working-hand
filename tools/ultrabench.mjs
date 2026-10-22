#!/usr/bin/env node
/**
 * ultrabench.mjs — what each part of «Ультра качество» costs (the picture here is drawn by the processor, SwiftShader:
 * not a video card's numbers, but the same WORK — pixels shaded, vertices moved, passes made — so the shares are telling).
 *   node tools/ultrabench.mjs [--frames 40] [--size 640x360] [--seed 20261015]
 * The hero stands on the meadow at the spawn; frames are timed in a few variants: the usual picture, all of «Ультра»,
 * and «Ультра» without one part each (the lawn, the glow/rays/mist pass, the big shadow, the 1.25× picture).
 */
import { startServer, launch, openPage, sleep } from '../tests/e2e/harness.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const FRAMES = parseInt(opt('frames', '40'), 10);
const SEED = parseInt(opt('seed', '20261015'), 10);
const [W, H] = opt('size', '640x360').split('x').map(Number);

const port = 8700 + Math.floor(Math.random() * 200);
const srv = await startServer(port);
const browser = await launch();
try {
    const { page } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: W, height: H } });
    await page.evaluate(({ SEED }) => {
        let s = 0x2545F491;
        Math.random = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
        const z = window.__zns;
        for (const [id, v] of [['graphics-quality', '3'], ['view-distance', 'high'], ['ultra-quality', 'off']]) { const el = document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event('change')); } }
        z.startGame({ ...z.readConfig(), mode: 'creative', map: null, seed: SEED, zombieCount: 0, graphics: '3', viewDistance: 'high', ultra: false });
    }, { SEED });
    await page.waitForFunction(() => window.__zns.game && window.__zns.game.active, null, { timeout: 180000 });
    await page.waitForFunction(() => !document.getElementById('hud').classList.contains('hidden'), null, { timeout: 120000 });
    await sleep(8000);
    const measure = (label, setup) => page.evaluate(async ({ label, setup, FRAMES }) => {
        const g = window.__zns.game;
        // eslint-disable-next-line no-new-func
        new Function('g', setup)(g);
        const wait = (n) => new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); });
        await wait(12); // (the grass is made, the targets are made)
        const gaps = [];
        let last = performance.now();
        for (let i = 0; i < FRAMES; i++) { await wait(1); const n = performance.now(); gaps.push(n - last); last = n; }
        gaps.sort((a, b) => a - b);
        const avg = gaps.reduce((a, b) => a + b, 0) / gaps.length;
        const i = g.renderer.info;
        return { label, avg: +avg.toFixed(0), p50: +gaps[Math.floor(gaps.length / 2)].toFixed(0), calls: i.render.calls, tris: i.render.triangles, blades: g.ultra?.grass?.slots?.reduce((a, s) => a + (s.mesh.visible ? s.geo.instanceCount : 0), 0) ?? 0 };
    }, { label, setup, FRAMES });
    const variants = [
        ['обычный', 'g.ultra.set(false)'],
        ['ультра', 'g.ultra.set(true)'],
        ['ультра без травы', 'g.ultra.set(true); g.ultra.grass.setVisible(false)'],
        ['ультра без пост-картинки', 'g.ultra.set(true); g.ultra.grass.setVisible(true); g.ultra.__render = g.ultra.render; g.ultra.render = () => false'],
        ['ультра, тень 2048', 'g.ultra.render = g.ultra.__render || g.ultra.render; g.ultra.set(true); const s = g.world.dirLight.shadow; s.mapSize.set(2048, 2048); if (s.map) { s.map.dispose(); s.map = null; }'],
        ['ультра, картинка ×1.0', 'g.world.dirLight.shadow.mapSize.set(3072, 3072); g.world.dirLight.shadow.map?.dispose(); g.world.dirLight.shadow.map = null; g.renderer.setPixelRatio(1.0)'],
        ['ультра, без теней', 'g.renderer.setPixelRatio(1.25); g.renderer.shadowMap.enabled = false'],
    ];
    console.log(`кадров ${FRAMES}, окно ${W}×${H}; среднее время кадра, мс (процессорная отрисовка)`);
    const res = [];
    for (const [label, setup] of variants) {
        const r = await measure(label, setup);
        res.push(r);
        console.log(`  ${label.padEnd(28)} ${String(r.avg).padStart(5)} мс (медиана ${r.p50})  вызовов ${r.calls}, треугольников ${r.tris}, травинок ${r.blades}`);
    }
    await page.close();
} finally {
    await browser.close();
    srv.stop();
}
