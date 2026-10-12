import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLayout, floorAt, roomAt, hullHalfWidth } from '../../src/game/ShipLayout.js';
import { ShipPose, ShipCollider } from '../../src/game/ShipCollision.js';
import { stepShip, newShipState, mooringForces } from '../../src/game/ShipPhysics.js';
import { SHIP_CLASSES, HELM_LOCK } from '../../src/game/ShipTypes.js';
import { polar, unwrap, steer, rimDist, HELM } from '../../src/game/HelmMath.js';
import { blastDamage, holeRadius, leakRate, stepFire, stepSinking } from '../../src/game/ShipDamage.js';
import { packShip, unpackShip } from '../../src/game/Ships.js';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { SPELL_COST } from '../../src/game/Combat.js';
import { CollisionWorld } from '../../src/world/Collision.js';
import { rollShipLoot } from '../../src/game/ItemTypes.js';

const CLASSES = ['pinnace', 'fluyt', 'galleon'];

test('ship layouts: every crew node stands on a floor, the walking graph is connected, nothing solid on a path', () => {
    for (const c of CLASSES) {
        const L = buildLayout(c);
        for (const n of L.nodes) assert.ok(Math.abs(floorAt(L, n.x, n.z, n.y + 0.5) - n.y) < 0.05, `${c} node ${n.id}`);
        const adj = L.nodes.map(() => []);
        for (const [a, b] of L.edges) { adj[a].push(b); adj[b].push(a); }
        const seen = new Set([0]), st = [0];
        while (st.length) for (const j of adj[st.pop()]) if (!seen.has(j)) { seen.add(j); st.push(j); }
        assert.equal(seen.size, L.nodes.length, `${c} graph connected`);
        for (const [a, b] of L.edges) {
            const A = L.nodes[a], B = L.nodes[b];
            for (let t = 0; t <= 1; t += 0.1) {
                const x = A.x + (B.x - A.x) * t, z = A.z + (B.z - A.z) * t, y = A.y + (B.y - A.y) * t;
                const f = floorAt(L, x, z, y + 1.05);
                assert.ok(f !== null && Math.abs(f - y) < 1.1, `${c} edge ${a}-${b} has a floor`);
            }
        }
        assert.ok(L.cannons.length >= 2 && L.racks.length === L.cannons.length, `${c} has guns`);
        assert.ok(L.sails.length >= 4);
        // the hero's hands at shoulder height reach the top of the wheel
        assert.ok(Math.abs(L.helm.stand.y + 3.25 - (L.helm.y + L.helm.rimR)) < HELM.GRAB_R + 0.6);
        // headroom in the captain's cabin
        const cab = L.rooms.find((r) => r.id === 'captain');
        assert.ok(cab.top - cab.y >= 5.4);
        assert.equal(roomAt(L, 2, L.deck + 1, (cab.z0 + cab.z1) / 2)?.id, 'captain');
    }
});

test('ShipPose: world ⇄ local round trip; the bow is the hero\'s forward', () => {
    const P = new ShipPose();
    for (let i = 0; i < 50; i++) {
        P.set(Math.random() * 100, Math.random(), Math.random() * 100, Math.random() * 6, (Math.random() - 0.5) * 0.2, (Math.random() - 0.5) * 0.2);
        const w = P.toWorld(3, 5, -7, {}), l = P.toLocal(w.x, w.y, w.z, {});
        assert.ok(Math.abs(l.x - 3) < 1e-9 && Math.abs(l.y - 5) < 1e-9 && Math.abs(l.z + 7) < 1e-9);
    }
    P.set(0, 0, 0, Math.PI / 2);
    const w = P.toWorld(0, 0, -1, {});
    assert.ok(Math.abs(w.x + 1) < 1e-9 && Math.abs(w.z) < 1e-9);
});

test('a ship as a mover: decks are floors, the rail holds a walker in, masts push out, a swimmer stays out', () => {
    const L = buildLayout('galleon');
    const col = new ShipCollider(L);
    const P = new ShipPose().set(100, -0.62, 50, 0.3);
    col.setPose(P);
    const cw = new CollisionWorld();
    cw.addMover(col);
    const on = P.toWorld(3, 0, -0.5, {});
    assert.ok(Math.abs(cw.groundAt(on.x, on.z, P.y + L.deck + 1) - (P.y + L.deck)) < 1e-6, 'standing on the deck');
    const q = L.floors.find((f) => f.id === 'quarter');
    const under = P.toWorld(2, 0, q.z0 + 4, {});
    assert.ok(Math.abs(cw.groundAt(under.x, under.z, P.y + L.deck + 1) - (P.y + L.deck)) < 1e-6, 'under the quarterdeck: the main deck');
    // walking outwards to starboard: the rail stops
    const pos = { x: on.x, y: 0, z: on.z };
    for (let i = 0; i < 12; i++) {
        const d = P.dirToWorld(0.9, 0, {});
        pos.x += d.x; pos.z += d.z;
        cw.resolveCylinder(pos, 0.48, P.y + L.deck, 3.5);
    }
    const l = P.toLocal(pos.x, 0, pos.z, {});
    assert.ok(Math.abs(l.x) <= hullHalfWidth(L, l.z, L.deck) - 0.4 - 0.47, `inside the rail (${l.x})`);
    // a mast
    const m = L.masts[1];
    const mp = P.toWorld(0.3, 0, m.z, {});
    const body = { x: mp.x, y: 0, z: mp.z };
    assert.ok(cw.resolveCylinder(body, 0.48, P.y + L.deck, 3.5), 'pushed out of the mast');
    // a swimmer beside the hull stays outside
    const sw = P.toWorld(L.B / 2 + 1.5, 0, 0, {});
    const swim = { x: sw.x, y: 0, z: sw.z };
    for (let i = 0; i < 10; i++) { const d = P.dirToWorld(-0.6, 0, {}); swim.x += d.x; swim.z += d.z; cw.resolveCylinder(swim, 0.48, P.y - 1.5, 3.5); }
    assert.ok(Math.abs(P.toLocal(swim.x, 0, swim.z, {}).x) > hullHalfWidth(L, 0, 0), 'outside the hull');
    assert.ok(cw.pointBlocked(on.x, P.y - 2, on.z), 'the closed hold is solid');
    assert.ok(!cw.pointBlocked(on.x, P.y + L.deck + 2, on.z), 'the air above the deck is free');
});

test('ship physics: heavy (slow to gather way, coasts long), the rudder turns only a moving ship, aback, moorings', () => {
    const G = SHIP_CLASSES.galleon;
    const st = newShipState(0, 0, 0);
    st.tau = Infinity; st.spellWind = { x: 0, z: -14 };
    const u = [];
    for (let t = 1; t <= 60; t++) { stepShip(st, G, { openFrac: 1 }, 1); u[t] = st.u; }
    assert.ok(u[5] > 1 && u[5] < 2, `u(5) ${u[5]}`);
    assert.ok(u[20] > 3.6 && u[20] < 4.8, `u(20) ${u[20]}`);
    assert.ok(u[60] > 5.6 && u[60] < 6.2, `u(60) ${u[60]}`);
    const furled = newShipState(0, 0, 0); furled.spellWind = { x: 0, z: -14 }; furled.tau = Infinity;
    stepShip(furled, G, { openFrac: 0 }, 10);
    assert.equal(furled.u, 0, 'furled sails: no thrust');
    const c = newShipState(0, 0, 0); c.u = 5;
    stepShip(c, G, { openFrac: 0 }, 60);
    assert.ok(c.u > 1, 'still moving after 60 s');
    stepShip(c, G, { openFrac: 0 }, 40);
    assert.ok(c.u < 1, 'nearly stopped after 100 s');
    const r = newShipState(0, 0, 0); r.wheel = HELM_LOCK; r.forced = { u: 4 };
    stepShip(r, G, { openFrac: 0 }, 45);
    assert.ok(r.yaw < -Math.PI / 2, 'full wheel to starboard turns the bow to starboard');
    const s0 = newShipState(0, 0, 0); s0.wheel = HELM_LOCK;
    stepShip(s0, G, { openFrac: 0 }, 20);
    assert.ok(Math.abs(s0.yaw) < 0.01, 'a ship at rest does not turn');
    const ab = newShipState(0, 0, 0); ab.spellWind = { x: 0, z: 14 }; ab.tau = Infinity;
    stepShip(ab, G, { openFrac: 1 }, 10);
    assert.ok(ab.u < 0, 'wind from ahead pushes it astern');
    const d = newShipState(0, 0, 0); d.spellWind = { x: 0, z: -10 }; d.tau = 45;
    stepShip(d, G, { openFrac: 0 }, 6);
    const k = Math.hypot(d.spellWind.x, d.spellWind.z) / 10;
    assert.ok(k > 0.83 && k < 0.92, 'the wind dies down');
    // moorings hold a ship against plain wind
    const m = newShipState(0, 0, 0); m.spellWind = { x: 0, z: -7 }; m.tau = Infinity;
    const lines = [{ bitt: { x: 0, z: -35 }, bollard: { x: 8, z: -35 }, L0: 8.5, state: 'tied' }, { bitt: { x: 0, z: 37 }, bollard: { x: 8, z: 37 }, L0: 8.5, state: 'tied' }];
    stepShip(m, G, { openFrac: 1, moorings: lines }, 60);
    assert.ok(Math.abs(m.z) < 10, `moored: drifted ${Math.hypot(m.x, m.z).toFixed(2)} m`);
    assert.ok(lines.every((l) => l.state === 'tied'));
    assert.ok(mooringForces(newShipState(0, 0, 0), G, []).u === 0);
});

test('the wheel by hand: angles, unwrap, steering speed, the lock, rim distance', () => {
    assert.equal(polar(0, 1), 0);
    assert.ok(Math.abs(polar(1, 0) - Math.PI / 2) < 1e-12);
    assert.ok(Math.abs(unwrap(3.1, -3.1) - (2 * Math.PI - 3.1)) < 1e-9);
    let w = 0;
    for (let i = 0; i < 10; i++) w = steer(w, [{ a0: 0, w0: 0, a: 0.5 }], 0.1, 0);
    assert.ok(Math.abs(w - 0.5 * HELM.GAIN) < 1e-9); // (the wheel goes round with the hand)
    const fast = steer(0, [{ a0: 0, w0: 0, a: 5 }], 1, 8);
    assert.ok(fast <= 2.4 + 1e-9);
    assert.ok(steer(0, [{ a0: 0, w0: 0, a: 100 }], 100, 0) <= HELM.LOCK + 1e-9);
    assert.ok(Math.abs(steer(0, [{ a0: 0, w0: 0, a: 0.4 }, { a0: 0, w0: 0, a: 0.2 }], 10, 0) - 0.3 * HELM.GAIN) < 1e-9);
    assert.ok(Math.abs(steer(1, [], 1, 4)) < 1);
    assert.equal(rimDist(0, 1.45, 0, 1.45, 1.85), 0);
    assert.ok(Math.abs(rimDist(0, 1.45, 0.3, 1.45, 1.85) - 0.3) < 1e-9);
});

test('damage: blasts, holes, leaks, fire, sinking to a wreck', () => {
    assert.equal(blastDamage(0, 3.6, 1), 35);
    assert.equal(blastDamage(10, 3.6, 1), 0);
    assert.ok(Math.abs(holeRadius(3.6) - 2.16) < 1e-9);
    assert.ok(Math.abs(leakRate([{ wy: -1, r: 1.26 }], -0.62, 1) - 0.0095) < 0.0005);
    assert.equal(leakRate([{ wy: 2, r: 1.26 }], -0.62, 1), 0);
    let seed = 1;
    const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const st = { fires: [{ lx: 0, ly: 6, lz: 0, k: 1, age: 0, sail: 'main:course' }], sails: [{ id: 'main:course', burnt: 0, open: 1, center: { x: 0, y: 20, z: 0 } }] };
    let t = 0;
    while (st.sails[0].burnt < 1 && t < 30) { stepFire(st, 0.1, rng); t += 0.1; }
    assert.ok(t > 7 && t < 10.5, `a sail burns in ${t.toFixed(1)} s`);
    const s = { listSide: 1 };
    let i = 0;
    while (!s.wreck && i++ < 3000) stepSinking(s, SHIP_CLASSES.pinnace, 0.1, -12, -0.62);
    assert.ok(s.wreck && s.flooded && Math.abs(s.sinkRoll) <= 0.38 + 1e-9);
});

test('ships on the network and in chests; the sail spells', () => {
    const s = { id: 'a:ship0', st: { x: 1.234, z: -5.678, yaw: 0.12345, u: 2.5, v: 0.1, r: 0.01, wheel: 1.5 }, state: 'moored', plank: { state: 'laid' }, hp: 99.6, flood: 0.25, sinkY: 0, flooded: false };
    const n = unpackShip(packShip(s));
    assert.equal(n.id, 'a:ship0');
    assert.ok(Math.abs(n.x - 1.23) < 0.01 && n.state === 'moored' && n.plank === 'laid' && n.hp === 100 && n.flood === 0.25);
    for (const t of ['анфёрл', 'Анферл!', 'unfurl', 'open sails', 'подними паруса']) assert.equal(matchSpell(t), 'Unfurl', t);
    assert.equal(matchSpell('анфёрл максима'), 'UnfurlMaxima');
    for (const t of ['фёрл', 'убрать паруса', 'furl']) assert.equal(matchSpell(t), 'Furl', t);
    assert.equal(matchSpell('вайнд'), 'Wind');
    assert.equal(matchSpell('бомбардо максима'), 'BombardoMaxima');
    assert.equal(matchSpell('reveal'), 'Reveal');
    assert.ok(SPELL_COST.Unfurl && SPELL_COST.UnfurlMaxima && SPELL_COST.Furl);
    let seed = 7;
    const r = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const loot = rollShipLoot(r, true);
    assert.ok(loot.length >= 2 && loot.every((it) => it.kind && it.uid));
});

test('ships: every crew path can be walked (never in under a stair, never through a wall)', () => {
    for (const cls of ['pinnace', 'fluyt', 'galleon']) {
        const L = buildLayout(cls);
        for (const [a, b] of L.edges) for (const [p, q] of [[a, b], [b, a]]) {
            const A = L.nodes[p], B = L.nodes[q], v = { x: A.x, y: A.y, z: A.z };
            let ok = false;
            for (let i = 0; i < 600 && !ok; i++) {
                const dt = 1 / 30, dx = B.x - v.x, dz = B.z - v.z, d = Math.hypot(dx, dz);
                if (d < 0.6) { ok = true; break; }
                const step = Math.min(d, 1.6 * dt), nx = v.x + (dx / d) * step, nz = v.z + (dz / d) * step;
                const f = floorAt(L, nx, nz, v.y + 1.1);
                if (f === null || f <= v.y - 3) continue;
                v.x = nx; v.z = nz; v.y += (f - v.y) * Math.min(1, dt * 10);
                const half = hullHalfWidth(L, v.z, Math.max(0.2, v.y)) - 0.9;
                if (Math.abs(v.x) > half) v.x = Math.sign(v.x) * half;
                for (const s of L.solids) {
                    if (s.y1 <= v.y + 0.6 || s.y0 >= v.y + 3.5) continue;
                    const cx = Math.max(s.x0, Math.min(s.x1, v.x)), cz = Math.max(s.z0, Math.min(s.z1, v.z));
                    const ex = v.x - cx, ez = v.z - cz, ed = Math.hypot(ex, ez);
                    if (ed < 0.5 && ed > 1e-4) { v.x = cx + (ex / ed) * 0.5; v.z = cz + (ez / ed) * 0.5; }
                }
            }
            assert.ok(ok, `${cls}: ${p} → ${q} gets stuck`);
        }
        // nobody stands on the deck inside a stair: under every stair higher than a step it is solid
        for (const r of L.ramps) {
            const z = r.az + (r.bz - r.az) * 0.7, y = r.ay + (r.by - r.ay) * 0.7, lo = Math.min(r.ay, r.by);
            assert.ok(L.solids.some((s) => s.kind === 'stair' && r.ax >= s.x0 && r.ax <= s.x1 && z >= s.z0 && z <= s.z1 && s.y0 <= lo && s.y1 > y - 0.4), `${cls} ${r.id}`);
        }
    }
});
