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
    for (const l of LESSONS) if (l.spell && SCHOOL_UNKNOWN.has(l.spell)) assert.equal(knows(l.spell, { mode: 'freeworld', school: true }), false);
});
