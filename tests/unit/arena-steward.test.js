/**
 * The steward of the duel arena: sign-up, waiting for the duel going on, the turn, the lit places on the floor, the reward.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, BLOCK } from '../../src/world/Terrain.js';
import { arenaSite, onArenaFloor, ARENA_ROUND } from '../../src/world/DuelArenas.js';
import { ArenaQueue, stewardIntent, duelSpots, STEWARD, STEWARD_LINES, stewardPool, stewardTier, TIERS, TIER_ORDER, tierCoins, dollSpots } from '../../src/game/ArenaSteward.js';
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

test('the count is 10…1; the reward is by the chosen opponent: 50 / 100 / 150 — the Master of the tower is never offered', () => {
    assert.equal(ARENA_DUEL.COUNT, 10);
    assert.deepEqual(TIER_ORDER.map(tierCoins), [50, 100, 150]);
    assert.ok(!TIERS.master, 'the Master of the tower does not fight for coins');
    for (const t of TIER_ORDER) { assert.ok(STEWARD_LINES['terms_' + t].includes(String(TIERS[t].coins))); assert.ok(stewardPool().includes(STEWARD_LINES['terms_' + t])); }
    assert.ok(stewardPool().includes(STEWARD_LINES.choose) && stewardPool().includes(STEWARD_LINES.master));
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

test('the opponent named to the steward: младший / средний / сильный; the Master is refused; the dolls stand in a row by him', () => {
    assert.equal(stewardTier('младший'), 'novice');
    assert.equal(stewardTier('хочу со слабым волшебником'), 'novice');
    assert.equal(stewardTier('давайте среднего'), 'adept');
    assert.equal(stewardTier('сильный преподаватель'), 'teacher');
    assert.equal(stewardTier('хочу сразиться с главой башни'), 'master');
    assert.equal(stewardTier('Джовалилиус'), 'master');
    assert.equal(stewardTier('да'), null);
    assert.equal(stewardTier('хочу сразиться'), null);
    const def = { x: 0, z: 0, axis: { a: { x: 0, z: -20 }, b: { x: 0, z: 20 } }, desk: { stand: { x: 4.5, y: 10, z: -40 }, book: { x: 6.5, y: 10, z: -36 } } };
    const d = dollSpots(def);
    assert.deepEqual(d.map((x) => x.tier), ['novice', 'adept', 'teacher']);
    assert.ok(d.every((x) => Math.hypot(x.x - 4.5, x.z + 40) >= 3), 'not on the steward');
    assert.ok(d.every((x) => x.x < 4.5), 'on the side away from the lectern');
});
