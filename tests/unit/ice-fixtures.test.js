// The Ice Castle's gates and chandelier (src/game/IceFixtures.js): strong but not invulnerable;
// her magic gone — plain ice; nothing hangs in the air: the chandelier without its hook falls.
import test from 'node:test';
import assert from 'node:assert/strict';
import { IceFixtures, GATE, gateDamage, gateCap } from '../../src/game/IceFixtures.js';
import { BLOCK } from '../../src/world/Terrain.js';

function setup() {
    const blocks = new Map();
    const key = (x, L, z) => x + ',' + L + ',' + z;
    const t = { get: (x, L, z) => blocks.get(key(x, L, z)) ?? BLOCK.AIR, set: (x, L, z, b) => blocks.set(key(x, L, z), b) };
    const doors = { list: new Map(), _place(d) { this.list.set(d.id, { ...d, model: { traverse() {} } }); }, remove(id) { this.list.delete(id); }, _setAngle(d, a) { d.a = a; } };
    const game = { doors, world: { terrain: { data: t } }, scene: { add() {}, remove() {} }, collision: { addBox: () => 1, removeBox() {} } };
    const plan = { x: 0, z: 0, rot: 0, F: 10, floor: 20, gate: { x: 0, y: 19.5, z: 13 }, chandelier: { x: 0, y: 40, z: -2 } };
    const life = { game, plan, auth: true, state: { queenDead: false }, _sendSoon: false };
    const f = new IceFixtures(life);
    return { f, life, t };
}

test('the gates: plain blasts barely scratch them, «Бомбардо Максима» several times breaks them, fire melts fastest, cold nothing', () => {
    assert.ok(gateDamage('blast', 1, false) < gateDamage('blast', 3, false) / 5, 'a plain blast is a scratch');
    assert.equal(gateDamage('ice', 1, false), 0, 'cold: nothing');
    assert.equal(gateDamage('blast', 99, false), Infinity, 'Total Destruction: at once');
    assert.ok(gateDamage('fire', 1, false) > gateDamage('blast', 1, false), 'fire is ice\'s weakness');
    const { f, life } = setup();
    f.make();
    assert.equal(f.leaves.length, 2);
    const G = life.plan.gate;
    let n = 0;
    while (!life.state.gateBroken && n < 20) { f.blast({ x: G.x, y: G.y + 2, z: G.z + 2 }, 4, 3); n++; }
    assert.ok(life.state.gateBroken, 'they break');
    assert.ok(n >= 3, `several «Максима» are needed (${n})`);
    assert.equal(life.game.doors.list.size, 0, 'the leaves are gone: the way is open');
});

test('her magic gone: the gates are plain ice — one «Бомбардо Максима»', () => {
    assert.ok(gateCap(true) < gateCap(false) / 3);
    const { f, life } = setup();
    f.make();
    life.state.queenDead = true;
    f.queenFell();
    assert.ok(life.state.gateHp <= GATE.WEAK_HP);
    f.blast({ x: life.plan.gate.x, y: life.plan.gate.y + 2, z: life.plan.gate.z + 1 }, 4, 3);
    assert.ok(life.state.gateBroken);
});

test('the chandelier hangs on its chain from the vault; its hook melted — it falls and shatters', () => {
    const { f, life, t } = setup();
    const P = life.plan;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) t.set(dx, 48, -2 + dz, BLOCK.ICE_WALL); // (the vault over it)
    f.make();
    f.update(0.016);
    assert.ok(f.ch.model && f.ch.chain, 'hung on a chain');
    assert.equal(f.ch.hookL, 48);
    f.update(1);
    assert.ok(!life.state.chandFallen, 'held while its hook is there');
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (dx || dz) t.set(dx, 48, -2 + dz, BLOCK.AIR);
    f.update(1);
    assert.ok(life.state.chandFallen, 'the vault round the hook blown away: a lone block does not hold it in the air');
    for (let i = 0; i < 200 && !f.ch.wreck; i++) f.update(0.02);
    assert.ok(f.ch.wreck, 'it lies broken on the floor');
    assert.ok(f.ch.model.position.y < P.floor + 2);
});

test('a blast at the chandelier breaks its chain', () => {
    const { f, life, t } = setup();
    t.set(0, 48, -2, BLOCK.ICE_WALL);
    f.make();
    f.update(0.016);
    f.blast({ x: 0, y: 38, z: -2 }, 4, 3);
    assert.ok(life.state.chandFallen);
});
