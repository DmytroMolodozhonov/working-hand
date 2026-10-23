#!/usr/bin/env node
/**
 * monsterbench.mjs — «Пентаграмма страшного монстра» in the real game: a frame of the monster form in a village.
 *   node tools/monsterbench.mjs [--frames 150] [--site village|castle] [--shots docs/monster] [--seed 20261015]
 *
 * Creative, the same world every run; the hero is put by the nearest village (or castle), its land and people made.
 * Parts: «человек» (standing, then walking into the village as a man), «превращение» (5 s), «монстр стоит»,
 * «монстр идёт» (through the houses at the monster's run: 25 m/s — what its body breaks, the falls), «удары» (a fist
 * into a wall, every 10 frames). Per part: the game's own work in a frame (ms: mean / p95 / max) at 60 FPS time, draw
 * calls, triangles; the blocks broken, the falls; shaders compiled after the start (must be 0). Pictures with --shots.
 */
import { startServer, launch, openPage, sleep } from '../tests/e2e/harness.mjs';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const SEED = parseInt(opt('seed', '20261015'), 10);
const FRAMES = parseInt(opt('frames', '150'), 10);
const SITE = opt('site', 'village');
const SHOTS = opt('shots', null);
const BOOST = opt('boost', null); // (MonsterForm.MONSTER.VIEW_BOOST for this run: how far the monster sees — its price)

const port = 8700 + Math.floor(Math.random() * 200);
const srv = await startServer(port);
const browser = await launch();
try {
    const { page } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 640, height: 360 } });
    page.on('pageerror', (e) => console.error('page error:', e.message));
    await page.evaluate(({ SEED }) => {
        const z = window.__zns;
        z.startGame({ ...z.readConfig(), mode: 'creative', map: null, seed: SEED, zombieCount: 0, graphics: '3', viewDistance: 'high' });
    }, { SEED });
    await page.waitForFunction(() => window.__zns.game && window.__zns.game.active, null, { timeout: 180000 });
    await page.waitForFunction(() => !document.getElementById('hud').classList.contains('hidden'), null, { timeout: 120000 });
    await sleep(3000);
    const where = await page.evaluate(({ SITE }) => {
        const g = window.__zns.game, data = g.terrain.data, p0 = g.character.group.position.clone();
        let site = SITE === 'village' ? data.villages?.spawnVillage?.() : (data.castles?.near?.(p0.x, p0.z, 1500) || [])[0];
        if (!site) return null;
        const x = site.x + 46, z = site.z + 46;
        const y = g.collision.groundY(x, z);
        g.character.group.position.set(x, (Number.isFinite(y) ? y : 20) + 2.1, z);
        // facing the village's middle
        const yaw = Math.atan2(-(site.x - x), -(site.z - z));
        g.smoothBody = yaw; g.cameraBaseRotation = yaw; g.character.setBodyRotation(yaw);
        return { id: site.id, x: site.x, z: site.z, kind: site.kind || SITE };
    }, { SITE });
    if (!where) { console.log('no such place'); process.exit(1); }
    console.log('place:', JSON.stringify(where));
    for (let i = 0; i < 60; i++) {
        const ok = await page.evaluate(() => { const g = window.__zns.game, p = g.character.group.position; return g.terrain.data.landMade(Math.round(p.x), Math.round(p.z)) && [...(g.castleLife?.castles?.values?.() || [])].some((c) => c.awake && c.active.size > 0); });
        if (ok) break;
        await sleep(2000);
    }
    await sleep(4000);
    const shot = async (name) => {
        if (!SHOTS) return;
        fs.mkdirSync(SHOTS, { recursive: true });
        await page.evaluate(() => { const g = window.__zns.game; g.lastTime = performance.now() - 16; g.frame(); });
        await page.screenshot({ path: path.join(SHOTS, `monster-game-${name}.png`) });
        console.log('saved', path.join(SHOTS, `monster-game-${name}.png`));
    };
    if (SHOTS) {
        await page.evaluate(() => { const g = window.__zns.game; g.cameraMode = 'third'; });
        await shot('man');
    }
    const res = await page.evaluate(async ({ FRAMES, BOOST }) => {
        const g = window.__zns.game, ch = g.character;
        if (BOOST != null) (await import('/src/game/MonsterForm.js')).MONSTER.VIEW_BOOST = +BOOST;
        const plan = [['человек', FRAMES], ['превращение', 330], ['монстр стоит', FRAMES], ['монстр идёт', FRAMES], ['удары', FRAMES]];
        const rows = [];
        let seg = 0, n = 0, done = false;
        const nProg0 = g.renderer.info.programs.length;
        const yaw0 = ch.group.rotation.y;
        let edits = 0, falls = 0;
        const se = g.builder._sendEdits.bind(g.builder);
        g.builder._sendEdits = (e, s) => { edits += e.length; return se(e, s); };
        const fl = g._collapsed?.bind(g);
        if (fl) g._collapsed = (f) => { falls += f?.length || 0; return fl(f); };
        const orig = g.frame.bind(g);
        g.frame = function () {
            const [name] = plan[seg] || [];
            if (!done) {
                if (name === 'человек' && n > FRAMES / 2) { ch.group.position.x -= Math.sin(yaw0) * 0.09; ch.group.position.z -= Math.cos(yaw0) * 0.09; }
                if (name === 'превращение' && n === 0) g.monster.begin({ free: true });
                if (name === 'монстр идёт') { ch.setRunning(true, 1); }
                if (name === 'удары' && n === 0) ch.setRunning(false);
                if (name === 'удары' && n % 10 === 0) {
                    // a fist straight ahead at chest height, the speed of a hard blow — into whatever is there
                    const at = ch.getHandWorldPosition('right', new ch.group.position.constructor());
                    g.monster._punchBlocks(at, new ch.group.position.constructor(-Math.sin(ch.group.rotation.y), 0, -Math.cos(ch.group.rotation.y)), 1, true);
                }
            }
            const t0 = performance.now();
            g.lastTime = t0 - 1000 / 60;
            orig();
            const t1 = performance.now();
            if (!done) {
                const info = g.renderer.info.render;
                rows.push({ seg: name, game: t1 - t0 - (g._parts?.['графика'] || 0), cpu: t1 - t0, calls: info.calls, tris: info.triangles });
                if (++n >= plan[seg][1]) { n = 0; seg++; if (seg >= plan.length) done = true; }
            }
        };
        const T0 = performance.now();
        while (!done && performance.now() - T0 < 900000) await new Promise((r) => setTimeout(r, 200));
        g.frame = orig;
        ch.setRunning(false);
        const st = (v) => { v = v.slice().sort((a, b) => a - b); const m = v.reduce((a, b) => a + b, 0) / v.length; return { mean: +m.toFixed(2), p95: +v[Math.floor(v.length * 0.95)].toFixed(2), max: +v[v.length - 1].toFixed(2) }; };
        const out = {};
        for (const [name] of plan) {
            const r = rows.filter((x) => x.seg === name);
            out[name] = { game: st(r.map((x) => x.game)), calls: Math.round(r.reduce((a, x) => a + x.calls, 0) / r.length), tris: Math.round(r.reduce((a, x) => a + x.tris, 0) / r.length) };
        }
        return { parts: out, edits, falls, newShaders: g.renderer.info.programs.length - nProg0, size: ch.size, phase: g.monster.phase, eyes: +(ch.getHeadPosition(new ch.group.position.constructor()).y - (ch.group.position.y - 2 * ch.size)).toFixed(2) };
    }, { FRAMES, BOOST });
    for (const [k, v] of Object.entries(res.parts)) console.log(`${k.padEnd(14)} игра ${v.game.mean} / ${v.game.p95} / ${v.game.max} мс   вызовов ${v.calls}   треугольников ${v.tris}`);
    console.log(`блоков снято ${res.edits}, обрушений ${res.falls}, шейдеров после старта ${res.newShaders}, размер ×${res.size} (${res.phase}), глаза над ногами ${res.eyes} м`);
    if (SHOTS) {
        await page.evaluate(() => { const g = window.__zns.game; g.cameraMode = 'third'; });
        await shot('monster-third');
        await page.evaluate(() => { const g = window.__zns.game; g.cameraMode = 'fpv'; });
        await shot('monster-eyes');
    }
} finally {
    await browser.close();
    srv.stop?.();
    srv.proc?.kill?.();
}
process.exit(0);
