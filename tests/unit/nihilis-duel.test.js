import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { Duel, DUEL_SPELLS } from '../../src/game/Duel.js';
import { knowsNihilis } from '../../src/game/MonsterFear.js';
import { WizardFight } from '../../src/game/WizardFight.js';
import { Nihilis } from '../../src/game/Nihilis.js';
import { knows } from '../../src/game/SpellBook.js';
import { NPC_COST } from '../../src/game/WizardAI.js';
import { WHIRL } from '../../src/game/WhirlRules.js';
import { Game } from '../../src/game/Game.js';

test('the spoken Nihilis actually casts a paid duel bolt at a wizard and keeps its cone at other targets', () => {
    for (const kind of ['p', 'v', 'a']) {
        const charges = [], cones = [], payments = [];
        const g = { localId: 'H', character: { isArmRaised: () => true,
            getHandWorldPosition: (s, v) => v.set(0, 2, 0), getHandDirection: (s, v) => v.set(1, 0, 0) },
            duel: { pickSide: () => ({ side: 'right', t: { kind, id: 'target' } }), cast: (...args) => charges.push(args) },
            castleLife: { byId: new Map([['target', { wizard: true }]]) }, _duelReach: () => 100,
            combat: { check: () => null, pay: (n) => payments.push(n) }, hud: { setVoice() {} },
            mana: { success() {} }, perf: { note() {} } };
        g._castDuel = Game.prototype._castDuel;
        const n = new Nihilis(g); n.fire = (...args) => cones.push(args);
        assert.equal(n.cast(true), 'Nihilis');
        assert.deepEqual(payments, ['Nihilis']);
        assert.equal(charges.length, kind === 'a' ? 0 : 1);
        assert.equal(cones.length, kind === 'a' ? 1 : 0);
        if (charges.length) assert.equal(charges[0][0], 'NihilisDuel');
    }
});

test('one persistent knowledge roll: weak 50%, medium 80%, strong/head/Saviour 100%; both versions use the same scroll', () => {
    for (const [rank, expected] of [['novice', 0.5], ['adept', 0.8], ['teacher', 1], ['elder', 1], ['master', 1], ['savior', 1]]) {
        let n = 0;
        for (let i = 0; i < 10000; i++) {
            const v = { id: 'wizard' + i, rank, ...(rank === 'savior' ? { savior: 0 } : {}) };
            assert.equal(knowsNihilis(v), knowsNihilis(v));
            n += knowsNihilis(v);
        }
        assert.ok(Math.abs(n / 10000 - expected) < 0.02, rank + ': ' + n);
    }
    assert.equal(knows('NihilisDuel', { mode: 'freeworld', spells: { Nihilis: true } }), true);
    assert.equal(knows('NihilisDuel', { mode: 'freeworld' }), false);
    assert.equal(NPC_COST.NihilisDuel, 40);
    assert.ok(DUEL_SPELLS.NihilisDuel);
});

test('NPC detects the existing visible threshold 41; a cleaned skin hides even true darkness 100', () => {
    const g = { localId: 'H', dark: { level: 100, skin: 40 }, remotes: new Map([['guest', { dark: 41, blackLevel: 80 }]]) };
    const life = { _playerPos: () => ({ x: 10, y: 2, z: 0 }), _sees: () => true };
    const fight = new WizardFight({ game: g, life });
    const v = { id: 'strong', rank: 'teacher', role: 'teacher', mana: 100 };
    assert.notEqual(fight._spellFor(v, 'Stupefy', {}, 'H'), 'NihilisDuel');
    g.dark.skin = 41;
    assert.equal(fight._spellFor(v, 'Stupefy', {}, 'H'), 'NihilisDuel');
    assert.equal(fight._spellFor(v, 'Stupefy', {}, 'guest'), 'NihilisDuel');
    life._sees = () => false;
    assert.notEqual(fight._spellFor(v, 'Stupefy', {}, 'guest'), 'NihilisDuel', 'no recognition through walls');
    life._sees = () => true;
    v.mana = 39;
    assert.notEqual(fight._spellFor(v, 'Stupefy', {}, 'guest'), 'NihilisDuel');
    v.mana = 100; v.lesson = {};
    assert.notEqual(fight._spellFor(v, 'Stupefy', {}, 'guest'), 'NihilisDuel');
});

test('the actual beam formula adds the opponent’s true percentage after ordinary buffs, independently in both directions', () => {
    const d = Object.create(Duel.prototype);
    d.game = { localId: 'H', dark: { level: 70, skin: 0 }, remotes: new Map([['guest', { dark: 0, blackLevel: 50 }]]) };
    d._strength = () => 200; d._wandK = () => 1.3;
    const bolt = { by: 'H', spell: 'NihilisDuel' };
    assert.equal(d._beamPower(bolt, 'guest', 1), 200 * 1.3 * 1.5);
    assert.equal(d._beamPower({ ...bolt, by: 'guest' }, 'H', 1), 200 * 1.3 * 1.7);
    assert.equal(d._beamPower({ ...bolt, extra: 'Jolt' }, 'guest', 1), 200 * 1.3 * WHIRL.DOUBLE_K * 1.5);
    assert.equal(d._beamPower({ ...bolt, spell: 'Stupefy' }, 'guest', 1), 200 * 1.3);
    d.game.remotes.get('guest').blackLevel = 0;
    assert.equal(d._beamPower(bolt, 'guest', 1), 200 * 1.3);
});

test('duel hits affect one wizard, never scatter a cone or damage a plain person/animal', () => {
    let hit = 0, shattered = 0;
    const g = { authority: true, localId: 'H', combat: { center: (v) => v.set(0, 2, 0), enabled: true, damage: () => hit++ },
        dark: { level: 50 }, castleLife: { hit: () => hit++, wizards: { fight: { breakDome: () => shattered++ } } } };
    const n = g.nihilis = new Nihilis(g), d = Object.create(Duel.prototype);
    d.game = g; d._note = () => {};
    const src = new THREE.Vector3(0, 2, 0);
    d.applyToMe('NihilisDuel', 'guest');
    assert.equal(hit, 1);
    d.applyToCreature('NihilisDuel', { wizard: true, dark: 20, x: 10, z: 0 }, 'H', src);
    assert.equal(hit, 2); assert.equal(shattered, 1);
    d.applyToCreature('NihilisDuel', { wizard: true, dark: 0 }, 'H', src);
    d.applyToCreature('NihilisDuel', { isAnimal: true }, 'H', src);
    assert.equal(hit, 2);
    n._marks = () => assert.fail('duel must not dispel nearby drawings');
    n._world = () => assert.fail('duel must not start an area attack');
    g.dark.level = 0;
    d.applyToMe('NihilisDuel', 'guest');
    assert.equal(hit, 2);
});
