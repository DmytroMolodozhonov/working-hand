// «Школа»: the ONE lesson engine (SchoolLesson.js) run through on a stand-in school — no browser: the call, the room, the words,
// the demo, the spell given, the task (a shield against charges / casts at the dummy / the duel), the record; and the «а если»:
// the hero never comes, walks out, is thrown out for a moment, never does the task.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SchoolLesson } from '../../src/game/SchoolLesson.js';

function stand() {
    const me = { x: 0, y: 21, z: 0 };
    const said = [], hints = [], bolts = new Map();
    const teacher = { x: 0, y: 21, z: 0, id: 't', yaw: 0 }, foe = { x: 0, z: 0, id: 'f' };
    const game = {
        localId: 'me', character: { group: { position: me } }, combat: { shield: null }, bonus: {},
        hud: { setVoice: (t) => hints.push(t) }, duel: { bolts, clashes: [] },
    };
    let n = 0;
    const school = {
        game, plan: { F: 20, rooms: { defence: { x0: 10, x1: 30, z0: 10, z1: 32, door: { x: 8, y: 20.5, z: 20 } } } },
        people: new Map([[21, teacher], [36, foe]]),
        _person: () => teacher, pupilsOf: () => [foe], dummy: () => ({}), _goal: () => {},
        _say: (v, t) => said.push(t),
        castAtHero: () => { const b = { id: 'b' + ++n, state: 'flying' }; bolts.set(b.id, b); return b; },
        castAtDummy: () => true,
    };
    return { me, said, hints, bolts, school, game, foe };
}
const run = (L, s, dt = 0.25) => { for (let i = 0; i < s / dt && !L.done; i++) L.update(dt); };
const inRoom = (me) => { me.x = 20; me.z = 22; };

test('the shield lesson: came → counted, the shield given, three charges held → passed; a missed charge is said', () => {
    const S = stand(), L = new SchoolLesson(S.school, 'def1');
    run(L, 5);
    assert.equal(L.phase, 'gather');
    inRoom(S.me);
    run(L, 1);
    assert.equal(L.attended, true);
    run(L, 40);
    assert.equal(L.phase, 'task');
    assert.equal(S.game.bonus.spells.Protection, true);
    let held = 0;
    for (let i = 0; i < 400 && !L.done; i++) {
        L.update(0.25);
        for (const b of S.bolts.values()) if (b.state === 'flying' && (b.age = (b.age || 0) + 1) > 4) {
            S.game.combat.shield = held < 1 ? null : { type: 1 }; L.update(0.01); // (the first one missed: no shield)
            b.state = 'arrived'; S.bolts.delete(b.id); held++; S.game.combat.shield = null;
        }
    }
    assert.ok(L.tries >= 4 && L.ok >= 3, `tries ${L.tries} ok ${L.ok}`);
    assert.ok(S.said.some((t) => /Не успели|Поздно/.test(t)));
    assert.equal(L.passed, true);
    assert.equal(L.done, true);
});

test('a dummy lesson counts the casts; the duel counts the hits on the pupil, who is safe only during it', () => {
    const S = stand(), L = new SchoolLesson(S.school, 'def4');
    inRoom(S.me); run(L, 60);
    assert.equal(L.phase, 'task');
    for (let i = 0; i < 3; i++) L.onCast('Expelliarmus');
    L.onCast('Jolt'); // (another spell: not this lesson's)
    run(L, 15);
    assert.equal(L.passed, true);
    const S2 = stand(), D = new SchoolLesson(S2.school, 'def10');
    inRoom(S2.me); run(D, 60);
    assert.equal(D.phase, 'task'); D.update(0.25);
    assert.equal(S2.foe.schoolSafe, true);
    for (let i = 0; i < 3; i++) D.onHit(S2.foe, 'me');
    run(D, 20);
    assert.equal(D.passed, true);
    assert.equal(S2.foe.schoolSafe, false);
});

test('а если: never came — missed, not counted; walked out — counted, the teacher minds; thrown out for a moment — nothing; no task done — ended kindly', () => {
    let S = stand(), L = new SchoolLesson(S.school, 'def2');
    run(L, 300);
    assert.equal(L.done, true); assert.equal(L.attended, false);
    S = stand(); L = new SchoolLesson(S.school, 'def2');
    inRoom(S.me); run(L, 8);
    S.me.x = 0; run(L, 2); S.me.x = 20; run(L, 2); // (thrown out for 2 s)
    assert.equal(L.left, false);
    S.me.x = 0; run(L, 6);
    assert.equal(L.left, true); assert.equal(L.attended, true); assert.equal(L.done, true);
    assert.ok(S.said.some((t) => /Куда вы/.test(t)));
    S = stand(); L = new SchoolLesson(S.school, 'def3');
    inRoom(S.me); run(L, 400);
    assert.equal(L.done, true); assert.equal(L.passed, false); assert.equal(L.attended, true);
});
