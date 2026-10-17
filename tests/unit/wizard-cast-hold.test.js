import test from 'node:test';
import assert from 'node:assert/strict';
import { CAST_HOLD, castHold, holdsCast } from '../../src/game/WizardAI.js';
import { WizardFight } from '../../src/game/WizardFight.js';

test('after a cast a wizard holds his pose 1.5–2.5 s (random), longer while his charge flies, at most 4 s', () => {
    assert.equal(castHold(() => 0), 1.5);
    assert.equal(castHold(() => 1), 2.5);
    assert.ok(holdsCast({ left: 0.5, held: 1.2 }));
    assert.ok(!holdsCast({ left: 0, held: 2 }));
    assert.ok(holdsCast({ left: 0, held: 2.6, flying: true }), 'his beam still flies from his wand: no running');
    assert.ok(!holdsCast({ left: 0, held: CAST_HOLD.MAX_T, flying: true }));
    assert.ok(!holdsCast({ left: 1, held: 0.3, fleeing: true }), 'a danger breaks it');
    assert.ok(!holdsCast({ left: 1, held: 0.3, foeDist: 1 }), 'a foe right at him breaks it');
});

test('WizardFight: a wizard who just cast stands still for the pose, then may move', () => {
    const bolts = new Map();
    const f = new WizardFight({ life: { _ground() {} }, game: { duel: { bolts } } });
    const v = { id: 7, x: 0, z: 0, yaw: 0, speed: 3, path: [1], fleeT: 0 };
    f._startHold(v);
    v.holdT = 2; // (the roll: 2 s)
    let still = 0;
    for (let i = 0; i < 300 && f.holdStill(v, 1 / 60); i++) { still++; assert.equal(v.speed, 0); assert.equal(v.path, null); }
    assert.ok(Math.abs(still / 60 - 2) < 0.05, `held ${still / 60} s`);
    assert.ok(!f.holding(v, 1 / 60), 'then free to move');
    // his charge still flying: he waits for it
    f._startHold(v); v.holdT = 1.5;
    bolts.set('7:1', { by: 7, state: 'flying' });
    for (let i = 0; i < 120; i++) f.holding(v, 1 / 60);
    assert.ok(f.holding(v, 1 / 60));
    bolts.clear();
    assert.ok(!f.holding(v, 1 / 60));
});
