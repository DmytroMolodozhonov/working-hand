/**
 * The Temple of the Gods (GodsTemple.js, Temple.js): the same temple from the same seed; local ↔ world
 * for every turn; its stone is solid (a floor to stand on, walls that push out, roofs as ceilings —
 * and a body over the podium is never thrown out of the temple sideways); one deterministic place.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { templePlan, templeToWorld, templeToLocal, templeSpot, TEMPLE_SCROLLS, TEMPLE } from '../../src/world/GodsTemple.js';
import { TempleCollider } from '../../src/game/Temple.js';

const plan = templePlan(5);

test('the same temple from the same seed; four scrolls, statues, solid parts', () => {
    const b = templePlan(5);
    assert.deepEqual(Array.from(b.mats.gold.pos.slice(0, 300)), Array.from(plan.mats.gold.pos.slice(0, 300)));
    assert.equal(b.mats.stone.pos.length, plan.mats.stone.pos.length);
    assert.deepEqual(plan.pedestals.map((p) => p.spell), TEMPLE_SCROLLS);
    assert.ok(plan.statues.some((s) => s.kind === 'creator' && s.gold), 'the golden god');
    assert.ok(plan.statues.some((s) => s.kind === 'wisdom'), 'the god of Wisdom');
    assert.ok(plan.statues.length >= 7, 'the other gods');
    for (const m of Object.values(plan.mats)) assert.ok(!m.pos.some(Number.isNaN) && !m.nor.some(Number.isNaN));
});

test('local ↔ world for every turn', () => {
    for (let rot = 0; rot < 4; rot++) {
        const s = { x: 100, y: 7, z: -40, rot };
        const w = templeToWorld(s, 3, 2, -11), l = templeToLocal(s, w.x, w.y, w.z);
        assert.ok(Math.abs(l.x - 3) < 1e-9 && Math.abs(l.y - 2) < 1e-9 && Math.abs(l.z + 11) < 1e-9, `rot ${rot}`);
    }
});

test('its stone: a floor, walls that push, a roof over the head; never thrown out from the podium', () => {
    const s = { x: 0, y: 0, z: 0, rot: 1 };
    const c = new TempleCollider(s, plan.solids);
    const floor = TEMPLE.RISE * TEMPLE.K;
    const hall = templeToWorld(s, 0, 0, -1);
    assert.ok(Math.abs(c.floorAt(hall.x, hall.z, floor + 1) - floor) < 1e-6, 'the floor of the hall');
    assert.ok(c.ceilingAt(hall.x, hall.z, floor + 2) > floor + 20 && c.ceilingAt(hall.x, hall.z, floor + 2) < Infinity, 'the roof');
    assert.ok(c.pointBlocked(...Object.values(templeToWorld(s, 0, 5, -70.8))), 'the library\'s back wall');
    // walking into the back wall of the library: pushed back into the room
    const w = templeToWorld(s, 0, 0, -69.6);
    const p = { x: w.x, y: 0, z: w.z };
    c.pushCylinder(p, 0.6, floor, 3.5, 1.05);
    const l = templeToLocal(s, p.x, floor, p.z);
    assert.ok(l.z > -70 && l.z < -69, `out of the wall, into the room (${l.z})`);
    // sunk a little into the podium (a fall's overshoot): stays where it is
    const q = { x: hall.x, y: 0, z: hall.z };
    assert.equal(c.pushCylinder(q, 0.6, floor - 0.3, 3.5, 0.2), false);
    assert.equal(q.x, hall.x);
});

test('one place on a planet from the seed: the flattest', () => {
    const ground = (x, z) => (x > 0 ? 0 : Math.sin(z / 9) * 20);
    const a = templeSpot(9, ground, { R: 900 }), b = templeSpot(9, ground, { R: 900 });
    assert.deepEqual(a, b);
    assert.ok(a.x > 60, 'on the flat side');
});

test('a gift of the gods: a blast at the temple breaks no block, throws nobody', async () => {
    const { TerrainData } = await import('../../src/world/Terrain.js');
    const { Temple, isGodGiftAt } = await import('../../src/game/Temple.js');
    const THREE = await import('three');
    const data = new TerrainData();
    data.generate({ seed: 3 });
    const added = [];
    const game = {
        seed: 3, scene: new THREE.Scene(), renderer: null, character: { group: { position: new THREE.Vector3() } },
        world: { terrain: { data }, createPedestal: () => 1.97 },
        collision: { addMover: (m) => added.push(m), removeMover: () => {} },
        items: { spawnLoose: () => {}, loose: new Map() },
    };
    const tm = game.temple = new Temple(game);
    tm.place({ x: 40, y: data.surfaceY(40, 40), z: 40, rot: 0 });
    assert.equal(added.length, 1, 'its stone in the collision world');
    // the ground under it: a blast takes nothing (outside its bounds it does)
    const y = data.surfaceY(40, 40);
    assert.deepEqual(data.removeSphere(40, y, 40, 4), [], 'no block of its ground breaks');
    data.set(40, data.topLayer(40, 40), 40, 0);
    assert.notEqual(data.get(40, data.topLayer(40, 40), 40), 0, 'nor one by one');
    assert.ok(isGodGiftAt(game, 40, y + 5, 40), 'within its bounds');
    assert.ok(!isGodGiftAt(game, 40, y, 900), 'far away: not');
    assert.ok(data.removeSphere(900, data.surfaceY(900, 900), 900, 3).length > 0, 'elsewhere a blast digs as always');
    // a creature in the temple is not thrown (CreatureImpact.apply asks the ward first)
    const { CreatureImpact } = await import('../../src/game/CreatureImpact.js');
    const src = CreatureImpact.prototype.apply.toString();
    assert.ok(/temple\?\.wards/.test(src), 'CreatureImpact asks the golden ward');
    tm.remove();
    assert.equal(data.godGiftAt, null, 'gone with it');
});
