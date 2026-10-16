/**
 * «Айс» is a duel spell: only the word itself casts it (never ordinary talk), and whoever it
 * hits is locked in ice 10 s and loses 3 HP a second (StrongSpells.js: «Айс» = «Frozen», «Айс Максима»).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { Combat, PVP } from '../../src/game/Combat.js';
import { Duel, DUEL_SPELLS } from '../../src/game/Duel.js';
import { StrongMagic } from '../../src/game/StrongMagic.js';
import { STRONG } from '../../src/game/StrongSpells.js';

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

test('«Айс» (= «Frozen») on me: 10 s in ice in every mode, −3 HP a second while it holds (the ice\'s bite never shatters me)', () => {
    for (const mode of ['freeworld', 'creative']) {
        const { g } = fakeGame(mode);
        g.strong = new StrongMagic(g);
        g.combat.maxHp = g.combat.hp = 50; // (−3/s × 10 s = 30: more than a new hero's 20 — the ice can kill)
        duelOf(g).applyToMe('IceDuel', 'enemy');
        assert.ok(g.combat.frozen, mode);
        assert.ok(g.combat.immobile, `${mode}: can't move`);
        assert.ok(g.combat.serialize()?.[3] > 0, `${mode}: the ice is sent to the others`);
        for (let t = 0; t < STRONG.Ice.time - 0.5; t += 0.1) { g.combat.update(0.1); g.strong._meUpdate(0.1); }
        assert.ok(g.combat.frozen && !g.combat.dead, `${mode}: still frozen, alive`);
        if (mode === 'freeworld') assert.ok(Math.abs(g.combat.hp - (50 - 28.5)) < 2, `the ice bites: ${g.combat.hp}`);
        for (let t = 0; t < 1; t += 0.1) g.combat.update(0.1);
        assert.ok(!g.combat.frozen, `${mode}: melted after 10 s`);
    }
});

test('«Айс» on an animal / a villager: 10 s in the ice and −3/s; «Айс Максима» −10/s; a zombie frozen with crystals all over it', () => {
    const { g } = fakeGame('freeworld');
    g.authority = true;
    const hits = [];
    g.animals = { hit: (c, dmg) => hits.push(['a', dmg]), guards: { attacked() {} } };
    g.castleLife = { hit: (c, dmg) => hits.push(['v', dmg]) };
    g.strong = new StrongMagic(g);
    const d = duelOf(g);
    d._creaturePoint = (c, o) => o.set(0, 1, 0);
    d._encase = () => {};
    g.duel = d;
    const cow = { isAnimal: true, id: 1 }, knight = { isVillager: true, id: 2, role: 'knight' };
    d.applyToCreature('IceDuel', cow, 'me');
    d.applyToCreature('IceDuelMaxima', knight, 'me');
    for (const c of [cow, knight]) assert.equal(c.stunT, STRONG.Ice.time);
    for (let t = 0; t < 10.2; t += 0.1) g.strong.update(0.1);
    const sum = (k) => hits.filter((h) => h[0] === k).reduce((a, h) => a + h[1], 0);
    assert.ok(Math.abs(sum('a') - 30) < 2, `the cow: −3/s × 10 s (${sum('a')})`);
    assert.ok(Math.abs(sum('v') - 100) < 6, `the knight: −10/s × 10 s (${sum('v')})`);
    const crystals = [];
    const z = { group: { position: new THREE.Vector3() }, isFrozen: false, iceCrystals: { children: crystals },
        spawnIceCrystalOnBody() { crystals.push({ scale: new THREE.Vector3(0.1, 0.1, 0.1) }); }, freeze() { this.isFrozen = true; } };
    d.applyToZombie('IceDuel', z, 'me');
    assert.ok(z.isFrozen);
    assert.ok(crystals.length >= 10 && crystals.every((k) => k.scale.x > 1), 'big ice crystals all over it');
});
