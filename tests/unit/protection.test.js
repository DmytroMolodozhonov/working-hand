import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Combat, PVP, shieldHitCost } from '../../src/game/Combat.js';
import { bounceOffShields } from '../../src/game/ShieldBounce.js';

/** One player at the origin facing −Z; `wand`: the hand holding a wand. */
function fakeGame({ armOut = 'right', tPose = false, wand = null, leftUp = 0 } = {}) {
    const voice = [];
    const g = {
        config: { mode: 'freeworld' },
        scene: new THREE.Scene(),
        localId: 'me',
        knockback: new THREE.Vector3(),
        remotes: new Map(),
        fx: { spark() {}, lightFlash() {} },
        hud: { update() {}, setFatigue() {}, setStatus() {}, setFrozenOverlay() {}, damageFlash() {}, setVoice(t) { voice.push(t); } },
        character: {
            group: { position: new THREE.Vector3(0, 0.5, 0) },
            getHandWorldPosition: (side, out = new THREE.Vector3()) => out.set(side === 'left' ? -0.6 : 0.6, 1.2 + (side === 'left' ? leftUp : 0), -1.5),
            getHandDirection: (side, out = new THREE.Vector3()) => out.set(0, 0, -1),
            isArmExtended: (side) => armOut === side || armOut === 'both',
            isTPose: () => tPose,
        },
        wandSide: () => wand,
        playerName: () => 'Враг',
        onLocalDeath() {},
    };
    return { g, voice, c: new Combat(g) };
}
const FRONT = new THREE.Vector3(0, 1.2, -20);

test('the hand shield is 30 % bigger; it drains 0.5 a second, the dome 1', () => {
    assert.ok(Math.abs(PVP.SHIELD_SCALE - 1.15 * 1.3) < 0.01);
    assert.equal(PVP.SHIELD_DRAIN, 0.5);
    assert.equal(PVP.DOME_DRAIN, 1);
});

test('a spell stopped by the shield costs half of its own mana', () => {
    assert.equal(shieldHitCost('AvadaKedavra'), 12.5);
    assert.equal(shieldHitCost('Stupefy'), 6);
    assert.equal(shieldHitCost('IceDuel'), 2.5); // («Айс» costs 5 now — StrongSpells.js)
    assert.equal(shieldHitCost('SapiraDuel'), 10);
    assert.equal(shieldHitCost('arrow'), 0, 'an arrow is no spell');
    const { c } = fakeGame();
    c.castProtection(false);
    c.fatigue = 30;
    assert.equal(c._blocked(FRONT, 'AvadaKedavra'), true);
    assert.equal(c.fatigue, 17.5);
    // a beam held on it is one spell: paid once
    for (let i = 0; i < 30; i++) c.chillBy(0.02, FRONT, 'enemy');
    assert.equal(c.fatigue, 15); // (the ice beam: half of «Айс»'s 5)
    assert.equal(c.chill, 0);
});

test('out of mana: the shield shatters and the spell goes on through', () => {
    const { c, voice } = fakeGame();
    c.castProtection(false);
    c.fatigue = 4; // (Sapira would cost 10)
    assert.equal(c.hitBySpell('Sapira', FRONT, 'enemy'), true, 'it hit me');
    assert.equal(c.shield, null);
    assert.equal(c.hp, 16);
    assert.equal(c.fatigue, 0);
    assert.equal(c.serialize()[4], 1, 'the others see it shatter');
    assert.ok(voice.some((t) => /разбит/.test(t)));
    assert.ok(c.visuals.shards.length > 0, 'its pieces fly');
});

test('the dome: proof against a blast (it pays half the spell); out of mana a blast hits in full', () => {
    const { c } = fakeGame({ tPose: true });
    c.castProtection(true);
    assert.equal(c.shield.type, 2);
    c.fatigue = 20;
    const hp = c.hp;
    c.explosion(new THREE.Vector3(1, 1, 1), 3.6, 1, 'enemy');
    assert.equal(c.hp, hp, 'no harm under the dome');
    assert.equal(c.fatigue, 12.5, 'Bombardo (15): half of it paid');
    c.damage(5, null, 'collapse');
    c.damage(5, null, 'Bombardo'); // (my own blast)
    assert.equal(c.hp, hp, 'no falling pieces, no own blast');
    c.fatigue = 3;
    c.explosion(new THREE.Vector3(1, 1, 1), 3.6, 1, 'enemy');
    assert.equal(c.shield, null, 'Bombardo (15) needs 7.5: shattered');
    assert.ok(c.hp <= 10, `the whole blast, not a quarter (hp ${c.hp})`);
});

test('a wand in one hand: the shield goes up at the wand; at the other hand only when it is raised higher', () => {
    const { c } = fakeGame({ armOut: 'both', wand: 'right' });
    c.castProtection(false);
    assert.equal(c.shield.side, 'right', 'at the wand');
    assert.equal(c.castFrom('right'), true, 'the same wand cast again: it is gone');
    assert.equal(c.shield, null);
    const { c: c2 } = fakeGame({ armOut: 'both', wand: 'right', leftUp: 0.4 });
    c2.castProtection(false);
    assert.equal(c2.shield.side, 'left', 'the other hand raised higher holds it');
    assert.equal(c2.castFrom('right'), false, 'the wand casts on: the shield stays');
    const { c: c3 } = fakeGame({ tPose: true, wand: 'right' });
    c3.castProtection(true);
    assert.equal(c3.castFrom('right'), false, 'the dome is not in a hand');
    assert.ok(c3.shield);
});

test('arrows bounce off a hand shield and a dome (mirrored), not through', () => {
    const disc = { disc: true, c: new THREE.Vector3(0, 1, 0), n: new THREE.Vector3(0, 0, 1), r: 1.5, by: 'p' };
    const was = new THREE.Vector3(0.3, 1, 0.3), p = new THREE.Vector3(0.3, 1, -0.2), v = new THREE.Vector3(0, 0, -30);
    assert.equal(bounceOffShields([disc], was, p, v, 'shooter'), disc);
    assert.ok(v.z > 0 && p.z > 0, 'mirrored back the way it came');
    const miss = new THREE.Vector3(3, 1, -0.2), v2 = new THREE.Vector3(0, 0, -30);
    assert.equal(bounceOffShields([disc], new THREE.Vector3(3, 1, 0.3), miss, v2), null, 'beside the disc: flies on');
    assert.equal(bounceOffShields([disc], was.clone(), new THREE.Vector3(0.3, 1, -0.2), new THREE.Vector3(0, 0, -30), 'p'), null, 'its owner\'s own arrow passes');
    const dome = { c: new THREE.Vector3(0, 0, 0), r: 2.6, by: 'p' };
    const v3 = new THREE.Vector3(-30, 0, 0), p3 = new THREE.Vector3(2.4, 0, 0);
    assert.equal(bounceOffShields([dome], new THREE.Vector3(3, 0, 0), p3, v3), dome);
    assert.ok(v3.x > 0 && p3.length() > 2.6, 'off the dome');
    assert.equal(bounceOffShields([dome], new THREE.Vector3(1, 0, 0), new THREE.Vector3(3, 0, 0), new THREE.Vector3(30, 0, 0)), null, 'from inside out: free');
});
