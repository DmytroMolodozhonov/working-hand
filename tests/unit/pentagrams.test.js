// Pentagrams.js: the drawing «circle + star», the rite's rules, the seen list.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerPentagram } from '../../src/game/Pentagrams.js';
import { figureLines, figureIds, figureOf, PENT, RITE, riteBody, riteGain, Seen, isPentagramScroll, pentagramScroll, PENTAGRAM_TARGETS } from '../../src/game/PentagramRules.js';

test('the figures: the devil one works, the others are blanks; the scroll', () => {
    assert.equal(figureOf('devil').ru, 'Пентаграмма дьявольской силы');
    assert.ok(figureIds().includes('breakward') && figureIds().includes('gargoyles'), 'the other sessions\' pentagrams are in the same table');
    assert.equal(riteBody({ k: 'v', wz: 1, mm: 90 }, 'breakward', { took: true }).why, 'blank', 'the rite is the devil one\'s');
    const sc = pentagramScroll('devil', 'u1');
    assert.ok(isPentagramScroll(sc) && sc.kind === 'scroll' && sc.pent === 'devil');
    assert.equal(pentagramScroll('nope', 'u2').pent, 'devil');
});

test('seen figures are kept and restored', () => {
    const s = new Seen();
    assert.ok(s.add('devil') && !s.add('devil') && !s.add('nope'));
    const t = new Seen();
    t.restore(s.snapshot());
    assert.ok(t.has('devil') && !t.has('breakward'));
    t.restore(['breakward', 'zzz']);
    assert.deepEqual(t.snapshot(), ['breakward']);
});

test('the rite: a wizard\'s body with the power taken — yes; bones, people, players, a second time — no', () => {
    const wiz = { k: 'v', wz: true, mm: 130 };
    assert.ok(riteBody(wiz, 'devil', { took: true }).ok);
    assert.equal(riteBody(wiz, 'devil', { took: false }).why, 'not-taken');
    assert.ok(riteBody(wiz, 'devil', { free: true }).ok, 'Creative');
    assert.equal(riteBody({ ...wiz, bones: {} }, 'devil', { took: true }).why, 'bones');
    assert.equal(riteBody({ ...wiz, stage: 'bones' }, 'devil', { took: true }).why, 'bones');
    assert.equal(riteBody({ k: 'v', mm: 30 }, 'devil', { took: true }).why, 'no-power');
    assert.equal(riteBody({ k: 'v', role: 'knight' }, 'devil', { took: true }).why, 'no-power');
    assert.equal(riteBody({ k: 'p', wz: true, mm: 90 }, 'devil', { took: true }).why, 'player');
    assert.equal(riteBody({ ...wiz, lg: {} }, 'devil', { took: true }).why, 'legacy');
    assert.equal(riteBody({ ...wiz, rit: 1 }, 'devil', { took: true }).why, 'done');
    assert.equal(riteBody(wiz, 'ward', { took: true }).why, 'blank');
    assert.equal(riteBody(null).ok, false);
});

test('the rite gives once more 25 % of the killed one\'s power (maximum − 30), at least 1', () => {
    assert.equal(RITE.K, 0.25);
    assert.equal(riteGain(430), 100);
    assert.equal(riteGain(130), 25);
    assert.equal(riteGain(30), 1);
    assert.equal(riteGain(undefined), 1);
});

test('the cost and the sizes are the author\'s', () => {
    assert.equal(PENT.COST, 20); assert.equal(PENT.DRAIN, 1);
    assert.equal(PENT.R_MIN, 3); assert.equal(PENT.R_MAX, 8); // (the author: a circle of 3…8 m radius; a hero is 3.5 m)
});

test('the table «who/what» has the creatures and the things', () => {
    for (const k of ['me', 'players', 'zombies', 'castlePeople', 'animals', 'sailors', 'spider', 'livingTrees', 'bookBirds', 'iceCastle', 'blackship', 'dragon', 'phoenix', 'owl', 'bodies', 'items', 'blocks', 'ground', 'godGift', 'enchanted', 'space', 'spells'])
        assert.ok(PENTAGRAM_TARGETS[k]?.why, k);
});

test('every figure has a name and a description of its picture', () => {
    for (const id of figureIds()) assert.ok(figureOf(id).figure && figureOf(id).ru, id);
});

