import test from 'node:test';
import assert from 'node:assert/strict';
import { Chores, CHORES, CHORE_KEYS, TOWN_CHORES, WIZ_CHORES, choresFor, choreCode, choreOf, shownChore } from '../../src/game/Chores.js';
import { VillagerModel, villagerLook } from '../../src/entities/VillagerModel.js';

test('about twenty chores, the wizards have their own', () => {
    const all = new Set([...TOWN_CHORES, ...WIZ_CHORES]);
    assert.ok(all.size >= 20, `${all.size}`);
    for (const k of ['potion', 'dummy', 'levbooks', 'plants', 'meditate']) { assert.ok(WIZ_CHORES.includes(k)); assert.ok(!TOWN_CHORES.includes(k)); }
    for (const k of ['yoga', 'roof', 'chop', 'argue', 'sweep']) assert.ok(!WIZ_CHORES.includes(k));
});

test('night: nobody does chores; day: there is something at the door', () => {
    for (const tag of ['door', 'well', 'market', 'yard', 'stall', 'room', 'ring', 'home', 'field', 'pier']) {
        assert.deepEqual(choresFor(tag, 'night', { role: 'farmer', port: true }), []);
        assert.deepEqual(choresFor(tag, 'home', { wizard: true }), []);
    }
    assert.ok(choresFor('door', 'day', { role: 'farmer' }).includes('chop'));
    assert.ok(!choresFor('door', 'day', { role: 'merchant' }).includes('chop'));
    assert.ok(!choresFor('pier', 'day', { role: 'farmer', port: false }).includes('fish'));
});

test('network code round trip', () => {
    for (const k of CHORE_KEYS) for (const side of [0, 1]) assert.deepEqual(choreOf(choreCode(k, side)), [k, side]);
    assert.deepEqual(choreOf(0), [null, 0]);
    assert.equal(shownChore({ chore: 'carryWater', mode: 'walk' }), 'carryWater');
    assert.equal(shownChore({ chore: 'roof', mode: 'flee' }), null);
});

test('every chore animates (no NaN), its things go away after, the tool comes back', () => {
    for (const k of CHORE_KEYS) {
        const wiz = CHORES[k].wizOnly;
        const m = new VillagerModel(villagerLook(7, wiz ? 'student' : 'farmer'), { tool: wiz ? 'wand' : 'hoe' });
        const mode = CHORES[k].carry ? 'walk' : 'chore';
        for (let i = 0; i < 300; i++) m.update(1 / 30, { mode, speed: mode === 'walk' ? 1.5 : 0, chore: k, side: 0 });
        m.group.updateMatrixWorld(true);
        m.group.traverse((o) => { for (const v of [o.position.x, o.position.y, o.position.z, o.rotation.x, o.rotation.z]) assert.ok(Number.isFinite(v), `${k}: ${o.name}`); });
        m.update(1 / 30, { mode: 'idle' });
        assert.equal(m.chore, null);
        assert.ok(m.props.children.every((o) => !o.visible), k);
        assert.equal(m.tool.visible, true, k);
        assert.equal(m.root.position.y, -1.95, k);
        m.dispose();
    }
});

test('a ladder needs a real wall (5 blocks tall); a fence is no wall; pushed off the spot, the chore is over (no ladder or bench left on the path)', () => {
    const solid = new Set();
    const data = { get: (x, y, z) => (solid.has(`${x},${y},${z}`) ? 1 : 0) };
    const c = new Chores({ game: { world: { terrain: { data } } } });
    for (let y = 1; y <= 5; y++) solid.add(`3,${y},0`); // a wall
    solid.add('6,1,0'); solid.add('6,2,0'); // a low fence
    assert.equal(c._tallWall(3, 0, 0), true);
    assert.equal(c._tallWall(6, 0, 0), false);
    const L = { _ground() {}, _steer() {} };
    const ch = new Chores({ game: {}, ...L, night: null });
    const v = { chore: 'roof', mode: 'chore', x: 10, z: 10, y: 0, speed: 0, choreSeen: performance.now(), waitT: 30, choreAt: { x: 10, z: 10 }, choreGo: null, choreYaw: 0, yaw: 0, cs: {}, dead: false };
    ch.life.chores = ch;
    assert.equal(ch.step(v, 0.05), true, 'at the place: goes on');
    v.x = 12; v.choreSeen = performance.now();
    assert.equal(ch.step(v, 0.05), false, 'pushed 2 m off: over');
    assert.equal(v.chore, null);
});
