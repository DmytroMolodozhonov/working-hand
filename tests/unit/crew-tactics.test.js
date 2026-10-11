// A ship's crew against one foe: never all at once — two at a time from two sides, taking turns.
import test from 'node:test';
import assert from 'node:assert/strict';
import { TACTICS, assignRoles, canSwing, spotAt } from '../../src/game/CrewTactics.js';

function crew(n, captain = true) {
    const out = [];
    if (captain) out.push({ id: 'c0', idx: 0, role: 'captain', l: { x: 0, z: 9 }, hp: 20, maxHp: 20 });
    for (let i = 1; i <= n; i++) {
        const a = i * 0.9;
        out.push({ id: 'c' + i, idx: i, role: 'sailor', l: { x: Math.cos(a) * (5 + i), z: Math.sin(a) * (5 + i) }, hp: 10, maxHp: 10 });
    }
    return out;
}

/** A small fight: they walk to their places, the ones in front swing in turns. */
function fight(list, seconds, opts = {}, each = () => {}) {
    const foe = { x: 0, z: 0 };
    let lastSwing = -1e9;
    for (let t = 0; t < seconds; t += 0.1) {
        for (const f of list) f.busy = (f.swingT || 0) > 0;
        const res = assignRoles(list, foe, t, opts);
        for (const f of list) {
            const p = spotAt(foe, f.tac.slot, f.tac.r);
            const dx = p.x - f.l.x, dz = p.z - f.l.z, d = Math.hypot(dx, dz);
            const step = Math.min(d, 0.4);
            if (d > 1e-6 && !f.busy) { f.l.x += (dx / d) * step; f.l.z += (dz / d) * step; }
            if (f.swingT > 0) f.swingT -= 0.1;
            else if (f.tac.role === 'engage' && d < 0.5 && (f.cd || 0) <= t && canSwing(list, f, t, lastSwing)) { f.swingT = TACTICS.SWING; f.busy = true; f.cd = t + 1; lastSwing = t; }
        }
        each(res, t, list);
    }
}

test('crew tactics: at most two go at the foe at a time, never two swings at once, the captain stays back', () => {
    const list = crew(6);
    let maxEngaged = 0;
    fight(list, 40, {}, (res) => {
        maxEngaged = Math.max(maxEngaged, res.engage.length);
        assert.ok(res.engage.length <= TACTICS.MAX_ENGAGE, `${res.engage.length} at once`);
        assert.ok(list.filter((f) => f.busy).length <= 1, 'they take turns to swing');
        assert.ok(!res.engage.some((f) => f.role === 'captain'), 'the captain commands from behind');
    });
    assert.equal(maxEngaged, 2);
});

test('crew tactics: the two in front come from two sides; the others wait in a ring off their lines', () => {
    const list = crew(6);
    fight(list, 6);
    const foe = { x: 0, z: 0 };
    const res = assignRoles(list, foe, 6);
    const [a, b] = res.engage;
    let d = Math.abs(a.tac.slot - b.tac.slot) % (Math.PI * 2);
    if (d > Math.PI) d = Math.PI * 2 - d;
    assert.ok(d > 1.2, `from two sides (${d.toFixed(2)} rad apart)`);
    for (const f of res.wait) {
        const r = Math.hypot(f.l.x, f.l.z);
        assert.ok(r > TACTICS.RING * 0.7, `${f.id} waits off (${r.toFixed(1)} m)`);
    }
});

test('crew tactics: turns change — every sailor gets to fight; a hurt one steps back', () => {
    const list = crew(5);
    const fought = new Set();
    fight(list, 60, {}, (res) => { for (const f of res.engage) fought.add(f.id); });
    for (const f of list) if (f.role !== 'captain') assert.ok(fought.has(f.id), `${f.id} had his turn`);
    // a man in front badly hurt: the next one takes his place, the captain names them
    const foe = { x: 0, z: 0 };
    const front = list.find((f) => f.tac.role === 'engage' && !f.busy);
    front.hp = 2;
    const res = assignRoles(list, foe, 61);
    assert.ok(!res.engage.includes(front), 'the hurt one stepped back');
    assert.ok(res.swaps.some((w) => w.out === front), 'somebody took his place');
});

test('crew tactics: where the deck is narrow only one fights; the captain fights when his men are gone', () => {
    const list = crew(4);
    fight(list, 10, { max: 1 }, (res) => assert.ok(res.engage.length <= 1));
    const two = crew(1);
    const res = assignRoles(two, { x: 0, z: 0 }, 0);
    assert.ok(res.engage.some((f) => f.role === 'captain'), 'the captain goes in himself');
    // a deck with room only on one side: nobody is sent to stand in the sea
    const fits = (x) => x > -3;
    const list2 = crew(5);
    fight(list2, 10, { fits });
    for (const f of list2) assert.ok(f.l.x > -3.5, `${f.id} stays on the deck (x ${f.l.x.toFixed(1)})`);
});

test('a group against a group: the men share the foes out, keep their own, the dangerous one gets more', async () => {
    const { shareFoes } = await import('../../src/game/CrewTactics.js');
    const men = Array.from({ length: 6 }, (_, i) => ({ id: 'm' + i, x: i, z: 0, foe: 'A' }));
    const foes = [{ id: 'A', x: 0, z: 2 }, { id: 'B', x: 6, z: 2 }];
    // all six went for the first one (he hit first): three are sent to the second — the nearest to him
    let m = shareFoes(men, foes);
    const on = (id) => [...m.values()].filter((x) => x === id).length;
    assert.equal(on('A'), 3); assert.equal(on('B'), 3);
    assert.equal(m.get('m5'), 'B', 'the one nearest to B goes for him');
    assert.equal(m.get('m0'), 'A', 'the one nearest to A stays');
    // again: nobody changes sides (no running back and forth)
    for (const f of men) f.foe = m.get(f.id);
    const again = shareFoes(men, foes);
    for (const f of men) assert.equal(again.get(f.id), f.foe);
    // three foes, the one at the wheel more dangerous: 6 men → 3 / 2 / 1-ish, each at least one
    m = shareFoes(men, [{ id: 'A', x: 0, z: 2 }, { id: 'B', x: 6, z: 2 }, { id: 'C', x: 3, z: 9, w: 2 }]);
    assert.ok(on('A') >= 1 && on('B') >= 1 && on('C') >= 2, JSON.stringify([...m]));
    // fewer men than foes: each a different foe
    m = shareFoes(men.slice(0, 2), [{ id: 'A', x: 0, z: 2 }, { id: 'B', x: 6, z: 2 }, { id: 'C', x: 50, z: 50 }]);
    assert.notEqual(m.get('m0'), m.get('m1'));
    // a foe out of reach: nobody is sent there
    m = shareFoes(men, [{ id: 'A', x: 0, z: 2 }, { id: 'far', x: 300, z: 0 }], { reach: 40 });
    assert.ok(![...m.values()].includes('far'));
});
