#!/usr/bin/env node
/**
 * guardbench.mjs — do the king's knights guard him? (the author: «рыцари тоже помогали и защищали игрока-короля»)
 * Run:  node tools/guardbench.mjs [--no-guard] [--zombies 6] [--seconds 40] [--walk] [--hp 100] [--seed 20261015] [--check]
 *
 * The nearest castle is the player's (he is its owner), the army is gathered to him («gather_army»), then zombies come at him
 * from different sides (and he walks, with --walk). Counted: how many times the king was hit (and when), how soon each zombie died
 * and who killed it, knights stuck / inside each other / inside a wall, the swing frames, frame time.
 * --no-guard turns the bodyguards off (the old behaviour) to compare. --check fails when the guard does worse than LIMITS.
 */
import { startServer, launch, openPage, waitHudVisible, sleep } from '../tests/e2e/harness.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const NOGUARD = args.includes('--no-guard');
const WALK = args.includes('--walk');
const N = Number(opt('zombies', '6'));
const SECONDS = Number(opt('seconds', '40'));
const PORT = Number(opt('port', '8173'));
const SEED = parseInt(opt('seed', '20261015'), 10);
const CHECK = args.includes('--check');
const LIMITS = { kingHits: 2, alive: 0, stuck: 0, overlapS: 4, wallS: 0 };

async function scene({ noguard, walk, n, seconds, args_detail }) {
    const g = window.__zns.game, L = g.castleLife, T = window.__zns.THREE;
    const frames = async (k) => { const f = g.frameCount; while (g.frameCount < f + k) await new Promise((res) => setTimeout(res, 20)); };
    const def = window.__site, cs = L.castles.get(def.id);
    const td = g.world.terrain.data;
    if (noguard) { L.guard.update = () => {}; L.guard.step = () => false; }
    let kingHits = 0; const hitT = [];
    const clk = () => L.wizards.fight.clock; // (game seconds: the headless browser draws slowly, the game's own clock is what counts)
    const clock0 = clk();
    g.combat.damage = (a) => { kingHits++; hitT.push(+(clk() - clock0).toFixed(1)); };
    g.damageLocalPlayer = () => { kingHits++; hitT.push(+(clk() - clock0).toFixed(1)); };
    g._zombieSun = () => {}; // (daylight: the sun would burn the zombies down by itself)
    let knightBlows = 0; const dz0 = g.damageZombie.bind(g); g.damageZombie = (...a) => { knightBlows++; return dz0(...a); };
    if (g.impact) g.impact.apply = () => 'none';
    L.state(def.id).owner = g.localId; // (the king: he took the castle)
    const hs = (def.houses || []).filter((h) => h.inside);
    const me = { x: def.gate.x + (def.gate.x - def.x) * 0.3, z: def.gate.z + (def.gate.z - def.z) * 0.3 };
    const stand = () => { const y = g.collision.groundY(me.x, me.z); g.character.group.position.set(me.x, y + 1.95, me.z); };
    stand();
    for (let i = 0; i < 30; i++) { stand(); await frames(3); }
    const knight = [...cs.active.values()].find((v) => v.role === 'knight') || [...cs.active.values()][0];
    L.orders.run(knight, 'gather_army', {}, g.localId);
    for (let i = 0; i < 160; i++) { stand(); await frames(3); } // (they come out and gather)
    const army = [...cs.active.values()].filter((v) => v.role === 'knight' && v.follow === g.localId);
    // zombies from several sides
    const zs = [];
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + 0.3, r = 18 + (i % 3) * 7;
        const x = me.x + Math.cos(a) * r, z = me.z + Math.sin(a) * r;
        const y = g.collision.groundY(x, z);
        const zz = g._createZombie(new T.Vector3(x, y, z));
        if (zz) zs.push(zz);
    }
    const rec = new Map();
    let nearest = Infinity;
    const solid = (x, y, z) => { const L1 = Math.round(y + 1.5); return td.solidIn(Math.round(x), Math.round(z), L1 + 1, L1 + 2); };
    let overlapS = 0, wallS = 0, maxFrame = 0, sumFrame = 0, nF = 0, ringSum = 0, ringN = 0, last = performance.now(), lastG = clk();
    const t0 = clk(), t0w = performance.now();
    let heading = 0;
    while (clk() - t0 < seconds && performance.now() - t0w < seconds * 6000) {
        stand();
        await frames(1);
        const now = performance.now(); const wallFt = now - last; last = now; maxFrame = Math.max(maxFrame, wallFt); sumFrame += wallFt; nF++;
        const gt = clk(); const ft = Math.max(0, (gt - lastG) * 1000); lastG = gt; // (ms of game time this look covers)
        if (walk) { const k = ft / 1000 * 4; me.x += Math.cos(heading) * k; me.z += Math.sin(heading) * k; heading += 0.0008 * ft / 16; } // (the king walks at 4 m/s)
        const live = army.filter((v) => !v.dead);
        for (const z of zs) if (!z.isDead && !z.isDying) nearest = Math.min(nearest, Math.hypot(z.group.position.x - me.x, z.group.position.z - me.z));
        for (const v of live) {
            let r = rec.get(v.id); if (!r) rec.set(v.id, (r = { x: v.x, z: v.z, t: 0, want: 0 }));
            const wants = v.mode === 'walk' || v.mode === 'run';
            r.want = wants ? r.want + ft / 1000 : 0;
            r.t += ft / 1000;
            if (r.t >= 3) { if (wants && r.want >= 3 && Math.hypot(v.x - r.x, v.z - r.z) < 0.5) r.stuck = (r.stuck || 0) + 1; r.x = v.x; r.z = v.z; r.t = 0; }
            if (solid(v.x, v.y, v.z)) wallS += ft / 1000;
            const d = Math.hypot(v.x - me.x, v.z - me.z); ringSum += d; ringN++;
        }
        for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) if (Math.hypot(live[i].x - live[j].x, live[i].z - live[j].z) < 0.6 && Math.abs(live[i].y - live[j].y) < 1.5) overlapS += ft / 1000;
        if (zs.every((z) => z.isDead || z.isDying)) { if (!rec.done) rec.done = gt - t0; if (gt - t0 > rec.done + 3) break; }
    }
    const detail = army.map((v) => ({ id: v.id, d: +Math.hypot(v.x - me.x, v.z - me.z).toFixed(1), mode: v.mode, sp: +(v.speed || 0).toFixed(1), path: !!(v.path && v.pathI < v.path.length), slot: !!v.gSlot, foe: v.gFoe?.key || null, own: v.gOwner, y: +(v.y - (g.character.group.position.y - 1.95)).toFixed(1) }));
    return {
        detail: args_detail ? detail : undefined,
        army: army.length, knightBlows, zombieNearest: +nearest.toFixed(1), alive: zs.filter((z) => !z.isDead && !z.isDying).length, killedAt: rec.done ?? null, kingHits, hitT,
        stuck: [...rec.values()].filter((r) => r.stuck).length, overlapS: +overlapS.toFixed(1), wallS: +wallS.toFixed(1),
        maxFrame: +maxFrame.toFixed(1), avgFrame: +(sumFrame / Math.max(1, nF)).toFixed(1), avgRing: +(ringSum / Math.max(1, ringN)).toFixed(1),
        knightsHurt: army.filter((v) => v.hp < (v.maxHp ?? 1e9)).length, dead: army.filter((v) => v.dead).length,
    };
}

const srv = await startServer(PORT);
const browser = await launch({});
let code = 0;
try {
    const { page } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 480, height: 270 } });
    await page.evaluate((seed) => {
        let s = seed >>> 0 || 0x2545F491;
        Math.random = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    }, SEED);
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
    await sleep(1500);
    const r = await page.evaluate(scene, { noguard: NOGUARD, walk: WALK, n: N, seconds: SECONDS, args_detail: args.includes('--detail') });
    console.log(`\n== Охрана короля (${NOGUARD ? 'БЕЗ охраны' : 'с охраной'}${WALK ? ', король идёт' : ''}): рыцарей ${r.army}, зомби ${N}`);
    if (r.detail) for (const d of r.detail) console.log(JSON.stringify(d));
    delete r.detail;
    console.log(JSON.stringify(r));
    if (CHECK) {
        const bad = Object.entries(LIMITS).filter(([k, lim]) => (r[k] ?? 0) > lim);
        if (r.army < 2) bad.push(['army', r.army]);
        if (bad.length) { console.log('НЕ ПРОШЛО:', bad.map(([k, v]) => `${k} ${r[k] ?? v}`).join(', ')); code = 1; } else console.log('ПРОШЛО');
    }
} finally {
    await browser.close();
    srv.stop();
}
process.exit(code);
