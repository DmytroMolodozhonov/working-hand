/**
 * «Джолт» / «Джолт Максима»: a duel charge of air — the body is thrown back, tumbles over in the air,
 * lies a while, gets up and is dizzy. Heard only as a word of its own.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { matchSpell } from '../../src/fx/SpellManager.js';
import { SPELL_COST } from '../../src/game/Combat.js';
import { Duel, DUEL_SPELLS, JOLT } from '../../src/game/Duel.js';
import { DUEL_SPELL_NAME, firstSpellGain } from '../../src/game/Mana.js';
import { NPC_COST } from '../../src/game/WizardAI.js';
import { CreatureImpact } from '../../src/game/CreatureImpact.js';
import { SPELLS } from '../../src/ui/Codex.js';

test('«Джолт» is heard as a Russian recognizer hears it — and never in ordinary talk', () => {
    for (const w of ['джолт', 'Джольт!', 'жолт', 'джоулт', 'джолд', 'jolt']) assert.equal(matchSpell(w), 'Jolt', w);
    for (const w of ['джолт максима', 'Jolt Maxima', 'жолт макс']) assert.equal(matchSpell(w), 'JoltMaxima', w);
    for (const w of ['жёлтый лист', 'желтый', 'джоуль', 'болт', 'золото', 'солдат', 'колдун']) assert.notEqual(matchSpell(w), 'Jolt', w);
});

test('«Джолт» costs 5, «Джолт Максима» 15 (a strong spell) and pushes three times as hard; a duel charge with cards in the book', () => {
    assert.equal(SPELL_COST.Jolt, 5);
    assert.equal(SPELL_COST.JoltMaxima, 15);
    assert.equal(NPC_COST.Jolt, 5);
    assert.ok(firstSpellGain('JoltMaxima') > firstSpellGain('Jolt'));
    assert.equal(JOLT.JoltMaxima.push, 3 * JOLT.Jolt.push);
    assert.ok(DUEL_SPELLS.Jolt && DUEL_SPELLS.JoltMaxima);
    assert.equal(DUEL_SPELL_NAME.JoltMaxima, 'JoltMaxima');
    for (const n of ['Jolt', 'Jolt Maxima']) assert.equal(SPELLS.find((s) => s.name === n)?.cat, 'duel', n);
});

test('«Джолт» on me: thrown back off the feet, through the air, tumbling (Maxima: 3× the push)', () => {
    for (const spell of ['Jolt', 'JoltMaxima']) {
        const got = [];
        const g = {
            localId: 'me', remotes: new Map(), fx: { spark() {}, lightFlash() {}, shake: 0 },
            hud: { setVoice() {}, flashColor() {} },
            character: { group: { position: new THREE.Vector3(), rotation: { y: 0 } } },
            combat: { enabled: true, center: (o) => o.set(0, 1, 0) },
            impact: { apply: (o) => got.push(o) },
            castleLife: null,
        };
        const d = Object.assign(Object.create(Duel.prototype), { game: g, log: [], _t: 0, _burst() {}, jolt: { hit() {} } });
        d._handOf = (by, side, out) => { out.set(0, 1, -6); return true; }; // (the caster stands 6 m in front)
        d.applyToMe(spell, 'enemy');
        const o = got[0];
        assert.ok(o.always && o.fly && o.tumble >= 1, spell);
        assert.ok(Math.abs(o.v.length() - JOLT[spell].push) < 1e-6, spell);
        assert.ok(o.v.z > 0, 'away from the caster');
    }
});

test('«Джолт» on a creature: it flies, flips over in the air, lies, gets up by itself and is dizzy', () => {
    const scene = new THREE.Group();
    const z = { id: 7, group: new THREE.Group(), takeDamage() {}, isDead: false };
    z.group.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1)));
    scene.add(z.group);
    const g = { authority: true, zombies: [z], fx: {} };
    const ci = new CreatureImpact(g);
    const res = ci.apply(z, { v: new THREE.Vector3(0, 0, JOLT.Jolt.push), spell: 'Jolt', always: { down: JOLT.Jolt.down }, toss: JOLT.Jolt.toss, fly: true, tumble: 1, daze: JOLT.Jolt.daze });
    assert.equal(res, 'knockdown');
    assert.ok(z.vy > 0, 'thrown up');
    let maxTurn = 0;
    const piv = z.group.userData.impPivot;
    for (let t = 0; t < 0.6; t += 1 / 60) { ci.update(1 / 60); maxTurn = Math.max(maxTurn, Math.abs(piv.rotation.x) + Math.abs(piv.rotation.z)); }
    assert.ok(maxTurn > Math.PI, `a real flip in the air (turned ${maxTurn.toFixed(2)} rad)`);
    assert.ok(z.group.position.z > 5, 'flown back several metres');
    for (let t = 0; t < 6; t += 1 / 60) ci.update(1 / 60);
    assert.equal(ci.stateOf(z), 'up', 'up again by itself');
    assert.ok(z.dazeT > 0, 'dizzy');
    for (let t = 0; t < 12; t += 1 / 60) ci.update(1 / 60);
    assert.ok(!(z.dazeT > 0), 'the head clears');
});
