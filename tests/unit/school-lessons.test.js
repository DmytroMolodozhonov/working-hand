// «Школа Акселдорф»: the lessons are ONE table run by one engine (SchoolLessons.js / SchoolLesson.js; docs/rules/school.md),
// and a new pupil does not know the fighting spells until a lesson gives them (SpellBook.SCHOOL_UNKNOWN).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LESSONS, lessonOk, lessonsOfMonth, SUBJECTS } from '../../src/game/SchoolLessons.js';
import { knows, SCHOOL_UNKNOWN } from '../../src/game/SpellBook.js';
import { SCHOOL_PEOPLE } from '../../src/game/School.js';

test('every lesson row is whole and its teacher is a person of the school', () => {
    const ids = new Set();
    for (const l of LESSONS) {
        assert.ok(lessonOk(l), l.id);
        assert.ok(!ids.has(l.id), 'one id: ' + l.id); ids.add(l.id);
        assert.ok(SCHOOL_PEOPLE.some((p) => p.idx === SUBJECTS[l.subject].teacher), l.id);
    }
    assert.ok(lessonsOfMonth(1).length >= 1);
});

test('at the school the fighting spells are learned at the lessons, the everyday ones known; elsewhere nothing changes', () => {
    for (const s of ['Protection', 'Expelliarmus', 'Frozen', 'Jolt', 'Sands']) {
        assert.equal(knows(s, { mode: 'freeworld', school: true }), false, s);
        assert.equal(knows(s, { mode: 'freeworld', school: true, spells: { [s]: true } }), true, s + ' after the lesson');
        assert.equal(knows(s, { mode: 'freeworld' }), true, s + ' in Survival');
    }
    for (const s of ['Lumos', 'Accio', 'Stop', 'Fire']) assert.equal(knows(s, { mode: 'freeworld', school: true }), true, s);
    for (const l of LESSONS) for (const sp of l.spells || [l.spell]) if (sp && SCHOOL_UNKNOWN.has(sp)) assert.equal(knows(sp, { mode: 'freeworld', school: true }), false, sp);
});

test('the defence of the year: a lesson a month; what the pupil casts is a spell the words can call', async () => {
    const { matchSpell } = await import('../../src/fx/SpellManager.js');
    const def = LESSONS.filter((l) => l.subject === 'defence');
    assert.ok(def.length >= 11);
    const said = new Set(['Protection', 'Jolt', 'Sands', 'Expelliarmus', 'Ice', 'Frozen', 'Stupefy', 'Groundprud', 'Sapira', 'ProtectionMaxima', 'Nihilis', 'Electrum', 'Caligo']);
    for (const l of def) for (const sp of l.task.spells || [l.task.kind === 'block' ? 'Protection' : l.task.spell]) assert.ok(said.has(sp), l.id + ' ' + sp);
    for (const w of ['джолт', 'даст', 'экспеллиармус', 'фрозен', 'остолбеней', 'граундпруд', 'сапира', 'протекшн максима', 'нихилис атра', 'электром', 'калиго']) assert.ok(said.has(matchSpell(w)), w);
});

test('the year: a lesson a day in the order of the months; the record kept and read back; a broken one forgotten', async () => {
    const Y = await import('../../src/game/SchoolYear.js');
    const days = Y.yearDays();
    assert.equal(days.length, LESSONS.length);
    for (let i = 1; i < days.length; i++) assert.ok(days[i].month >= days[i - 1].month);
    assert.equal(Y.lessonOfDay(1).id, 'def1');
    assert.equal(Y.lessonOfDay(days.length + 1), null);
    const mem = new Map(), store = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, v), removeItem: (k) => mem.delete(k) };
    assert.equal(Y.loadRecord(store), null);
    const r = Y.newRecord(); r.day = 3; r.arrived = true; r.spells.push('Protection'); r.cells = 6;
    Y.saveRecord(store, r);
    const back = Y.loadRecord(store);
    assert.deepEqual(back, r);
    mem.set(Y.SCHOOL_SAVE_KEY, '{oops'); assert.equal(Y.loadRecord(store), null);
    assert.equal(Y.YEAR.START_CELLS, 5);
    // the mana the lessons grow is enough for the year's hardest spell («Электром» 50) by its lesson
    assert.ok(Y.YEAR.START_CELLS + (days.length - 1) * Y.YEAR.LESSON_CELLS >= 35);
});

test('the Director gathers the school in the Great Hall at each month from the second: words only, nothing to do', async () => {
    const { HALL_TALKS, lessonById } = await import('../../src/game/SchoolLessons.js');
    for (let m = 2; m <= 12; m++) { const h = lessonById('hall' + m); assert.ok(h && lessonOk(h) && h.task.kind === 'listen', 'month ' + m); }
    assert.equal(HALL_TALKS.length, 11);
});
