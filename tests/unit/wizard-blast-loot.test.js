import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WizardBlast } from '../../src/game/WizardBlast.js';
import { WizardFight } from '../../src/game/WizardFight.js';
import { FX } from '../../src/fx/WizardFx.js';
import { NPC_COST } from '../../src/game/WizardAI.js';
import { rollScroll } from '../../src/game/ItemTypes.js';
import { lootOfVillager } from '../../src/game/Death.js';
import { npcWorn } from '../../src/game/NpcArmor.js';
import { ArmorSystem as Armor } from '../../src/game/Armor.js';
import { Game } from '../../src/game/Game.js';

function rng(seed = 17) { let x = seed; return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; }; }

test('both scroll families occur equally often, including mild scrolls and wizard loot', () => {
    for (const mild of [false, true]) {
        const r = rng(), n = 20000; let pent = 0;
        for (let i = 0; i < n; i++) if (rollScroll(r, mild).stat === 'pentagram') pent++;
        assert.ok(Math.abs(pent / n - 0.5) < 0.015, `${mild}: ${pent}/${n}`);
    }
    const r = rng(); let doubles = 0, residents = 0, pent = 0, total = 0;
    for (let i = 0; i < 10000; i++) {
        const scrolls = lootOfVillager('wanderer', { rank: 'adept' }, r).filter(it => it.kind === 'scroll');
        assert.ok(scrolls.length === 1 || scrolls.length === 2); doubles += scrolls.length === 2;
        pent += scrolls.filter(it => it.stat === 'pentagram').length; total += scrolls.length;
        const ordinary = lootOfVillager('teacher', { rank: 'teacher' }, r).filter(it => it.kind === 'scroll');
        assert.ok(ordinary.length <= 1); residents += ordinary.length;
    }
    assert.ok(Math.abs(doubles / 10000 - 0.5) < 0.02);
    assert.ok(Math.abs(residents / 10000 - 0.25) < 0.02);
    assert.ok(Math.abs(pent / total - 0.5) < 0.02);
});

test('a wizard wears a real random robe, whose reserve and effects survive becoming loot', () => {
    const tiers = new Set(), effects = new Set();
    for (let i = 0; i < 100; i++) {
        const v = { id: 'wiz' + i, role: 'student', wizard: true, robe: true };
        const robe = npcWorn(v).robe;
        tiers.add(robe.tier); effects.add(JSON.stringify(robe.strong || []));
        robe.mag -= 5;
        const desc = Armor.prototype.deadArmor.call({}, v);
        const [loot] = Armor.prototype.armorItems.call({}, desc);
        assert.equal(loot.mag, robe.mag); assert.deepEqual(loot.strong, robe.strong);
    }
    assert.equal(tiers.size, 3); assert.ok(effects.size > 5);
    const plain = npcWorn({ id: 'plain', wizard: true, robe: false }).robe;
    assert.equal(plain.magic, false);
});

test('a witnessed Bombardo immediately raises capable domes and makes other mages counterattack', () => {
    const weak = { id: 'weak', wizard: true, role: 'student', entry: { brave: 0 }, x: 0, y: 0, z: -12, mana: 50, fx: 0, W: {}, castCd: 3 };
    const strong = { ...weak, id: 'strong', role: 'teacher', x: 3, mana: 200, W: { dome: { t: 6, cd: 20 } } };
    const hidden = { ...strong, id: 'hidden', x: 10, fx: 0 };
    const life = { byId: new Map([[weak.id, weak], [strong.id, strong], [hidden.id, hidden]]), _isPlayer: id => id === 'guest', _playerPos: () => ({ x: 0, y: 2, z: 0 }), _sees: v => v !== hidden, _say() {} };
    const W = { life, game: { authority: true }, fight: Object.create(WizardFight.prototype) };
    new WizardBlast(W).cast('guest', 'BombardoMaxima', new THREE.Vector3(0, 3, 0), new THREE.Vector3(0, 0, -1));
    assert.ok(strong.fx & FX.DOME); assert.equal(strong.mana, 200 - NPC_COST.ProtectionMaxima);
    assert.equal(weak.blastThreat.reply, 'Bombardo'); assert.equal(strong.blastThreat.reply, 'Stupefy');
    assert.equal(weak.foe, 'guest'); assert.equal(WizardFight.fights(weak), true);
    assert.equal(hidden.foe, undefined); assert.equal(hidden.fx, 0, 'no knowledge through a wall');
    assert.equal(WizardFight.prototype._spellFor.call({}, weak, 'Expelliarmus', {}, 'guest'), 'Bombardo');
    weak.noWand = true;
    const mana = weak.mana; new WizardBlast(W).cast('guest', 'Bombardo', new THREE.Vector3(), new THREE.Vector3(0, 0, -1));
    assert.equal(weak.mana, mana, 'disarmed wizard casts nothing');
});

test('one authoritative explosion hits every actor system once, including titans and the pharaoh', () => {
    const calls = new Map(), names = ['animals', 'spiders', 'phoenixes', 'owls', 'spencers', 'plants', 'canaries', 'tarons', 'flora', 'gargoyles', 'diabolos', 'dragons', 'iceCastle', 'vampire', 'titans', 'pharaoh', 'castleLife', 'customCreatures', 'customPlants'];
    const g = { localId: 'me', world: { explode: () => ({ blocks: [], falls: [], props: [] }) }, character: { group: { position: new THREE.Vector3(100, 2, 100) } }, combat: { explosion() {}, center: v => v.set(100, 2, 100) }, fx: { shake: 0, explosion() {}, debrisFrom() {} }, water: { explode() {} }, fire: { ignite() {} }, weapons: { weapons: [] }, zombies: [], creatureImpact: { spellArea() {} } };
    for (const name of names) g[name] = { hitAt: () => calls.set(name, (calls.get(name) || 0) + 1), noise() {}, attacked() {}, damaged() {} };
    Game.prototype.applyExplosion.call(g, new THREE.Vector3(), 6, true, 3, 'guest');
    for (const name of names) assert.equal(calls.get(name), 1, name);
});
