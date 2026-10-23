#!/usr/bin/env node
/**
 * creativebench.mjs — the Creative start scene, measured (the author: «в Творческом раньше было ~75 FPS, теперь 50»).
 *   node tools/creativebench.mjs [--frames 120] [--seed 20261015] [--level high|max|ultra] [--check] [--profile] [--alloc]
 *
 * Creative, a fresh world (the same seed every run), the hero at the start: «стоим» (standing, looking ahead),
 * «оглядываемся» (a full turn round), «идём» (a walk on along the start's way), «стоим2» (standing there).
 * Per part and for the whole: the game's own work in a frame without the drawing («игра», ms: mean / p95 / max),
 * the whole frame's processor work («процессор», with preparing the picture — here drawn by the processor, so the
 * drawing's own time is NOT the video card's), draw calls, triangles; at the end the renderer's geometries,
 * textures, programs (shaders) and the shaders compiled after the start. The heaviest parts of the frame are listed.
 * The game's time runs as at 60 FPS (each frame is given 16.7 ms whatever it really took — the frames here are slow:
 * what is done «every 0.1 s» would run nearly every frame), so a frame's numbers are what it costs at 60 FPS.
 * In the container there is no video card: the numbers are the processor's (JS) work and the draw calls / triangles,
 * which a video card pays for — not its own time.
 */
import { startServer, launch, openPage, sleep, ROOT } from '../tests/e2e/harness.mjs';
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const SEED = parseInt(opt('seed', '20261015'), 10);
const FRAMES = parseInt(opt('frames', '120'), 10); // frames per part
const LEVEL = opt('level', 'high');
const OUT = opt('out', null);
const CHECK = args.includes('--check');
const PROFILE = args.includes('--profile');
const ALLOC = args.includes('--alloc');
const KEYS = args.includes('--keys'); // the full keys of the shaders compiled after the start (and of all prewarmed ones like them)
const OWNERS = args.includes('--owners'); // the scene's top things: how many, their parts, materials, a sample of names
const SCAN = args.includes('--scan'); // at the start: 16 directions — draws, triangles and who is drawn in each
const ABLATE = opt('ablate', null); // e.g. trees,villagers,animals,terrain: standing, each hidden in turn — its cost of drawing
/** --check: what the Creative start scene must keep (only tighten). */
const LIMITS = { gameMeanMs: 11, gameP95Ms: 20, calls: 650, triangles: 480000, newShaders: 0 }; // (23.10: 8.9 / 16.3 ms, ~600 calls, 425k triangles — before the fixes 11.6 ms and ~700 calls)
const [W, H] = opt('size', '480x270').split('x').map(Number);
const PRESETS = { high: { graphics: '3', viewDistance: 'high' }, max: { graphics: '3', viewDistance: 'max' }, ultra: { graphics: '3', viewDistance: 'high', ultra: 'on' } };

async function scene(FRAMES) {
    const g = window.__zns.game, ch = g.character;
    const frames = [];
    let seg = 'стоим', n = 0, done = false, prev = null;
    const start = ch.group.position.clone();
    let yaw = g.cameraBaseRotation || 0;
    const yaw0 = yaw;
    const setYaw = (y) => { yaw = y; g.smoothBody = y; g.cameraBaseRotation = y; ch.setBodyRotation(y); };
    const nProg0 = g.renderer.info.programs.length;
    let nSeen = window.__compiled?.length || 0;
    const newProgs = [];
    const origFrame = g.frame.bind(g);
    const plan = ['стоим', 'оглядываемся', 'идём', 'стоим2'];
    // each system's own update timed (the game's objects with an update(): who takes the frame's time)
    const sys = {}, undo = [];
    const wrap = (obj, fn, name) => {
        const orig = obj[fn];
        obj[fn] = function (...a) { const t = performance.now(); try { return orig.apply(this, a); } finally { sys[name] = (sys[name] || 0) + performance.now() - t; } };
        undo.push(() => { obj[fn] = orig; });
    };
    for (const k of Object.keys(g)) {
        const o = g[k];
        if (!o || typeof o !== 'object' || o === g || o.isObject3D) continue;
        if (typeof o.update === 'function') wrap(o, 'update', k);
        if (k === 'duel' && typeof o.updateVisuals === 'function') wrap(o, 'updateVisuals', 'duel.visuals');
    }
    for (const fn of ['_updatePlayer', '_updateChests', '_updateZombies', '_updateCaves', '_updateCamera', '_draw']) if (typeof g[fn] === 'function') wrap(g, fn, fn);
    if (g.world?.forest?.update) wrap(g.world.forest, 'update', 'world.forest');
    if (g.weapons?.checkHits) wrap(g.weapons, 'checkHits', 'weapons.checkHits');
    if (g.hud?.drawMinimap) wrap(g.hud, 'drawMinimap', 'hud.drawMinimap');
    let sysFrames = 0;
    g.frame = function () {
        // the scene's moves (before the frame, as the player's own would be)
        if (!done) {
            if (seg === 'оглядываемся') setYaw(yaw0 + (n / FRAMES) * Math.PI * 2);
            else if (seg === 'идём') {
                // a walking pace of ~5 m/s at 60 FPS: 0.09 m a frame (the frames here are slow — counted by frames)
                const s = (n + 1) * 0.09;
                const x = start.x - Math.sin(yaw0) * s, z = start.z - Math.cos(yaw0) * s;
                const gy = g.collision.groundY ? g.collision.groundY(x, z) : null;
                ch.group.position.x = x; ch.group.position.z = z;
                if (Number.isFinite(gy) && Math.abs(gy - ch.group.position.y) < 6) ch.group.position.y = Math.max(ch.group.position.y, gy + 2.0);
                setYaw(yaw0);
            }
        }
        const t0 = performance.now();
        g.lastTime = t0 - 1000 / 60; // (the game's time goes as at 60 FPS: what is done «every 0.1 s» costs what it costs there)
        origFrame();
        const t1 = performance.now();
        const progs = g.renderer.info.programs;
        if (!done) {
            const parts = {};
            for (const k in g._parts) parts[k] = g._parts[k];
            const info = g.renderer.info.render;
            sysFrames++;
            if (prev != null) frames.push({ seg, gap: t0 - prev, cpu: t1 - t0, game: t1 - t0 - (g._parts['графика'] || 0), calls: info.calls, tris: info.triangles, parts });
            if (++n >= FRAMES) { n = 0; const i = plan.indexOf(seg); if (i === plan.length - 1) done = true; else seg = plan[i + 1]; }
            if (progs.length > nProg0 + newProgs.filter((x) => !x.startsWith('   ')).length) {
                for (let i = nProg0 + newProgs.filter((x) => !x.startsWith('   ')).length; i < progs.length; i++) {
                    // (what is new about it: the settings that differ from the closest program already built)
                    const A = String(progs[i].cacheKey).split(',');
                    let best = null;
                    for (let j = 0; j < i; j++) {
                        if (progs[j].name !== progs[i].name) continue;
                        const B = String(progs[j].cacheKey).split(',');
                        const d = A.map((x, k) => (x !== B[k] ? `${k}:${x.slice(0, 40)}` : null)).filter(Boolean);
                        if (!best || d.length < best.length) best = d;
                    }
                    newProgs.push(`${seg} ${(t1 - t0).toFixed(0)}мс ${progs[i].name} [${(best || ['новый вид']).slice(0, 8).join(' ')}]`);
                    if (window.__KEYS) newProgs.push(`   ключ: ${String(progs[i].cacheKey).slice(0, 600)}`);
                }
                // (the objects using the materials compiled now: their path, so the thing can be found)
                const mats = new Set((window.__compiled || []).slice(nSeen));
                const who = [];
                g.scene.traverse((o) => {
                    if (!o.material || who.length > 6) return;
                    for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (mats.has(m)) {
                        const path = [];
                        for (let q = o; q && q !== g.scene && path.length < 5; q = q.parent) path.push(q.name || Object.keys(q.userData || {}).slice(0, 2).join('/') || q.type);
                        who.push(`${m.type}${m.name ? '(' + m.name + ')' : ''} map:${!!m.map} vc:${!!m.vertexColors} ← ${path.join(' < ')}`);
                    }
                });
                if (who.length) newProgs.push(`   кто: ${who.join(' | ')}`);
            }
            nSeen = window.__compiled?.length || 0;
        }
        prev = t0;
    };
    const t0 = performance.now();
    while (!done && performance.now() - t0 < 1200000) await new Promise((r) => setTimeout(r, 200));
    g.frame = origFrame;
    for (const u of undo) u();
    const systems = Object.entries(sys).map(([k, v]) => [k, +(v / Math.max(1, sysFrames)).toFixed(3)]).sort((a, b) => b[1] - a[1]).slice(0, 30);
    const info = g.renderer.info;
    const cl = g.castleLife;
    let people = 0, peopleVisible = 0;
    if (cl?.castles) for (const cs of cl.castles.values()) if (cs.active) for (const p of cs.active.values?.() || []) { people++; if (p.group?.visible !== false) peopleVisible++; }
    let objs = 0, meshes = 0, visMeshes = 0;
    g.scene.traverse((o) => { objs++; if (o.isMesh || o.isInstancedMesh || o.isPoints || o.isLine) { meshes++; let v = true; for (let q = o; q; q = q.parent) if (!q.visible) { v = false; break; } if (v) visMeshes++; } });
    // the scene's biggest groups by visible draw objects (to find who draws much)
    const groups = [];
    for (const c of g.scene.children) {
        let k = 0, tri = 0;
        if (!c.visible) continue;
        c.traverseVisible((o) => { if (o.isMesh || o.isPoints || o.isLine) { k++; const gm = o.geometry; if (gm) { const ix = gm.index ? gm.index.count : (gm.attributes.position?.count || 0); tri += (ix / 3) * (o.isInstancedMesh ? o.count : 1); } } });
        if (k) groups.push({ name: c.name || Object.keys(c.userData || {}).slice(0, 2).join('/') || c.type, k, tri: Math.round(tri) });
    }
    groups.sort((a, b) => b.k - a.k);
    return {
        frames, newProgs, systems, people, peopleVisible, objs, meshes, visMeshes, groups: groups.slice(0, 16),
        render: { programs: info.programs.length, geometries: info.memory.geometries, textures: info.memory.textures },
        pos: { x: Math.round(start.x), y: Math.round(start.y), z: Math.round(start.z) },
    };
}

/** Runs in the page: the hero turned to 16 directions; in each — the draws, triangles, and who is in the picture (meshes by owner). */
async function scanDirs() {
    const g = window.__zns.game, ch = g.character, T = window.__zns.THREE;
    const yaw0 = g.cameraBaseRotation || 0, out = [];
    const fr = new T.Frustum(), pm = new T.Matrix4();
    const owner = (o) => {
        let top = o; while (top.parent && top.parent !== g.scene) top = top.parent;
        return top.name || Object.keys(top.userData || {}).slice(0, 2).join('/') || top.type;
    };
    const origFrame = g.frame;
    for (let k = 0; k < 16; k++) {
        const yaw = yaw0 + (k / 16) * Math.PI * 2;
        const rows = [];
        await new Promise((resolve) => {
            let n = 0;
            g.frame = function () {
                g.smoothBody = yaw; g.cameraBaseRotation = yaw; ch.setBodyRotation(yaw);
                g.lastTime = performance.now() - 1000 / 60;
                const t0 = performance.now();
                origFrame.call(g);
                const info = g.renderer.info.render;
                if (n++ >= 3) rows.push({ calls: info.calls, tris: info.triangles, game: performance.now() - t0 - (g._parts['графика'] || 0) });
                if (rows.length >= 4) { g.frame = origFrame; resolve(); }
            };
        });
        const cam = g.camera;
        fr.setFromProjectionMatrix(pm.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
        const by = {}, sh = {};
        g.scene.traverseVisible((o) => {
            if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return;
            const inPic = !o.frustumCulled || fr.intersectsObject(o);
            const w = owner(o);
            if (inPic) by[w] = (by[w] || 0) + 1;
            if (o.castShadow) sh[w] = (sh[w] || 0) + 1;
        });
        const m = (key) => rows.reduce((a, r) => a + r[key], 0) / rows.length;
        out.push({ deg: Math.round((k / 16) * 360), calls: Math.round(m('calls')), tris: Math.round(m('tris')), game: +m('game').toFixed(1),
            who: Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 10), shadows: Object.entries(sh).sort((a, b) => b[1] - a[1]).slice(0, 6) });
    }
    return out;
}

/** Runs in the page: standing, the same view, with one kind of thing hidden at a time — what each costs to draw. */
async function ablate({ names, FRAMES }) {
    const g = window.__zns.game;
    const ANIMALS = new Set(['pig', 'cow', 'horse', 'sheep', 'chicken', 'goat', 'wolf', 'deer']);
    // what is turned off for a name → the undo (top groups by name; a few special ones)
    const off = (name) => {
        const undo = [];
        const hide = (o) => { if (o.visible) { o.visible = false; undo.push(() => { o.visible = true; }); } };
        const F = g.world?.forest;
        if (name === 'villagers') { for (const v of g.castleLife?.byId?.values() || []) if (v.group) hide(v.group); }
        else if (name === 'animals') { for (const c of g.scene.children) if (ANIMALS.has(c.name)) hide(c); }
        else if (name === 'leaves' && F) { for (const e of F.meshes.values()) hide(e.leaf); }
        else if (name === 'wood' && F) { for (const e of F.meshes.values()) hide(e.wood); }
        else if ((name === 'nearTrees' || name === 'farTrees') && F) { for (const e of F.meshes.values()) if (((e.key & 1) === 1) === (name === 'farTrees')) { hide(e.wood); hide(e.leaf); } }
        else if (name === 'treeShadows' && F) { for (const e of F.meshes.values()) for (const m of [e.wood, e.leaf]) if (m.castShadow) { m.castShadow = false; undo.push(() => { m.castShadow = true; }); } }
        else if (name === 'shadows') { const sm = g.renderer.shadowMap; if (sm.autoUpdate) { sm.autoUpdate = false; undo.push(() => { sm.autoUpdate = true; }); } }
        else for (const c of g.scene.children) if (c.name === name) hide(c);
        return { n: undo.length, undo: () => { for (const u of undo) u(); } };
    };
    const res = [];
    for (const name of ['все', ...names]) {
        const origDraw = g._draw;
        const hidden = { length: 0 };
        g._draw = function (...a) {
            const h = name !== 'все' ? off(name) : null;
            hidden.length = h ? h.n : 0;
            try { return origDraw.apply(this, a); } finally { if (h) h.undo(); }
        };
        const rows = [];
        let n = 0;
        const origFrame = g.frame;
        await new Promise((resolve) => {
            g.frame = function () {
                g.lastTime = performance.now() - 1000 / 60;
                origFrame.call(g);
                const info = g.renderer.info.render;
                if (n++ > 3) rows.push({ draw: g._parts['графика'] || 0, calls: info.calls, tris: info.triangles, hid: hidden.length });
                if (rows.length >= FRAMES) { g.frame = origFrame; resolve(); }
            };
        });
        g._draw = origDraw;
        const m = (k) => rows.reduce((s, r) => s + r[k], 0) / rows.length;
        res.push({ name, draw: +m('draw').toFixed(2), calls: Math.round(m('calls')), tris: Math.round(m('tris')), hidden: rows[0]?.hid || 0 });
    }
    return res;
}

function stats(v) {
    const n = v.length;
    if (!n) return null;
    const s = v.slice().sort((a, b) => a - b);
    const mean = v.reduce((a, b) => a + b, 0) / n;
    return { mean: +mean.toFixed(2), p95: +s[Math.min(n - 1, Math.floor(n * 0.95))].toFixed(2), max: +s[n - 1].toFixed(1) };
}

const port = 8700 + Math.floor(Math.random() * 200);
const srv = await startServer(port);
const browser = await launch({ extraArgs: ['--enable-precise-memory-info'] });
let res;
try {
    const { page, errors } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: W, height: H } });
    await page.evaluate(() => {
        let s = 0x2545F491;
        Math.random = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    });
    const P = PRESETS[LEVEL];
    await page.evaluate(({ P, SEED }) => {
        for (const [id, v] of [['graphics-quality', P.graphics], ['view-distance', P.viewDistance], ['ultra-quality', P.ultra || 'off']]) { const el = document.getElementById(id); if (el) { el.value = v; el.dispatchEvent(new Event('change')); } }
        const z = window.__zns;
        const seen = window.__compiled = []; // (each material's first compile: who needed a shader after the start)
        z.THREE.Material.prototype.onBeforeCompile = function () { seen.push(this); };
        z.startGame({ ...z.readConfig(), mode: 'creative', map: null, seed: SEED, zombieCount: 0, graphics: P.graphics, viewDistance: P.viewDistance, ultra: P.ultra === 'on' });
    }, { P, SEED });
    await page.waitForFunction(() => window.__zns.game && window.__zns.game.active, null, { timeout: 180000 });
    await page.waitForFunction(() => !document.getElementById('hud').classList.contains('hidden'), null, { timeout: 120000 });
    // the start's land and its people: wait until the land around is made (the workers) and things settle
    for (let i = 0; i < 120; i++) {
        const q = await page.evaluate(() => { const g = window.__zns.game; return { q: g.terrain._queue?.length ?? 0, f: g.frameCount }; });
        if (q.q === 0 && q.f > 200) break;
        await sleep(1000);
    }
    for (let i = 0; i < 240; i++) {
        const ok = await page.evaluate(() => { const g = window.__zns.game; const c = typeof g.circleAttack?._warm === 'function' ? g.circleAttack : null, n = typeof g.inspirius?._warm === 'function' ? g.inspirius : null; return (!c || !!c._warmed) && (!n || !!n._warmed); });
        if (ok) break;
        await sleep(500);
    }
    await sleep(3000);
    let cdp = null, heap = null;
    if (PROFILE) { cdp = await page.context().newCDPSession(page); await cdp.send('Profiler.enable'); await cdp.send('Profiler.setSamplingInterval', { interval: 200 }); await cdp.send('Profiler.start'); }
    if (ALLOC) { heap = await page.context().newCDPSession(page); await heap.send('HeapProfiler.enable'); await heap.send('HeapProfiler.startSampling', { samplingInterval: 4096, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true }); }
    if (args.includes('--animals')) {
        const an = await page.evaluate(() => {
            const g = window.__zns.game, me = g.character.group.position;
            return g.animals.list.map((a) => { let n = 0; a.model.traverseVisible((o) => { if (o.isMesh) n++; }); const p = a.group.position;
                return `${a.type} ${Math.round(Math.hypot(p.x - me.x, p.z - me.z))}м far:${!!a.far?.on} видимых:${n} state:${a.state} guard:${a.guard || ''} fly:${!!a.fly}/${a.flyCode} tamed:${!!a.tamed} pen:${!!a.pen} lev:${!!a.lev} stun:${a.stunT > 0}`; });
        });
        console.log('\nзвери:\n  ' + an.join('\n  '));
    }
    if (OWNERS) {
        const ow = await page.evaluate(() => {
            const g = window.__zns.game, by = {};
            for (const top of g.scene.children) {
                const k = top.name || Object.keys(top.userData || {}).slice(0, 2).join('/') || top.type;
                const e = by[k] || (by[k] = { tops: 0, meshes: 0, shown: 0, shadow: 0, mats: new Set(), geos: new Set(), names: new Set(), ud: new Set() });
                e.tops++;
                for (const u of Object.keys(top.userData || {}).slice(0, 6)) e.ud.add(u);
                top.traverse((o) => { if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite)) return; e.meshes++; let v = true; for (let q = o; q; q = q.parent) if (!q.visible) { v = false; break; } if (v) { e.shown++; if (o.castShadow) e.shadow++; } e.mats.add(o.material); e.geos.add(o.geometry); if (o.name && e.names.size < 8) e.names.add(o.name); });
            }
            return Object.entries(by).filter(([, e]) => e.shown > 8).sort((a, b) => b[1].shown - a[1].shown).slice(0, 30)
                .map(([k, e]) => `${k}: ${e.tops} шт, частей ${e.meshes} (видимых ${e.shown}, с тенью ${e.shadow}), материалов ${e.mats.size}, геометрий ${e.geos.size}; userData ${[...e.ud].join(',')}; имена ${[...e.names].join(',')}`);
        });
        console.log('\nкрупные вещи сцены:\n  ' + ow.join('\n  '));
        const grp = await page.evaluate(() => {
            const g = window.__zns.game, out = [];
            for (const top of g.scene.children) {
                if (top.name || Object.keys(top.userData || {}).length || top.type !== 'Group' || !top.visible) continue;
                let n = 0; const nm = new Set(); top.traverseVisible((o) => { if (o.isMesh) { n++; if (o.name && nm.size < 5) nm.add(o.name); } });
                if (n < 3) continue;
                const p = top.position; out.push(`${n} ч. @${Math.round(p.x)},${Math.round(p.y)},${Math.round(p.z)} дети:${top.children.length} ${[...nm].join(',')} ${top.children.slice(0, 4).map((c) => c.name || Object.keys(c.userData || {}).slice(0, 2).join('/') || c.type).join('|')}`);
            }
            return out.sort((a, b) => parseInt(b) - parseInt(a)).slice(0, 25);
        });
        console.log('\nбезымянные группы (видимых частей):\n  ' + grp.join('\n  '));
    }
    if (SCAN) {
        const sc = await page.evaluate(scanDirs);
        console.log('\nнаправления (градусы: вызовов, треугольников, игра мс; кто в кадре — мешей; тени — отбрасывающих):');
        for (const d of sc) console.log(`  ${String(d.deg).padStart(3)}° ${String(d.calls).padStart(5)} ${String(d.tris).padStart(8)} ${String(d.game).padStart(5)}  ${d.who.map(([k, v]) => k + ' ' + v).join(', ')}\n        тени: ${d.shadows.map(([k, v]) => k + ' ' + v).join(', ')}`);
    }
    if (KEYS) await page.evaluate(() => { window.__KEYS = true; });
    const r = await page.evaluate(scene, FRAMES);
    if (KEYS) console.log('\nпрогретые ключи (Lambert/Phong):\n' + (await page.evaluate(() => window.__zns.game.renderer.info.programs.filter((p) => /Lambert|Phong/.test(p.name)).map((p) => p.name + ' ' + String(p.cacheKey).slice(0, 600)).join('\n'))));
    if (ABLATE) {
        const ab = await page.evaluate(ablate, { names: ABLATE.split(','), FRAMES });
        console.log('\nбез одного вида (стоим; рисование мс / вызовов / треугольников / скрыто объектов):');
        for (const a of ab) console.log(`  ${a.name.padEnd(12)} ${String(a.draw).padStart(7)} ${String(a.calls).padStart(6)} ${String(a.tris).padStart(9)} ${String(a.hidden).padStart(5)}`);
    }
    if (cdp) {
        const { profile } = await cdp.send('Profiler.stop');
        const out = path.join(ROOT, 'tools', 'creative.cpuprofile');
        fs.writeFileSync(out, JSON.stringify(profile));
        // the heaviest functions by own time (game code)
        const self = new Map(), byId = new Map(profile.nodes.map((nd) => [nd.id, nd]));
        const dt = profile.timeDeltas; const counts = new Map();
        profile.samples.forEach((id, i) => counts.set(id, (counts.get(id) || 0) + (dt[i] || 0)));
        for (const [id, us] of counts) { const f = byId.get(id).callFrame; const k = `${f.functionName || '(anon)'} ${f.url.replace(/^.*\/(src|vendor)\//, '$1/')}:${f.lineNumber + 1}`; self.set(k, (self.get(k) || 0) + us); }
        const tot = [...self.values()].reduce((a, b) => a + b, 0);
        console.log('\nсамые тяжёлые функции (своё время, % от записи):');
        for (const [k, v] of [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`  ${(100 * v / tot).toFixed(1).padStart(5)}%  ${k}`);
        console.log('profile:', out);
    }
    if (heap) {
        const { profile } = await heap.send('HeapProfiler.stopSampling');
        const by = new Map();
        const fr = (f) => `${f.functionName || '(anon)'} ${f.url.replace(/^.*\/(src|vendor)\//, '$1/')}:${f.lineNumber + 1}`;
        const walk = (nd, up) => { const f = nd.callFrame; const k = f.url ? fr(f) : `${fr(f)}  ← ${up}`; by.set(k, (by.get(k) || 0) + nd.selfSize); for (const c of nd.children) walk(c, f.url ? fr(f) : up); };
        walk(profile.head, '');
        const tot = [...by.values()].reduce((a, b) => a + b, 0);
        console.log(`\nмусор (выборка): всего ${(tot / 1048576).toFixed(1)} МБ за ${r.frames.length} кадров; больше всего:`);
        for (const [k, v] of [...by.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`  ${(v / 1048576).toFixed(2).padStart(7)} МБ  ${k}`);
    }
    const out = { level: LEVEL, pos: r.pos, systems: r.systems, total: {}, segs: {}, render: r.render, newProgs: r.newProgs, people: r.people, peopleVisible: r.peopleVisible, objs: r.objs, meshes: r.meshes, visMeshes: r.visMeshes, groups: r.groups };
    const sum = (f) => ({ game: stats(f.map((x) => x.game)), cpu: stats(f.map((x) => x.cpu)), calls: stats(f.map((x) => x.calls)), tris: stats(f.map((x) => x.tris)) });
    out.total = sum(r.frames);
    for (const s of ['стоим', 'оглядываемся', 'идём', 'стоим2']) out.segs[s] = sum(r.frames.filter((x) => x.seg === s));
    const pa = {};
    for (const f of r.frames) for (const k in f.parts) pa[k] = (pa[k] || 0) + f.parts[k] / r.frames.length;
    out.parts = Object.fromEntries(Object.entries(pa).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +v.toFixed(2)]));
    out.errors = errors.filter((e) => !/AudioContext|favicon|ERR_|WebGL|GPU stall|GL Driver/i.test(e)).slice(0, 5);
    res = out;
    await page.close();
} finally {
    await browser.close();
    srv.stop();
}
const f = (s) => s ? `${String(s.mean).padStart(7)} ${String(s.p95).padStart(7)} ${String(s.max).padStart(7)}` : '—';
console.log(`\n=== Творческий, старт (${res.pos.x},${res.pos.y},${res.pos.z}), графика ${res.level}`);
console.log(`  ${'часть'.padEnd(14)} ${'игра: сред'.padStart(10)} ${'p95'.padStart(7)} ${'макс'.padStart(7)} | ${'процессор'.padStart(9)} ${'p95'.padStart(7)} ${'макс'.padStart(7)} | вызовов  треугольников`);
const row = (name, s) => console.log(`  ${name.padEnd(14)} ${f(s.game).padStart(25)} | ${f(s.cpu)} | ${String(Math.round(s.calls.mean)).padStart(7)} ${String(Math.round(s.tris.mean)).padStart(12)}`);
row('всё', res.total);
for (const k in res.segs) if (res.segs[k].game) row(k, res.segs[k]);
console.log('  части кадра (сред мс):', JSON.stringify(res.parts));
console.log('  системы (сред мс за кадр):', res.systems.map(([k, v]) => `${k} ${v}`).join(', '));
console.log(`  графика: ${JSON.stringify(res.render)}; объектов сцены ${res.objs}, мешей ${res.meshes} (видимых ${res.visMeshes}); жителей ${res.people} (видимых ${res.peopleVisible})`);
console.log('  крупные группы сцены (видимых мешей / треуг.):', res.groups.map((x) => `${x.name} ${x.k}/${x.tri}`).join('; '));
const shaders = res.newProgs.filter((x) => !x.startsWith('   '));
console.log(`  шейдеров собрано после старта: ${shaders.length}${res.newProgs.length ? ':\n    ' + res.newProgs.slice(0, 16).join('\n    ') : ''}`);
if (res.errors.length) console.log('  ошибки:', res.errors);
if (OUT) { fs.writeFileSync(OUT, JSON.stringify(res, null, 1)); console.log('saved:', OUT); }
if (CHECK) {
    const bad = [];
    const t = res.total;
    if (t.game.mean > LIMITS.gameMeanMs) bad.push(`игра в кадре в среднем ${t.game.mean} мс > ${LIMITS.gameMeanMs}`);
    if (t.game.p95 > LIMITS.gameP95Ms) bad.push(`игра в кадре, 95-й процентиль ${t.game.p95} мс > ${LIMITS.gameP95Ms}`);
    if (t.calls.mean > LIMITS.calls) bad.push(`вызовов отрисовки в среднем ${Math.round(t.calls.mean)} > ${LIMITS.calls}`);
    if (t.tris.mean > LIMITS.triangles) bad.push(`треугольников в среднем ${Math.round(t.tris.mean)} > ${LIMITS.triangles}`);
    if (shaders.length > LIMITS.newShaders) bad.push(`шейдеров собрано после старта: ${shaders.length}`);
    if (res.errors.length) bad.push('ошибки: ' + res.errors.join('; '));
    console.log(bad.length ? '\nПРОВЕРКА НЕ ПРОЙДЕНА:\n  ' + bad.join('\n  ') : '\nПРОВЕРКА ПРОЙДЕНА');
    process.exitCode = bad.length ? 1 : 0;
}
