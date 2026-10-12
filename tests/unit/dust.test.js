/**
 * «Даст» is a duel spell that slows whoever it hits for 5 s — players and every creature.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Combat, PVP } from '../../src/game/Combat.js';
import { Duel, DUEL_SPELLS } from '../../src/game/Duel.js';
import { SLOW, slowFactor, tickSlow } from '../../src/game/Slow.js';
import { DUEL_SPELL_NAME } from '../../src/game/Mana.js';

function fakeGame(mode = 'freeworld') {
    const ev = { deaths: [], voice: [], status: '' };
    const g = {
        config: { mode }, localId: 'me', knockback: new THREE.Vector3(), remotes: new Map(), killCount: 0, punchCount: 0,
        weapons: { hasWeapon: () => false }, fx: { spark() {}, lightFlash() {} },
        hud: { update() {}, setFatigue() {}, setStatus(t) { ev.status = t; }, setFrozenOverlay() {}, damageFlash() {}, setVoice(t) { ev.voice.push(t); }, flashColor() {}, toast() {} },
        character: { group: { position: new THREE.Vector3() }, getHandWorldPosition: (s, o = new THREE.Vector3()) => o, getHandDirection: (s, o = new THREE.Vector3()) => o.set(0, 0, -1), isArmExtended: () => false, isTPose: () => false },
        playerName: (id) => (id === 'enemy' ? 'Враг' : null),
        onLocalDeath: (text) => ev.deaths.push(text),
    };
    g.combat = new Combat(g);
    return { g, ev };
}
/** Just the parts of Duel that apply a landed charge. */
const duelOf = (g) => Object.assign(Object.create(Duel.prototype), { game: g, log: [], _t: 0, _burst() {} });

test('«Даст» is a duel charge (cost of «Sands»), sandy coloured', () => {
    assert.ok(DUEL_SPELLS.SandsDuel);
    assert.equal(DUEL_SPELLS.SandsDuel.name, 'Dust');
    assert.equal(DUEL_SPELL_NAME.SandsDuel, 'Sands');
});

test('«Даст» on me: 5 s slowed (every mode), 3 HP in the free world', () => {
    for (const mode of ['freeworld', 'creative']) {
        const { g, ev } = fakeGame(mode);
        duelOf(g).applyToMe('SandsDuel', 'enemy');
        assert.equal(g.character.slowScale, SLOW.SCALE, mode);
        assert.equal(g.combat.hp, mode === 'freeworld' ? PVP.MAX_HP - 3 : PVP.MAX_HP);
        for (let i = 0; i < 240; i++) g.combat.update(1 / 60);
        assert.equal(g.character.slowScale, SLOW.SCALE, `${mode}: still slowed after 4 s`);
        assert.match(ev.status, /замедлены/);
        for (let i = 0; i < 66; i++) g.combat.update(1 / 60);
        assert.equal(g.character.slowScale, 1, `${mode}: normal again after 5 s`);
    }
    // death and back: no sand left
    const { g } = fakeGame();
    g.combat.slow(5);
    g.combat.revive();
    assert.equal(g.character.slowScale, 1);
});

test('«Даст» on a zombie, an animal, a villager: 5 s at 0.4 speed', () => {
    const { g } = fakeGame();
    const d = duelOf(g);
    d._creaturePoint = (c, o) => o.set(0, 1, 0);
    const z = { group: { position: new THREE.Vector3() } }, cow = { isAnimal: true }, knight = { isAnimal: false };
    d.applyToZombie('SandsDuel', z, 'me');
    d.applyToCreature('SandsDuel', cow, 'me');
    d.applyToCreature('SandsDuel', knight, 'me');
    for (const c of [z, cow, knight]) {
        assert.equal(c.slowT, SLOW.TIME);
        assert.equal(slowFactor(c), 0.4);
        tickSlow(c, 4.9);
        assert.equal(slowFactor(c), 0.4);
        tickSlow(c, 0.2);
        assert.equal(slowFactor(c), 1);
    }
    assert.equal(slowFactor({}), 1);
});
