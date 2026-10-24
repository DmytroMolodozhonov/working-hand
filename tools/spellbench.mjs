#!/usr/bin/env node
/**
 * spellbench.mjs — how much of a frame the heavy spells that change the world take (the author: «создание
 * дома: может резко пропасть FPS, потом вернуться»). Run:
 *     node tools/spellbench.mjs [--only house,castle,…] [--out file.json] [--seed 20261015]
 *
 * The same world every run (Творческий). One after another, each standing still on the ground:
 *   «покой»      — nothing is cast (the frame's own cost, to compare with);
 *   «дом»        — «Create a House» 30 m ahead, its 10 s and 4 s after;
 *   «дом 2…5»    — «Improve a House» to levels 2…5 (the stone house of level 5 is the biggest);
 *   «замок»      — «Create a Castle» (30 s of magic);
 *   «ледяной»    — «Ice Castle»;
 *   «бомбардо»   — «Bombardo Maxima» ×3; «землетрясение» — «Earthquake Maxima»; «разрушение» — «Total Destruction»;
 *   «пентаграмма» — «Пентаграниум»: рисунок круг + звезда по земле (след), горящая пентаграмма и ритуал над телом волшебника (Pentagranium.js);
 *   «рой вещей»  — «Левиоса Максима» на вещь: 32 вещи цепочкой, вихрем, щитом и залпом (ItemSwarm.js);
 *   «полёт»      — a straight fast flight (new land loaded) and back over the changed places.
 * For each: the game's own work in a frame («игра», without drawing the picture — here the processor draws
 * it, far slower than a video card), its average, the 95 % and the worst frame, how many frames took more
 * than 8 ms; and the systems that took the most in one frame (the worst frame's culprits).
 */
import { startServer, launch, openPage, startFromMenu, waitHudVisible, sleep } from '../tests/e2e/harness.mjs';
import fs from 'node:fs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const ONLY = opt('only', null)?.split(',') || null;
const OUT = opt('out', null);
const PORT = Number(opt('port', '8297'));
/** --profile дом: a CPU profile of that scenario — its heaviest functions printed (self time, ms). */
const PROFILE = opt('profile', null);

function install() {
    const g = window.__zns.game;
    const B = window.__sb = { frames: [], cur: {}, rec: false };
    // (the picture only every 15th frame: the processor draws it here)
    let nr = 0;
    const origRender = g.renderer.render.bind(g.renderer);
    g.renderer.render = function (scene, camera) { if (scene !== g.scene || ++nr % 15 === 0) return origRender(scene, camera); };
    const origFrame = g.frame.bind(g);
    let prev = 0;
    g.frame = function () {
        const t0 = performance.now();
        B.cur = {};
        origFrame();
        const t1 = performance.now();
        if (B.rec && prev) B.frames.push({ gap: t0 - prev, game: t1 - t0 - (g._parts?.['графика'] || 0), parts: { ...g._parts }, fns: B.cur });
        prev = t0;
    };
    const wrap = (path) => {
        const at = path.split('.'), name = at.pop();
        let o = g;
        for (const k of at) o = o?.[k];
        if (!o || typeof o[name] !== 'function') return;
        const f = o[name];
        o[name] = function (...a) {
            const t = performance.now();
            try { return f.apply(this, a); } finally { B.cur[path] = (B.cur[path] || 0) + performance.now() - t; }
        };
    };
    for (const p of ['world.update', 'world.terrain.update', 'world.terrain._sendRebuild', 'world.terrain._applyRebuilt', 'world.terrain._buildLocal',
        'world.terrain._applyBuilt', 'world.terrain._build', 'world.terrain.flora.update', 'houseMagic.update', 'houseMagic._build', 'houseMagic._done',
        'houseMagic._hostStart', 'houseMagic._takeTree', 'houseMagic._whirl', 'houseMagic._furnish', 'castleMagic.update', 'castleMagic._hostStart', 'iceMagic.update',
        'fx.update', 'falling.update', 'destruction.update', 'builder._sendEdits', 'builder.update', 'castleLife.update', 'houses.update', 'spells.update',
        'lanterns.update', 'doors.update', 'beds.update', 'animals.update', 'carriages.update', 'travelers.update', 'phoenixes.update', 'owls.update',
        'world.followShadow', 'seaSurface.update', 'fire.update', 'burnWreck.update', 'collision.rebuild', 'world.setDayPhase']) wrap(p);
}

const scenarios = {
    async 'покой'(page) { await page.evaluate(() => { window.__sb.rec = true; }); await sleep(6000); },
    async 'дом'(page) {
        const ok = await page.evaluate(() => {
            const g = window.__zns.game, me = g.character.group.position;
            for (const [dx, dz] of [[30, 0], [0, 30], [-30, 0], [0, -30], [45, 20], [-20, 45]]) {
                const x = Math.round(me.x + dx), z = Math.round(me.z + dz);
                g.houseMagic.testAim = { x, z };
                window.__sb.rec = true;
                if (g.houseMagic._hostStart({ kind: 'CreateHouse', at: [x, g.collision.groundY(x, z), z], c: [me.x, me.z] }, g.localId) === true) return true;
            }
            return false;
        });
        if (!ok) return 'не построился';
        await page.waitForFunction(() => !window.__zns.game.houseMagic.magic, null, { timeout: 120000, polling: 200 });
        await sleep(4000);
    },
    async 'дом 2…5'(page) {
        for (let level = 2; level <= 5; level++) {
            const ok = await page.evaluate(() => {
                const g = window.__zns.game, hm = g.houseMagic, rec = [...hm.list.values()][0];
                if (!rec) return false;
                const p = hm.plan(rec);
                rec.t -= 600 * 1000;
                const ax = p.rect.x1 + 4;
                window.__sb.rec = true;
                return hm._hostStart({ kind: 'ImproveHouse', at: [ax, rec.G, rec.z], c: [ax + 4, rec.z], hid: rec.id }, g.localId) === true;
            });
            if (!ok) return `уровень ${level} не начался`;
            await page.waitForFunction(() => !window.__zns.game.houseMagic.magic, null, { timeout: 120000, polling: 200 });
            await sleep(2000);
        }
    },
    async 'замок'(page) {
        const ok = await page.evaluate(async () => {
            const g = window.__zns.game, cm = g.castleMagic, me = g.character.group.position.clone();
            cm.testAim = null;
            for (const [dx, dz] of [[0, -110], [110, 0], [-110, 0], [0, 110], [150, -150], [-150, 150], [200, 0], [0, -200]]) {
                const at = { x: Math.round(me.x + dx), z: Math.round(me.z + dz) };
                window.__sb.rec = true;
                if (cm._hostStart({ at: [at.x, 0, at.z], c: [at.x - dx * 0.4, at.z - dz * 0.4] }, g.localId) === true) return true;
            }
            return false;
        });
        if (!ok) return 'не построился';
        await page.waitForFunction(() => !window.__zns.game.castleMagic.magic, null, { timeout: 240000, polling: 200 });
        await sleep(4000);
    },
    async 'вихрь земли'(page) {
        // (the wand's aim is faked: a spot 4 m ahead; the lift is fed by hand — 160 blocks in 3 s, then the shield, a blow, the volley, the end)
        await page.evaluate(() => {
            const g = window.__zns.game, v = g.groundVortex, p = g.character.group.position;
            const x = Math.round(p.x) + 4, z = Math.round(p.z), L = g.terrain.data.topLayer(x, z);
            v._aimSpot = (side, out = {}) => Object.assign(out, { x, y: L - 0.5, z, L, dist: 4 });
            window.__sb.rec = true;
            v.cast(true);
        });
        for (let i = 0; i < 10; i++) { await page.evaluate(() => { const v = window.__zns.game.groundVortex; if (v.state) v.state.acc += 20; }); await sleep(300); }
        await sleep(1500);
        await page.evaluate(() => { const g = window.__zns.game, v = g.groundVortex; v.sayShield(true); });
        await sleep(2500);
        await page.evaluate(() => { const g = window.__zns.game, v = g.groundVortex, p = g.character.group.position; v.take({ x: p.x + 8, y: p.y, z: p.z }, 'Bombardo'); v.sayShield(true); v.attack(true); });
        await sleep(3500);
        await page.evaluate(() => { window.__zns.game.groundVortex.stop('stop'); });
        await sleep(4000);
    },
    async 'бомбардо'(page) {
        for (let i = 0; i < 3; i++) {
            await page.evaluate((i) => {
                const g = window.__zns.game;
                g.character.setBodyRotation?.(i * 2.1); g.cameraBaseRotation = i * 2.1; g.smoothBody = i * 2.1;
                window.__sb.rec = true;
                g.castDebug('BombardoMaxima');
            }, i);
            await sleep(3500);
        }
    },
    async 'землетрясение'(page) { await page.evaluate(() => { window.__sb.rec = true; window.__zns.game.castDebug('EarthquakeMaxima'); }); await sleep(8000); },
    async 'разрушение'(page) { await page.evaluate(() => { window.__sb.rec = true; window.__zns.game.destruction.cast(true, 'TotalDestruction'); }); await sleep(10000); },
    async 'пентаграмма'(page) {
        const ok = await page.evaluate(() => {
            const g = window.__zns.game, P = g.pentagranium, me = g.character.group.position;
            const cx = me.x + 12, cz = me.z, gy = g.collision.groundY(cx, cz);
            P.learnFigure('devil');
            // the wand draws with help: round the circle (a trembling hand), then led from point to point along the star's chords
            const R = 4, ring = [];
            for (let k = 0; k <= 130; k++) { const a = (k / 100) * Math.PI * 2; ring.push([cx + Math.cos(a) * R + Math.sin(k * 7) * 0.3, cz + Math.sin(a) * R + Math.cos(k * 5) * 0.3]); }
            let lead = [], phase = 'ring', i = 0;
            P.groundAt = () => {
                const L = P.draw?.line;
                if (L && phase === 'ring') { phase = 'lead'; i = 0; for (const c of L.graph.chords) for (const n of [c.nodes[0], c.nodes.at(-1)]) for (let k = 0; k < 4; k++) lead.push(L.world[n]); }
                const arr = phase === 'ring' ? ring : lead, q = arr[Math.min(i, arr.length - 1)];
                return q ? { x: q[0], y: g.collision.groundY(q[0], q[1]), z: q[1] } : null;
            };
            const orig = P._drawStep.bind(P);
            P._drawStep = function (dt) { i++; orig(dt); };
            window.__sb.rec = true;
            g.combat.fatigue = Math.max(g.combat.fatigue, 60);
            P.begin();
            window.__pgb = { cx, cz, gy };
            return true;
        });
        if (!ok) return 'не началось';
        await sleep(6000);
        const marks = await page.evaluate(() => {
            const g = window.__zns.game, P = g.pentagranium, b = window.__pgb;
            const m = [...P.marks.values()][0];
            if (!m) return 0;
            m.mine = true;
            g.mana.duelsWon.set('pgw', 'kill');
            g.death.addBody({ id: 'pgb1', k: 'v', who: 'pgw', role: 'adept', wz: 1, mm: 230, x: m.x, y: m.y, z: m.z, yaw: 0, age: 0, look: null });
            return P.marks.size;
        });
        if (!marks) return 'пентаграмма не засчиталась';
        await sleep(18000); // (the bench runs the game slowly: the rite takes its 5 s of game time)
        const left = await page.evaluate(() => { const g = window.__zns.game, P = g.pentagranium, b = g.death.bodies.get('pgb1'), m = [...P.marks.values()][0]; return b ? 'тело не сгорело: ' + JSON.stringify({ lev: b.lev, fall: g.death.falling.has('pgb1'), rit: b.rit, model: !!b.model, by: b.y, my: m?.y, fade: m?.fade, mine: m?.mine, rites: m?.rites.length, rt: m?.rites[0]?.t, life: m?.life, gt: P._t, dx: m && Math.hypot(b.x - m.x, b.z - m.z), r: m?.r }) : null; });
        await page.evaluate(() => { window.__zns.game.pentagranium.clear(); });
        await sleep(1000);
        return left;
    },
    async 'рой вещей'(page) {
        const ok = await page.evaluate(() => {
            const g = window.__zns.game, me = g.character.group.position;
            const kinds = ['redApple', 'apple', 'scroll', 'wand', 'bow', 'shield', 'hammer', 'backpack'];
            const uids = [];
            for (let i = 0; i < 32; i++) {
                const a = i * 0.7, r = 5 + (i % 5);
                const uid = 'swb' + i;
                g.items.spawnLoose({ kind: kinds[i % kinds.length], uid }, { x: me.x + Math.cos(a) * r, y: g.collision.groundY(me.x + Math.cos(a) * r, me.z + Math.sin(a) * r) + 0.3, z: me.z + Math.sin(a) * r }, { broadcast: false });
                uids.push(uid);
            }
            const sw = g.levMax.swarm;
            if (!sw.start('right', uids[0], g.localId)) return false;
            g.levMax.mine = { id: 'sb', side: 'right', players: [], t: 0, kind: 'swarm', emptyT: 0 };
            for (const u of uids.slice(1)) sw._take(g.items.loose.get(u));
            sw.keeper.next = (m) => m; // (the hand does not really circle here: the mode is chosen by the bench)
            window.__sb.rec = true;
            return true;
        });
        if (!ok) return 'не поднялось';
        await sleep(5000);
        await page.evaluate(() => { window.__zns.game.levMax.swarm.sim.mode = 'orbit'; });
        await sleep(4000);
        await page.evaluate(() => { window.__zns.game.levMax.swarm.sim.mode = 'train'; window.__zns.game.levMax.swarm.shield(true); });
        await sleep(3000);
        await page.evaluate(() => { window.__zns.game.levMax.swarm._shT = 0; window.__zns.game.levMax.swarm.attack(true); });
        await sleep(4000);
        const left = await page.evaluate(() => { const g = window.__zns.game; const n = g.levMax.swarm.n; g.levMax.stop(); return [n, [...g.items.loose.values()].filter((L) => L.lev).length]; });
        await sleep(1500);
        return left[1] ? `зависли вещи: ${left[1]}` : null;
    },
    async 'полёт'(page) {
        await page.evaluate(() => {
            const g = window.__zns.game, ch = g.character, home = ch.group.position.clone();
            window.__sb.rec = true;
            g.startFlight(true);
            let t = 0;
            const orig = g._updateFlight.bind(g);
            g._updateFlight = function (dt, pose) {
                t += dt;
                const f = g.flight;
                if (f.active) { f.state = 'cruise'; f.t = 5; f.speed = 26; f.pitch = 0; f.hovering = false; }
                orig(dt, pose);
                const s = t < 12 ? t : Math.max(0, 24 - t); // (out 12 s and back over the changed places)
                const p = ch.group.position;
                p.x = home.x + s * 26; p.z = home.z;
                p.y = Math.max(g.collision.groundY(p.x, p.z) + 18, home.y + 10);
            };
        });
        await sleep(26000);
    },
};

const srv = await startServer(PORT);
const browser = await launch({});
const results = {};
try {
    const { page } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 480, height: 270 } });
    await startFromMenu(page, 'creative');
    await waitHudVisible(page);
    await page.evaluate(install);
    await sleep(5000);
    for (const [name, run] of Object.entries(scenarios)) {
        if (ONLY && !ONLY.some((o) => name.startsWith(o))) continue;
        await page.evaluate(() => { window.__sb.frames.length = 0; window.__sb.rec = false; });
        const t0 = Date.now();
        let err = null, cdp = null;
        if (PROFILE && name.startsWith(PROFILE)) {
            cdp = await page.context().newCDPSession(page);
            await cdp.send('Profiler.enable');
            await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
            await cdp.send('Profiler.start');
        }
        try { err = await run(page); } catch (e) { err = String(e.message || e).slice(0, 120); }
        if (cdp) {
            const { profile } = await cdp.send('Profiler.stop');
            const self = new Map(), byId = new Map(profile.nodes.map((n) => [n.id, n]));
            const dt = profile.timeDeltas;
            for (let i = 0; i < profile.samples.length; i++) {
                const n = byId.get(profile.samples[i]), f = n.callFrame;
                const k = `${f.functionName || '(anon)'} ${f.url.split('/').pop()}:${f.lineNumber + 1}`;
                self.set(k, (self.get(k) || 0) + (dt[i] || 0) / 1000);
            }
            console.log('  профиль (собственное время, мс):\n' + [...self].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => `    ${v.toFixed(0).padStart(6)}  ${k}`).join('\n'));
        }
        const r = await page.evaluate(() => {
            const B = window.__sb, fr = B.frames.splice(0);
            B.rec = false;
            const games = fr.map((f) => f.game).sort((a, b) => a - b);
            const n = games.length || 1;
            const worst = fr.reduce((w, f) => (!w || f.game > w.game ? f : w), null);
            const fnMax = {}, fnSum = {};
            for (const f of fr) for (const [k, v] of Object.entries(f.fns)) { fnSum[k] = (fnSum[k] || 0) + v; if (v > (fnMax[k] || 0)) fnMax[k] = v; }
            const top = Object.entries(fnMax).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k} ${v.toFixed(1)} (ср ${(fnSum[k] / n).toFixed(2)})`);
            const wf = worst ? Object.entries(worst.fns).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${v.toFixed(1)}`) : [];
            const wp = worst ? Object.entries(worst.parts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v.toFixed(1)}`) : [];
            return {
                frames: fr.length,
                avg: +(games.reduce((a, b) => a + b, 0) / n).toFixed(2),
                p95: +(games[Math.floor(n * 0.95)] || 0).toFixed(1),
                max: +(games[n - 1] || 0).toFixed(1),
                over8: games.filter((x) => x > 8).length,
                over16: games.filter((x) => x > 16).length,
                worstFrame: [...wp, ...wf].join(', '),
                top,
            };
        });
        results[name] = { ...r, err, secs: Math.round((Date.now() - t0) / 1000) };
        console.log(`${name.padEnd(14)} кадров ${String(r.frames).padStart(4)} | игра ср ${String(r.avg).padStart(5)} мс, 95% ${String(r.p95).padStart(5)}, худш ${String(r.max).padStart(6)} | >8мс ${r.over8}, >16мс ${r.over16}${err ? ' | ' + err : ''}`);
        console.log(`               худший кадр: ${r.worstFrame}`);
        console.log(`               больше всего за кадр: ${r.top.join('; ')}`);
    }
} finally {
    await browser.close();
    srv.stop();
}
if (OUT) fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
