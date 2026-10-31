import test from 'node:test';
import assert from 'node:assert/strict';
import { HANDOVER, giveWhy, takeWhy, TouchTimer, HandoverPeer } from '../../src/game/Handover.js';

test('give: only from the secondary hand, with something in it', () => {
    assert.equal(giveWhy({ kind: 'apple' }, 'left', 'left'), null);
    assert.equal(giveWhy({ kind: 'apple' }, 'right', 'left'), 'primary');
    assert.equal(giveWhy(null, 'left', 'left'), 'empty');
    assert.equal(giveWhy({ kind: 'apple' }, 'left', 'left', { dead: true }), 'dead');
    assert.equal(giveWhy({ kind: 'shield' }, 'left', 'left', { twoHanded: true }), 'heavy');
    assert.equal(giveWhy({ kind: 'apple' }, 'left', 'left', { spell: true }), 'spell');
    assert.equal(giveWhy({ kind: 'mantle' }, 'left', 'left'), 'bound');
    // the left-handed: mirrored (the secondary hand is the right one)
    assert.equal(giveWhy({ kind: 'apple' }, 'right', 'right'), null);
    assert.equal(giveWhy({ kind: 'apple' }, 'left', 'right'), 'primary');
    // the ice rod is an ordinary thing
    assert.equal(giveWhy({ kind: 'iceRod', godGift: true }, 'left', 'left'), null);
});

test('take: only the secondary hand, and it must be empty', () => {
    assert.equal(takeWhy({ rs: 'left', off: 'left', handFree: true }), null);
    assert.equal(takeWhy({ rs: 'right', off: 'left', handFree: true }), 'wrongHand');
    assert.equal(takeWhy({ rs: 'left', off: 'left', handFree: false }), 'busy');
    assert.equal(takeWhy({ rs: 'left', off: 'left', handFree: true, reserved: true }), 'busy');
    assert.equal(takeWhy({ rs: 'left', off: 'left', handFree: true, canTake: false }), 'state');
});

const run = (timer, secs, dist, dt = 0.05) => { let ok = false; for (let t = 0; t < secs - 1e-9; t += dt) ok = timer.update(dt, dist(t)) || ok; return ok; };

test('timer: 2.5 s of touching hands, not 2', () => {
    assert.equal(run(new TouchTimer(), 2.0, () => 0.3), false);
    assert.equal(run(new TouchTimer(), 2.6, () => 0.3), true);
    assert.equal(run(new TouchTimer(), 2.6, () => 1.2), false); // (apart: > NEAR)
});

test('timer: a short gap is forgiven, a long one or a wide one resets', () => {
    const T = new TouchTimer();
    run(T, 1.5, () => 0.3);
    run(T, 0.25, () => 1.2); // gap ≤ 0.3
    assert.ok(T.t > 1.4);
    run(T, 0.3, () => 0.3);
    run(T, 0.5, () => 1.2); // too long
    assert.equal(T.t, 0);
    const W = new TouchTimer();
    run(W, 1.5, () => 0.3);
    run(W, 0.05, () => 1.6); // > BREAK
    assert.equal(W.t, 0);
});

test('timer: the camera losing a hand ≤ 0.25 s does not reset', () => {
    const T = new TouchTimer();
    run(T, 1.0, () => 0.3);
    for (let i = 0; i < 5; i++) T.update(0.04, null);
    assert.ok(T.t >= 1.0);
    for (let i = 0; i < 10; i++) T.update(0.04, null);
    assert.equal(T.t, 0);
});

// ------------------------------------------------------------- the protocol: atomic
function world(seed) {
    let s = seed;
    const rnd = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    const peers = {}, hands = {}, floor = [], slots = {}, queue = [], alive = { A: true, B: true };
    let now = 0;
    const mk = (id, other) => {
        hands[id] = null; slots[id] = [];
        peers[id] = new HandoverPeer({
            now: () => now,
            send: (to, m) => queue.push({ to, from: id, m, at: now + rnd() * 0.3 }), // (lag; reliable and in order per pair)
            held: () => hands[id],
            release: () => { const x = hands[id]; hands[id] = null; return x; },
            take: (it) => { if (hands[id]) { if (slots[id].length < 2) slots[id].push(it); else floor.push(it); return false; } hands[id] = it; return true; },
            canTake: (rs) => (rs !== 'left' ? 'wrongHand' : hands[id] ? 'busy' : null),
            alive: (x) => alive[x],
        });
    };
    mk('A'); mk('B');
    const count = (uid) => ['A', 'B'].filter((i) => hands[i]?.uid === uid).length + floor.filter((x) => x.uid === uid).length
        + Object.values(slots).flat().filter((x) => x.uid === uid).length + queue.filter((q) => q.m.k === 'c' && q.m.item.uid === uid).length;
    return { rnd, peers, hands, queue, alive, count, floor, slots, get now() { return now; }, tick(dt) { now += dt; } };
}

test('1000 random handovers: a thing is never in two places and never nowhere', () => {
    let given = 0, kept = 0;
    for (let n = 0; n < 1000; n++) {
        const W = world(n * 7919 + 1);
        W.hands.A = { uid: 'x' + n, kind: 'apple' };
        if (W.rnd() < 0.4) W.hands.B = { uid: 'y' + n, kind: 'sword' }; // (busy taker)
        if (W.rnd() < 0.2) W.peers.B.start('A', 'left', 'B'); // (they give at the same time: a refusal, not a swap)
        W.peers.A.start('B', W.rnd() < 0.8 ? 'left' : 'right', 'A');
        const leaveAt = W.rnd() < 0.3 ? W.rnd() * 2 : 99;
        for (let step = 0; step < 120; step++) {
            W.tick(0.05);
            if (W.now > leaveAt && W.alive.B) { W.alive.B = false; W.peers.A.onLeave('B'); }
            // deliver the due messages in order
            for (let i = 0; i < W.queue.length; i++) {
                const q = W.queue[i];
                if (q.at <= W.now) {
                    if (W.rnd() < 0.15 && q.m.k !== 'c') { W.queue.splice(i--, 1); continue; } // (a lost ask/answer: the TICKs finish it)
                    W.queue.splice(i--, 1);
                    if (!W.alive[q.to]) continue;
                    W.peers[q.to].onMsg(q.from, q.m);
                }
            }
            W.peers.A.tick(); W.peers.B.tick();
            for (const uid of ['x' + n, 'y' + n]) if (W.alive.B) assert.ok(W.count(uid) <= 1 + 0, 'twice ' + uid);
            if (W.alive.B) {
                for (const uid of ['x' + n]) assert.equal(W.count(uid), 1, 'nowhere/twice ' + uid + ' step ' + step);
            } else {
                assert.ok(W.hands.A?.uid === 'x' + n || !W.hands.A, 'giver ok');
            }
        }
        if (W.hands.B?.uid === 'x' + n) given++; else if (W.hands.A?.uid === 'x' + n) kept++;
    }
    assert.ok(given > 100 && kept > 100, `given ${given}, kept ${kept}`);
});

test('exchange: both give at once → both refused, both keep their things', () => {
    const W = world(5);
    W.hands.A = { uid: 'a', kind: 'apple' }; W.hands.B = { uid: 'b', kind: 'apple' };
    assert.equal(W.peers.A.start('B', 'left', 'A'), true);
    assert.equal(W.peers.B.start('A', 'left', 'B'), true); // (at the very same moment: each finds the other busy asking → both refused)
    for (let i = 0; i < 40; i++) { W.tick(0.1); for (let j = 0; j < W.queue.length; j++) { const q = W.queue[j]; if (q.at <= W.now) { W.queue.splice(j--, 1); W.peers[q.to].onMsg(q.from, q.m); } } }
    assert.equal(W.hands.A.uid, 'a'); assert.equal(W.hands.B.uid, 'b');
});

test('a late commit still delivers (reservation gone): to the hand if free, else a slot', () => {
    const W = world(9);
    W.hands.A = { uid: 'a', kind: 'apple' };
    W.peers.A.start('B', 'left', 'A');
    for (let i = 0; i < 20; i++) { W.tick(0.1); for (let j = 0; j < W.queue.length; j++) { const q = W.queue[j]; if (q.at <= W.now) { W.queue.splice(j--, 1); if (q.m.k === 'c') { W.queue.push({ ...q, at: W.now + 6 }); continue; } W.peers[q.to].onMsg(q.from, q.m); } } W.peers.B.tick(); }
    W.hands.B = { uid: 'b', kind: 'apple' }; // (the hand was taken meanwhile)
    W.tick(7);
    for (const q of W.queue.splice(0)) W.peers[q.to].onMsg(q.from, q.m);
    assert.equal(W.count('a'), 1);
    assert.equal(W.slots.B.some((x) => x.uid === 'a'), true);
});
