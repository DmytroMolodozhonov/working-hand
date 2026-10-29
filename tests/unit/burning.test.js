// A creature ON FIRE (Burning.js): catches fire, burns ~8 s at −2 HP/s, is put out by «Firefighting» up / water / time.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Burning, BURN, BURN_TARGETS } from '../../src/game/Burning.js';
import { Firefighting } from '../../src/game/Firefighting.js';

function world({ water = false } = {}) {
    const hurt = [], bodies = new Map();
    const body = (id, x) => ({ kind: 'v', id, a: new THREE.Vector3(x, 0, 0), b: new THREE.Vector3(x, 3.5, 0), r: 0.5 });
    bodies.set('v:1', body(1, 2)); // a neighbour 2 m from me
    bodies.set('v:2', body(2, 20)); // far away
    for (const id of [3, 4]) bodies.set('v:' + id, body(id, 30)); // wizards (the fire tests)
    const g = {
        localId: 'me', authority: true, isDeadLocal: false, config: { mode: 'survival' }, log: [],
        combat: { dead: false, enabled: true, center: (v) => v.set(0, 1.7, 0), damage: (d, by, kind) => hurt.push({ d, kind }) },
        character: { group: { position: new THREE.Vector3(0, 2, 0) } },
        hud: { setVoice: (t) => g.log.push(t), damageFlash() {} }, sound: {},
        duel: {
            _bodyOf(kind, id, e) {
                if (kind === 'p' && id === 'me') { e.kind = kind; e.id = id; e.a.set(0, 0, 0); e.b.set(0, 3.5, 0); e.r = 0.5; return e; }
                const b = bodies.get(kind + ':' + id); if (!b) return null;
                e.kind = kind; e.id = id; e.a.copy(b.a); e.b.copy(b.b); e.r = b.r; return e;
            },
            _creature: (k, id) => ({ id, wizard: false }),
        },
        castleLife: { alarm() {}, fear() {}, _say() {}, hit: (v, d, dir, by, o) => hurt.push({ d, v: v.id, kind: o.kind }) },
        _flameBlock: () => (water ? 'water' : null), _flameWaters: () => [],
        fire: { douse: () => 0 }, space: { spellBlocked: () => null },
    };
    g.burning = new Burning(g);
    g.hurt = hurt;
    return g;
}

test('fire catches: I burn 8 s, −2 HP a second through armour-aware kind «fire», then it goes out by itself', () => {
    const g = world(), B = g.burning;
    assert.ok(B.ignite('p', 'me', null));
    assert.ok(B.me && B.me.left === BURN.TIME);
    assert.ok(g.log.some((t) => /Firefighting/.test(t)), 'one hint on the first time');
    for (let i = 0; i < 100; i++) B.update(0.1); // 10 s
    assert.equal(B.me, null);
    assert.ok(g.hurt.length >= 7 && g.hurt.length <= 8, 'a burn every second: ' + g.hurt.length);
    assert.ok(g.hurt.every((h) => h.d === BURN.DMG && h.kind === 'fire'));
});

test('a new fire renews the burning but never past the maximum', () => {
    const g = world(), B = g.burning;
    B.ignite('p', 'me');
    for (let i = 0; i < 30; i++) B.update(0.1); // 3 s gone
    assert.ok(B.me.left < BURN.TIME - 2.5);
    B.ignite('p', 'me', null, 100);
    assert.equal(B.me.left, BURN.TIME);
});

test('the hint is told once; creative: no burning; water: cannot catch fire, and puts it out', () => {
    const g = world(), B = g.burning;
    B.ignite('p', 'me'); B._outMe('x'); B.ignite('p', 'me');
    assert.equal(g.log.filter((t) => /Firefighting/.test(t)).length, 1);
    B._outMe('x');
    g.config.mode = 'creative'; g.combat.enabled = false;
    assert.ok(!B.ignite('p', 'me'));
    const w = world({ water: true });
    assert.ok(!w.burning.ignite('v', 1, null), 'a villager standing in water does not catch fire');
});

test('«Firefighting» held up puts out me and a neighbour within 3 m, not the far one; a non-burning caster spends only mana', () => {
    const g = world(), B = g.burning, F = new Firefighting(g);
    B.ignite('p', 'me'); B.ignite('v', 1); B.ignite('v', 2);
    assert.ok(B.list.has('v:1') && B.list.has('v:2'));
    const sp = { o: new THREE.Vector3(0, 1.7, 0), d: new THREE.Vector3(0, 1, 0), max: false, self: true, t: 1, by: 'me', done: false };
    assert.ok(F.act(sp, 0.1), 'something was put out');
    assert.equal(B.me, null);
    assert.ok(!B.list.has('v:1'));
    assert.ok(B.list.has('v:2'), 'the far one burns on');
    const sp2 = { ...sp, done: false };
    assert.ok(!F.act(sp2, 0.1), 'nobody burns: nothing counted');
});

test('the cone ahead puts out whoever burns in it', () => {
    const g = world(), B = g.burning;
    B.ignite('v', 2);
    const n = B.douseWhere((c, r) => Math.hypot(c.x - 20, c.z) < 3 + r);
    assert.equal(n, 1);
    assert.ok(!B.list.has('v:2'));
});

test('the host burns creatures once a second and a wizard puts himself out', () => {
    const g = world(), B = g.burning;
    B.ignite('v', 1);
    for (let i = 0; i < 25; i++) B.update(0.1);
    assert.ok(g.hurt.some((h) => h.v === 1 && h.kind === 'burn'));
    const wiz = { id: 2, wizard: true, knowsFire: true, mana: 20, rank: 'adept' };
    g.duel._creature = (k, id) => (id === 2 ? wiz : { id });
    B.ignite('v', 2);
    for (let i = 0; i < 20; i++) B.update(0.1);
    assert.ok(!B.list.has('v:2'), 'the wizard put himself out in ~1.5 s');
    assert.equal(wiz.mana, 17, 'it cost him 3 mana (FIRE.COST)');
    // 1 in 5 does not know «Firefighting»: he burns on, in panic; one out of mana too
    const dull = { id: 3, wizard: true, knowsFire: false, mana: 50, rank: 'adept' }, dry = { id: 4, wizard: true, knowsFire: true, mana: 1, rank: 'adept' };
    g.duel._creature = (k, id) => (id === 3 ? dull : id === 4 ? dry : { id });
    B.ignite('v', 3); B.ignite('v', 4);
    for (let i = 0; i < 20; i++) B.update(0.1);
    assert.ok(B.list.has('v:3') && B.list.has('v:4'), 'no «Firefighting» / no mana: they burn on');
    assert.equal(dull.mana, 50);
});

test('a touch of a fire sets one alight (a runner through it too); no fire — nobody burns', () => {
    assert.ok(BURN.STAND <= 0.15, 'the author: whoever runs through the fire burns');
    const g = world(), B = g.burning;
    g.campfires = { _fireAt: () => null };
    for (let i = 0; i < 20; i++) B.update(0.1);
    assert.equal(B.me, null, 'no fire here');
    g.campfires = { _fireAt: () => ({}), list: new Map([[1, { left: 30 }]]) };
    for (let i = 0; i < 7; i++) B.update(0.1); // (the first look may be up to 0.5 s away; with a fire burning they come 8 times a second)
    assert.ok(B.me, 'a moment in the fire is enough');
});

test('the network: others\' flags are shown and forgotten; guests do not decide creatures', () => {
    const g = world(), B = g.burning;
    B.onNet({ by: 'ann', on: 1 });
    assert.ok(B.isBurning('p', 'ann'));
    B.onNet({ by: 'ann', on: 0 });
    assert.ok(!B.isBurning('p', 'ann'));
    g.authority = false;
    assert.ok(!B.ignite('v', 1));
    B.onList({ l: [['v', 1], ['D', 3]] });
    assert.ok(B.isBurning('v', 1) && !B.isBurning('D', 3));
});

test('BURN_TARGETS: every creature and thing is decided, with a reason', () => {
    for (const k of ['me', 'players', 'zombies', 'castlePeople', 'animals', 'sailors', 'spider', 'livingTrees', 'bookBirds', 'servants', 'dragon', 'iceCastle', 'blackship', 'phoenix', 'owl', 'items', 'ships', 'water', 'ground', 'arena', 'sleep', 'godGifts', 'space'])
        assert.ok(BURN_TARGETS[k]?.why && BURN_TARGETS[k]?.does, k);
    assert.equal(BURN_TARGETS.dragon.does, 'none');
    assert.equal(BURN_TARGETS.zombies.does, 'burn');
});
