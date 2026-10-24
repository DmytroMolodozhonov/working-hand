/**
 * The steward of the duel arena: sign-up, waiting for the duel going on, the turn, the lit places on the floor, the reward.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, BLOCK } from '../../src/world/Terrain.js';
import { arenaSite, onArenaFloor, ARENA_ROUND } from '../../src/world/DuelArenas.js';
import { ArenaQueue, stewardIntent, duelSpots, STEWARD, STEWARD_LINES, stewardPool } from '../../src/game/ArenaSteward.js';
import { ARENA_DUEL } from '../../src/game/ArenaRules.js';

test('what the player says to the steward', () => {
    for (const t of ['хочу сразиться', 'Запишите меня на дуэль', 'я хочу на арену']) assert.equal(stewardIntent(t), 'want', t);
    for (const t of ['да', 'Да!', 'конечно', 'давайте']) assert.equal(stewardIntent(t), 'yes', t);
    for (const t of ['нет', 'не хочу', 'отмена', 'не хочу сражаться', 'передумал']) assert.equal(stewardIntent(t), 'no', t);
    for (const t of ['сколько награда', 'какие правила']) assert.equal(stewardIntent(t), 'info', t);
    assert.equal(stewardIntent('привет, как дела'), null);
    assert.equal(stewardIntent(''), null);
});

test('the queue: sign up, wait while a duel goes on, the turn, cancel, the ones who left', () => {
    const q = new ArenaQueue();
    assert.equal(q.sign('a'), 0);
    assert.equal(q.sign('b'), 1);
    assert.equal(q.sign('a'), -1, 'signed twice — no');
    assert.equal(q.ahead('b', true), 2, 'before b: a and the duel going on');
    assert.equal(q.ahead('a', false), 0, 'a free arena: a is next');
    assert.ok(q.cancel('a') && !q.cancel('a'), 'cancel');
    q.sign('c');
    assert.deepEqual(q.prune((id) => id === 'c'), ['c'], 'the one who walked away is struck off');
    q.sign('d');
    assert.equal(q.take((id) => id === 'd'), 'd', 'the turn of the first still about');
    assert.equal(q.take(() => true), null, 'nobody left');
});

test('the reward is exactly 100 coins and the count is 10…1', () => {
    assert.equal(ARENA_DUEL.REWARD, 100);
    assert.equal(ARENA_DUEL.COUNT, 10);
    assert.ok(STEWARD_LINES.terms.includes('100'));
    assert.ok(stewardPool().includes(STEWARD_LINES.ask[0]));
});

function ringPoints(c, n = 12, r = STEWARD.RING) {
    const out = [];
    for (let i = 0; i < n; i++) out.push([c.x + Math.cos(i / n * 6.2832) * r, c.z + Math.sin(i / n * 6.2832) * r]);
    out.push([c.x, c.z]);
    return out;
}

test('the lit places lie wholly on the arena floor of the enchanted stone (the tower\'s arena)', () => {
    const t = new TerrainData();
    t.generate({ seed: 7, mountains: true, seas: true, lush: true, deepCaves: true });
    const towers = t.towers.near(0, 0, 2000).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
    let a = null;
    for (const tw of towers) { a = t.sites.arenas.ofTower(tw); if (a) break; }
    assert.ok(a, 'an arena');
    const sp = duelSpots(a);
    assert.ok(sp.steward && a.desk.stand, 'the steward\'s place');
    for (const c of [sp.player, sp.foe]) {
        for (const [x, z] of ringPoints(c)) {
            assert.ok(onArenaFloor(a, x, z, 0.2), 'on the floor');
            const L = t.topLayer(Math.round(x), Math.round(z));
            const b = t.get(Math.round(x), L, Math.round(z));
            assert.ok(b === BLOCK.ENCHANTED || b === BLOCK.ENCHANTED_SEAT, 'enchanted stone, got ' + b);
        }
    }
    // the steward stands outside the stands, beside the gate's lane, not inside them
    assert.ok(!onArenaFloor(a, sp.steward.x, sp.steward.z), 'not on the floor');
    assert.ok(Math.hypot(sp.steward.x - a.gates[0].out.x, sp.steward.z - a.gates[0].out.z) < 12, 'by the front gate');
});

test('the round arena of a settlement: both places on its floor', () => {
    const a = arenaSite('arT', 0, 0, 10, 0, {}, ARENA_ROUND);
    const sp = duelSpots(a);
    for (const c of [sp.player, sp.foe]) for (const [x, z] of ringPoints(c)) assert.ok(onArenaFloor(a, x, z, 0), 'on the round floor');
    assert.ok(Math.hypot(sp.player.x - sp.foe.x, sp.player.z - sp.foe.z) > 10, 'two places far apart');
    assert.ok(STEWARD.MARK_R > STEWARD.RING, 'standing on the ring counts');
});
