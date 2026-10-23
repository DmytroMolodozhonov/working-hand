// «Вайнд Максима» с палочкой вверх: кольцо ветра — толкает и гасит огонь, когда до него дошёл фронт.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WindRing, WIND_RING, isWindRing, ringDelay, windRingPush } from '../../src/game/WindRing.js';
import { FireSystem } from '../../src/world/Fire.js';
import { Hellfire, HELLFIRE } from '../../src/game/Hellfire.js';
import { SPELL_COST } from '../../src/game/Combat.js';
import { spaceSpellBlock } from '../../src/game/Space.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

test('only a wand straight up makes the ring; the cone ahead stays as it was; the cost is «Вайнд Максима»\'s', () => {
    assert.ok(isWindRing('WindMaxima', V(0, 1, 0)));
    assert.ok(!isWindRing('WindMaxima', V(0, 0, -1)));
    assert.ok(!isWindRing('WindMaxima', V(0, 0.7, -0.7)));
    assert.ok(!isWindRing('Wind', V(0, 1, 0)), 'plain «Вайнд» is not changed');
    assert.equal(SPELL_COST.WindMaxima, 20);
    assert.ok(WIND_RING.R > 9 && WIND_RING.R < 24, 'wider than the Impulse, never wider than the cone');
});

test('the front: near fires go out earlier than far ones; the push is away from the caster and out of reach beyond R', () => {
    assert.ok(ringDelay(3) < ringDelay(12));
    assert.ok(ringDelay(WIND_RING.R) > 0.3 && ringDelay(WIND_RING.R) < 0.7);
    const o = V(0, 0, 0);
    const v = windRingPush(o, V(5, 0, 0));
    assert.ok(v.x > 0 && Math.abs(v.z) < 1e-9 && v.y > 0);
    assert.ok(windRingPush(o, V(0, 0, -5)).z < 0);
    assert.equal(windRingPush(o, V(WIND_RING.R + 1, 0, 0)), null);
});

function game() {
    const fire = new FireSystem({ world: null, fx: null });
    const g = { authority: true, fire, fx: null, campfires: { list: new Map(), _out(c) { this.list.delete(c.id); } }, hellfire: Object.create(Hellfire.prototype) };
    g.campfires.list.set('near', { id: 'near', x: 3, y: 0, z: 0 });
    g.campfires.list.set('far', { id: 'far', x: 12, y: 0, z: 0 });
    g.campfires.list.set('out', { id: 'out', x: 20, y: 0, z: 0 });
    fire.burningBlocks.set('1,1,1', { x: 1, L: 1, z: 1, t: 0 });
    fire.burningBlocks.set('30,1,0', { x: 30, L: 1, z: 0, t: 0 });
    g.hellfire.state = null; g.hellfire.remote = new Map(); g._note = () => {};
    g.hellfire._note = () => {};
    g.hellfire.left = [{ by: 'x', c: V(2, 0, 2), R0: 3, R: 3, t: 0 }, { by: 'x', c: V(40, 0, 0), R0: 3, R: 3, t: 0 }];
    g.hellfire._dieDown = () => {};
    g.hellfire.game = g;
    return g;
}

test('the wave puts out the fires it reaches, when it reaches them — not those beyond it', () => {
    const g = game();
    const w = new WindRing(g);
    const sp = w.begin(V(0, 0, 0), 'me');
    w.step(sp, ringDelay(5)); // the front is at 5 m
    assert.ok(!g.campfires.list.has('near'), 'the near campfire is out');
    assert.ok(g.campfires.list.has('far'), 'the far one burns still');
    assert.equal(g.fire.burningBlocks.size, 1, 'the near burning block is out');
    assert.equal(g.hellfire.left.length, 1, 'the fire left on the ground near is out whole');
    while (w.step(sp, 0.05));
    assert.ok(!g.campfires.list.has('far'));
    assert.ok(g.campfires.list.has('out'), 'beyond 14 m nothing is touched');
    assert.equal(g.fire.burningBlocks.size, 1, 'the block at 30 m still burns');
    assert.equal(g.hellfire.left.length, 1, 'the fire at 40 m is left');
});

test('the held Hellfire is knocked back once per wave, not drowned', () => {
    const g = game();
    const H = g.hellfire;
    g.character = { group: { position: V(0, 0, 0) } };
    H.state = { c: V(1, 0, 0), R: 8, k: 0, rr: 6, rw: 2, ang: 0 };
    const w = new WindRing(g);
    const sp = w.begin(V(0, 0, 0), 'me');
    while (w.step(sp, 0.05));
    assert.ok(H.state && H.state.R > 0 && H.state.R < 8, 'smaller but alive');
    assert.ok(Math.abs(H.state.R - (8 - HELLFIRE.DOUSE_KNOCK)) < 1e-9, 'knocked once, not once per ring section');
});

test('no air, no wind: the block is the same for the ring as for the cone', () => {
    assert.ok(spaceSpellBlock('WindMaxima', 'space', 'none'));
});
