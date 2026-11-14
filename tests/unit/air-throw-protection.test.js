/**
 * The air mage's lift-and-throw and who can stop it (the author 14.11: «Защититься можно при помощи Protection Maxima. Обычный Protection не сможет»).
 * «А если»: no shield; the ordinary shield (type 1) facing him; the Maxima dome (type 2); the dome up behind his back (not facing: shieldFactor < 1);
 * a plain Leviosa lift (not an air mage's) — the ordinary shield still breaks that one; thrown while not held (nothing happens); a throw with a NaN velocity;
 * a throw faster than a mage can throw (clamped); the throw sent over the net.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Levitation, THROW_MAX } from '../../src/game/Levitation.js';
import { AIR_THROW, throwVector } from '../../src/game/ElementalRules.js';

function rig({ shield = null, factor = 1 } = {}) {
    const blocked = [], said = [], sent = [];
    const g = {
        localId: 'me', hud: { setVoice: (m) => said.push(m) }, sync: { lift: (...a) => sent.push(['lift', ...a]), lev: (...a) => sent.push(['lev', ...a]) },
        elementalMages: { liftedBy() {} },
        combat: { dead: false, enabled: true, shield, shieldFactor: () => factor, center: (o) => o.set(0, 2, 0), _blocked: (from, kind) => (blocked.push(kind), true), magicArmor: false },
        duel: { _handOf: (by, side, a, b) => { a.set(0, 4, -5); b.set(0, 4, -5); return true; } },
        character: { group: { position: new THREE.Vector3(0, 0, 0) } },
        impact: {}, knockback: new THREE.Vector3(),
    };
    const lev = Object.create(Levitation.prototype); lev.game = g; lev.lifted = null; lev.state = null;
    return { g, lev, blocked, said, sent };
}

test('no shield: the air mage\'s lift takes hold (flagged `air`)', () => {
    const r = rig(); r.lev.liftMe('airmage', 'right', { mx: true, air: true });
    assert.ok(r.lev.lifted && r.lev.lifted.air === true && r.lev.lifted.mx === true);
});
test('the ORDINARY Protection does not stop it — neither the start nor the hold', () => {
    const r = rig({ shield: { type: 1, side: 'right', left: 9 } });
    r.lev.liftMe('airmage', 'right', { mx: true, air: true });
    assert.ok(r.lev.lifted, 'lifted through the ordinary shield');
    assert.equal(r.blocked.length, 0, 'the shield was not even asked');
    r.lev.holdPoint = () => new THREE.Vector3(0, 12, 0); r.lev._updateLifted(0.1);
    assert.ok(r.lev.lifted, 'and still held after a frame facing the ordinary shield');
});
test('the dome of «Protection Maxima» turns the lift away at the start', () => {
    const r = rig({ shield: { type: 2, side: 'right', left: 9 } });
    r.lev.liftMe('airmage', 'right', { mx: true, air: true });
    assert.equal(r.lev.lifted, null);
    assert.deepEqual(r.blocked, ['LevitationMaxima']);
    assert.ok(r.sent.some((m) => m[0] === 'lift' && m[5] === 'levShield' || m[6] === 'levShield'), 'the mage is told it was shielded');
});
test('a dome raised AFTER the lift breaks the hold: he is dropped', () => {
    const r = rig(); r.lev.liftMe('airmage', 'right', { mx: true, air: true });
    r.g.combat.shield = { type: 2, side: 'right', left: 9 };
    r.lev.holdPoint = () => new THREE.Vector3(0, 12, 0); r.lev._updateLifted(0.1);
    assert.equal(r.lev.lifted, null);
});
test('the dome behind the back (not facing the mage) stops nothing', () => {
    const r = rig({ shield: { type: 2, side: 'right', left: 9 }, factor: 0.2 });
    r.lev.liftMe('airmage', 'right', { mx: true, air: true });
    assert.ok(r.lev.lifted);
});
test('a plain Leviosa lift (not an air mage\'s) is still broken by the ordinary shield', () => {
    const r = rig(); r.lev.liftMe('wizard', 'right', { mx: false });
    r.g.combat.shield = { type: 1, side: 'right', left: 9 };
    r.lev.holdPoint = () => new THREE.Vector3(0, 12, 0); r.lev._updateLifted(0.1);
    assert.equal(r.lev.lifted, null);
    assert.deepEqual(r.blocked, ['Levitation']);
});
test('throwMe: the body leaves with the mage\'s velocity; nothing if not held / by someone else / NaN; clamped', () => {
    const r = rig(); assert.equal(r.lev.throwMe('airmage', { x: 1, y: 1, z: 1 }), false, 'not held');
    r.lev.liftMe('airmage', 'right', { mx: true, air: true });
    assert.equal(r.lev.throwMe('someone', { x: 1, y: 1, z: 1 }), false);
    assert.equal(r.lev.throwMe('airmage', { x: NaN, y: 1, z: 1 }), false);
    assert.ok(r.lev.lifted);
    assert.equal(r.lev.throwMe('airmage', { x: 100, y: 0, z: 0 }), true);
    assert.equal(r.lev.lifted, null);
    assert.ok(r.g.knockback.length() <= THROW_MAX * 1.5 + 1e-6, 'a mage\'s throw is not a cannon: ' + r.g.knockback.length());
    assert.ok(r.g.knockback.x > 10, 'went the way it was thrown');
    assert.ok(r.said.some((m) => /бросил/.test(m)));
});
test('the throw over the net: a guest\'s release message with `thr` throws him', () => {
    const r = rig(); r.lev.liftMe('airmage', 'right', { mx: true, air: true });
    r.lev.onNetLev({ k: 'p', id: 'me', on: 0, by: 'airmage', thr: [8, 6, -9] });
    assert.equal(r.lev.lifted, null);
    assert.ok(r.g.knockback.z < -5 && r.g.character.verticalVelocity > 3);
    const q = rig(); q.lev.liftMe('airmage', 'right', { mx: true, air: true });
    q.lev.onNetLev({ k: 'p', id: 'me', on: 0, by: 'airmage', thr: [NaN, 1, 1] });
    assert.equal(q.lev.lifted, null, 'a bad throw is only a drop');
});
test('throwVector: away from the mage over the foe, aside by his die, never zero', () => {
    const a = throwVector(0, 0, 10, 0, 0.5);
    assert.ok(Math.abs(a.x - AIR_THROW.SPEED) < 1e-9 && Math.abs(a.z) < 1e-9 && a.y === AIR_THROW.UP);
    const b = throwVector(0, 0, 10, 0, 1), c = throwVector(0, 0, 10, 0, 0);
    assert.ok(Math.sign(b.z) !== Math.sign(c.z), 'the two ends of the die go to different sides');
    const d = throwVector(3, 3, 3, 3, 0.5);
    assert.ok(Math.hypot(d.x, d.z) > 5, 'the foe on top of him: still a throw');
});
