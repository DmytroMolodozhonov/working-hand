// The people of the castles meet danger sensibly (Danger.js / VillagerFear.js) and the builders
// put back what was destroyed — only that (Rebuild.js).
import test from 'node:test';
import assert from 'node:assert/strict';
import { DANGERS, PEOPLE, REBUILT, levelOf, worst, pickShelter, pickEscape, towards, calmNeeded } from '../../src/game/Danger.js';
import { planRepair, orderOps, stillStanding, blockKind } from '../../src/game/Rebuild.js';
import { BLOCK } from '../../src/world/Terrain.js';
import { STATS } from '../../src/game/CastleLife.js';

test('«на кого и на что»: every kind of castle person and every danger the people sense is in the table', () => {
    for (const role of Object.keys(STATS)) assert.ok(PEOPLE[role], `PEOPLE misses ${role}`);
    for (const k of ['blast', 'ruin', 'quake', 'fire', 'fall', 'spider', 'zombie', 'attacker', 'fight']) assert.ok(DANGERS[k]?.ru, `DANGERS misses ${k}`);
    assert.ok(REBUILT.restored.length && REBUILT.kept.some((t) => /игрок/.test(t)));
});

test('a danger is judged by distance: deadly near, «hide» nearer, «what was that» far, nothing beyond', () => {
    assert.equal(levelOf('blast', 3), 3);
    assert.equal(levelOf('blast', 20), 2);
    assert.equal(levelOf('blast', 80), 1);
    assert.equal(levelOf('blast', 200), 0);
    // a fire must be seen: unseen far off it is nothing
    assert.equal(levelOf('fire', 40, { sees: false }), 0);
    assert.equal(levelOf('fire', 40, { sees: true }), 1);
    // «Total Destruction»: its own big radius
    assert.equal(levelOf('ruin', 22, { r: 20 }), 3);
    const w = worst({ x: 0, z: 0 }, [{ kind: 'blast', x: 90, z: 0 }, { kind: 'spider', x: 20, z: 0 }]);
    assert.equal(w.danger.kind, 'spider');
    assert.equal(w.level, 2);
});

test('they hide in a whole house that is not on the danger\'s side (their own if it is as good)', () => {
    const me = { x: 0, z: 0 };
    const blast = [{ kind: 'blast', x: 20, z: 0, r: 4 }];
    const houses = [
        { i: 0, x: 14, z: 0 }, // right by the blast
        { i: 1, x: -12, z: 2 }, // away from it
        { i: 2, x: -10, z: -2, burning: true },
        { i: 3, x: -8, z: 0, broken: true },
    ];
    assert.equal(pickShelter(me, houses, blast), 1);
    // their own house a little farther, but on the safe side: home
    assert.equal(pickShelter(me, [...houses, { i: 4, x: -20, z: 6, own: true }], blast), 4);
    // nothing whole: -1 (they run out of the gates)
    assert.equal(pickShelter(me, houses.filter((h) => h.i !== 1), blast), -1);
});

test('running away never goes past the danger', () => {
    const me = { x: 0, z: 0 };
    const fire = [{ kind: 'fire', x: 10, z: 0, r: 4 }];
    assert.equal(towards(me, { x: 30, z: 0 }, fire), true);
    assert.equal(towards(me, { x: -30, z: 0 }, fire), false);
    const gates = [{ x: 40, z: 0 }, { x: -40, z: 5 }];
    const to = pickEscape(me, gates, fire);
    assert.equal(to.i, 1);
    // no gate: straight away from it
    const away = pickEscape(me, [], fire, 30);
    assert.ok(away.x < -25);
    // the old and the timid wait longer before they come out
    assert.ok(calmNeeded(0.2, true).out > calmNeeded(0.9, false).out);
});

test('the builders put back what the castle was — not a player\'s blocks, not deep ground', () => {
    const W = BLOCK.CS_GREY ?? BLOCK.STONE, R = BLOCK.ROOF_RED ?? BLOCK.PLANKS;
    // the castle as made: ground at layer 0, a wall 3 high at x=0, a roof block on it
    const orig = (x, L, z) => (L <= 0 ? BLOCK.DIRT : x === 0 && L <= 3 ? W : x === 0 && L === 4 ? R : BLOCK.AIR);
    // now: the wall is down, a crater at x=1, rubble at x=2, a player's block at x=3, deep below untouched
    const now = (x, L, z) => {
        if (x === 0 && L > 0) return BLOCK.AIR;
        if (x === 1 && (L === 0 || L === -1)) return BLOCK.AIR;
        if (x === 2 && L === 1) return W;
        if (x === 3 && L === 1) return BLOCK.PLANKS;
        if (x === 1 && L === -20) return BLOCK.AIR;
        return orig(x, L, z);
    };
    const ops = orderOps(planRepair(now, orig, { x0: 0, x1: 3, z0: 0, z1: 0, L0: -25, L1: 6, floor: 0, placed: (k) => k === '3,1,0' }));
    const key = (o) => `${o.x},${o.L}=${o.t}`;
    assert.deepEqual(ops.map(key), [
        `2,1=${BLOCK.AIR}`, // the rubble first
        `1,-1=${BLOCK.DIRT}`, `1,0=${BLOCK.DIRT}`, // the crater filled
        `0,1=${W}`, `0,2=${W}`, `0,3=${W}`, // the wall from the bottom up
        `0,4=${R}`, // the roof last
    ]);
    assert.equal(blockKind(BLOCK.DIRT), 1);
    // a captured castle: what its king took apart himself stays apart
    const kept = planRepair(now, orig, { x0: 0, x1: 0, z0: 0, z1: 0, L0: 0, L1: 6, floor: 0, kept: (k) => k === '0,2,0' });
    assert.ok(!kept.some((o) => o.L === 2));
});

test('a rebuilt block stands after a reload, unless a later blast took it again', () => {
    const log = [[0, 1, 0, 3, 1], [50, 1, 0, 3, 1], [0, 2, 0, 3, 2]];
    const explosions = [{ p: [0, 0, 0], r: 5 }, { p: [0, 0, 0], r: 5 }, { p: [50, 0, 0], r: 20, ruin: 1 }];
    // #1 was put back after one blast, but the 2nd blast took it; #2 — the ruin at x=50 took it; #3 stands
    assert.deepEqual(stillStanding(log, explosions).map((e) => e[0] + ',' + e[1]), ['0,2']);
    // nothing after them: all stand
    assert.equal(stillStanding(log, explosions.slice(0, 1)).length, 3);
});
