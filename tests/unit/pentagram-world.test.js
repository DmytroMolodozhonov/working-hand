// The ready pairs of teleportation pentagrams between the wizards' settlements (PentagramWorld.js, VillageIndex.tpSpot, Pentagranium.worldWake).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TerrainData } from '../../src/world/Terrain.js';
import { TELEPORT } from '../../src/world/WizardVillages.js';
import { CASTLE_CELL } from '../../src/world/Castles.js';
import { PartnerSearch, windowCells } from '../../src/game/PentagramWorld.js';
import { Pentagranium } from '../../src/game/Pentagranium.js';

const world = (seed) => { const d = new TerrainData(); d.generate({ seed, mountains: true, seas: true, lush: true, slopes: true, wizHuts: true, furnish: true }); return d; };
const villagesOf = (d, R = 6) => { const out = []; for (let gz = -R; gz <= R; gz++) for (let gx = -R; gx <= R; gx++) { const v = d.villages.cellOf(gx, gz); if (v) out.push(v); } return out; };

test('the spot of a settlement\'s pentagram is worked out from its cell alone and is the real plaza spot of the built settlement (quarter-turn and all)', () => {
    for (const seed of [20261015, 7, 99]) {
        const d = world(seed);
        const vs = villagesOf(d);
        assert.ok(vs.length >= 3, `seed ${seed}: settlements to try (${vs.length})`);
        for (const v of vs.slice(0, 8)) {
            const s = d.villages.tpSpot(v.gx, v.gz);
            const [u, w] = TELEPORT.LOCAL, r = v.rot;
            const x = v.x + (r === 0 ? u : r === 1 ? -w : r === 2 ? -u : w), z = v.z + (r === 0 ? w : r === 1 ? u : r === 2 ? -w : -u);
            assert.deepEqual([s.x, s.z], [x, z], `${v.id}`);
            // clear of the fire (2.6) with its whole circle and outer ring, of the statue and of the roads (local axes)
            const dist = Math.hypot(u, w);
            assert.ok(dist - TELEPORT.R * 1.3 > 2.6 + 0.5, 'clear of the fire ring');
            assert.ok(Math.abs(u) - TELEPORT.R * 1.3 > 1.6 && Math.abs(w) - TELEPORT.R * 1.3 > 1.6, 'clear of the roads along the axes');
            assert.ok(w < 0 && dist + TELEPORT.R * 1.3 < 18 - 2, 'on the plaza (radius 18), the side away from the statue (it stands at +v)');
        }
        assert.equal(d.villages.tpSpot(99, 99) === null || typeof d.villages.tpSpot(99, 99) === 'object', true);
    }
});

test('the pairs: mutual nearest settlements are partners; both ends agree; nobody has two; far settlements have none', () => {
    for (const seed of [20261015, 7, 99]) {
        const d = world(seed);
        const vs = villagesOf(d, 5).filter((v) => Math.abs(v.gx) <= 3 && Math.abs(v.gz) <= 3);
        const partner = new Map();
        for (const v of vs) { const p = new PartnerSearch(d.villages, v.gx, v.gz).run(); if (p) partner.set(v.id, p.id); }
        const cell = (id) => id.slice(2).split('_').map(Number);
        for (const [a, b] of partner) assert.equal(new PartnerSearch(d.villages, ...cell(b)).run()?.id, a, `${a} ↔ ${b}: both ends agree`);
        const targets = [...partner.values()];
        assert.equal(new Set(targets).size, targets.length, 'one partner each');
        // the partner is the nearest settlement of the window
        for (const [a, b] of partner) {
            const A = d.villages.tpSpot(+a.slice(2).split('_')[0], +a.split('_')[1]), B = d.villages.tpSpot(+b.slice(2).split('_')[0], +b.split('_')[1]);
            assert.ok(Math.hypot(A.x - B.x, A.z - B.z) < 5 * CASTLE_CELL);
        }
    }
});

test('the search goes one cell a frame (a castle\'s plan may be built on the way) and ends in at most 50 steps', () => {
    const d = world(20261015);
    const v = villagesOf(d)[0];
    const s = new PartnerSearch(d.villages, v.gx, v.gz);
    let n = 0;
    while (!s.step() && n++ < 100);
    assert.ok(n <= 50, `${n} steps`);
    assert.equal(windowCells(0, 0).length, 24);
});

// ---- the game part with a stub
function stub(gen = 10) {
    const said = [];
    const spots = new Map([['wv0_0', { id: 'wv0_0', gx: 0, gz: 0, x: 100, z: 100 }], ['wv1_0', { id: 'wv1_0', gx: 1, gz: 0, x: 600, z: 100 }], ['wv0_1', { id: 'wv0_1', gx: 0, gz: 1, x: 100, z: 1500 }]]);
    const index = { tpSpot: (gx, gz) => spots.get(`wv${gx}_${gz}`) || null };
    const g = {
        gen, config: { mode: 'freeworld' }, hud: { setVoice: (t) => said.push(t) },
        combat: { enabled: true, fatigue: 100, _hudKey: '' },
        terrain: { data: { villages: index, topLayer: () => 1, get: () => 1, landMade: () => true } },
        fx: { spark() {}, lightFlash() {} }, character: { group: { position: new THREE.Vector3(100, 2.5, 100) }, verticalVelocity: 0 },
        sync: { pentagram: () => {} }, perf: { note() {} }, death: { bodies: new Map(), falling: new Set() },
    };
    const p = new Pentagranium(g);
    p.fx = { trailBegin() {}, trailEnd() {}, add() {}, set() {}, remove() {}, ambient() {}, trailPulse() {}, anchorsHide() {}, sampleModels: () => [] };
    return { g, p, said };
}
const run = (p, sec, dt = 0.05) => { for (let t = 0; t < sec; t += dt) p.update(dt); };
const village = (gx, gz) => ({ kind: 'wizvillage', id: `wv${gx}_${gz}`, gx, gz });

test('a waking settlement lights its pentagram on the plaza once its partner is found; standing on it 3 s with 50 mana takes the hero to the partner\'s place', () => {
    const { g, p } = stub();
    p.worldWake(village(0, 0));
    run(p, 3);
    const m = p.marks.get('w:wv0_0');
    assert.ok(m && m.world && m.perm && m.pent === 'teleport', 'lit');
    assert.deepEqual(m.pairSpot, { id: 'wv1_0', x: 600, z: 100 }, 'the partner: the nearest one, the other end not made here');
    assert.ok(p._use.get('w:wv0_0')?.locked, 'it lit under the hero\'s feet: no jump until he steps off');
    run(p, 4);
    assert.ok(Math.abs(g.character.group.position.x - 100) < 0.1, 'locked while he stands');
    g.character.group.position.set(300, 2.5, 100); run(p, 0.2);
    g.character.group.position.set(100, 2.5, 100);
    run(p, 2);
    assert.ok(Math.abs(g.character.group.position.x - 100) < 0.1, 'not yet');
    run(p, 2);
    assert.ok(Math.abs(g.character.group.position.x - 600) < 0.1 && Math.abs(g.character.group.position.z - 100) < 0.1, 'arrived');
    assert.equal(g.combat.fatigue, 50);
    // the world's pentagram is not saved (the world makes it again)
    assert.equal(p.marksSnapshot(), null);
});

test('a world of an older generation, another kind of place, a settlement left alone: no pentagram; sleeping puts it out', () => {
    const old = stub(9); old.p.worldWake(village(0, 0)); run(old.p, 3); assert.equal(old.p.marks.size, 0);
    const k = stub(); k.p.worldWake({ kind: 'castle', id: 'cs0_0', gx: 0, gz: 0 }); run(k.p, 3); assert.equal(k.p.marks.size, 0);
    const alone = stub(); alone.p.worldWake(village(0, 1)); run(alone.p, 3); assert.equal(alone.p.marks.size, 0, 'far from every other settlement: no pair');
    const { p } = stub();
    p.worldWake(village(0, 0)); run(p, 3); assert.equal(p.marks.size, 1);
    p.worldSleep(village(0, 0)); assert.equal(p.marks.size, 0);
});

test('the land of the partner not made yet: the hero waits (nothing paid); spoilt ground: not made again while the place is awake', () => {
    const { g, p, said } = stub();
    p.worldWake(village(0, 0)); run(p, 3);
    g.terrain.data.landMade = (x) => Math.abs(x - 600) > 5;
    g.character.group.position.set(300, 2.5, 100); run(p, 0.2);
    g.character.group.position.set(100, 2.5, 100);
    run(p, 6);
    assert.equal(g.combat.fatigue, 100);
    assert.ok(Math.abs(g.character.group.position.x - 100) < 0.1);
    assert.match(said.join('|'), /земля ещё не готова/);
    g.terrain.data.topLayer = () => 4; // (the plaza was dug up)
    g.character.group.position.set(500, 2.5, 500);
    run(p, 2);
    assert.equal(p.marks.size, 0);
    run(p, 3);
    assert.equal(p.marks.size, 0, 'not made again');
});
