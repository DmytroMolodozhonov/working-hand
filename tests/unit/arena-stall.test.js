/**
 * The duel arena's stall, entrances, fee, board (the author: «куклы сливаются в одну массу… как прилавок с МАЛЕНЬКИМИ фигурками, подписанными;
 * платные бои: победил — вернули и добавили столько же; табло с очередью; отдельный вход для посетителей и для сражающихся»).
 * Worlds of generation ARENA_ENTRIES_FROM_GEN have the stall and the visitors' stair as blocks; older ones keep their arenas (the figures on stones).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { TerrainData, BLOCK, ARENA_ENTRIES_FROM_GEN, WORLD_GEN } from '../../src/world/Terrain.js';
import { dollSpots, settleStake, ArenaQueue, TIERS, TIER_ORDER, tierCoins, FIG, STEWARD_LINES, stewardPool } from '../../src/game/ArenaSteward.js';
import { boardView, fmtTime, BOARD } from '../../src/game/ArenaBoard.js';
import { SIGN } from '../../src/fx/ArenaDollsFx.js';

const OPTS = { seed: 7, mountains: true, seas: true, lush: true, deepCaves: true };
function arenaOf(entries) {
    const t = new TerrainData();
    t.generate({ ...OPTS, arenaEntries: entries });
    const towers = t.towers.near(0, 0, 2500).sort((a, b) => Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
    for (const tw of towers) { const a = t.sites.arenas.ofTower(tw); if (a) return { t, a }; }
    throw new Error('no arena');
}
const pairs = (list) => { const out = []; for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) out.push([list[i], list[j]]); return out; };
const dist = (p, q) => Math.hypot(p.x - q.x, p.z - q.z);

test('a new world has the entries; an older one does not (the generation is one number)', () => {
    assert.ok(WORLD_GEN >= ARENA_ENTRIES_FROM_GEN);
    const n = arenaOf(true).a, o = arenaOf(false).a;
    assert.ok(n.visit && n.desk.stall, 'the stair and the stall');
    assert.ok(!o.visit && !o.desk.stall, 'an old world\'s arena is as it was');
});

test('the three figures: each its own slot on the counter, 1,6 m apart, plates narrower than the gap — nothing lies on anything', () => {
    const { t, a } = arenaOf(true);
    const d = dollSpots(a);
    assert.deepEqual(d.map((x) => x.tier), TIER_ORDER);
    assert.ok(d.every((x) => x.onCounter));
    for (const [p, q] of pairs(d)) assert.ok(dist(p, q) >= 1.55, 'slots apart: ' + dist(p, q));
    assert.ok(SIGN.W < 1.55 && FIG.H < 1.2, 'a plate fits between two; a figure is ~a metre (a hero is 3,5)');
    // under each figure there is a block of the counter, and its top is the figure's feet (the canopy is above: the column's top is not the counter's)
    for (const x of d) {
        const ix = Math.round(x.x), iz = Math.round(x.z), k = Math.round(x.y + 0.5);
        assert.ok([BLOCK.PLANKS, BLOCK.PLANKS_DARK].includes(t.get(ix, k, iz)), 'the counter under a figure');
        assert.equal(t.get(ix, k + 1, iz), BLOCK.AIR, 'air over the figure up to the canopy');
        assert.equal(t.get(ix, k + 3, iz), BLOCK.AIR);
        assert.ok(x.y - a.floorY > 1 && x.y - a.floorY < 3, 'the counter is 2 m high (a market stall\'s): ' + (x.y - a.floorY));
    }
    // the steward behind the counter: the counter lies between him and the customer (a wall to a walker)
    const S = a.desk.stand, F = a.desk.front, k0 = Math.round(d[0].y + 0.5);
    let blocked = 0;
    for (let k = 0; k <= 40; k++) { const x = Math.round(S.x + (F.x - S.x) * k / 40), z = Math.round(S.z + (F.z - S.z) * k / 40); if (t.get(x, k0, z) !== BLOCK.AIR) blocked++; }
    assert.ok(blocked >= 1, 'a counter between the steward and the customer');
    assert.equal(t.get(Math.round(S.x), k0, Math.round(S.z)), BLOCK.AIR, 'the steward has room behind it');
    assert.equal(t.get(Math.round(F.x), k0, Math.round(F.z)), BLOCK.AIR, 'and the customer in front');
    assert.ok(dist(S, F) > 4 && dist(S, F) < 8, 'the customer stands at hand\'s reach of the figures');
});

test('older worlds and the round arena: the figures stand apart too, off the gate\'s lane', () => {
    const { a } = arenaOf(false);
    const d = dollSpots(a);
    for (const [p, q] of pairs(d)) assert.ok(dist(p, q) >= 1.75, 'apart: ' + dist(p, q));
    const lane = a.gates[0].out;
    for (const x of d) assert.ok(dist(x, lane) > 5, 'not in the gate\'s lane');
});

/** Heights of the walkers' way from `from` to `to` (every half metre): the top layer of each column. */
function ground(t, from, to) {
    const n = Math.ceil(dist(from, to) * 2), out = [];
    for (let k = 0; k <= n; k++) out.push(t.topLayer(Math.round(from.x + (to.x - from.x) * k / n), Math.round(from.z + (to.z - from.z) * k / n)));
    return out;
}

test('the visitors\' stair is a way a man climbs: steps of one block, the gap in the rim, onto the top row', () => {
    const { t, a } = arenaOf(true);
    const V = a.visit;
    for (const [p, q] of [[V.out, V.top], [V.top, V.in]]) {
        const h = ground(t, p, q);
        for (let i = 1; i < h.length; i++) assert.ok(Math.abs(h[i] - h[i - 1]) <= 1, `a step of one block: ${h[i - 1]} → ${h[i]}`);
    }
    const up = ground(t, V.out, V.in);
    assert.ok(up[up.length - 1] - up[0] >= 5, 'the stair climbs to the top row: ' + up[0] + ' → ' + up[up.length - 1]);
    // the stair is 5 wide with a rail on both sides (not narrower than 3 blocks)
    const ux = V.top.x - V.in.x, uz = V.top.z - V.in.z, ul = Math.hypot(ux, uz), px = -uz / ul, pz = ux / ul;
    let open = 0;
    for (let s = -4; s <= 4; s++) if (t.topLayer(Math.round(V.top.x + px * s), Math.round(V.top.z + pz * s)) === t.topLayer(Math.round(V.top.x), Math.round(V.top.z))) open++;
    assert.ok(open >= 5, 'a stair 5 blocks wide: ' + open);
    // 2 blocks of air above the way (a man 3,5 m tall walks without his head in stone): no block over the gap
    for (const q of [V.in, V.top, V.out]) {
        const L = t.topLayer(Math.round(q.x), Math.round(q.z));
        assert.equal(t.get(Math.round(q.x), L + 1, Math.round(q.z)), BLOCK.AIR);
        assert.equal(t.get(Math.round(q.x), L + 3, Math.round(q.z)), BLOCK.AIR);
    }
});

test('two entrances that never meet: the fighters\' front gate and the visitors\' stair (and the stall) are far apart', () => {
    const { a } = arenaOf(true);
    const fight = [a.gates[0].out, a.gates[0].in];
    const visit = [a.visit.via0, a.visit.via, a.visit.out, a.visit.top, a.visit.in];
    for (const f of fight) for (const v of visit) assert.ok(dist(f, v) > 12, `a fighter's way and a visitor's are apart: ${dist(f, v).toFixed(1)}`);
    for (const x of dollSpots(a)) for (const v of visit) assert.ok(dist(x, v) > 12, 'the stall is not on the visitors\' way');
    // the visitors come round the arena's corner: the way from the road to the stair never crosses the lane
    const road = a.gates[0].out, lane = a.gates[0].in;
    const cross = (p1, p2, p3, p4) => { const o = (a1, b1, c1) => Math.sign((b1.x - a1.x) * (c1.z - a1.z) - (b1.z - a1.z) * (c1.x - a1.x)); return o(p1, p2, p3) !== o(p1, p2, p4) && o(p3, p4, p1) !== o(p3, p4, p2); };
    assert.ok(!cross(a.visit.via0, a.visit.via, road, lane) && !cross(a.visit.via, a.visit.out, road, lane), 'the visitors\' leg does not cross the fighters\' lane');
});

test('the stake: a win — back and as much again; a loss — gone; a draw or trouble — back; a free entry (Creative) — the tier\'s coins', () => {
    for (const tier of TIER_ORDER) {
        const c = tierCoins(tier);
        assert.deepEqual(settleStake({ tier, stake: c, who: 'p', why: 'wand' }), { kind: 'win', coins: c * 2 });
        assert.deepEqual(settleStake({ tier, stake: c, who: 'a', why: 'wand' }), { kind: 'lost', coins: 0 });
        assert.deepEqual(settleStake({ tier, stake: c, who: 'a', why: 'off' }), { kind: 'lost', coins: 0 }, 'walked off the floor — lost');
        assert.deepEqual(settleStake({ tier, stake: c, who: null, why: 'foul' }), { kind: 'lost', coins: 0 }, 'a foul — lost');
        for (const why of ['time', 'gone', 'noshow']) assert.deepEqual(settleStake({ tier, stake: c, who: null, why }), { kind: 'refund', coins: c }, why);
        assert.deepEqual(settleStake({ tier, stake: 0, who: 'p', why: 'wand' }), { kind: 'win', coins: c }, 'free entry');
        assert.equal(settleStake({ tier, stake: 0, who: 'a', why: 'wand' }).coins, 0);
    }
    assert.deepEqual(TIER_ORDER.map(tierCoins), [50, 100, 150]);
    assert.equal(settleStake({ tier: 'adept', stake: 100, who: 'p' }).coins, 200, 'the mid wizard: 100 back and 100 more');
    for (const t of TIER_ORDER) { assert.ok(STEWARD_LINES['terms_' + t].includes(String(tierCoins(t))) && STEWARD_LINES['terms_' + t].includes(String(tierCoins(t) * 2))); assert.ok(stewardPool().includes(STEWARD_LINES['terms_' + t])); }
    for (const k of ['poor', 'full', 'terms_free_novice']) assert.ok(stewardPool().includes(STEWARD_LINES[k]), k);
});

test('the line: one duel at a time, in order; the one who left is skipped; a second sign-up is refused', () => {
    const q = new ArenaQueue();
    q.sign('a'); q.sign('b'); q.sign('c');
    assert.equal(q.sign('b'), -1);
    assert.equal(q.take((id) => id !== 'a'), 'b', 'a has gone: b is next');
    assert.deepEqual(q.list, ['c']);
    assert.equal(q.ahead('c', true), 1, 'one duel going on before c');
    assert.equal(q.take(() => true), 'c');
    assert.equal(q.take(() => true), null);
    assert.equal(q.sign('a'), 0, 'after his duel he signs up again from the start');
});

test('the magic board: the duel now and how long it may last, the line, the result and the pay-out', () => {
    const text = (v) => [...v.head.map((h) => h.text), ...v.queue, v.foot].join(' | ');
    const free = boardView({ ph: 'idle', q: [] });
    assert.ok(/свободна/.test(text(free)) && /Очередь/.test(text(free)) === false && /сразиться/.test(free.foot));
    const q = [{ n: 'Ольга', tr: 'adept' }, { n: 'Иван', tr: 'novice' }, { n: 'Петя', tr: 'teacher' }, { n: 'Маша', tr: 'novice' }, { n: 'Саша', tr: 'novice' }];
    const fight = boardView({ ph: 'fight', pn: 'Олег', fn: 'Лиам', tr: 'adept', go: 60, maxT: 300, q }, 0);
    const ft = text(fight);
    assert.ok(/Идёт бой: Олег против Лиам \(Средний\)/.test(ft), ft);
    assert.ok(ft.includes(fmtTime(240)), 'it may last no longer than 4:00 more: ' + ft);
    assert.ok(fight.queue.length === BOARD.QUEUE_SHOWN + 1 && /и ещё 1/.test(fight.queue.at(-1)), 'the line: four and «и ещё»');
    assert.ok(/1\. Ольга — Средний/.test(fight.queue[0]));
    assert.ok(boardView({ ph: 'fight', pn: 'Олег', fn: 'Лиам', go: 60, maxT: 300 }, 30).head[1].text.includes(fmtTime(210)), 'the board counts the minutes on its own');
    assert.ok(/Олег, ваш черёд/.test(text(boardView({ ph: 'call', pn: 'Олег', q: [] }))) && /светящееся место/.test(text(boardView({ ph: 'call', pn: 'Олег', q: [] }))), 'your turn: the lit place');
    assert.ok(/Отсчёт/.test(text(boardView({ ph: 'count', pn: 'Олег', fn: 'Лиам', q: [] }))));
    assert.ok(/Победил Олег/.test(text(boardView({ ph: 'over', res: 'win', pn: 'Олег', co: 200, q: [] }))) && /200 монет/.test(text(boardView({ ph: 'over', res: 'win', pn: 'Олег', co: 200, q: [] }))));
    assert.ok(/Ставка проиграна/.test(text(boardView({ ph: 'over', res: 'lose', pn: 'Олег', fn: 'Лиам', q: [] }))));
    assert.ok(/возвращена: 100/.test(text(boardView({ ph: 'over', res: 'draw', co: 100, q: [] }))));
    assert.ok(/Ночью/.test(text(boardView({ ph: 'idle', night: true, q: [] }))));
    assert.ok(BOARD.W <= 7 && BOARD.UP + BOARD.H < 12, 'a board a stall\'s size over the road');
});
