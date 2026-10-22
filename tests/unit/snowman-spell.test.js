// «Snowman» (IceQueen.castSnowman, type 'friend'): its words, its price, who/what acts on it, its life
// (it wanders, runs from the heat and melts near it) — and the Ice Queen's immunity to every cold kind.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { SPELL_COST } from '../../src/game/Combat.js';
import { SPELLS } from '../../src/ui/Codex.js';
import { IceCastleLife, ICE, COLD_KINDS, iceDamage, iceBolt, FRIEND_TARGETS } from '../../src/game/IceQueen.js';

test('«Snowman»: its words (English and Russian), never confused with Alive / Frozen / Ice', () => {
    for (const w of ['Snowman', 'snow man', 'Сноумен', 'сноумэн', 'сноуман', 'Снеговик']) assert.equal(matchSpell(w), 'Snowman', w);
    assert.equal(matchSpell('Alive'), 'Alive');
    assert.equal(matchSpell('Frozen'), 'Frozen');
    assert.equal(matchSpell('айс'), 'Ice');
    assert.equal(SPELL_COST.Snowman, 30);
    assert.ok(SPELLS.some((s) => s.name === 'Snowman' && s.cost === 30));
});

test('the friendly snowman: 10 HP; fire melts it, blows scatter it, cold does nothing', () => {
    assert.equal(ICE.FRIEND.HP, 10);
    assert.ok(iceDamage('friend', 'Inferno', 3) >= 10, 'fire melts it');
    assert.ok(iceDamage('friend', 'Bombardo', 4) >= 10);
    assert.equal(iceDamage('friend', 'melee', 4), 4);
    for (const k of COLD_KINDS) assert.equal(iceDamage('friend', k, 10), 0, k);
    assert.equal(iceBolt('friend', 'Stupefy').stun, 4);
    for (const k of ['fire', 'cold', 'queen', 'master', 'network']) assert.ok(FRIEND_TARGETS[k], k);
});

test('the Ice Queen: no cold of any kind touches her (no damage, no stun, no freezing)', () => {
    for (const t of ['queen', 'monster']) for (const k of COLD_KINDS) {
        assert.equal(iceDamage(t, k, 50), 0, `${t} ${k}`);
        assert.deepEqual(iceBolt(t, k), { dmg: 0 }, `${t} ${k}`);
    }
    for (const k of ['Ice', 'IceDuel', 'Frozen', 'RodFrozen', 'snow', 'chill', 'cold']) assert.ok(COLD_KINDS.has(k), k);
});

/** A tiny world: flat snow at y 0, one player, a campfire if asked. */
function fakeGame(fire = null) {
    const scene = new THREE.Scene();
    const me = new THREE.Group(); me.position.set(0, 1.95, 0);
    const g = {
        scene, authority: true, localId: 'me', frameCount: 0, remotes: new Map(),
        character: { group: me },
        collision: { groundAt: () => 0, resolveCylinder() {} },
        world: { terrain: { data: { get: (x, L) => (L === 0 ? 4 : 0) } } }, // (BLOCK.SNOW under every foot)
        campfires: { list: new Map(fire ? [['f', { x: fire.x, y: 0, z: fire.z }]] : []) },
        fx: { spark() {} },
    };
    return g;
}

test('it is made, wanders, and runs from a campfire — melting smaller near it, to a puddle', () => {
    const g = fakeGame();
    const life = new IceCastleLife(g);
    const c = life.makeFriend(new THREE.Vector3(10, 0, 0));
    assert.ok(c && c.type === 'friend');
    for (let i = 0; i < 80; i++) { g.frameCount++; life.update(0.05); }
    assert.ok(c.buildT >= ICE.FRIEND.BUILD, 'built in a few seconds');
    // a campfire right beside it: it runs away and melts a little
    g.campfires.list.set('f', { x: 11, y: 0, z: 0 });
    const x0 = c.model.position.x;
    for (let i = 0; i < 40; i++) { g.frameCount++; life.update(0.05); }
    assert.ok(c.model.position.x < x0 - 1, 'it ran from the fire');
    assert.ok(c.hp < ICE.FRIEND.HP, 'and melted a little');
    // stuck right at a great fire: it melts away (a puddle)
    life.hit(c, 5, 'Inferno', null);
    assert.ok(c.dead && c.melting, 'melted');
    assert.equal(life.puddles.length, 1);
    // saved with the world while it lives
    const d = life.makeFriend(new THREE.Vector3(-5, 0, 0));
    assert.equal(life.snapshot().friends.length, 1);
    assert.ok(d);
});

test('the palace struck from afar: the snowmen and the monsters go out after whoever did it', () => {
    const g = fakeGame();
    g.character.group.position.set(0, 1.95, 140); // (far off: a «Бомбардо» from 140 m)
    const life = new IceCastleLife(g);
    const at = (x, z) => ({ x, y: 0, z });
    life._plan = {
        x: 0, z: 0, R: 30, rot: 0, x0: -30, x1: 30, z0: -30, z1: 30, floor: 0.5,
        hall: { ...at(0, -2), r: 13, top: 30 }, throne: at(0, -10), chandelier: { ...at(0, -2), y: 20 },
        gate: { ...at(0, 13), w: 5, h: 6, inner: at(0, 9), out: at(0, 21) }, guard: [at(-5, 22), at(5, 22)], chests: [],
    };
    life.update(0.05);
    for (let i = 0; i < 20; i++) { g.frameCount++; life.update(0.05); }
    const snow = life.list.filter((c) => c.type === 'snowman');
    assert.ok(snow.length && snow.every((c) => c.target?.id !== 'me'), 'far off: nobody minds him');
    life.attacked(new THREE.Vector3(0, 6, 13), 3, 'me');
    assert.ok(life._offender('me'));
    const d0 = Math.min(...snow.map((c) => 140 - c.model.position.z));
    for (let i = 0; i < 200; i++) { g.frameCount++; life.update(0.05); }
    assert.ok(snow.some((c) => c.target?.id === 'me'), 'the snowmen go for him');
    assert.ok(Math.min(...snow.map((c) => 140 - c.model.position.z)) < d0 - 10, 'and come out towards him');
    assert.ok(life.list.some((c) => c.type === 'monster' && c.target?.id === 'me'), 'the monsters too');
});
