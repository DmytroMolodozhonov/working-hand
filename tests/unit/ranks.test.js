import test from 'node:test';
import assert from 'node:assert/strict';
import { RANK, levelOf, withRank, isForgiven, isRespected, commandsGuard, titleFor, vizierLine, fill, GREET_RANKED, RANK_TITLES } from '../../src/game/Ranks.js';

test('the steps include the ones below', () => {
    let r = withRank({}, 'p', RANK.FRIEND, null, 'Олег');
    assert.equal(isForgiven(r, 'p'), true); assert.equal(isRespected(r, 'p'), false); assert.equal(commandsGuard(r, 'p'), false);
    r = withRank(r, 'p', RANK.HONORED);
    assert.equal(isForgiven(r, 'p'), true); assert.equal(isRespected(r, 'p'), true); assert.equal(commandsGuard(r, 'p'), false);
    r = withRank(r, 'p', RANK.COMMANDER, 'маршал');
    assert.equal(commandsGuard(r, 'p'), true); assert.equal(r.p.title, 'маршал');
    r = withRank(r, 'p', 0);
    assert.equal(levelOf(r, 'p'), 0); assert.equal(isForgiven(r, 'p'), false);
    assert.equal(levelOf(undefined, 'p'), 0);
});

test('offices are named for the steps that command only', () => {
    assert.equal(titleFor(3, 'назначаю его маршалом'), 'маршал');
    assert.equal(titleFor(3, 'поручаю ему должность казначея'), 'казначей');
    assert.equal(titleFor(3, 'слушайтесь его'), RANK_TITLES[3]);
    assert.equal(titleFor(1, 'маршал'), RANK_TITLES[1], 'a friend is no marshal');
    assert.equal(titleFor(4, 'он мой наместник'), 'наместник');
});

test('the vizier and the knights have words for each step', () => {
    for (const l of [1, 2, 3, 4]) { assert.ok(vizierLine(l, 'Олег', RANK_TITLES[l]).includes('Олег')); assert.ok(GREET_RANKED[l].length); }
    assert.ok(vizierLine(0, 'Олег', '', 3).length > 10);
    assert.equal(fill('Слушаем вас, {title} {name}!', 'Олег', 'маршал'), 'Слушаем вас, маршал Олег!');
    assert.equal(fill('Рады видеть вас, {name}!', 'Олег', ''), 'Рады видеть вас, Олег!');
});
