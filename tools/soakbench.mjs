#!/usr/bin/env node
/**
 * soakbench.mjs — a long game played by itself, to find what piles up the longer one plays
 * (the author: «чем дольше играешь, тем больше FPS просаживается»). Run:
 *     node tools/soakbench.mjs [--minutes 15] [--every 30] [--out file.json] [--check]
 *
 * The same world every run (seed 20261015, Творческий, графика «Высокая»). Rounds of ~80 s,
 * again and again: a flight far over the world (a wide circle: the land ahead is made, the
 * land behind should go), a landing, then a fight on the ground — zombies come, spells are
 * cast at them (Bombardo, Inferno, Stupefy, Ice, Sands, Sapira, Thunderwave, Wind, Earthquake,
 * WallRise, Overgrown…), and the zombies die.
 *
 * --minutes are minutes of play (the game's own time). Every --every seconds (by the clock) a sample: FPS and the game's own work in a frame («игра», without
 * handing the picture to the video card — here the picture is drawn by the processor), the
 * video card's things (geometries, textures, shaders, draw calls), the objects in the scene
 * (and in which top group), the page's JS memory, and the size of EVERY array/Map/Set the game's
 * systems hold (two levels deep). At the end: what grew between the first and the last third.
 *
 * --space: each round also goes to space and back («Космос», Space.js): Flying Maxima out of the air, a
 * flight through space, then back into the Earth's air to a new place.
 *
 * --check: fail when something grows without end (scene objects, geometries, textures, shaders,
 * a collection over 500 that kept growing) or when the game's work in a frame grew by more than half.
 */
import { startServer, launch, openPage, sleep } from '../tests/e2e/harness.mjs';
import fs from 'node:fs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const MINUTES = parseFloat(opt('minutes', '15'));
const EVERY = parseFloat(opt('every', '30'));
const SEED = parseInt(opt('seed', '20261015'), 10);
const OUT = opt('out', null);
const CHECK = args.includes('--check');
const SPACE = args.includes('--space');
const [W, H] = opt('size', '480x270').split('x').map(Number);
/** Draw the picture only every N-th frame: here the processor draws it (seconds a frame), so without
 *  this the game itself would go 2–3 frames a second and 15 minutes would be 3 minutes of play. */
const RENDER_EVERY = parseInt(opt('render-every', '15'), 10);

/** In the page: the autopilot (the rounds) and the sampler. */
function install({ EVERY, RENDER_EVERY, SPACE }) {
    const g = window.__zns.game;
    const T = window.__zns.THREE;
    const ch = g.character;
    const S = window.__soak = { samples: [], frames: [], round: 0, phase: 'старт', casts: 0, errors: 0, gameTime: 0 };
    // ---- the frames: the gap and the game's own work (without the drawing)
    const origFrame = g.frame.bind(g);
    let prev = 0;
    g.frame = function () {
        const t0 = performance.now();
        try { origFrame(); } catch (e) { S.errors++; throw e; }
        const t1 = performance.now();
        if (prev) S.frames.push([t0 - prev, t1 - t0 - (g._parts?.['графика'] || 0), S.gameTime += Math.min(0.1, (t0 - prev) / 1000)]);
        prev = t0;
    };
    let nr = 0;
    const origRender = g.renderer.render.bind(g.renderer);
    g.renderer.render = function (scene, camera) { if (scene !== g.scene || ++nr % RENDER_EVERY === 0) return origRender(scene, camera); };
    // ---- the autopilot
    const home = ch.group.position.clone();
    let angle = 0, phaseT = 0, castT = 0, zT = 0;
    const R = 1400; // m: the flight's circle round the start
    const SPELLS = ['Bombardo', 'Inferno', 'Stupefy', 'Ice', 'Sands', 'Sapira', 'Thunderwave', 'Wind', 'Earthquake', 'WallRise', 'Overgrown', 'AvadaKedavra', 'BombardoMaxima', 'WindImpulse', 'Firefighting'];
    let si = 0;
    const plan = [{ name: 'полёт', time: 40 }, { name: 'бой', time: 40 }, ...(SPACE ? [{ name: 'космос', time: 50 }] : [])];
    let sp = null; // (the space round's own steps)
    const origFlight = g._updateFlight.bind(g);
    let pi = 0;
    const tick = (dt) => { // (the game's own time: the rounds last as long in play however slow the frames)
        const P = plan[pi];
        S.phase = P.name;
        phaseT += dt;
        if (P.name === 'космос') {
            const Sx = g.space;
            if (!sp) sp = { t: 0, step: 'out' };
            sp.t += dt;
            if (sp.step === 'out' && Sx.state === 'off' && Sx.realm === 'earth') {
                if (g.flight.active === false) g.startFlight(true);
                g.flight.state = 'cruise'; g.flight.t = 5;
                Sx.cast(true);
                sp.step = 'up';
            } else if (sp.step === 'up' && Sx.realm === 'space') { sp.step = 'fly'; sp.t = 0; }
            else if (sp.step === 'fly' && sp.t > 20) {
                // back: from close over the Earth, straight down into its air (a new place each round)
                const e = window.__planetPos(Sx.planets.get('earth'), Sx.now(), { x: 0, y: 0, z: 0 }, Sx.planets), R = Sx.planets.get('earth').radius;
                const a = S.round * 1.3;
                Sx.P.x = e.x + Math.cos(a) * 120; Sx.P.y = e.y + R + 400; Sx.P.z = e.z + Math.sin(a) * 120;
                Sx.O.x = Sx.P.x; Sx.O.y = Sx.P.y; Sx.O.z = Sx.P.z; Sx._exitDir = null;
                Sx.pitch = -1.4; Sx.speed = 300; Sx.vel.x = 0; Sx.vel.y = -300; Sx.vel.z = 0; g.flight.hovering = false;
                Sx._place();
                sp.step = 'down';
            }
            if (phaseT + dt >= P.time) {
                // (the round ends at home: wherever it got to)
                if (Sx.realm !== 'earth' || Sx.state !== 'off') { Sx.state = 'off'; ch.group.position.set(home.x, home.y + 20, home.z); }
                home.copy(ch.group.position); home.y = Math.max(home.y, g.collision.groundY(home.x, home.z) + 2);
                sp = null;
            }
        } else if (P.name === 'полёт') {
            if (!g.flight.active) g.startFlight(true);
            angle += dt * 26 / R;
            const p = ch.group.position;
            p.x = home.x + Math.sin(angle) * R; p.z = home.z + Math.cos(angle) * R - R;
            const gy = g.collision.groundY(p.x, p.z);
            p.y = Math.max(gy + 18, Math.min(105, gy + 18));
            const yaw = angle + Math.PI / 2;
            g.smoothBody = yaw; g.cameraBaseRotation = yaw; ch.setBodyRotation(yaw);
        } else {
            if (g.flight.active) g.flight.land('debug');
            // the fight: zombies near, a spell every 1.5 s at them, a new zombie every 4 s (at most 8)
            castT += dt; zT += dt;
            if (zT > 4 && g.zombies.length < 8) {
                zT = 0;
                const p = ch.group.position, a = Math.random() * Math.PI * 2;
                const zp = new T.Vector3(p.x + Math.sin(a) * 14, 0, p.z + Math.cos(a) * 14);
                zp.y = g.collision.groundY(zp.x, zp.z);
                try { g._createZombie(zp); } catch (e) { S.errors++; }
            }
            if (castT > 1.5) {
                castT = 0;
                const z = g.zombies[0];
                if (z) { // face it
                    const p = ch.group.position, q = z.group.position;
                    const yaw = Math.atan2(-(q.x - p.x), -(q.z - p.z));
                    g.smoothBody = yaw; g.cameraBaseRotation = yaw; ch.setBodyRotation(yaw);
                }
                const name = SPELLS[si++ % SPELLS.length];
                try { g.castDebug(name); S.casts++; } catch (e) { S.errors++; }
                try { g.stopSpells?.(); } catch (e) { /* */ }
            }
        }
        if (phaseT >= P.time) { phaseT = 0; pi = (pi + 1) % plan.length; if (pi === 0) S.round++; }
    };
    g._updateFlight = function (dt, pose) {
        const f = g.flight;
        if (f.active) { f.state = 'cruise'; f.t = 5; f.speed = 26; f.pitch = 0; f.hovering = false; }
        const at = ch.group.position.clone();
        origFlight(dt, pose);
        if (f.active) ch.group.position.copy(at);
    };
    const origPlayer = g._updatePlayer.bind(g);
    g._updatePlayer = function (dt) { origPlayer(dt); try { tick(dt); } catch (e) { S.errors++; console.warn('soak tick', e); } };
    // ---- the sampler
    const t0 = performance.now();
    const sizeOf = (v) => (Array.isArray(v) ? v.length : v instanceof Map || v instanceof Set ? v.size : -1);
    const sample = () => {
        const fr = S.frames.splice(0);
        const n = fr.length;
        const gapSum = fr.reduce((a, f) => a + f[0], 0), gameSum = fr.reduce((a, f) => a + f[1], 0);
        const games = fr.map((f) => f[1]).sort((a, b) => b - a);
        const info = g.renderer.info;
        let objects = 0;
        const groups = {};
        const geos = {}, seenGeo = new Set();
        for (const top of g.scene.children) {
            let c = 0, ng = 0;
            top.traverse((o) => { c++; if (o.geometry && !seenGeo.has(o.geometry)) { seenGeo.add(o.geometry); ng++; } });
            objects += c;
            // (an unnamed group: its first userData key or its shape — so the thing can be found)
            const key = top.name || Object.keys(top.userData || {})[0] || `${top.type}[${top.children.length}:${top.children[0]?.type || ''}${top.children[0]?.name ? ' ' + top.children[0].name : ''}]`;
            groups[key] = (groups[key] || 0) + c;
            geos[key] = (geos[key] || 0) + ng;
        }
        const coll = {};
        const seen = new Set();
        const scan = (obj, path, depth) => {
            if (!obj || typeof obj !== 'object' || seen.has(obj) || obj.isObject3D || obj.isMaterial || obj.isBufferGeometry || obj.isTexture) return;
            seen.add(obj);
            for (const k of Object.keys(obj)) {
                let v;
                try { v = obj[k]; } catch (e) { continue; }
                if (!v || typeof v !== 'object') continue;
                const s = sizeOf(v);
                if (s >= 0) { if (s > 0) coll[path + k] = s; if (depth > 0 && s > 0 && Array.isArray(v) && typeof v[0] === 'object') { /* (a list of things: not inside each) */ } continue; }
                if (depth > 0 && !(v instanceof Node) && !ArrayBuffer.isView(v)) scan(v, path + k + '.', depth - 1);
            }
        };
        scan(g, '', 2);
        S.samples.push({
            t: Math.round((performance.now() - t0) / 1000), gt: Math.round(S.gameTime), round: S.round, phase: S.phase,
            fps: n ? +(1000 * n / gapSum).toFixed(1) : 0,
            game: n ? +(gameSum / n).toFixed(2) : 0,
            game95: n ? +games[Math.floor(n * 0.05)].toFixed(1) : 0,
            frames: n, casts: S.casts, errors: S.errors,
            geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs.length,
            calls: info.render.calls, triangles: info.render.triangles,
            objects, groups, geos, heapMB: performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : 0,
            zombies: g.zombies.length, chunks: g.terrain?.data?.chunks?.size, meshes: g.terrain?.meshes?.size,
            coll,
        });
    };
    S.timer = setInterval(sample, EVERY * 1000);
}

const port = 8700 + Math.floor(Math.random() * 200);
const srv = await startServer(port);
const browser = await launch({ extraArgs: ['--enable-precise-memory-info', '--js-flags=--expose-gc'] });
let samples = [];
let errors = [];
try {
    const o = await openPage(browser, srv.url, { noCamera: true, viewport: { width: W, height: H } });
    const page = o.page;
    errors = o.errors;
    await page.evaluate(() => { let s = 0x2545F491; Math.random = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; });
    await page.evaluate(({ SEED }) => {
        for (const [id, v] of [['graphics-quality', '3'], ['view-distance', 'high']]) { const el = document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event('change')); } }
        const z = window.__zns;
        z.startGame({ ...z.readConfig(), mode: 'creative', map: null, seed: SEED, zombieCount: 0, graphics: '3', viewDistance: 'high' });
    }, { SEED });
    await page.waitForFunction(() => window.__zns.game && window.__zns.game.active, null, { timeout: 180000 });
    await page.waitForFunction(() => !document.getElementById('hud').classList.contains('hidden'), null, { timeout: 120000 });
    await sleep(3000);
    if (SPACE) await page.evaluate(async () => { const m = await import('/src/world/Planets.js'); window.__planetPos = m.planetPosition; });
    await page.evaluate(install, { EVERY, RENDER_EVERY, SPACE });
    // (minutes of PLAY: the game's own time; at most four times as long by the clock)
    const end = Date.now() + MINUTES * 4 * 60000;
    let shown = 0;
    while (Date.now() < end && !(samples.at(-1)?.gt >= MINUTES * 60)) {
        await sleep(5000);
        samples = await page.evaluate(() => window.__soak.samples);
        if (OUT) fs.writeFileSync(OUT, JSON.stringify({ samples, partial: true })); // (to look at while it runs)
        for (; shown < samples.length; shown++) {
            const s = samples[shown];
            console.log(`${String(s.t).padStart(5)}с (игры ${String(s.gt).padStart(4)}с) р${s.round} ${s.phase.padEnd(5)} FPS ${String(s.fps).padStart(5)} игра ${String(s.game).padStart(6)}мс (95% ${s.game95}) | объектов ${s.objects} геом ${s.geometries} текст ${s.textures} шейд ${s.programs} вызовов ${s.calls} | память ${s.heapMB} МБ | зомби ${s.zombies} чанков ${s.chunks}/${s.meshes} закл ${s.casts} ош ${s.errors}`);
        }
    }
    await page.close();
} finally {
    await browser.close();
    srv.stop();
}

// ---- what grew: the first third against the last third
const third = Math.max(1, Math.floor(samples.length / 3));
const A = samples.slice(0, third), B = samples.slice(-third);
const avg = (list, f) => list.reduce((a, s) => a + (f(s) || 0), 0) / Math.max(1, list.length);
const grow = [];
const keys = new Set();
for (const s of samples) for (const k in s.coll) keys.add(k);
for (const k of keys) {
    const a = avg(A, (s) => s.coll[k]), b = avg(B, (s) => s.coll[k]);
    const mono = samples.slice(third).every((s, i, arr) => i === 0 || (s.coll[k] || 0) >= (arr[i - 1].coll[k] || 0));
    if (b > a * 1.3 + 20) grow.push({ k, a: Math.round(a), b: Math.round(b), last: samples.at(-1)?.coll[k] || 0, mono });
}
grow.sort((x, y) => (y.b - y.a) - (x.b - x.a));
const groups = new Set();
for (const s of samples) for (const k in s.groups) groups.add(k);
const ggrow = [];
for (const k of groups) { const a = avg(A, (s) => s.groups[k]), b = avg(B, (s) => s.groups[k]); if (b > a * 1.2 + 10) ggrow.push(`${k}: ${Math.round(a)} → ${Math.round(b)}`); }
const geoGrow = [];
for (const k of groups) { const a = avg(A, (s) => s.geos?.[k]), b = avg(B, (s) => s.geos?.[k]); if (b > a * 1.2 + 10) geoGrow.push(`${k}: ${Math.round(a)} → ${Math.round(b)}`); }
const sum = (f) => `${avg(A, f).toFixed(1)} → ${avg(B, f).toFixed(1)}`;
console.log('\n=== первая треть → последняя треть');
for (const [name, f] of [['FPS', (s) => s.fps], ['игра, мс', (s) => s.game], ['игра 95%, мс', (s) => s.game95], ['объектов сцены', (s) => s.objects], ['геометрий', (s) => s.geometries], ['текстур', (s) => s.textures], ['шейдеров', (s) => s.programs], ['вызовов', (s) => s.calls], ['память, МБ', (s) => s.heapMB], ['чанков', (s) => s.chunks]]) console.log(`  ${name.padEnd(16)} ${sum(f)}`);
console.log('  растут группы сцены:', ggrow.join('; ') || '—');
console.log('  растут геометрии в группах сцены:', geoGrow.join('; ') || '—');
console.log('  растут коллекции:');
for (const x of grow.slice(0, 40)) console.log(`    ${x.k}: ${x.a} → ${x.b} (в конце ${x.last}${x.mono ? ', всё время растёт' : ''})`);
const errs = errors.filter((e) => !/AudioContext|favicon|ERR_|WebGL|GPU stall|GL Driver/i.test(e));
if (errs.length) console.log('  ошибки:', errs.slice(0, 8));
if (OUT) { fs.writeFileSync(OUT, JSON.stringify({ samples, grow, ggrow, errors: errs.slice(0, 50) }, null, 1)); console.log('saved:', OUT); }
if (CHECK) {
    const bad = [];
    const lastMinute = (f) => avg(B, f), first = (f) => avg(A, f);
    if (lastMinute((s) => s.game) > first((s) => s.game) * 1.5 + 2) bad.push(`работа игры за кадр выросла: ${sum((s) => s.game)} мс`);
    for (const [name, f, slack] of [['объектов сцены', (s) => s.objects, 400], ['геометрий', (s) => s.geometries, 150], ['текстур', (s) => s.textures, 40], ['шейдеров', (s) => s.programs, 5]]) if (lastMinute(f) > first(f) + slack) bad.push(`${name}: ${sum(f)}`);
    for (const x of grow) if (x.mono && x.last > 500) bad.push(`коллекция ${x.k} всё время растёт: ${x.a} → ${x.last}`);
    console.log(bad.length ? '\nПРОВЕРКА НЕ ПРОЙДЕНА:\n  ' + bad.join('\n  ') : '\nПРОВЕРКА ПРОЙДЕНА');
    process.exitCode = bad.length ? 1 : 0;
}
