// Pentagrams.js: the drawing «circle + star», the rite's rules, the seen list.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerPentagram } from '../../src/game/Pentagrams.js';
import { recognize, recognizeAny, resample, starPoints, figureLines, figureIds, figureOf, PENT, RITE, riteBody, riteGain, Seen, isPentagramScroll, pentagramScroll, PENTAGRAM_TARGETS } from '../../src/game/PentagramRules.js';

/** A hand-drawn figure: the circle, then the star; `wob` of the radius of trembling, `rot` the star turned, `ox/oz` the centre, `oval` squash. */
function figure({ R = 3.5, cx = 40, cz = -12, wob = 0, rot = 0, oval = 1, seed = 5, circleTurns = 1.05, step = 0.3 } = {}) {
    let s = seed;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * 2 - 1;
    const pts = [];
    const push = (x, z) => pts.push([cx + x * R + rnd() * wob * R, cz + z * R * oval + rnd() * wob * R]);
    const n = Math.round(circleTurns * 2 * Math.PI * R / step);
    for (let i = 0; i <= n; i++) { const a = (i / n) * circleTurns * 2 * Math.PI; push(Math.cos(a), Math.sin(a)); }
    const v = starPoints(rot);
    for (let k = 0; k <= 5; k++) {
        const a = v[k % 5], b = v[(k + 1) % 5];
        const m = Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) * R / step);
        for (let i = 0; i < m; i++) push(a[0] + (b[0] - a[0]) * i / m, a[1] + (b[1] - a[1]) * i / m);
    }
    return pts;
}

test('an exact circle with a star inside is recognised', () => {
    const r = recognize(figure());
    assert.ok(r.ok, JSON.stringify(r));
    assert.ok(Math.abs(r.r - 3.5) < 0.6 && Math.abs(r.cx - 40) < 0.5);
});

test('a crooked, trembling, turned, oval figure still counts (the author: «хоть минимально похож»)', () => {
    for (const o of [{ wob: 0.06 }, { wob: 0.08, rot: 0.6, seed: 9 }, { oval: 0.85, wob: 0.05, seed: 3 }, { R: 3.2, wob: 0.07 }, { R: 7.5, rot: 2, seed: 11 }, { circleTurns: 0.9, wob: 0.05 }]) {
        const r = recognize(figure(o));
        assert.ok(r.ok, JSON.stringify(o) + ' ' + JSON.stringify(r));
    }
});

test('a scribble, a lone circle, a lone star, a line, a spiral do not count', () => {
    let s = 1;
    const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
    const scribble = Array.from({ length: 200 }, () => [rnd() * 7, rnd() * 7]);
    assert.ok(!recognize(scribble).ok, 'scribble');
    const circle = figure().slice(0, 75);
    assert.ok(!recognize(circle).ok, 'circle only');
    const star = figure().slice(75);
    assert.ok(!recognize(star).ok, 'star only');
    assert.ok(!recognize(Array.from({ length: 80 }, (_, i) => [i * 0.2, 0])).ok, 'line');
    assert.ok(!recognize(Array.from({ length: 150 }, (_, i) => [Math.cos(i / 10) * (1 + i / 30), Math.sin(i / 10) * (1 + i / 30)])).ok, 'spiral');
    assert.ok(!recognize([]).ok && recognize([]).why === 'few');
});

test('the circle must come first; the size must fit', () => {
    const f = figure();
    const circle = f.slice(0, 75), star = f.slice(75);
    const wrong = recognize([...star, ...circle]);
    assert.ok(!wrong.ok && wrong.why === 'order', JSON.stringify(wrong));
    assert.equal(recognize(figure({ R: 1.2 })).ok, false);
    assert.equal(recognize(figure({ R: 11 })).why, 'large');
});

test('resample keeps the order and the ends', () => {
    const a = Array.from({ length: 300 }, (_, i) => [i, 0]);
    const b = resample(a, 100);
    assert.equal(b.length, 100);
    assert.deepEqual(b[0], [0, 0]); assert.deepEqual(b[99], [299, 0]);
});

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

test('the figures differ: a hexagram, a square and the five-pointed star are told apart; alike drawings go to the one the hero knows', () => {
    registerPentagram({ id: 't-hex', title: 'Гексаграмма', glow: 0x6a5acd, shape: { ring: 1, star: 6, skip: 2 } });
    registerPentagram({ id: 't-sq', title: 'Квадрат', glow: 0x3fae5a, shape: { ring: 1, star: 4, skip: 1 } });
    const lines = (id, o = {}) => {
        const { R = 3.5, cx = 40, cz = -12 } = o, pts = [];
        for (let i = 0; i <= 74; i++) { const a = (i / 74) * Math.PI * 2; pts.push([cx + Math.cos(a) * R, cz + Math.sin(a) * R]); }
        for (const poly of figureLines(id, o.rot || 0)) for (let k = 0; k <= poly.length; k++) {
            const a = poly[k % poly.length], b = poly[(k + 1) % poly.length], m = Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) * R / 0.3);
            for (let i = 0; i < m; i++) pts.push([cx + (a[0] + (b[0] - a[0]) * i / m) * R, cz + (a[1] + (b[1] - a[1]) * i / m) * R]);
        }
        return pts;
    };
    for (const id of ['devil', 't-hex', 't-sq']) {
        const r = recognizeAny(lines(id, { rot: 0.5 }), new Set(['devil', 't-hex', 't-sq']));
        assert.ok(r.ok && r.id === id, `${id} drawn: ${JSON.stringify(r)}`);
    }
    // the same star is the devil one, the breakward one and the gargoyles': the known one wins
    assert.equal(recognizeAny(lines('devil'), new Set(['gargoyles'])).id, 'gargoyles');
    assert.equal(recognizeAny(lines('devil'), new Set(['devil'])).id, 'devil');
    assert.ok(!recognizeAny([]).ok);
});

test('the scroll names its figure (what to draw inside the circle)', () => {
    for (const id of figureIds()) assert.ok(figureOf(id).figure && figureOf(id).ru && figureOf(id).sym > 0, id);
});

test('dense scribbles never pass (random fills of every density), and a shaky hand with a 12 % tremble still does', () => {
    for (const n of [80, 160, 300, 600]) for (let sd = 1; sd <= 12; sd++) {
        let s = sd * 7919; const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
        assert.ok(!recognize(Array.from({ length: n }, () => [(rnd() - 0.5) * 7.4, 8 + (rnd() - 0.5) * 7.4])).ok, `fill ${n} #${sd}`);
    }
    for (let sd = 1; sd <= 12; sd++) assert.ok(recognize(figure({ wob: 0.12, seed: sd * 13, rot: sd * 0.3 })).ok, `shaky #${sd}`);
    // a double circle is not the pentagram of the devil
    const two = [];
    for (let i = 0; i <= 75; i++) { const a = (i / 75) * 6.283; two.push([Math.cos(a) * 3.5, 8 + Math.sin(a) * 3.5]); }
    for (let i = 0; i <= 45; i++) { const a = (i / 45) * 6.283; two.push([Math.cos(a) * 2, 8 + Math.sin(a) * 2]); }
    assert.ok(!recognize(two, 'devil').ok);
});
