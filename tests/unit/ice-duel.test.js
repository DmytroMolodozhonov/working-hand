/**
 * «Айс» is a duel spell: only the word itself casts it (never ordinary talk), and whoever it
 * hits is locked in ice — a wizard 20 s in the free world (5 s in other modes), a creature 8 s.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { Combat, PVP } from '../../src/game/Combat.js';
import { Duel, DUEL_SPELLS } from '../../src/game/Duel.js';
import { ICE } from '../../src/fx/IceLook.js';

test('«Айс»: the word alone casts it — never ordinary talk that has «луч», «лед», «аис» inside', () => {
    for (const w of ['айс', 'Айс!', 'айз', 'лёд', 'лед', 'ice', 'скажи айс']) assert.equal(matchSpell(w), 'Ice', w);
    for (const w of ['мне так лучше', 'получилось', 'следующий', 'последний', 'наиболее', 'найс', 'случайно', 'холодно', 'this is it', 'face'])
        assert.notEqual(matchSpell(w), 'Ice', w);
    assert.ok(DUEL_SPELLS.IceDuel, 'a duel charge');
});

function fakeGame(mode) {
    const ev = { voice: [], status: '' };
    const g = {
        config: { mode }, localId: 'me', knockback: new THREE.Vector3(), remotes: new Map(), killCount: 0, punchCount: 0,
        weapons: { hasWeapon: () => false }, fx: { spark() {}, lightFlash() {} },
        hud: { update() {}, setFatigue() {}, setStatus(t) { ev.status = t; }, setFrozenOverlay() {}, damageFlash() {}, setVoice(t) { ev.voice.push(t); }, flashColor() {}, toast() {} },
        character: { group: { position: new THREE.Vector3() }, getHandWorldPosition: (s, o = new THREE.Vector3()) => o, getHandDirection: (s, o = new THREE.Vector3()) => o.set(0, 0, -1) },
        onLocalDeath() {},
    };
    g.combat = new Combat(g);
    return { g, ev };
}
const duelOf = (g) => Object.assign(Object.create(Duel.prototype), { game: g, log: [], _t: 0, _burst() {} });

test('«Айс» on me: in a shell of ice — 20 s in the free world, 5 s in other modes (and the others see it)', () => {
    for (const [mode, T] of [['freeworld', PVP.FREEZE_TIME], ['creative', ICE.CREATIVE_T]]) {
        const { g, ev } = fakeGame(mode);
        duelOf(g).applyToMe('IceDuel', 'enemy');
        assert.ok(g.combat.frozen, mode);
        assert.ok(g.combat.immobile, `${mode}: can't move`);
        assert.ok(g.combat.serialize()?.[3] > 0, `${mode}: the ice is sent to the others`);
        for (let t = 0; t < T - 0.5; t += 0.1) g.combat.update(0.1);
        assert.ok(g.combat.frozen, `${mode}: still frozen`);
        if (mode === 'creative') assert.match(ev.status, /Айс/);
        for (let t = 0; t < 1; t += 0.1) g.combat.update(0.1);
        assert.ok(!g.combat.frozen, `${mode}: melted after ${T} s`);
    }
});

test('«Айс» on an animal / a villager: it stands in the ice 8 s; a zombie is frozen with crystals all over it', () => {
    const { g } = fakeGame('freeworld');
    const d = duelOf(g);
    d._creaturePoint = (c, o) => o.set(0, 1, 0);
    const cow = { isAnimal: true, id: 1 }, knight = { id: 2 };
    d.applyToCreature('IceDuel', cow, 'me');
    d.applyToCreature('IceDuel', knight, 'me');
    for (const c of [cow, knight]) assert.equal(c.stunT, ICE.CREATURE_T);
    const crystals = [];
    const z = { group: { position: new THREE.Vector3() }, isFrozen: false, iceCrystals: { children: crystals },
        spawnIceCrystalOnBody() { crystals.push({ scale: new THREE.Vector3(0.1, 0.1, 0.1) }); }, freeze() { this.isFrozen = true; } };
    d.applyToZombie('IceDuel', z, 'me');
    assert.ok(z.isFrozen);
    assert.ok(crystals.length >= 10 && crystals.every((k) => k.scale.x > 1), 'big ice crystals all over it');
});
