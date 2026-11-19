#!/usr/bin/env node
/**
 * litebench.mjs — the cost of a frame where there is NO video card (the container draws with the processor — SwiftShader —
 * exactly the case of «Лёгкий режим»): the real wall time of a frame (draw included), in turn for: as it is, each cut alone,
 * and everything cut. node tools/litebench.mjs [--size 480x270] [--frames 40] [--level high]
 */
import { startServer, launch, openPage, sleep } from '../tests/e2e/harness.mjs';
const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const [W, H] = opt('size', '480x270').split('x').map(Number);
const FRAMES = parseInt(opt('frames', '40'), 10);
const GFX = opt('graphics', '3'), VIEW = opt('view', 'high'), LITEOPT = opt('lite', 'off'), LITE = opt('only', null); // --only base: just the first row
const srv = await startServer(8900 + Math.floor(Math.random() * 90));
const browser = await launch({});
const killer = setTimeout(() => { console.error('litebench: timeout'); process.exit(2); }, 14 * 60 * 1000);
try {
    const { page } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: W, height: H } });
    await page.evaluate(({ GFX, VIEW, LITEOPT }) => {
        for (const [id, v] of [['graphics-quality', GFX], ['view-distance', VIEW]]) { const el = document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event('change')); } }
        const z = window.__zns;
        z.startGame({ ...z.readConfig(), mode: 'creative', map: null, seed: 20261015, zombieCount: 0, graphics: GFX, viewDistance: VIEW, lite: LITEOPT });
    }, { GFX, VIEW, LITEOPT });
    await page.waitForFunction(() => window.__zns.game && window.__zns.game.active, null, { timeout: 180000 });
    for (let i = 0; i < 120; i++) { const q = await page.evaluate(() => { const g = window.__zns.game; return { q: g.terrain._queue?.length ?? 0, f: g.frameCount }; }); if (q.q === 0 && q.f > 120) break; await sleep(1000); }
    await sleep(3000);
    const measure = (label, setup) => page.evaluate(async ({ label, setup, FRAMES }) => {
        const g = window.__zns.game;
        const undo = (new Function('g', setup))(g) || (() => {});
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        const ts = [];
        let rt = 0, rn = 0; const r0 = g.renderer.render.bind(g.renderer); g.renderer.render = (...a) => { const t = performance.now(); r0(...a); { const gl = g.renderer.getContext(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); } rt += performance.now() - t; rn++; };
        let prev = performance.now();
        for (let i = 0; i < FRAMES; i++) { await new Promise((r) => requestAnimationFrame(r)); const n = performance.now(); ts.push(n - prev); prev = n; }
        ts.sort((a, b) => a - b);
        const mean = ts.reduce((a, b) => a + b, 0) / ts.length;
        undo(); g.renderer.render = r0;
        return { render_ms_per_frame: +(rt / Math.max(1, FRAMES)).toFixed(1), label, mean: +mean.toFixed(1), p50: +ts[ts.length >> 1].toFixed(1), lite: g.lite, vs: g.world.viewScale, fog: g.scene.fog?.far, tv: g.world.terrain.viewDistance, pr: g.renderer.getPixelRatio(), chunks: g.world.terrain.meshes?.size, calls: g.renderer.info.render.calls, tris: g.renderer.info.render.triangles };
    }, { label, setup, FRAMES });
    const rows = [];
    if (LITE !== 'top') rows.push(await measure('как есть', ''));
    if (LITE === 'top') { rows.length = 0; } else if (LITE === 'base') { console.log(JSON.stringify(rows)); throw new Error('done'); }
    if (LITE !== 'top') rows.push(await measure('пиксели ×0.5', 'const o=g.renderer.getPixelRatio();g.renderer.setPixelRatio(o*0.5);return()=>g.renderer.setPixelRatio(o)'));
    if (LITE !== 'top') rows.push(await measure('пиксели ×0.35', 'const o=g.renderer.getPixelRatio();g.renderer.setPixelRatio(o*0.35);return()=>g.renderer.setPixelRatio(o)'));
    if (LITE !== 'top') rows.push(await measure('без теней (карта не рисуется)', 'const s=g.world.dirLight;const o=s.castShadow;g.renderer.shadowMap.enabled=false;return()=>{g.renderer.shadowMap.enabled=true}'));
    if (LITE !== 'top') rows.push(await measure('без неба/облаков', 'const w=g.world;const o=w.sky?.mesh?.visible;if(w.sky?.setClouds)w.sky.setClouds(false);return()=>{}'));
    const hide = (name, re) => measure('скрыто: ' + name, `const L=[];g.scene.traverse(o=>{if(o.parent===g.scene&&${re}.test(o.name||o.constructor.name)){L.push([o,o.visible]);o.visible=false}});return()=>L.forEach(([o,v])=>o.visible=v)`);
    if (LITE !== 'top') for (const [n, re] of [['земля', '/terrain|chunk/i'], ['всё не-земля', '/^(?!.*(terrain|chunk)).*$/i']]) rows.push(await hide(n, re));
    const tops = await page.evaluate(() => { const g = window.__zns.game, out = []; for (const o of g.scene.children) { let n = 0, tri = 0; o.traverse((m) => { if (m.isMesh && m.visible) { n++; const gg = m.geometry; tri += (gg.index ? gg.index.count : gg.attributes.position?.count || 0) / 3; } }); { const kids = o.children.slice(0, 3).map((c) => (c.name || c.type) + (c.userData && Object.keys(c.userData).length ? '{' + Object.keys(c.userData).slice(0, 4).join(',') + '}' : '')).join('/'); const hp = g.character.group.position; out.push([(o.name || o.type) + ' @' + Math.round(Math.hypot(o.position.x - hp.x, o.position.z - hp.z)) + 'm ' + (o.userData ? Object.keys(o.userData).slice(0, 5).join(',') : '') + ' [' + kids + ']', n, Math.round(tri)]); } } return out.sort((a, b) => b[2] - a[2]).slice(0, 22); });
    console.log(JSON.stringify(rows, null, 1)); console.log('верх сцены (имя, мешей, треуг):'); for (const t of tops) console.log(' ', t.join(' | '));
} finally { clearTimeout(killer); await browser.close().catch(() => {}); srv.close?.(); }
