#!/usr/bin/env node
/**
 * flightbench.mjs — a repeatable measurement of the game's smoothness in flight
 * over the new world (generation 5). Run:  node tools/flightbench.mjs [options]
 *
 *   --levels high,max   graphics presets to measure (high: quality «Высокая» + view «Высокая»;
 *                       max: quality «Высокая» + view «Максимальная»)
 *   --seed 20261015     the world's seed (the same world every run)
 *   --out file.json     save the numbers (and print a table)
 *   --check             fail (exit code 1) when the flight is not smooth (LIMITS below)
 *   --profile           also record a CPU profile of the max run (scratch/flight.cpuprofile)
 *   --size 640x360      the window (small: here the picture is drawn by the processor)
 *
 * The route (the same every run, real flight speed 26 m/s, the player's own flight):
 *   1. «прямой»   — straight fast flight away from spawn;
 *   2. «разворот» — a U-turn (the world behind loads again);
 *   3. «замок»    — to the nearest castle with its village, and a circle round it;
 *   4. «горы»     — to the highest mountain about and over it.
 *
 * Numbers per part and for the whole flight: average FPS, the 1 % worst frames
 * (their average FPS), the longest frame, how many frames took longer than 33 ms.
 * Two kinds of time are counted: «кадр» — the real gap between frames (here the
 * picture is drawn by the processor, SwiftShader, so it is far slower than on a
 * video card), and «процессор» — the game's own work in a frame (logic, world
 * building, preparing the drawing): the part that makes a strong computer stutter.
 */
import { startServer, launch, openPage, sleep, ROOT } from '../tests/e2e/harness.mjs';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const LEVELS = opt('levels', 'high,max').split(',');
const SEED = parseInt(opt('seed', '20261015'), 10);
const OUT = opt('out', null);
const PROFILE = args.includes('--profile');
const CHECK = args.includes('--check');
/** --check: what a flight must keep (the game's own work in a frame; no shader made in flight). */
const LIMITS = { gameMaxMs: 50, gameOver33Share: 0.01, gameLow1Fps: 30, newShaders: 0 };
const [W, H] = opt('size', '640x360').split('x').map(Number);
const PRESETS = { high: { graphics: '3', viewDistance: 'high' }, max: { graphics: '3', viewDistance: 'max' } };

/** Runs in the page: fly the route, record every frame. */
async function flyRoute() {
    const g = window.__zns.game;
    const ch = g.character;
    const data = g.terrain.data;
    const SPEED = 26; // m/s (FLIGHT.MAX_SPEED)
    const frames = [];
    let seg = 'взлёт';
    // targets: the nearest castle beyond 250 m, the highest ground within ~1.2 km
    const p0 = ch.group.position.clone();
    const castles = (data.castles?.near?.(p0.x, p0.z, 1500) || []).filter((c) => Math.hypot(c.x - p0.x, c.z - p0.z) > 250)
        .sort((a, b) => Math.hypot(a.x - p0.x, a.z - p0.z) - Math.hypot(b.x - p0.x, b.z - p0.z));
    const castle = castles[0] || { x: p0.x - 600, z: p0.z + 300 };
    let peak = { x: p0.x, z: p0.z + 800, h: -1 };
    for (let z = -1200; z <= 1200; z += 40) for (let x = -1200; x <= 1200; x += 40) {
        const h = data.heightAt(Math.round(p0.x + x), Math.round(p0.z + z)); // (the height alone: no chunk is made)
        if (h > peak.h) peak = { x: p0.x + x, z: p0.z + z, h };
    }
    const segs = [];
    // flight state
    let yaw = 0; // facing -z at yaw 0 (forward = (-sin, -cos))
    const face = (tx, tz) => Math.atan2(-(tx - ch.group.position.x), -(tz - ch.group.position.z));
    const turnTo = (target, rate, dt) => { let d = target - yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); yaw += Math.max(-rate * dt, Math.min(rate * dt, d)); return Math.abs(d); };
    let phase = 0, phaseT = 0, circleA = 0, startYaw = 0;
    const plan = [
        { name: 'прямой', time: 22 },
        { name: 'разворот', time: 7 },
        { name: 'замок', time: 32 },
        { name: 'горы', time: 30 },
    ];
    const origFlight = g._updateFlight.bind(g);
    let last = performance.now();
    let done = false;
    g._updateFlight = function (dt, pose) {
        const f = g.flight;
        if (f.active && !done) { f.state = 'cruise'; f.t = 5; f.speed = SPEED; f.pitch = 0; f.hovering = false; } // (no camera here: the route flies)
        origFlight(dt, pose);
        if (!f.active || done) return;
        const p = ch.group.position;
        p.copy(at); // (the route, not the flight's own step)
        const now = performance.now();
        const step = Math.min(0.1, (now - last) / 1000); last = now;
        const P = plan[phase];
        if (!P) { done = true; return; }
        seg = P.name;
        phaseT += step;
        if (P.name === 'прямой') { /* keep yaw */ }
        else if (P.name === 'разворот') yaw = startYaw + Math.PI * Math.min(1, phaseT / P.time);
        else if (P.name === 'замок') {
            const d = Math.hypot(castle.x - p.x, castle.z - p.z);
            if (d > 70 && circleA === 0) turnTo(face(castle.x, castle.z), 1.2, step);
            else { circleA += step; yaw += step * SPEED / 70; } // round the castle at 70 m
        } else if (P.name === 'горы') turnTo(face(peak.x, peak.z), 1.2, step);
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
        p.x += fx * SPEED * step; p.z += fz * SPEED * step;
        // terrain following: 18 m over the highest ground just ahead
        let gy = -1e9;
        for (const a of [0, 10, 25, 45]) gy = Math.max(gy, g.collision.groundY(p.x + fx * a, p.z + fz * a));
        const want = Math.min(105, gy + 18);
        p.y += (want - p.y) * Math.min(1, step * 1.5);
        if (p.y < gy + 4) p.y = gy + 4;
        g.smoothBody = yaw; g.cameraBaseRotation = yaw; ch.setBodyRotation(yaw);
        at.copy(p);
        if (phaseT >= P.time) { segs.push({ name: P.name, x: Math.round(p.x), z: Math.round(p.z) }); phase++; phaseT = 0; circleA = 0; startYaw = yaw; }
    };
    // what inside a frame takes the time (inclusive ms per frame)
    const sub = {};
    const undo = [];
    const wrap = (obj, fn, name) => {
        if (!obj || typeof obj[fn] !== 'function') return;
        const orig = obj[fn];
        obj[fn] = function (...a) { const t = performance.now(); try { return orig.apply(this, a); } finally { sub[name] = (sub[name] || 0) + performance.now() - t; } };
        undo.push(() => { obj[fn] = orig; });
    };
    const t = g.terrain;
    wrap(t, 'update', 'земля:всего');
    wrap(t.data, '_generateChunk', 'земля:генерация');
    wrap(t, '_build', 'земля:меш');
    wrap(t.flora, 'update', 'трава');
    wrap(g.seaSurface, 'update', 'море');
    wrap(g.world.sky, 'update', 'небо');
    wrap(g.renderer.shadowMap, 'render', 'тени');
    wrap(g.hud, 'drawMinimap', 'миникарта');
    wrap(g.world, 'followShadow', 'тени:коробка');
    wrap(g.world, 'setDayPhase', 'день/ночь');
    wrap(g.swim, 'applyFog', 'туман воды');
    wrap(g.falling, 'update', 'падающие блоки');
    wrap(g.destruction, 'update', 'разрушение');
    wrap(g.circleAttack, 'update', 'circleAttack');
    wrap(g.inspirius, 'update', 'inspirius');
    for (const k of ['castleLife', 'travelers', 'carriages', 'animals', 'dragons', 'ships', 'fx', 'livingTrees', 'phoenixes', 'spiders', 'houses', 'campfires', 'fire', 'items', 'weapons', 'duel', 'storm', 'sun']) wrap(g[k], 'update', k);
    // record frames
    const origFrame = g.frame.bind(g);
    let prev = null;
    const newProgs = [];
    let nProg = g.renderer.info.programs.length;
    let nSeen = window.__compiled.length;
    g.frame = function () {
        for (const k in sub) sub[k] = 0;
        const heapBefore = performance.memory ? performance.memory.usedJSHeapSize : 0;
        const t0 = performance.now();
        origFrame();
        const t1 = performance.now();
        const progs = g.renderer.info.programs;
        const lastProgs = newProgs.length;
        if (progs.length > nProg) { for (let i = nProg; i < progs.length; i++) {
            // (what is new about it: the settings that differ from the closest program already built)
            const A = String(progs[i].cacheKey).split(',');
            let best = null;
            for (let j = 0; j < i; j++) {
                if (progs[j].name !== progs[i].name) continue;
                const B = String(progs[j].cacheKey).split(',');
                const d = A.map((x, k) => (x !== B[k] ? `${k}:${x.slice(0, 40)}` : null)).filter(Boolean);
                if (!best || d.length < best.length) best = d;
            }
            newProgs.push(`${seg} ${(t1 - t0).toFixed(0)}мс ${progs[i].name} [${(best || ['новый вид']).slice(0, 6).join(' ')}]`);
        }
        if (window.__compiled.length > nSeen && newProgs.length > lastProgs) {
            // (the objects using the new materials: their top group's name, so the thing can be found)
            const mats = new Set(window.__compiled.slice(nSeen));
            nSeen = window.__compiled.length;
            const who = [];
            g.scene.traverse((o) => {
                if (!o.material || who.length > 6) return;
                for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (mats.has(m)) {
                    const path = [];
                    let top = o;
                    while (top.parent && top.parent !== g.scene) top = top.parent;
                    for (let q = o; q && q !== g.scene && path.length < 3; q = q.parent) path.push(q.name || q.type);
                    path.push('… ' + (top.name || Object.keys(top.userData || {}).slice(0, 3).join('/') || top.type) + ` (${top.children.length} частей)`);
                    who.push(`${m.type}${m.name ? '(' + m.name + ')' : ''} ← ${path.join(' < ')}`);
                }
            });
            if (who.length) newProgs.push(`   кто: ${who.join(' | ')}`);
        }
        nProg = progs.length; }
        nSeen = window.__compiled.length;
        if (prev != null && !done && g.flight.active) {
            const parts = {};
            for (const k in g._parts) parts[k] = +g._parts[k].toFixed(2);
            for (const k in sub) if (sub[k] > 0.05) parts[k] = +sub[k].toFixed(2);
            // «игра»: the frame's work without handing the picture to the video card (here a slow software
            // one, whose waits land in «графика» — on a real card they don't): logic, the world, creatures
            // (the memory the page holds dropped during the frame: the browser cleaned up — garbage collection)
            const heap = performance.memory ? performance.memory.usedJSHeapSize : 0;
            if (heapBefore && heap < heapBefore - 4e6) parts['уборка памяти, МБ'] = +((heapBefore - heap) / 1e6).toFixed(0);
            frames.push({ seg, gap: +(t0 - prev).toFixed(2), cpu: +(t1 - t0).toFixed(2), game: +(t1 - t0 - (g._parts['графика'] || 0)).toFixed(2), parts });
        }
        prev = t0;
    };
    const warmAtTakeoff = { circle: !!g.circleAttack?._warmed, inspirius: !!g.inspirius?._warmed, programs: g.renderer.info.programs.length };
    g.startFlight(true);
    ch.group.position.y += 20;
    const at = ch.group.position.clone();
    const t0 = performance.now();
    while (!done && performance.now() - t0 < 420000) await new Promise((r) => setTimeout(r, 250));
    g._updateFlight = origFlight;
    g.frame = origFrame;
    for (const u of undo) u();
    const info = g.renderer.info;
    return {
        frames, segs, newProgs, warmAtTakeoff, prewarmed: g.prewarmedPrograms, castle: { x: castle.x, z: castle.z }, peak,
        terrain: { ...g.terrain.stats, meshes: g.terrain.meshes.size, chunks: data.chunks.size, queue: g.terrain._queue.length },
        render: { calls: info.render.calls, triangles: info.render.triangles, programs: info.programs.length, geometries: info.memory.geometries, textures: info.memory.textures },
    };
}

function metrics(frames, key) {
    const v = frames.map((f) => f[key]);
    const n = v.length;
    if (!n) return null;
    const sum = v.reduce((a, b) => a + b, 0);
    const sorted = v.slice().sort((a, b) => b - a);
    const worst = sorted.slice(0, Math.max(1, Math.round(n / 100)));
    const worstAvg = worst.reduce((a, b) => a + b, 0) / worst.length;
    return {
        frames: n,
        fps: +(1000 * n / sum).toFixed(1),
        low1: +(1000 / worstAvg).toFixed(1), // the 1 % worst frames, as FPS
        p50: +sorted[Math.floor(n / 2)].toFixed(1),
        max: +sorted[0].toFixed(1),
        over33: v.filter((x) => x > 33.3).length,
        over50: v.filter((x) => x > 50).length,
    };
}

function partsAvg(frames) {
    const s = {}, mx = {};
    for (const f of frames) for (const k in f.parts) { s[k] = (s[k] || 0) + f.parts[k]; mx[k] = Math.max(mx[k] || 0, f.parts[k]); }
    const out = {};
    for (const k in s) out[k] = `${(s[k] / frames.length).toFixed(1)}/${mx[k].toFixed(0)}`;
    return out;
}

async function runLevel(browser, url, level) {
    const { page, errors } = await openPage(browser, url, { noCamera: true, viewport: { width: W, height: H } });
    // the same random choices every run (people's walks, sparks…)
    await page.evaluate(() => {
        let s = 0x2545F491;
        Math.random = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    });
    const P = PRESETS[level];
    await page.evaluate(({ P, SEED }) => {
        for (const [id, v] of [['graphics-quality', P.graphics], ['view-distance', P.viewDistance]]) { const el = document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event('change')); } }
        const z = window.__zns;
        // which things need a shader that was not ready (a material's first compile is noted, with
        // the objects using it — every material, the same way, so the shaders stay the ones the game makes)
        const seen = window.__compiled = [];
        z.THREE.Material.prototype.onBeforeCompile = function () { seen.push(this); };
        z.startGame({ ...z.readConfig(), mode: 'creative', map: null, seed: SEED, zombieCount: 0, graphics: P.graphics, viewDistance: P.viewDistance });
    }, { P, SEED });
    await page.waitForFunction(() => window.__zns.game && window.__zns.game.active, null, { timeout: 180000 });
    await page.waitForFunction(() => !document.getElementById('hud').classList.contains('hidden'), null, { timeout: 120000 });
    await sleep(4000); // (the first frames: shaders of what is on screen)
    // (Circle Attack and Inspirius compile their looks a couple of game seconds after the start, on the
    // ground; here the frames are slow, so wait for that before taking off — in a real game it is long done)
    for (let i = 0; i < 480; i++) {
        const st = await page.evaluate(() => { const g = window.__zns.game; const c = typeof g.circleAttack?._warm === 'function' ? g.circleAttack : null, n = typeof g.inspirius?._warm === 'function' ? g.inspirius : null; /* (an older game has no warm-up) */ return { ok: (!c || !!c._warmed) && (!n || !!n._warmed), sound: (!c || !!c._soundReady) && (!n || !!n._soundsReady), frames: g.frameCount }; });
        if (st.ok && st.sound) break; // (their sounds: made a few ms a frame — here, with slow frames, it takes a while)
        if (i % 40 === 39) console.log('  (ждём прогрев эффектов…)', JSON.stringify(st));
        await sleep(500);
    }
    await sleep(1500);
    let cdp = null;
    if (PROFILE && level === LEVELS[LEVELS.length - 1]) {
        cdp = await page.context().newCDPSession(page);
        await cdp.send('Profiler.enable');
        await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
        await cdp.send('Profiler.start');
    }
    const r = await page.evaluate(flyRoute);
    if (cdp) {
        const { profile } = await cdp.send('Profiler.stop');
        const out = path.join(ROOT, 'tools', 'flight.cpuprofile');
        fs.writeFileSync(out, JSON.stringify(profile));
        console.log('profile:', out);
    }
    const res = { level, warmAtTakeoff: r.warmAtTakeoff, newProgs: r.newProgs, prewarmed: r.prewarmed, route: r.segs, castle: r.castle, peak: r.peak, terrain: r.terrain, render: r.render, total: {}, segs: {} };
    res.total = { frame: metrics(r.frames, 'gap'), cpu: metrics(r.frames, 'cpu'), game: metrics(r.frames, 'game'), parts: partsAvg(r.frames) };
    for (const s of ['прямой', 'разворот', 'замок', 'горы']) {
        const f = r.frames.filter((x) => x.seg === s);
        res.segs[s] = { frame: metrics(f, 'gap'), cpu: metrics(f, 'cpu'), game: metrics(f, 'game'), parts: partsAvg(f) };
    }
    // the slowest frames and what was heaviest in each
    res.spikes = r.frames.slice().sort((a, b) => b.cpu - a.cpu).slice(0, 12).map((f) => `${f.cpu.toFixed(0)}мс ${f.seg}: ` + Object.entries(f.parts).filter(([k]) => k !== 'земля:всего').sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${v.toFixed(0)}`).join(', '));
    res.culprits = {};
    for (const f of r.frames) if (f.cpu > 33.3) {
        let best = null;
        for (const [k, v] of Object.entries(f.parts)) if (!/^(игрок|магия и оружие|зомби|мультиплеер|мир|прочее|земля:всего)$/.test(k) && (!best || v > best[1])) best = [k, v];
        if (best) res.culprits[best[0]] = (res.culprits[best[0]] || 0) + 1;
    }
    res.errors = errors.filter((e) => !/AudioContext|favicon|ERR_|WebGL|GPU stall|GL Driver/i.test(e)).slice(0, 5);
    await page.close();
    return res;
}

function table(results) {
    const row = (name, m) => m ? `${name.padEnd(10)} ${String(m.fps).padStart(6)} ${String(m.low1).padStart(7)} ${String(m.max).padStart(8)} ${String(m.over33).padStart(6)} ${String(m.frames).padStart(7)}` : `${name} —`;
    for (const r of results) {
        console.log(`\n=== ${r.level}  (замок ${r.castle.x},${r.castle.z}; вершина ${r.peak.x},${r.peak.z} h${r.peak.h})`);
        for (const kind of ['frame', 'cpu', 'game']) {
            console.log(`  ${{ frame: 'КАДР (с рисованием процессором)', cpu: 'ПРОЦЕССОР (работа игры за кадр, с подготовкой рисования)', game: 'ИГРА (логика, мир, существа — без рисования)' }[kind]}`);
            console.log(`  ${'часть'.padEnd(10)} ${'FPS'.padStart(6)} ${'1%худш'.padStart(7)} ${'макс,мс'.padStart(8)} ${'>33мс'.padStart(6)} ${'кадров'.padStart(7)}`);
            console.log('  ' + row('весь полёт', r.total[kind]));
            for (const s in r.segs) console.log('  ' + row(s, r.segs[s][kind]));
        }
        console.log('  части кадра (сред/макс мс):', JSON.stringify(r.total.parts));
        console.log('  самые долгие кадры:\n    ' + r.spikes.join('\n    '));
        console.log(`  шейдеры: прогрето ${r.prewarmed}, при взлёте ${JSON.stringify(r.warmAtTakeoff)}, в полёте новых ${r.newProgs.length}: ` + r.newProgs.slice(0, 12).join('; '));
        console.log('  кто виноват в кадрах >33мс:', JSON.stringify(r.culprits));
        console.log('  мир:', JSON.stringify(r.terrain), ' графика:', JSON.stringify(r.render));
        if (r.errors.length) console.log('  ошибки:', r.errors);
    }
}

const port = 8700 + Math.floor(Math.random() * 200);
const srv = await startServer(port);
const browser = await launch({ extraArgs: ['--enable-precise-memory-info'] }); // (to see the browser's clean-ups)
const results = [];
try {
    for (const level of LEVELS) {
        console.log('полёт:', level, '…');
        results.push(await runLevel(browser, srv.url, level));
    }
} finally {
    await browser.close();
    srv.stop();
}
table(results);
if (OUT) { fs.writeFileSync(OUT, JSON.stringify(results, null, 1)); console.log('\nsaved:', OUT); }
if (CHECK) {
    const bad = [];
    for (const r of results) {
        const m = r.total.game;
        if (!m) { bad.push(`${r.level}: полёт не записан`); continue; }
        if (m.max > LIMITS.gameMaxMs) bad.push(`${r.level}: самый долгий кадр игры ${m.max} мс > ${LIMITS.gameMaxMs}`);
        if (m.over33 > m.frames * LIMITS.gameOver33Share) bad.push(`${r.level}: кадров игры дольше 33 мс — ${m.over33} из ${m.frames}`);
        if (m.low1 < LIMITS.gameLow1Fps) bad.push(`${r.level}: 1% худших кадров игры ${m.low1} FPS < ${LIMITS.gameLow1Fps}`);
        const shaders = r.newProgs.filter((x) => !x.startsWith('   ')).length;
        if (shaders > LIMITS.newShaders) bad.push(`${r.level}: в полёте собрано шейдеров: ${shaders}`);
        if (r.errors.length) bad.push(`${r.level}: ошибки: ${r.errors.join('; ')}`);
    }
    console.log(bad.length ? '\nПРОВЕРКА НЕ ПРОЙДЕНА:\n  ' + bad.join('\n  ') : '\nПРОВЕРКА ПРОЙДЕНА');
    process.exitCode = bad.length ? 1 : 0;
}
