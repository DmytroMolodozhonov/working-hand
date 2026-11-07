// TutorialNudge.js: a player who skipped the tutorial and struggles is reminded at most twice (the second bright, 5 min later), then never.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TutorialNudge, NUDGE, struggling } from '../../src/game/TutorialNudge.js';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };

function game({ seen = true, wand = false, x = 0 } = {}) {
    return { poseService: { lastResults: { poseLandmarks: seen ? [1] : [] } }, items: { heldOf: () => (wand ? {} : null) }, character: { group: { position: { x, z: 0 } } }, combat: {} };
}
const run = (N, s) => { for (let t = 0; t < s; t += 0.25) N.update(0.25); };

test('what «does not work» means', () => {
    const ok = { t: 200, seenT: 190, heard: 2, casts: 1, wandEver: true, moved: 30 };
    assert.equal(struggling(ok), null);
    assert.equal(struggling({ ...ok, t: 30, heard: 9, casts: 0 }), null, 'not at the very start');
    assert.equal(struggling({ ...ok, seenT: 50 }), 'camera');
    assert.equal(struggling({ ...ok, heard: 5, casts: 0 }), 'spells');
    assert.equal(struggling({ ...ok, wandEver: false }), 'wand');
    assert.equal(struggling({ ...ok, moved: 2 }), 'walk');
});

test('never skipped — never watched', () => {
    store.clear();
    const N = new TutorialNudge(game());
    assert.equal(N.on, false);
});

test('skipped and struggling: the quiet reminder, 5 minutes later the bright one, then never again', () => {
    store.clear(); store.set('zns-tutorial-skipped', '1');
    const shown = [];
    const N = new TutorialNudge(game({ wand: true }));
    N._show = (n, why) => shown.push([n, why]);
    for (let i = 0; i < 5; i++) N.heard();
    run(N, NUDGE.FIRST_AFTER_S + 1);
    assert.deepEqual(shown, [[1, 'spells']]);
    run(N, NUDGE.SECOND_AFTER_S - 10);
    assert.equal(shown.length, 1);
    run(N, 15);
    assert.deepEqual(shown[1], [2, undefined]);
    assert.equal(N.on, false);
    const again = new TutorialNudge(game());
    assert.equal(again.on, false, 'a new game: never again');
});

test('the second one comes in the next game if this one ended first', () => {
    store.clear(); store.set('zns-tutorial-skipped', '1');
    const N = new TutorialNudge(game({ wand: true }));
    N._show = () => {};
    for (let i = 0; i < 5; i++) N.heard();
    run(N, NUDGE.FIRST_AFTER_S + 1);
    run(N, 100); // (the game ends)
    const shown = [];
    const M = new TutorialNudge(game({ wand: true }));
    M._show = (n) => shown.push(n);
    run(M, NUDGE.SECOND_AFTER_S - 100 + 6);
    assert.deepEqual(shown, [2]);
});

test('a player who gets on well is never bothered', () => {
    store.clear(); store.set('zns-tutorial-skipped', '1');
    const g = game({ wand: true });
    const shown = [];
    const N = new TutorialNudge(g);
    N._show = (n) => shown.push(n);
    N.onCast();
    for (let t = 0; t < NUDGE.WATCH_S + 5; t += 0.25) { g.character.group.position.x += 0.1; N.update(0.25); }
    assert.deepEqual(shown, []);
    assert.equal(N.on, false);
});
