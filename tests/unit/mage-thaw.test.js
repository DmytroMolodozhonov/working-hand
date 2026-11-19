// A wizard of the game frozen by the plain «Frozen»/«Айс» thaws himself with «Fire Maxima» after his reaction time (1–5 s by strength); a fire mage
// is immune; the thick «Айс Максима» is not touched (MageThaw.js, the author 19.11).
import test from 'node:test';
import assert from 'node:assert/strict';
import { thawRule, THAW_REACT, isWizardNpc } from '../../src/game/MageThaw.js';

test('the stronger the wizard, the quicker he answers: 1…5 s', () => {
    const d = (rank, extra = {}) => thawRule({ rank, ...extra }).delay;
    assert.equal(d('novice'), 5); assert.equal(d('adept'), 4); assert.equal(d('teacher'), 3);
    assert.equal(d('supermage'), 1); assert.equal(d('savior'), 1);
    assert.ok(d('novice') > d('adept') && d('adept') > d('teacher') && d('teacher') > d('supermage'));
    assert.equal(d('teacher', { maxMana: 500 }), 2.5, 'a big reserve helps a little');
    assert.equal(d('savior', { maxMana: 900 }), 1, 'never quicker than a second');
    for (const r of Object.keys(THAW_REACT)) assert.ok(d(r) >= 1 && d(r) <= 5, r);
    assert.equal(thawRule({ W: {} }).delay, 4, 'a wizard of no known rank: the middle');
});

test('a fire mage does not take the ice at all', () => {
    assert.deepEqual(thawRule({ rank: 'elemental', element: 'fire', skillRole: 'mage' }), { immune: true });
    assert.ok(thawRule({ rank: 'elemental', element: 'water', skillRole: 'mage' }).delay >= 1, 'other elements: only a reaction');
});

test('not a wizard (a farmer, a knight, a plain villager): the usual ice', () => {
    assert.equal(thawRule({ role: 'farmer' }), null);
    assert.equal(thawRule({ role: 'knight' }), null);
    assert.equal(thawRule(null), null);
    assert.equal(isWizardNpc({ rank: 'adept', role: 'townwiz' }), true);
});
