// «Электром» pressing on a shield: held without end, the shield's holder pays mana a second until it gives way.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Combat, pressCost, SHIELD_PRESS } from '../../src/game/Combat.js';
import { StrongMagic } from '../../src/game/StrongMagic.js';
import { STRONG } from '../../src/game/StrongSpells.js';

function world(type) {
    const sparks = [];
    const g = { config: { mode: 'freeworld' }, localId: 'me', remotes: new Map(), fx: { spark: () => sparks.push(1), lightFlash() {} }, hud: { setVoice() {}, flashColor() {}, damageFlash() {}, setStatus() {}, update() {} },
        character: { group: { position: new THREE.Vector3() } }, onLocalDeath() {}, playerName: () => 'me', sound: new Proxy({}, { get: () => () => {} }) };
    g.combat = new Combat(g);
    const c = g.combat;
    c.maxHp = c.hp = 100;
    c.shield = { type, left: 30, side: 'right' };
    c.shatterCalls = 0;
    c._shatter = function () { this.shield = null; this.shatterCalls++; };
    c.shieldAt = (side, out) => out.set(0, 1, 0);
    c.shieldDir = (side, out) => out.set(0, 0, 1);
    return { g, c, sparks };
}

test('the dome pays half of what a «Protection» pays while the beam presses', () => {
    assert.equal(pressCost('Electrum', 1, true) * 2, pressCost('Electrum', 1, false));
    assert.equal(pressCost('Electrum', 1), SHIELD_PRESS.Electrum);
    assert.equal(pressCost('Bombardo', 1), 0, 'one-off spells are not pressed');
});

test('«Protection Maxima»: held for as long as mana lasts, then gives way and the beam goes on to the body', () => {
    const { c } = world(2);
    Object.defineProperty(c, 'manaOn', { value: true }); c.fatigue = 30;
    const from = new THREE.Vector3(0, 1, 10);
    let t = 0;
    while (c.pressBeam(from, 'Electrum', 0.25) && t < 60) t += 0.25;
    assert.ok(t > 8 && t < 12, `30 mana at 3/s ≈ 10 s: ${t}`);
    assert.equal(c.shatterCalls, 1);
    assert.equal(c.fatigue, 0);
});

test('plain «Protection» gives way twice as fast; a shield pressed for a short time stays', () => {
    const { c } = world(1);
    Object.defineProperty(c, 'manaOn', { value: true }); c.fatigue = 30;
    c.shieldFactor = () => 1;
    const from = new THREE.Vector3(0, 1, 10);
    let t = 0;
    while (c.pressBeam(from, 'Electrum', 0.25) && t < 60) t += 0.25;
    assert.ok(t > 4 && t < 6, `30 mana at 6/s ≈ 5 s: ${t}`);
});

test('electrumOnMe: no damage while the shield holds, damage once it gave way', () => {
    const { g, c } = world(2);
    Object.defineProperty(c, 'manaOn', { value: true }); c.fatigue = 4;
    g.duel = { _handOf: (by, side, p) => { p.set(0, 1, 10); return true; } };
    const s = new StrongMagic(g);
    const T = STRONG.Electrum.tick, dmg = STRONG.Electrum.dps * T;
    s.electrumOnMe('x', dmg);
    assert.equal(c.hp, 100, 'held');
    for (let i = 0; i < 20; i++) s.electrumOnMe('x', dmg);
    assert.ok(c.hp < 100, 'the shield gave way: the beam hurts');
    assert.equal(c.shield, null);
});

test('no mana rules — it holds on; no shield — no pressing', () => {
    const { c } = world(2);
    assert.equal(c.pressBeam(new THREE.Vector3(0, 1, 10), 'Electrum', 0.25) === true, true);
    c.shield = null;
    assert.equal(c.pressBeam(new THREE.Vector3(0, 1, 10), 'Electrum', 0.25), false);
});
