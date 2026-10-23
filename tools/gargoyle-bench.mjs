#!/usr/bin/env node
/**
 * gargoyle-bench.mjs — the pentagram of the infernal gargoyles, run in the real game (Creative), measured and photographed.
 *   node tools/gargoyle-bench.mjs [--out docs/gargoyles] [--dt 0.05] [--size 960x540] [--no-shots] [--check] [--hold 40]
 *
 * A fresh Creative world (the same seed every run). First «стоим» (the start scene as it is: nothing of the ritual), then the ritual
 * is begun 16 m ahead of the hero (free in Creative): its fire (5 s), the release (30 gargoyles), the storm and the hunt. The game's
 * time runs at a fixed step (`--dt`, whatever the frames really took: the container has no video card, the frames are slow), so the
 * numbers are what the GAME's own work costs per step: «игра» = the frame without the drawing (ms: mean / p95 / max), draw calls and
 * triangles of the frame, and the objects the scene and the renderer hold (geometries, textures, shaders) before and after — nothing
 * may grow, no shader may be compiled in flight. Pictures at the main moments go to --out (the container's own software GL).
 * --check: the limits below (only tighten).
 */
import { startServer, launch, openPage, sleep } from '../tests/e2e/harness.mjs';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const SEED = parseInt(opt('seed', '20261015'), 10);
const DT = parseFloat(opt('dt', '0.05'));
const [W, H] = opt('size', '960x540').split('x').map(Number);
const OUT = path.resolve(opt('out', 'docs/gargoyles'));
const SHOTS = !args.includes('--no-shots');
const CHECK = args.includes('--check');
const HOLD = parseFloat(opt('hold', '40')); // the ritual's seconds to run (the hunt is measured from 12 to this)
/** --check: what 30 gargoyles may cost the game's own work in a step (only tighten). */
const LIMITS = { gameMeanMs: 9, gameP95Ms: 18, drawsAdded: 130, newPrograms: 0, newGeometries: 4, newTextures: 40 }; // (a live gargoyle owns one bone texture; they are freed with it)

fs.mkdirSync(OUT, { recursive: true });
const port = 8900 + Math.floor(Math.random() * 90);
const srv = await startServer(port);
const browser = await launch({ extraArgs: ['--enable-precise-memory-info'] });
let failed = false;
try {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: W, height: H } });
    await page.evaluate(() => {
        let s = 0x2545F491;
        Math.random = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    });
    await page.evaluate(({ SEED }) => {
        for (const [id, v] of [['graphics-quality', '3'], ['view-distance', 'high']]) { const el = document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event('change')); } }
        const z = window.__zns;
        const seen = window.__compiled = [];
        z.THREE.Material.prototype.onBeforeCompile = function () { seen.push(this); };
        z.startGame({ ...z.readConfig(), mode: 'creative', map: null, seed: SEED, zombieCount: 0, graphics: '3', viewDistance: 'high', ultra: false });
    }, { SEED });
    await page.waitForFunction(() => window.__zns.game && window.__zns.game.active, null, { timeout: 180000 });
    await page.waitForFunction(() => !document.getElementById('hud').classList.contains('hidden'), null, { timeout: 120000 });
    for (let i = 0; i < 120; i++) {
        const q = await page.evaluate(() => { const g = window.__zns.game; return { q: g.terrain._queue?.length ?? 0, f: g.frameCount }; });
        if (q.q === 0 && q.f > 200) break;
        await sleep(1000);
    }
    await sleep(4000);

    // the frame wrapper: a fixed step, the game's own work apart from the drawing, a hold for the pictures
    await page.evaluate(({ DT }) => {
        const g = window.__zns.game;
        const rec = window.__rec = [];
        window.__hold = false;
        const origFrame = g.frame.bind(g);
        const origDraw = g._draw ? g._draw.bind(g) : null;
        let drawMs = 0;
        if (origDraw) g._draw = function () { const t = performance.now(); try { return origDraw(); } finally { drawMs += performance.now() - t; } };
        g.frame = function () {
            if (window.__hold) { g.lastTime = performance.now(); return; }
            const t0 = performance.now();
            g.lastTime = t0 - DT * 1000;
            drawMs = 0;
            origFrame();
            const t1 = performance.now();
            const info = g.renderer.info;
            const G = g.gargoyles, r = G?.rituals?.[0];
            rec.push({ total: t1 - t0, game: t1 - t0 - drawMs, calls: info.render.calls, tris: info.render.triangles, t: r ? r.t : -1, n: G ? G.list.length : 0, rit: G?.rituals?.length || 0 });
            if (rec.length > 6000) rec.shift();
        };
    }, { DT });
    const snap = () => page.evaluate(() => {
        const g = window.__zns.game, i = g.renderer.info;
        return { geo: i.memory.geometries, tex: i.memory.textures, prog: i.programs.length, compiled: window.__compiled.length, scene: g.scene.children.length };
    });
    const stats = (arr, k) => { const a = arr.map((x) => x[k]).sort((x, y) => x - y); const m = a.reduce((s, v) => s + v, 0) / (a.length || 1); return { mean: +m.toFixed(2), p95: +(a[Math.floor(a.length * 0.95)] || 0).toFixed(2), max: +(a[a.length - 1] || 0).toFixed(2) }; };

    // the hero looks along its way; the ritual is 16 m ahead
    await page.evaluate(() => {
        const g = window.__zns.game, ch = g.character;
        const yaw = g.cameraBaseRotation || 0;
        g.smoothBody = yaw; ch.setBodyRotation(yaw);
        window.__aim = { x: ch.group.position.x - Math.sin(yaw) * 16, z: ch.group.position.z - Math.cos(yaw) * 16 };
    });
    // before: standing
    await page.evaluate(() => { window.__rec.length = 0; });
    while ((await page.evaluate(() => window.__rec.length)) < 60) await sleep(300);
    const before = { frames: await page.evaluate(() => window.__rec.slice()), snap: await snap() };
    const base = { game: stats(before.frames, 'game'), calls: stats(before.frames, 'calls'), tris: stats(before.frames, 'tris') };
    console.log(`до ритуала:   игра ${base.game.mean} / p95 ${base.game.p95} мс, вызовов ${base.calls.mean | 0}, треугольников ${base.tris.mean | 0}`);

    // the ritual
    const started = await page.evaluate(() => {
        const g = window.__zns.game, a = window.__aim;
        const y = g.collision.groundY(a.x, a.z);
        const res = g.gargoyles.startRitual({ x: a.x, y, z: a.z });
        return { res, y };
    });
    if (!started.res.ok) throw new Error('the ritual did not start: ' + JSON.stringify(started.res));
    await page.evaluate(() => { window.__rec.length = 0; });
    const shotAt = [[2.0, 'fire-early'], [4.6, 'fire'], [6.0, 'release'], [8.5, 'burst'], [13, 'storm'], [26, 'hunt'], [HOLD - 1, 'late']];
    let si = 0;
    const T0 = Date.now();
    while (true) {
        const st = await page.evaluate(() => { const r = window.__zns.game.gargoyles.rituals[0]; const n = window.__zns.game.gargoyles.list.length; return { t: r ? r.t : 999, n, f: window.__rec.length }; });
        if (SHOTS && si < shotAt.length && st.t >= shotAt[si][0]) {
            await page.evaluate(() => { window.__hold = true; });
            await sleep(400);
            const f = path.join(OUT, `ritual-${String(si + 1).padStart(2, '0')}-${shotAt[si][1]}.png`);
            await page.screenshot({ path: f });
            console.log(`снимок t=${st.t.toFixed(1)} с, горгулий ${st.n}: ${f}`);
            await page.evaluate(() => { window.__hold = false; });
            si++;
        }
        if (st.t >= HOLD || Date.now() - T0 > 20 * 60 * 1000) break;
        await sleep(250);
    }
    const rec = await page.evaluate(() => window.__rec.slice());
    const after = await snap();
    const part = (a, b) => rec.filter((x) => x.t >= a && x.t < b);
    for (const [name, a, b] of [['огонь (0–5 с)', 0, 5], ['вылет (5–7,4 с)', 5, 7.4], ['охота (12 с и дальше)', 12, 1e9]]) {
        const p = part(a, b);
        if (!p.length) continue;
        const gm = stats(p, 'game'), c = stats(p, 'calls'), tr = stats(p, 'tris');
        const n = Math.max(...p.map((x) => x.n));
        console.log(`${name}: ${p.length} кадров, горгулий до ${n}: игра ${gm.mean} / p95 ${gm.p95} / max ${gm.max} мс, вызовов ${c.mean | 0} (+${(c.mean - base.calls.mean) | 0}), треугольников ${tr.mean | 0} (+${(tr.mean - base.tris.mean) | 0})`);
    }
    console.log(`до → после: геометрий ${before.snap.geo} → ${after.geo}, текстур ${before.snap.tex} → ${after.tex}, шейдеров ${before.snap.prog} → ${after.prog}, собрано после старта ${before.snap.compiled} → ${after.compiled}`);
    const news = await page.evaluate((n0) => window.__compiled.slice(n0).map((m) => m.type + ':' + (m.name || m.constructor.name)), before.snap.compiled);
    if (news.length) console.log('шейдеры, собранные в полёте: ' + news.join(', '));
    const hunt = part(12, 1e9);
    const huntStats = hunt.length ? stats(hunt, 'game') : null;
    const huntCalls = hunt.length ? stats(hunt, 'calls').mean - base.calls.mean : 0;
    if (CHECK) {
        const bad = [];
        if (huntStats && huntStats.mean > LIMITS.gameMeanMs) bad.push(`игра ${huntStats.mean} > ${LIMITS.gameMeanMs} мс`);
        if (huntStats && huntStats.p95 > LIMITS.gameP95Ms) bad.push(`p95 ${huntStats.p95} > ${LIMITS.gameP95Ms} мс`);
        if (huntCalls > LIMITS.drawsAdded) bad.push(`вызовов +${huntCalls | 0} > ${LIMITS.drawsAdded}`);
        if (after.prog - before.snap.prog > LIMITS.newPrograms) bad.push(`новых шейдерных программ: ${after.prog - before.snap.prog}`);
        if (after.geo - before.snap.geo > LIMITS.newGeometries) bad.push(`геометрий +${after.geo - before.snap.geo}`);
        if (after.tex - before.snap.tex > LIMITS.newTextures) bad.push(`текстур +${after.tex - before.snap.tex}`);
        if (bad.length) { console.log('ПРОВАЛ: ' + bad.join('; ')); failed = true; } else console.log('проверка пройдена');
    }
    const real = errors.filter((e) => !/ERR_TUNNEL|ERR_NAME_NOT_RESOLVED|XNNPACK|Web Speech|AudioContext|Failed to load resource/.test(e));
    if (real.length) console.log('ошибки страницы:\n  ' + real.slice(0, 8).join('\n  '));
} finally {
    await browser.close();
    srv.stop?.();
    srv.proc?.kill?.();
}
process.exit(failed ? 1 : 0);
