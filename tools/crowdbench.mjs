#!/usr/bin/env node
/**
 * crowdbench.mjs — how the people of the game really walk when something dreadful happens
 * (the author: «Нужно провести глобальный тест того, как вообще персонажи ходят в игре»).
 * Run:  node tools/crowdbench.mjs [--site tower|castle] [--seconds 40] [--extra 6] [--side 50] [--seed 20261015] [--check] [--out f.json] [--debug]
 *
 *   tower  — a wizards' tower: the player stands on the plaza and blows a hole in the tower's wall
 *            (the hole is carved straight into the world — the tower's stone may be charmed against
 *            «Бомбардо» — and then the blast itself goes off, as the player's «Бомбардо»);
 *   castle — the nearest castle's village: a blast in the street among the people;
 *   house  — a shut 6×6 house of walls on the plaza of the tower, the player inside: the wizards are sent to him
 *            («иди за мной» / search) — none may press into the wall for long or go through it; they stand off and let go.
 *
 * Every person of the site is recorded (4 times a second of game time) and judged:
 *   застрял   — wants to go (walks / runs / flees / has a path) and is not getting anywhere for 3 s;
 *   в стене   — the body (chest) inside blocks; сквозь стену — a step that went through a wall;
 *   к врагу   — a timid one fleeing who comes nearer to the attacker for over 3 s (or passes within 10 m of him);
 *   всё равно — one who heard it (near) and went on as before (no fear, no fight, no looking);
 *   толкотня  — two bodies inside each other (closer than 0.6 m, same floor);
 *   кругами   — a lot of walking and hardly any way made (10 s: path > 4 × the way made);
 *   упал      — dropped more than 2.5 m between two looks (into the hole, off a floor);
 *   атака     — the brave: how soon the first spell / blow, how many.
 * --check fails (exit 1) when anything of that is found beyond the LIMITS.
 */
import { startServer, launch, openPage, waitHudVisible, sleep } from '../tests/e2e/harness.mjs';
import fs from 'node:fs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const SITE = opt('site', 'tower');
const HOUSE = SITE === 'house';
const SECONDS = Number(opt('seconds', '40'));
const EXTRA = Number(opt('extra', SITE === 'tower' || HOUSE ? '6' : '0'));
const OUT = opt('out', null);
const CHECK = args.includes('--check');
const PORT = Number(opt('port', '8171'));
const SEED = parseInt(opt('seed', '20261015'), 10);
const SIDE = Number(opt('side', '50')) * Math.PI / 180; // (where on the tower's wall the hole is: degrees round from the door)
/** --check: what must hold (per run). */
const LIMITS = { stuckPeople: 0, wallSteps: 1, inWall: 0, towardFoe: 0, indifferent: 0, overlapS: 4, circling: 1, friendlyHits: 0 };

/** In the page: set the scene up, blow, record. */
async function scene({ site, seconds, extra, side }) {
    const SIDE = side;
    const g = window.__zns.game, L = g.castleLife, T = window.__zns.THREE;
    const td = g.world.terrain.data;
    const frames = async (n) => { const f = g.frameCount; while (g.frameCount < f + n) await new Promise((res) => setTimeout(res, 20)); };
    // daylight, nobody hurts the player (he only watches)
    g.combat.damage = () => {}; g.damageLocalPlayer = () => {}; if (g.impact) g.impact.apply = () => 'none';
    g.combat.stun = () => {}; g.combat.freeze = () => {}; if (g.knock) g.knock.knock = () => {}; if (g.knockback) g.knockback.add = () => {};
    const def = window.__site;
    const cs = L.castles.get(def.id);
    const out = site === 'tower' || site === 'house' ? new T.Vector3(def.gate.x - def.x, 0, def.gate.z - def.z).normalize() : null;
    // the player: on the plaza before the tower (28 m from its middle) / in the village street
    let me;
    if (site === 'tower' || site === 'house') me = { x: def.x + out.x * 30, z: def.z + out.z * 30 };
    else {
        const hs = (def.houses || []).filter((h) => h.inside);
        const h = hs.sort((a, b) => Math.hypot(a.inside.x - def.x, a.inside.z - def.z) - Math.hypot(b.inside.x - def.x, b.inside.z - def.z))[Math.floor(hs.length / 2)] || { inside: def.gate };
        me = { x: h.inside.x + 14, z: h.inside.z };
    }
    const stand = () => { const y = g.collision.groundY(me.x, me.z); g.character.group.position.set(me.x, y + 1.95, me.z); };
    stand();
    // the house: a ring of walls 6×6 round the player, 5 blocks high (built like the spell does: blocks of the world)
    let houseWalls = 0;
    if (site === 'house') {
        const cx = Math.round(me.x), cz = Math.round(me.z);
        for (let x = cx - 3; x <= cx + 3; x++) for (let z = cz - 3; z <= cz + 3; z++) {
            if (Math.max(Math.abs(x - cx), Math.abs(z - cz)) !== 3) continue;
            const f = td.floorBelow(x, z, 80);
            for (let L0 = f + 1; L0 <= f + 5; L0++) { td.set(x, L0, z, 3); houseWalls++; }
        }
        g.world.terrain.flushAround(me.x, me.z);
        window.__house = { cx, cz };
    }
    // more people about (the tower: students in the rooms of all the floors)
    for (let k = 0; k < extra; k++) {
        const rooms = cs.graph.tagged('room');
        const n = cs.graph.nodes[rooms[Math.floor(Math.random() * rooms.length)]];
        const idx = L._freeCommoner(cs, site === 'tower' ? 'student' : null);
        if (idx < 0 || !n) break;
        const v = L._activate(cs, idx, { x: n.x, y: n.y, z: n.z }, 'wander');
        if (v) { v.node = n.id; v.trips = 3; L._nextTrip(v); }
    }
    for (let i = 0; i < 40; i++) { stand(); await frames(3); }
    console.log('[bench] ready: ' + cs.active.size + ' people');
    if (site === 'house') {
        // every wizard and student of the tower comes to the player in the house (half «follow me», half «go and look who is there»)
        let k = 0;
        for (const v of cs.active.values()) {
            if (v.dead) continue;
            v.path = null; v.job = 'wander'; v.post = null; v.sleep = null; v.waitT = 0;
            if (k++ % 2) { v.follow = g.localId; v.followT = 120; v.followFar = true; }
            else v.investigate = { x: me.x, y: g.collision.groundY(me.x, me.z), z: me.z, by: g.localId, t: 120 };
        }
    }
    const clock = () => L.wizards.fight.clock;
    // where it goes off: the tower's wall facing the player, the ground floor (a hole ~4.5 m); the village: the street near the people
    let blast;
    // (the tower: its wall 50° round from the door — the hole is not the doorway — at the second floor's height)
    if (site === 'tower') { const c = Math.cos(SIDE), s = Math.sin(SIDE), ox = out.x * c - out.z * s, oz = out.x * s + out.z * c; blast = { x: def.x + ox * 16, y: def.gate.y + 5.5, z: def.z + oz * 16 }; }
    else {
        const ppl = [...cs.active.values()].filter((v) => !v.dead && v.role !== 'knight');
        const c = ppl.sort((a, b) => Math.hypot(a.x - me.x, a.z - me.z) - Math.hypot(b.x - me.x, b.z - me.z))[Math.min(2, ppl.length - 1)] || { x: me.x - 10, y: 0, z: me.z };
        blast = { x: c.x + 3, y: c.y + 1, z: c.z };
    }
    const R = 4.5;
    let carved = 0;
    if (site === 'tower') {
        for (let x = Math.floor(blast.x - R); x <= Math.ceil(blast.x + R); x++) for (let z = Math.floor(blast.z - R); z <= Math.ceil(blast.z + R); z++) {
            for (let L0 = Math.floor(blast.y - R + 1.5); L0 <= Math.ceil(blast.y + R + 1.5); L0++) {
                if ((x - blast.x) ** 2 + (z - blast.z) ** 2 + (L0 - 1 - blast.y) ** 2 > R * R) continue;
                if (td.get(x, L0, z)) { td.set(x, L0, z, 0); carved++; }
            }
        }
        g.world.terrain.flushAround(blast.x, blast.z);
    }
    // who is there before it
    const people = () => [...cs.active.values()];
    const fights = (v) => L._fights(v);
    const solid = (x, y, z) => { const L1 = Math.round(y + 1.5); return td.solidIn(Math.round(x), Math.round(z), L1 + 1, L1 + 2); };
    const rec = new Map();
    const look = (t) => {
        for (const v of people()) {
            let r = rec.get(v.id);
            if (!r) rec.set(v.id, (r = { id: v.id, role: v.role, wizard: !!v.wizard, brave: fights(v), knight: v.role === 'knight', s: [] }));
            const moving = v.mode === 'walk' || v.mode === 'run' || v.mode === 'flee';
            const path = !!(v.path && v.pathI < v.path.length);
            r.s.push({
                t: +t.toFixed(2), x: +v.x.toFixed(2), y: +v.y.toFixed(2), z: +v.z.toFixed(2), m: v.mode, sp: +(v.speed || 0).toFixed(2),
                want: (moving || path) && !(v.wallW?.noWay > 0), stand: v.wallW?.noWay > 0, dead: !!v.dead, foe: v.foe != null, flee: v.fleeT > 0 || !!v.fear, inv: !!v.investigate,
                busy: !!(v.stunT > 0 || v.vy || v.lev || v.climb || v.seated || v.sleep || v.flinchT > 0 || v.holdT != null || v.castT > 0),
                wall: solid(v.x, v.y, v.z), job: v.job, fear: v.fear?.state || null,
                // (for looking into one: its role in the fight, where it wants to stand, the path left, its flight's plan)
                wr: v.wt?.role || null, to: (v.wt?.spot || v.spot) ? [Math.round((v.wt?.spot || v.spot).x), Math.round((v.wt?.spot || v.spot).y ?? -99), Math.round((v.wt?.spot || v.spot).z)] : null,
                pl: path ? v.path.length - v.pathI : 0, fp: v.flee?.plan ? Object.keys(v.flee.plan)[0] : null,
            });
        }
    };
    const t0 = clock();
    look(0);
    // the blast — the player's «Бомбардо» (the world is already broken there for the tower)
    const casts = new Map();
    const add = g.duel._addBolt.bind(g.duel);
    g.duel._addBolt = (o) => { if (o.npc && o.by != null) { const c = casts.get(o.by) || { n: 0, first: null }; c.n++; if (c.first == null) c.first = clock() - t0; casts.set(o.by, c); } return add(o); };
    // who hurt whom (a spell of one of their own into another: friendly fire)
    const hits = [];
    const hit0 = L.hit.bind(L);
    L.hit = (v, dmg, dir, by, o) => {
        const own = by != null && cs.active.has?.(Number(String(by).split(':')[1]));
        hits.push({ t: +(clock() - t0).toFixed(1), v: v.id, by: by ?? null, dmg, spell: o?.kind || (o?.spell ? 'spell' : null), via: o?.via || null, ...(own && window.__crowdDebug ? { from: new Error().stack.split('\n').slice(2, 5).map((l) => l.trim().replace(/https?:\/\/[^/]+/, '')).join(' < ') } : {}) });
        return hit0(v, dmg, dir, by, o);
    };
    if (site !== 'house') g.explode(new T.Vector3(blast.x, blast.y, blast.z), 4, g.localId, 1);
    let next = 0.25, scanned = false;
    const debug = [];
    const wall0 = performance.now();
    while (clock() - t0 < seconds && performance.now() - wall0 < seconds * 8000) {
        stand();
        await frames(1);
        const t = clock() - t0;
        if (t >= next) { look(t); next += 0.25; if (Math.floor(t / 5) !== Math.floor((t - 0.25) / 5)) console.log(`[bench] ${t.toFixed(0)} с`); }
        if (window.__crowdDebug && !scanned && t > seconds / 2) {
            scanned = true; whyStuck();
            const pv = window.__probe;
            if (pv) {
                const log = [];
                const wrap = (name) => { const f = L[name]; L[name] = function (v, ...a) { if (v === pv) log.push(name + ' ' + a.slice(0, 3).map((q) => typeof q === 'number' ? q.toFixed(2) : q).join(',') + ' @' + v.x.toFixed(2) + ',' + v.z.toFixed(2) + ' pI' + v.pathI); return f.call(this, v, ...a); }; return () => { L[name] = f; }; };
                const un = ['_followPath', '_steer', '_goTo', '_goSpot', '_investigate', '_fight', '_tacStep'].map(wrap);
                for (let k = 0; k < 12; k++) { await frames(1); log.push('--- ' + pv.x.toFixed(2) + ',' + pv.z.toFixed(2) + ' ' + pv.mode); }
                un.forEach((u) => u());
                debug.push({ probe: pv.id, log });
            }
        }
    }
    // (--debug: why the fleeing ones go where they go)
    if (window.__crowdDebug) {
        const FP = await import('/src/game/FleePlan.js');
        for (const v of people()) {
            if (!(v.fleeT > 0)) continue;
            const T = L._threats(v), g2 = cs.graph;
            const from = g2.nearest(v.x, v.y, v.z), can = g2.reach(from, cs.cut);
            const ranked = FP.rankRefuges(g2.nodes.filter((n) => can.has(n.id)), v, T, { maxRun: 120 });
            const tries = ranked.map((id) => { const p = g2.path(from, id, { cut: cs.cut, cost: (n) => FP.threatCost(n, T) }); return { id, n: g2.nodes[id], len: p?.length ?? null, passes: p ? FP.pathPasses(p, g2.nodes, v, T) : null, worst: p ? Math.min(...p.map((k) => FP.threatDist(g2.nodes[k], T))).toFixed(1) : null }; });
            debug.push({ id: v.id, at: [v.x, v.y, v.z].map(Math.round), d: FP.threatDist(v, T).toFixed(1), roofed: L._roofed(v), from, reach: can.size, cut: cs.cut?.size || 0, nodes: g2.nodes.length, plan: v.flee?.plan, tries });
        }
    }
    if (window.__crowdDebug) whyStuck();
    function whyStuck() {
        // the ones standing with a way to go: why
        for (const v of people()) {
            const r = rec.get(v.id);
            if (!r || v.dead || !v.path || v.pathI >= v.path.length) continue;
            const a = r.s[Math.max(0, r.s.length - 12)], b = r.s[r.s.length - 1];
            if (Math.hypot(b.x - a.x, b.z - a.z) > 1.2) continue;
            const g2 = cs.graph, n = g2.nodes[v.path[v.pathI]], pn = v.pathI > 0 ? g2.nodes[v.path[v.pathI - 1]] : null;
            const d = Math.hypot(n.x - v.x, n.z - v.z), ux = (n.x - v.x) / d, uz = (n.z - v.z) / d;
            const near = L.game.crowd?.near(v.x, v.z, v.y, 3, v, 2.5, []).map((o) => ({ kind: o.kind, id: o.id, d: +Math.hypot(o.x - v.x, o.z - v.z).toFixed(2), v: +Math.hypot(o.vx, o.vz).toFixed(2) }));
            if (v.role === 'knight' && !window.__probe) window.__probe = v; // (one stuck knight: what moves it, frame by frame)
            debug.push({ order: v.order?.kind, foe: v.foe ?? null, tac: v.tac?.role, job: v.job, fleeT: v.fleeT, speed: v.speed, goal: v.goal, pathI: v.pathI, plen: v.path?.length, stuck: v.id, role: v.role, mode: v.mode, at: [v.x, v.y, v.z].map((q) => +q.toFixed(2)), node: [n.x, n.y, n.z], d: +d.toFixed(2), probe: L._walkable(v.x + ux * 0.5, v.z + uz * 0.5, v.y), probe2: L._walkable(v.x + ux * 1, v.z + uz * 1, v.y), edge: pn ? L._edgeWalkable(pn, n) : null, toNode: L._edgeWalkable(v, n), avoid: v._avoid, near, blockT: v.blockT, inv: !!v.investigate, fear: v.fear?.state });
        }
    }
    const strikes = {};
    for (const [id, c] of casts) strikes[id] = c;
    // the knights' blows: counted from their «attack» mode
    return { me, blast, carved, houseWalls, gameS: +(clock() - t0).toFixed(1), realS: +((performance.now() - wall0) / 1000).toFixed(1), people: [...rec.values()], casts: strikes, debug, hits, hostile: cs.hostile.has(g.localId), door: def.door || def.gate };
}

/** In Node: judge the recordings. */
function judge(res) {
    const me = res.me;
    const P = res.people;
    const rows = [];
    const sum = { people: P.length, stuckPeople: 0, stuckS: 0, inWall: 0, wallSteps: 0, towardFoe: 0, indifferent: 0, overlapS: 0, circling: 0, falls: 0, dead: 0, braveCast: 0, brave: 0, timid: 0, timidAway: 0 };
    const dist = (s) => Math.hypot(s.x - me.x, s.z - me.z);
    for (const r of P) {
        const s = r.s;
        if (s.length < 3) continue;
        const row = { id: r.id, role: r.role, kind: r.knight ? 'рыцарь' : r.wizard ? (r.brave ? 'смелый' : 'робкий') : 'житель', stuck: 0, wall: 0, through: 0, toward: 0, minD: Infinity, indiff: false, circ: 0, fall: 0, dead: false, firstCast: res.casts[r.id]?.first ?? null, casts: res.casts[r.id]?.n || 0, d0: +dist(s[0]).toFixed(1), d1: +dist(s[s.length - 1]).toFixed(1), what: '' };
        if (r.wizard && r.brave) sum.brave++;
        else if (r.wizard || !r.knight) sum.timid++;
        // stuck: 3 s windows of wanting to go without getting anywhere
        let stuckRun = 0;
        for (let i = 12; i < s.length; i++) {
            const a = s[i - 12], b = s[i];
            const want = s.slice(i - 12, i + 1).every((q) => q.want && !q.busy && !q.dead);
            const moved = Math.hypot(b.x - a.x, b.z - a.z) + Math.abs(b.y - a.y);
            if (want && moved < 0.5) { stuckRun += 0.25; } else stuckRun = 0;
            if (stuckRun > 0) row.stuck += 0.25;
        }
        for (let i = 0; i < s.length; i++) {
            const q = s[i];
            if (q.dead) { row.dead = true; break; }
            if (q.wall && !q.busy) row.wall++;
            if (i > 0) {
                const p = s[i - 1];
                if (!p.dead && p.y - q.y > 2.5) row.fall++;
                if (q.flee && !r.brave && dist(q) < 30 && dist(q) < dist(p) - 0.4 && q.sp > 1) row.toward += 0.25; // (far off, a way round a house is no running at him)
            }
            if (q.t > 2 && q.flee && !r.brave) row.minD = Math.min(row.minD, dist(q)); // (after the first moments: one standing right by him when it went off needs a moment to get away)
        }
        // a step through a wall: the straight line between two looks crosses solid where both ends are free
        row.through = s.filter((q, i) => i > 0 && q.thru).length;
        // indifferent: near (≤ 60 m from the player or the blast) and never reacted
        const near = Math.min(dist(s[0]), Math.hypot(s[0].x - res.blast.x, s[0].z - res.blast.z)) < 60;
        const reacted = s.some((q) => q.t > 0 && (q.foe || q.flee || q.inv || q.m === 'flee' || q.m === 'cast' || q.m === 'shield' || q.fear));
        if (near && !reacted && !s.slice(0, 9).some((q) => q.dead)) row.indiff = true; // (killed by it at once: no time to react)
        // circling: 10 s windows
        for (let i = 40; i < s.length; i += 4) {
            let path = 0;
            for (let k = i - 39; k <= i; k++) path += Math.hypot(s[k].x - s[k - 1].x, s[k].z - s[k - 1].z);
            const net = Math.hypot(s[i].x - s[i - 40].x, s[i].z - s[i - 40].z);
            if (path > 8 && path > 4 * net && !s[i].foe) row.circ++;
        }
        if (row.stuck >= 3) { sum.stuckPeople++; }
        sum.stuckS += row.stuck;
        if (row.wall) sum.inWall++;
        if (row.toward > 3 || row.minD < 10) sum.towardFoe++; // (a few steps round a corner are no running at him)
        if (row.indiff) sum.indifferent++;
        if (row.circ) sum.circling++;
        sum.falls += row.fall;
        if (row.dead) sum.dead++;
        if (row.casts) sum.braveCast++;
        if (!r.brave && row.d1 > row.d0 + 10) sum.timidAway++;
        rows.push(row);
    }
    // bodies inside each other (same look, same floor)
    const byT = new Map();
    // (only where the player can see: farther than 80 m people are not drawn, and the game doesn't keep them apart)
    for (const r of P) for (const q of r.s) { if (q.dead || dist(q) > 80) continue; (byT.get(q.t) || byT.set(q.t, []).get(q.t)).push(q); }
    for (const list of byT.values()) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (Math.abs(a.y - b.y) < 1.5 && Math.hypot(a.x - b.x, a.z - b.z) < 0.6) sum.overlapS += 0.25;
    }
    sum.stuckS = +sum.stuckS.toFixed(1);
    sum.overlapS = +sum.overlapS.toFixed(1);
    return { sum, rows };
}

const srv = await startServer(PORT);
const browser = await launch({});
let code = 0;
try {
    const { page } = await openPage(browser, srv.url, { noCamera: true, viewport: { width: 480, height: 270 } });
    page.on('console', (m) => { if (m.text().startsWith('[bench]')) console.log(m.text()); });
    // the same world and the same random choices every run (so a run before a change and after it compare)
    await page.evaluate((seed) => {
        let s = seed >>> 0 || 0x2545F491;
        Math.random = () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
    }, SEED);
    await page.waitForFunction(() => !!window.__zns?.startGame);
    await page.evaluate((seed) => { const z = window.__zns; z.startGame({ ...z.readConfig(), mode: 'freeworld', map: null, seed, zombieCount: 0, graphics: '3', viewDistance: 'high' }); }, SEED);
    await page.waitForFunction(() => window.__zns.game && window.__zns.game.active, null, { timeout: 180000 });
    await waitHudVisible(page, 120000);
    await page.evaluate((site) => {
        const g = window.__zns.game, data = g.world.terrain.data;
        g.dayStart = Date.now() - 0.3 * 24 * 60 * 1000; // (daylight: mid-morning of the game's 24-minute day)
        const list = site === 'tower' || site === 'house' ? data.towers.near(0, 0, 4000) : data.castles.near(0, 0, 2500);
        const t = list.sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z))[0];
        window.__site = t;
        g.character.group.position.set(t.gate.x, t.gate.y + 2.2, t.gate.z);
        g.world.terrain.flushAround(t.gate.x, t.gate.z);
    }, SITE);
    await page.waitForFunction(() => { const L = window.__zns.game.castleLife; const cs = L.castles.get(window.__site.id); return cs?.awake && cs.active.size >= 4; }, null, { timeout: 90000, polling: 500 });
    await sleep(1500);
    // (the recorder marks steps through walls on the page side: the line between two looks)
    if (args.includes('--debug')) await page.evaluate(() => { window.__crowdDebug = true; });
    const res = await page.evaluate(scene, { site: SITE, seconds: SECONDS, extra: EXTRA, side: SIDE });
    if (res.debug?.length) for (const d of res.debug) console.log(JSON.stringify(d));
    // steps through walls: checked again on the page with the world at hand
    const thru = await page.evaluate((people) => {
        const td = window.__zns.game.world.terrain.data;
        const out = {};
        for (const r of people) {
            let n = 0;
            for (let i = 1; i < r.s.length; i++) {
                const a = r.s[i - 1], b = r.s[i];
                if (a.dead || b.dead || a.busy || b.busy || a.wall || b.wall) continue;
                const d = Math.hypot(b.x - a.x, b.z - a.z);
                if (d < 0.6 || Math.abs(b.y - a.y) > 1.2) continue;
                const k = Math.ceil(d / 0.3);
                for (let j = 1; j < k; j++) {
                    const x = a.x + (b.x - a.x) * j / k, z = a.z + (b.z - a.z) * j / k, y = a.y + (b.y - a.y) * j / k;
                    const L1 = Math.round(y + 1.5);
                    if (td.solidIn(Math.round(x), Math.round(z), L1 + 1, L1 + 2)) { n++; b.thru = true; break; }
                }
            }
            out[r.id] = n;
        }
        return out;
    }, res.people);
    for (const r of res.people) { const n = thru[r.id] || 0; r.thru = n; }
    const { sum, rows } = judge(res);
    sum.wallSteps = res.people.reduce((a, r) => a + (r.thru || 0), 0);
    for (const row of rows) row.through = thru[row.id] || 0;
    console.log(`\n== ${SITE === 'tower' ? 'Башня волшебников' : 'Замок и деревня'}: ${sum.people} человек, ${res.gameS} с игры (${res.realS} с на часах), дыра: ${res.carved} блоков, враг для них: ${res.hostile ? 'да' : 'нет'}`);
    console.log('кто        роль       было→стало м  застрял с  в стене  сквозь  к врагу с  ближе всего  всё равно  кругами  упал  заклинаний (первое, с)');
    for (const r of rows) {
        console.log(`${r.kind.padEnd(10)} ${String(r.role).padEnd(10)} ${String(r.d0).padStart(5)}→${String(r.d1).padEnd(6)} ${String(r.stuck).padStart(8)}  ${String(r.wall).padStart(7)}  ${String(r.through).padStart(6)}  ${String(r.toward).padStart(9)}  ${(Number.isFinite(r.minD) ? r.minD.toFixed(1) : '—').padStart(11)}  ${(r.indiff ? 'ДА' : '').padStart(9)}  ${String(r.circ).padStart(7)}  ${String(r.fall).padStart(4)}  ${r.casts ? `${r.casts} (${r.firstCast.toFixed(1)})` : ''}${r.dead ? '  погиб' : ''}`);
    }
    const own = (res.hits || []).filter((h) => h.by != null && res.people.some((p) => p.id === h.by));
    sum.friendlyHits = own.length;
    if (own.length) console.log('свои по своим:', own.map((h) => `${h.t}с ${h.by}→${h.v} ${h.spell || ''}${h.via ? ' ' + h.via : ''} −${h.dmg}${h.from ? ' [' + h.from + ']' : ''}`).join('; '));
    console.log('\nИтого:', JSON.stringify(sum));
    if (OUT) fs.writeFileSync(OUT, JSON.stringify({ site: SITE, sum, rows, raw: res }, null, 1));
    if (CHECK) {
        const bad = Object.entries(LIMITS).filter(([k, lim]) => (sum[k] ?? 0) > lim);
        if (bad.length) { console.log('НЕ ПРОШЛО:', bad.map(([k, lim]) => `${k} ${sum[k]} > ${lim}`).join(', ')); code = 1; } else console.log('ПРОШЛО');
    }
} finally {
    await browser.close();
    srv.stop();
}
process.exit(code);
