// «Thunderwave» (ThunderWave.js): 40 mana, −10 to everyone in ONE zone, not through walls; an ordinary «Protection» and
// plain armour do not stop it (the blow is from above), «Protection Maxima» and magic armour do.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Combat, SPELL_COST } from '../../src/game/Combat.js';
import { DAMAGE } from '../../src/game/Damage.js';
import { THUNDER, inThunderZone, thunderZone } from '../../src/game/ThunderWave.js';
import { soakBlow, makePiece, wornEffects } from '../../src/game/ArmorTypes.js';
import { matchSpell } from '../../src/fx/SpellManager.js';

const O = { x: 0, y: 2, z: 0 };
const D = { x: 0, y: 0, z: -1 };

test('cost 40, damage 10', () => {
    assert.equal(SPELL_COST.Thunderwave, 40);
    assert.equal(THUNDER.DAMAGE, 10);
    assert.equal(DAMAGE.Thunderwave, 10);
});

test('the zone: close all round-and-ahead, far in a cone, nothing behind', () => {
    assert.ok(inThunderZone(O, D, 0, 2, -30));
    assert.ok(inThunderZone(O, D, 20, 2, -30)); // (33° off)
    assert.ok(!inThunderZone(O, D, 30, 2, -5)); // (far to the side)
    assert.ok(!inThunderZone(O, D, 0, 2, 30)); // (behind, far)
    assert.ok(!inThunderZone(O, D, 0, 2, -45)); // (out of range)
    assert.ok(inThunderZone(O, D, 2, 2, 0.3)); // (close, a little beside/behind)
    assert.ok(!inThunderZone(O, D, 2, 2, 1.5)); // (close, but behind)
});

/** A fake game: bodies of several kinds, a wall on request; each kind's hit recorded. */
function world(wallAtZ = null) {
    const seen = [];
    const rec = (k) => (...a) => seen.push([k, a[1]]);
    const bodies = [
        { kind: 'v', id: 1, z: -10 }, { kind: 'a', id: 2, z: -12 }, { kind: 's', id: 3, z: -14 }, { kind: 'D', id: 4, z: -16 },
        { kind: 'v', id: 5, z: 20 }, // behind
        { kind: 'c', id: 6, z: -18 },
    ].map((b) => ({ ...b, a: new THREE.Vector3(0, 2, b.z), b: new THREE.Vector3(0, 3, b.z), r: 1 }));
    const game = {
        localId: 'me',
        duel: { _bodies: () => bodies, _wallOnWay: (a, b) => (wallAtZ !== null && Math.min(a.z, b.z) < wallAtZ && Math.max(a.z, b.z) > wallAtZ ? 0.5 : 2) },
        castleLife: { byId: new Map([[1, {}], [5, {}]]), hit: rec('v') },
        animals: { byId: new Map([[2, {}]]), hit: rec('a'), push() {} },
        spiders: { byId: () => ({}), hit: rec('s') },
        dragons: { byId: () => ({}), hit: rec('D'), noise() {} },
        ships: { crew: { byId: new Map([[6, {}]]), hit: rec('c') } },
    };
    return { game, seen };
}

test('10 to every kind in the zone, nothing behind; the hit passes the kind', () => {
    const { game, seen } = world();
    const pts = thunderZone(game, new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, 0, -1), 'me', true);
    assert.equal(pts.length, 5, 'a bolt on each');
    assert.deepEqual(seen.map((s) => s[0]).sort(), ['D', 'a', 'c', 's', 'v']);
    assert.ok(!seen.some((s) => s[1] === undefined));
});

test('a guest only sees (bolts), the host deals', () => {
    const { game, seen } = world();
    const pts = thunderZone(game, new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, 0, -1), 'me', false);
    assert.equal(pts.length, 5);
    assert.equal(seen.length, 0);
});

test('a wall stops it: those behind the wall are not hit', () => {
    const { game, seen } = world(-11); // (a wall at z −11: the villager at −10 is before it)
    const pts = thunderZone(game, new THREE.Vector3(0, 2, 0), new THREE.Vector3(0, 0, -1), 'me', true);
    assert.equal(pts.length, 1);
    assert.deepEqual(seen.map((s) => s[0]), ['v']);
});

function me() {
    const g = {
        config: { mode: 'freeworld' }, scene: new THREE.Scene(), localId: 'me', knockback: new THREE.Vector3(), remotes: new Map(), weapons: { hasWeapon: () => false },
        fx: { spark() {}, lightFlash() {} },
        hud: { update() {}, setFatigue() {}, setStatus() {}, setFrozenOverlay() {}, damageFlash() {}, setVoice() {} },
        character: {
            group: { position: new THREE.Vector3(0, 0.5, 0) },
            getHandWorldPosition: (side, out = new THREE.Vector3()) => out.set(0.6, 1.2, -1.5),
            getHandDirection: (side, out = new THREE.Vector3()) => out.set(0, 0, -1),
            isArmExtended: () => true, isTPose: () => true,
        },
        playerName: () => 'Враг', onLocalDeath() {},
    };
    return new Combat(g);
}
const FRONT = new THREE.Vector3(0, 1.2, -20);

test('an ordinary Protection does not stop it (from above); Protection Maxima does', () => {
    const c = me();
    c.hp = 20; c.fatigue = 30;
    assert.equal(c.castProtection(false), null);
    assert.ok(c.shield);
    assert.equal(c.hitBySpell('Thunderwave', FRONT, 'enemy'), true);
    assert.equal(c.hp, 10);
    const d = me();
    d.hp = 20; d.fatigue = 30;
    assert.equal(d.castProtection(true), null);
    d.fatigue = 100; // (a held blow costs half the spell's 40)
    assert.equal(d.hitBySpell('Thunderwave', FRONT, 'enemy'), false);
    assert.equal(d.hp, 20);
});

test('plain armour does not soak it, a magic piece does', () => {
    const body = (magic) => { const worn = { chest: makePiece('chest', { magic }) }; return soakBlow(worn, wornEffects(worn), 10, 'Thunderwave', () => 0.2).hp; }; // (0.2: lands on the chest)
    assert.equal(body(false), 10, 'plain steel: the full 10');
    assert.ok(body(true) < 10, 'a magic piece takes a share');
});

test('voice: a lone «удар» / «молния» no longer casts it', () => {
    for (const w of ['тандервейв', 'thunderwave', 'гром', 'сандер вейв']) assert.equal(matchSpell(w), 'Thunderwave', w);
    for (const w of ['удар', 'молния', 'молнию']) assert.notEqual(matchSpell(w), 'Thunderwave', w);
});
