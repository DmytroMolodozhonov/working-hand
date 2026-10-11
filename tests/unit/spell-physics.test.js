import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SPELL_PHYSICS, spellOutcome, spellPush, thunderPush } from '../../src/game/Impact.js';
import { Combat, SPELL_COST } from '../../src/game/Combat.js';
import { DUEL_SPELLS } from '../../src/game/Duel.js';
import { SPELL_RU } from '../../src/game/ItemTypes.js';
import { BodyImpact } from '../../src/game/BodyImpact.js';
import { Knockdown } from '../../src/game/Knockdown.js';
import { VoxelCharacter } from '../../src/entities/Character.js';

test('every spell has been looked at: its physical effect is written down (null = none)', () => {
    const names = new Set([...Object.keys(SPELL_COST), ...Object.keys(DUEL_SPELLS), ...Object.keys(SPELL_RU),
        'Sapira', 'Sands', 'Inferno', 'Ice', 'Lightning', 'LightningCatch', 'LightningHold', 'Storm', 'WallRise', 'WallRiseMaxima', 'Attack',
        'Nox', 'Draw', 'Reveal', 'Rescue', 'Stand', 'Pause', 'Maxima', 'Frozen', 'Gather', 'CreateFloor', 'CreateWall', 'CreateCeiling',
        'BuildRoof', 'CreateDoor', 'Fire', 'Waterball', 'WaterForming', 'Flight']);
    for (const n of names) assert.ok(Object.prototype.hasOwnProperty.call(SPELL_PHYSICS, n), n);
});

test('light, building and healing spells move nobody', () => {
    for (const n of ['Lumos', 'LumosMaxima', 'Nox', 'Draw', 'Reveal', 'Accio', 'ChangeColor', 'CreateBed', 'Gather', 'Brainrot', 'ToTheSun', 'Rescue', 'Stand', 'Protection', 'Levitation'])
        assert.equal(spellOutcome(n, 1), 'none', n);
});

test('each spell pushes by its strength: a stagger or off the feet', () => {
    const want = [
        ['Inferno', 5, 'none'], ['Sands', 5, 'stagger'],
        ['Wind', 8, 'stagger'], ['Wind', 2, 'knockdown'], ['WindMaxima', 10, 'knockdown'],
        ['WaveAttack', 0, 'stagger'], ['WaveAttackMaxima', 0, 'knockdown'],
        ['Thunderwave', 10, 'knockdown'], ['Thunderwave', 30, 'stagger'],
        ['Bombardo', 2, 'knockdown'], ['Bombardo', 5, 'stagger'], ['Bombardo', 6.5, 'none'], ['BombardoMaxima', 7, 'knockdown'],
        ['SapiraDuel', 0, 'knockdown'], ['Sapira', 0, 'knockdown'],
        ['Stupefy', 0, 'knockdown'], ['Earthquake', 0, 'knockdown'], ['EarthquakeMaxima', 0, 'knockdown'], ['Lightning', 0, 'knockdown'],
        ['WallRise', 0, 'stagger'], ['WallRiseMaxima', 0, 'knockdown'],
    ];
    for (const [n, d, r] of want) assert.equal(spellOutcome(n, d), r, `${n} at ${d}`);
    assert.equal(spellOutcome('Stupefy', 0, { dome: true }), 'none', 'the dome stops even Stupefy');
    assert.equal(spellPush('Thunderwave', 20), thunderPush(20));
    // a heavy cow takes the same Thunderwave as a stagger
    assert.equal(spellOutcome('Thunderwave', 10, { mass: 2.2, quad: true }), 'stagger');
});

/** A free-world player at the origin facing −Z, with the real body systems. */
function me() {
    const g = {
        config: { mode: 'freeworld' }, scene: new THREE.Scene(), localId: 'me', remotes: new Map(),
        knockback: new THREE.Vector3(), fx: { shake: 0, spark() {}, lightFlash() {} }, killCount: 0, punchCount: 0,
        weapons: { hasWeapon: () => false },
        hud: { update() {}, setFatigue() {}, setStatus() {}, setFrozenOverlay() {}, damageFlash() {}, setVoice() {}, flashColor() {} },
        playerName: () => null, onLocalDeath() {},
    };
    g.character = new VoxelCharacter(g.scene);
    g.character.group.position.set(0, 0.5, 0);
    g.combat = new Combat(g);
    g.impact = new BodyImpact(g);
    g.knock = new Knockdown(g);
    return g;
}
const FRONT10 = new THREE.Vector3(0, 1.1, -10);

test('Thunderwave at 10 m throws me on my back and hurts; held by a shield it only pushes the arm', () => {
    const g = me();
    const push = new THREE.Vector3(0, 0, 1).multiplyScalar(thunderPush(10));
    g.combat.hitBySpell('Thunderwave', FRONT10, 'enemy', push);
    assert.equal(g.combat.hp, 17);
    assert.equal(g.knock.state, 'falling');
    assert.equal(g.knock.dir, 'back');
    // with Protection turned to the caster
    const s = me();
    s.combat.shield = { type: 1, side: 'right', left: 5 };
    s.combat.shieldFactor = () => 1;
    s.combat.hitBySpell('Thunderwave', FRONT10, 'enemy', push.clone());
    assert.equal(s.combat.hp, 20);
    assert.equal(s.knock.down, false, 'never a fall behind a shield (at most a step back)');
    assert.ok(Math.abs(s.knockback.length() - 0.25 * push.length()) < 0.1, `felt: ${s.knockback.length()}`);
});

test('Sapira and Lightning knock down by their push; Inferno only drifts', () => {
    const a = me();
    a.combat.hitBySpell('Sapira', FRONT10, 'enemy');
    assert.equal(a.knock.state, 'falling');
    const b = me();
    b.combat.hitBySpell('Lightning', new THREE.Vector3(1, 0, 0), 'enemy');
    assert.equal(b.knock.state, 'falling', 'electrocuted: always off the feet');
    assert.equal(b.knock.dir, 'left', 'away from the strike');
    const c = me();
    c.combat.hitBySpell('Inferno', FRONT10, 'enemy');
    assert.equal(c.knock.state, 'up');
    assert.ok(c.knockback.z > 1, 'the flames push a little');
});
