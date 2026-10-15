import test from 'node:test';
import assert from 'node:assert/strict';
import { FACE, facesTarget, facingError, turnToward, yawTo } from '../../src/game/FaceTarget.js';
import { decide } from '../../src/game/WizardAI.js';

// forward is (−sin yaw, −cos yaw): yaw 0 looks along −z
test('«лицом к цели»: in front — may cast; from the side or behind — not', () => {
    assert.ok(facesTarget(0, 0, 0, 0, -10));                 // straight ahead
    assert.ok(facesTarget(0, 0, 0, 1.5, -10));               // ~8.5° off: still in front
    assert.ok(!facesTarget(0, 0, 0, 10, 0));                 // at his side
    assert.ok(!facesTarget(0, 0, 0, -10, 0));                // the other side
    assert.ok(!facesTarget(0, 0, 0, 0, 10));                 // behind his back
    assert.ok(!facesTarget(0, 0, 0, 4, -10, FACE.SPELL));    // ~22° off: no spell yet…
    assert.ok(facesTarget(0, 0, 0, 4, -10, FACE.MELEE));     // …but a sword's swing covers it
});

test('he turns at a limited speed — and after the turn he may cast', () => {
    let yaw = 0;
    const tx = 0, tz = 10; // right behind him
    const want = yawTo(0, 0, tx, tz);
    const dt = 1 / 60;
    yaw = turnToward(yaw, want, FACE.WIZARD_TURN * dt);
    assert.ok(!facesTarget(yaw, 0, 0, tx, tz), 'no instant about-face');
    let t = dt;
    while (!facesTarget(yaw, 0, 0, tx, tz) && t < 5) { yaw = turnToward(yaw, want, FACE.WIZARD_TURN * dt); t += dt; }
    assert.ok(facesTarget(yaw, 0, 0, tx, tz), 'turned to the target');
    assert.ok(t > 0.5 && t < 1, `a half-turn takes a moment (${t.toFixed(2)} s)`);
    assert.ok(facingError(yaw, 0, 0, tx, tz) <= FACE.SPELL);
});

test('WizardAI.decide: not turned to the foe yet — he turns, then casts', () => {
    const base = { role: 'teacher', hp: 16, mana: 40, brave: 1, dist: 10, sees: true, castReady: true, spell: 'Stupefy' };
    assert.equal(decide({ ...base, faced: false }).a, 'turn');
    assert.equal(decide({ ...base, faced: true }).a, 'cast');
});
