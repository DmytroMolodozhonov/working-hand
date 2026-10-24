#!/usr/bin/env node
/**
 * duelbench.mjs — the Creative duel-only start («Перед дуэлью на арене»), run in the real game and measured.
 *   node tools/duelbench.mjs [--seed 7] [--seconds 40] [--foe mid|weak|strong|master]
 * Shows: that the hero stands on his mark facing the wizard (yaw), the stands (fans), the wizard's first spell, the 5 s
 * on the spot, the frame's work per system (JS, without the drawing; no video card in the container) and the draw calls.
 */
import { startServer, launch, openPage, sleep } from '../tests/e2e/harness.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const SEED = parseInt(opt('seed', '7'), 10), SECONDS = parseInt(opt('seconds', '40'), 10), FOE = opt('foe', 'mid');

const port = 8900 + Math.floor(Math.random() * 100);
const srv = await startServer(port);
const browser = await launch({ extraArgs: ['--enable-precise-memory-info'] });
try {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 480, height: 270 } });
    await page.evaluate(({ SEED, FOE }) => {
        const z = window.__zns;
        z.startGame({ ...z.readConfig(), mode: 'creative', map: null, seed: SEED, zombieCount: 0, hero: { spawn: 'arena', foe: FOE, infiniteMana: false, cells: 200, health: 'normal', maxHp: 20, duelPower: 2 } });
    }, { SEED, FOE });
    await page.waitForFunction(() => window.__zns.game && window.__zns.game.active, null, { timeout: 180000 });
    // the arena: the hero is carried there (the world's land is made by the workers), then the duel is made
    const t0 = Date.now();
    let started = false;
    for (let i = 0; i < 240 && !started; i++) {
        started = await page.evaluate(() => { const A = window.__zns.game.arenaDuels; return !!(A?.mode && [...A.list.values()].some((a) => a.duel)); });
        if (!started) await sleep(1000);
    }
    console.log(started ? `дуэль началась через ${((Date.now() - t0) / 1000).toFixed(0)} с после старта игры` : 'дуэль НЕ началась за 4 минуты');
    if (!started) { console.log('состояние:', JSON.stringify(await page.evaluate(() => { const g = window.__zns.game, p = g.character.group.position; return { pos: [p.x, p.y, p.z].map(Math.round), pending: !!g.heroApply?.pending, id: g.heroApply?.pending?.id, mode: !!g.arenaDuels?.mode, arenas: g.arenaDuels?.list.size, big: g.terrain.data.sites?.arenas?.d?.W }; }))); }
    else {
        // measure: the frame's own work per system + what the duel looks like
        const res = await page.evaluate(async (SECONDS) => {
            const g = window.__zns.game, A = [...g.arenaDuels.list.values()].find((a) => a.duel), ch = g.character;
            const out = { checks: [], frames: [] };
            const sys = {}, undo = [];
            const wrap = (o, name) => { const f = o.update; o.update = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { sys[name] = (sys[name] || 0) + performance.now() - t; } }; undo.push(() => { o.update = f; }); };
            for (const k of Object.keys(g)) { const o = g[k]; if (o && typeof o === 'object' && !o.isObject3D && o !== g && typeof o.update === 'function') wrap(o, k); }
            const orig = g.frame.bind(g); let n = 0;
            g.frame = function () { const t = performance.now(); g.lastTime = t - 1000 / 60; orig(); const info = g.renderer.info.render; out.frames.push({ ms: performance.now() - t - (g._parts['графика'] || 0), calls: info.calls, tris: info.triangles }); n++; };
            const t0 = performance.now();
            const foe = () => A.duel?.a;
            const yawTo = () => { const f = foe(); if (!f) return null; const p = ch.group.position; const want = Math.atan2(-(f.x - p.x), -(f.z - p.z)); let d = ch.group.rotation.y - want; d = Math.atan2(Math.sin(d), Math.cos(d)); return +(d * 180 / Math.PI).toFixed(1); };
            const snap = (label) => { const f = foe(), p = ch.group.position; out.checks.push({ t: +((performance.now() - t0) / 1000).toFixed(1), label, phase: A.duel?.phase, yawErrDeg: yawTo(), dist: f ? +Math.hypot(f.x - p.x, f.z - p.z).toFixed(1) : null, fans: A.fans.size, seated: [...A.fans].filter((v) => v.seated).length, foeMode: f?.mode, foeCast: f?.arena?.last, heroY: +p.y.toFixed(1), standing: !g.knock?.down }); };
            const x0 = ch.group.position.x, z0 = ch.group.position.z;
            for (let s = 0; s < SECONDS; s++) {
                snap('t'); 
                if (s === 2) { ch.group.position.x += 5; } // (try to walk away in the first 5 s: must be put back)
                await new Promise((r) => setTimeout(r, 1000));
            }
            g.frame = orig; for (const u of undo) u();
            const ms = out.frames.map((f) => f.ms).sort((a, b) => a - b);
            out.mean = +(ms.reduce((a, b) => a + b, 0) / ms.length).toFixed(2); out.p95 = +ms[Math.floor(ms.length * 0.95)].toFixed(2);
            out.calls = Math.round(out.frames.reduce((a, f) => a + f.calls, 0) / out.frames.length); out.tris = Math.round(out.frames.reduce((a, f) => a + f.tris, 0) / out.frames.length);
            out.systems = Object.entries(sys).map(([k, v]) => [k, +(v / Math.max(1, n)).toFixed(3)]).sort((a, b) => b[1] - a[1]).slice(0, 12);
            out.moved = [+(ch.group.position.x - x0).toFixed(1), +(ch.group.position.z - z0).toFixed(1)];
            out.log = g.spellLog?.text?.().split('\n').filter((l) => /⚔️|⚡|🏁/.test(l)).slice(0, 8);
            out.world = { chunks: g.terrain.meshes?.size, arenaR: A.def.axis.r, fogFar: g.scene.fog.far };
            return out;
        }, SECONDS);
        for (const c of res.checks.filter((_, i) => i % 3 === 0)) console.log(JSON.stringify(c));
        console.log('кадр (игра без рисования): среднее', res.mean, 'мс, p95', res.p95, 'мс; вызовов отрисовки', res.calls, ', треугольников', res.tris);
        console.log('системы мс/кадр:', res.systems.map(([k, v]) => `${k} ${v}`).join(', '));
        console.log('сдвиг героя за время:', res.moved, '· мир:', JSON.stringify(res.world));
        console.log('журнал:\n' + (res.log || []).join('\n'));
    }
    const bad = errors.filter((e) => !/favicon|Failed to load resource/.test(String(e)));
    if (bad.length) console.log('ошибки страницы:', bad.slice(0, 5));
} finally { await browser.close(); srv.stop?.(); process.exit(0); }
