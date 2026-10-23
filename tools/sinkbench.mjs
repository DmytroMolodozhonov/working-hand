#!/usr/bin/env node
/**
 * sinkbench.mjs — do the creatures stand on the real ground after «Бомбардо» (the author: «NPC проваливаются под землю»)?
 * Run:  node tools/sinkbench.mjs [--seconds 14] [--check] [--seed N]
 * Every kind of walking creature (villagers, knights, wizards, animals, zombies…) is put round a blast on the flat, on a
 * slope and by a pit; after each blast (Бомбардо, Максима) its feet are measured against the world's real floor under it
 * every frame: «в земле» — how deep its feet are below that floor (m), «сколько кадров». --check fails when anyone stays
 * sunk more than LIMIT_M for more than LIMIT_S seconds.
 */
import { startServer, launch, openPage, waitHudVisible } from '../tests/e2e/harness.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const SECONDS = Number(opt('seconds', '14'));
const SEED = parseInt(opt('seed', '20261015'), 10);
const CHECK = args.includes('--check');
const LIMIT_M = 0.15, LIMIT_S = 1.0;

async function scene({ seconds }) {
    const g = window.__zns.game, T = window.__zns.THREE, L = g.castleLife, td = g.world.terrain.data;
    const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((r) => setTimeout(r, 15)); };
    g.combat.damage = () => {}; g.damageLocalPlayer = () => {}; if (g.impact) g.impact.apply = () => 'none';
    const def = window.__site, cs = L.castles.get(def.id);
    const me = { x: def.x + 30, z: def.z + 30 };
    const moveMe = (x, z) => { me.x = x + 22; me.z = z + 22; g.world.terrain.flushAround(x, z); };
    const stand = () => g.character.group.position.set(me.x, g.collision.groundY(me.x, me.z) + 1.95, me.z);
    stand();
    const kinds = [];
    // everybody: (name, getter of [x, y(feet), z], alive)
    const all = () => {
        const out = [];
        for (const v of L.byId.values()) if (!v.dead && !v.seated) out.push({ k: 'man:' + v.role, id: 'v' + v.id, x: v.x, y: v.y, z: v.z, c: v });
        for (const a of g.animals?.list || []) if (!a.dead && a.group) out.push({ k: 'animal:' + a.type, id: 'a' + a.id, x: a.group.position.x, y: a.group.position.y, z: a.group.position.z, c: a });
        for (const z of g.zombies || []) if (!z.isDead && z.group) out.push({ k: 'zombie', id: 'z' + z.id, x: z.group.position.x, y: z.group.position.y, z: z.group.position.z, c: z });
        return out;
    };
    const results = [];
    // the sites: flat (the plaza), the nearest slope, by a pit (a first blast makes it)
    const sites = [];
    const H = (x, z) => g.collision.groundY(x, z);
    const open = (x, z) => { // no water and no building within 24 m, and the spread of the heights
        let lo = Infinity, hi = -Infinity;
        for (let dx = -24; dx <= 24; dx += 6) for (let dz = -24; dz <= 24; dz += 6) {
            const h = H(x + dx, z + dz), top = td.topLayer(Math.round(x + dx), Math.round(z + dz));
            if (td.get(Math.round(x + dx), top, Math.round(z + dz)) === 9 /* water? */) return null;
            lo = Math.min(lo, h); hi = Math.max(hi, h);
        }
        return hi - lo;
    };
    const find = (want) => {
        let best = null;
        for (let i = 0; i < 160; i++) {
            const a = Math.random() * 6.283, r = 120 + Math.random() * 500, x = def.x + Math.cos(a) * r, z = def.z + Math.sin(a) * r;
            if (H(x, z) < 3) continue; // (above the sea)
            // nothing built: the natural top blocks only
            const sp = open(x, z);
            if (sp == null) continue;
            const score = Math.abs(sp - want);
            if (!best || score < best.score) best = { score, x, z, sp };
        }
        return best;
    };
    for (const [name, want] of [['равнина', 0.5], ['склон', 9]]) {
        const f = find(want);
        sites.push({ name: `${name} (перепад ${f.sp.toFixed(1)} м)`, x: f.x, z: f.z });
    }
    for (const site of sites) for (const [name, r, pw] of [['Бомбардо', 4, 1], ['Максима', 9, 2]]) {
        moveMe(site.x, site.z);
        // put creatures in rings round the blast
        const placed = [];
        const ring = (n, rad) => { for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; placed.push({ x: site.x + Math.cos(a) * rad, z: site.z + Math.sin(a) * rad }); } };
        ring(6, 3); ring(8, 7); ring(10, 12);
        g.world.terrain.flushAround(site.x, site.z);
        const spawned = [];
        const types = ['pig', 'cow', 'sheep', 'horse'];
        placed.forEach((p, i) => {
            const y = g.collision.groundY(p.x, p.z);
            if (i % 3 === 0) { const a = g.animals._spawn(types[(i / 3 | 0) % 4], new T.Vector3(p.x, y + 0.5, p.z), {}); if (a) spawned.push(a); }
            else if (i % 3 === 1) { const z = g._createZombie(new T.Vector3(p.x, y, p.z)); spawned.push(z); }
        });
        // villagers: the ones of the site come to the blast (teleported onto the ground)
        const men = [...L.byId.values()].filter((v) => !v.dead && v.role !== 'king');
        placed.forEach((p, i) => { if (i % 3 === 2 && men[i]) { const v = men[i]; v.x = p.x; v.z = p.z; v.y = g.collision.groundY(p.x, p.z); v.path = null; v.vy = 0; } });
        for (let i = 0; i < 20; i++) { stand(); await frames(2); }
        const pos = new T.Vector3(site.x, g.collision.groundY(site.x, site.z) + 0.5, site.z);
        const floor = (e) => td.floorAt(e.x, e.z, e.y + (e.k.startsWith('man') ? 1.1 : 1)); // (the reach the game itself uses)
        const lieOf = (e) => (e.k.startsWith('animal') ? (e.c.lie || 0) * (e.c.dims?.legH || 0) * 0.9 : 0); // (a lying animal sits lower on purpose)
        // how deep the body's own parts are in the world (sampled vertices of the model, ground under each of them)
        const V = new T.Vector3();
        const rootOf = (e) => e.c.model?.root || e.c.model || e.c.group;
        const pen = (e) => {
            const root = rootOf(e); if (!root) return 0;
            root.updateMatrixWorld(true);
            let worst = 0;
            root.traverse((o) => {
                if (!o.isMesh || !o.visible || !o.geometry?.attributes?.position) return;
                const pos = o.geometry.attributes.position, step = Math.max(1, Math.floor(pos.count / 24));
                for (let i = 0; i < pos.count; i += step) {
                    V.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld);
                    const f = td.floorAt(V.x, V.z, e.y + 1.1); // (the floor of the creature's own level: a roof over it is not ground)
                    if (f - V.y > worst) { worst = f - V.y; pen.at = { vx: +V.x.toFixed(2), vy: +V.y.toFixed(2), vz: +V.z.toFixed(2), f, part: o.name || o.parent?.name || '' }; }
                }
            });
            return worst;
        };
        const base = new Map(), penBase = new Map();
        for (const e of all()) { const d = Math.hypot(e.x - pos.x, e.z - pos.z); if (d < 16) { base.set(e.id, e.y - floor(e)); penBase.set(e.id, pen(e)); } }
        g.explode(pos, r, g.localId, pw);
        const rec = new Map(), prevYs = new Map();
        const t0 = g.frameCount, wall0 = performance.now();
        const clock0 = L.wizards.fight.clock;
        let prevT = clock0;
        while (L.wizards.fight.clock - clock0 < seconds && performance.now() - wall0 < seconds * 6000) {
            stand(); await frames(1);
            const now = L.wizards.fight.clock, dt = now - prevT; prevT = now;
            for (const e of all()) {
                if (!base.has(e.id)) continue;
                if (e.c.airborne || e.c.vy || e.c.climb || e.c.lev || e.c.vel?.y) continue; // (in the air / on a ladder: not on the ground)
                e.prevY = prevYs.get(e.id); prevYs.set(e.id, +(e.y - floor(e)).toFixed(2));
                const sink = (base.get(e.id)) - lieOf(e) - (e.y - floor(e));
                if (g.frameCount % 2 === 0) {
                    let st = 'up'; for (const [, en] of g.creatureImpact.active) if (en.c === e.c) st = en.s.state;
                    const q = pen(e) - penBase.get(e.id);
                    const rr = rec.get(e.id) || { k: e.k, max: 0, s: 0, last: 0, d: 0 }; rr.pen = rr.pen || {}; const o = (rr.pen[st] ||= { max: 0, n: 0 }); if (q > o.max) { o.max = q; o.at = { ...pen.at, cx: +e.x.toFixed(2), cy: +e.y.toFixed(2), cz: +e.z.toFixed(2), cf: +floor(e).toFixed(2), t: +(g.frameCount - t0) }; } o.n++; rec.set(e.id, rr);
                }
                if (false) { const q = pen(e) - penBase.get(e.id); const rr = rec.get(e.id) || { k: e.k, max: 0, s: 0, last: 0, d: Math.hypot(e.x - pos.x, e.z - pos.z) }; rr.pmax = Math.max(rr.pmax || 0, q); if (q > 0.3) rr.ps = (rr.ps || 0) + dt * 3; rr.pst = rr.pst || {}; if (q > 0.3) { const st = e.c.state || e.c.mode || '?'; rr.pst[st] = (rr.pst[st] || 0) + 1; } rec.set(e.id, rr); }
                const r0 = rec.get(e.id) || { k: e.k, max: 0, s: 0, last: 0, d: Math.hypot(e.x - pos.x, e.z - pos.z) };
                if (sink > r0.max) r0.max = sink;
                if (sink > 0.15) r0.s += dt; // seconds spent sunk
                r0.last = sink;
                if (sink > r0.max - 1e-6) r0.worst = { x: +e.x.toFixed(2), y: +e.y.toFixed(2), z: +e.z.toFixed(2), floor: +floor(e).toFixed(2), reach1: +td.floorAt(e.x, e.z, e.y + 1).toFixed(2), surf: +td.surfaceY(e.x, e.z).toFixed(2), base: +base.get(e.id).toFixed(2), air: !!(e.c.airborne || e.c.vy), vy: +(e.c.vel?.y ?? e.c.vy ?? 0).toFixed(1), st: e.c.state || e.c.mode || null, dying: !!e.c.isDying, frz: !!e.c.isFrozen, hp: e.c.health ?? e.c.hp, wind: !!e.c.windVel, zvy: +(e.c.vy || 0).toFixed(2), rotx: +(e.c.group?.rotation?.x || 0).toFixed(2), prevY: e.prevY,  stun: +(e.c.stunT || 0).toFixed(1), t: +(now - clock0).toFixed(1) };
                rec.set(e.id, r0);
            }
        }
        // the corpses (Death.js bodies) and the fallen villagers: do they lie ON the ground?
        for (const b of g.death?.bodies?.values?.() || []) {
            const o = b.model || b.bones; if (!o || Math.hypot(b.x - pos.x, b.z - pos.z) > 20) continue;
            const f = td.floorAt(o.position.x, o.position.z, o.position.y + 1);
            rec.set('body' + b.id, { k: 'труп:' + b.k, max: f - o.position.y, s: 0, last: f - o.position.y, worst: { x: +o.position.x.toFixed(1), y: +o.position.y.toFixed(1), z: +o.position.z.toFixed(1), floor: f } });
        }
        results.push({ site: site.name, spell: name, rows: [...rec.entries()].map(([id, r]) => ({ id, ...r })).sort((a, b) => b.max - a.max) });
        // clean up the animals / zombies we added
        for (const a of spawned) { try { if (a.isDead === undefined) g.animals.remove?.(a); } catch (e) { /* ignore */ } }
    }
    return results;
}

const srv = await startServer(Number(opt('port', '8172')));
const browser = await launch({});
let code = 0;
try {
    const { page } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 480, height: 270 } });
    page.on('pageerror', (e) => console.log('[pageerror]', e.message));
    await page.evaluate((seed) => { let s = seed >>> 0 || 0x2545F491; Math.random = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }, SEED);
    await page.waitForFunction(() => !!window.__zns?.startGame);
    await page.evaluate((seed) => { const z = window.__zns; z.startGame({ ...z.readConfig(), mode: 'freeworld', map: null, seed, zombieCount: 0, graphics: '3', viewDistance: 'high' }); }, SEED);
    await page.waitForFunction(() => window.__zns.game && window.__zns.game.active, null, { timeout: 180000 });
    await waitHudVisible(page, 120000);
    await page.evaluate(() => {
        const g = window.__zns.game, data = g.world.terrain.data;
        g.dayStart = Date.now() - 0.3 * 24 * 60 * 1000;
        const t = data.castles.near(0, 0, 2500).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
        window.__site = t;
        g.character.group.position.set(t.gate.x, t.gate.y + 2.2, t.gate.z);
        g.world.terrain.flushAround(t.gate.x, t.gate.z);
    });
    await page.waitForFunction(() => { const L = window.__zns.game.castleLife; const cs = L.castles.get(window.__site.id); return cs?.awake && cs.active.size >= 4; }, null, { timeout: 90000, polling: 500 });
    const res = await page.evaluate(scene, { seconds: SECONDS });
    let bad = 0;
    for (const r of res) {
        console.log(`\n== ${r.site}, ${r.spell}: ${r.rows.length} существ`);
        const byKind = {};
        for (const w of r.rows) { if (w.max === undefined) continue; const k = (byKind[w.k] ||= { n: 0, max: 0, s: 0, stuck: 0 }); k.n++; k.max = Math.max(k.max, w.max); k.s = Math.max(k.s, w.s); if (w.last > LIMIT_M) k.stuck++; }
        for (const [k, v] of Object.entries(byKind)) {
            const fail = v.s > LIMIT_S || v.stuck > 0;
            if (fail) bad++;
            console.log(`${k.padEnd(18)} ${String(v.n).padStart(3)}  глубже всего ${v.max.toFixed(2)} м  дольше всего в земле ${v.s.toFixed(1)} с  остались в земле ${v.stuck}${fail ? '  <<< В ЗЕМЛЕ' : ''}`);
        }
    }
    if (args.includes('--dump')) for (const r of res) for (const w of r.rows.filter((q) => q.max > LIMIT_M).slice(0, 6)) console.log(r.site, r.spell, w.k, w.id, 'max', w.max.toFixed(2), 'last', w.last.toFixed(2), JSON.stringify(w.worst));
    if (args.includes('--pen')) {
        const agg = {};
        for (const r of res) for (const w of r.rows) for (const [st, o] of Object.entries(w.pen || {})) { const a = (agg[w.k + ' / ' + st] ||= { n: 0, max: 0, over: 0, N: 0 }); a.N++; a.max = Math.max(a.max, o.max); if (o.max > 0.4) a.over++; }
        for (const [k, a] of Object.entries(agg).sort()) console.log('тело', k.padEnd(28), 'существ', String(a.N).padStart(3), ' глубже всего', a.max.toFixed(2), 'м  больше 0,4 м у', a.over);
    }
    if (args.includes('--penDump')) for (const r of res) for (const w of r.rows) for (const [st, o] of Object.entries(w.pen || {})) if (o.max > 0.6) console.log(r.site, r.spell, w.k, st, o.max.toFixed(2), JSON.stringify(o.at));
    console.log('\nИтого проблемных групп:', bad);
    if (CHECK && bad) { console.log('НЕ ПРОШЛО'); code = 1; } else if (CHECK) console.log('ПРОШЛО');
} finally { await browser.close(); srv.stop(); }
process.exit(code);
