import test from 'node:test';
import assert from 'node:assert/strict';
import { Network } from '../../src/net/Network.js';
import { OUTBOX } from '../../src/net/NetOutbox.js';

function link() {
    const sent = [], conn = { open: true, dataChannel: { bufferedAmount: OUTBOX.HIGH }, send(m) { sent.push(structuredClone(m)); }, close() { this.open = false; } };
    const net = new Network();
    return { net, conn, sent, drain() { conn.dataChannel.bufferedAmount = 0; conn._outbox.pump(); } };
}

test('a slow link keeps only the latest poses and gives every spell priority over them', () => {
    const { net, conn, sent, drain } = link();
    try {
        for (let i = 0; i < 10000; i++) net._sendConn(conn, { t: 'p', id: 'g', s: { p: [i, 2, 0] } });
        net._sendConn(conn, { t: 'spell', name: 'Bombardo' });
        net._sendConn(conn, { t: 'duel', s: 'Expelliarmus', id: 'bolt' });
        net._sendConn(conn, { t: 'stop' });
        assert.equal(conn._outbox.states.size, 1);
        assert.equal(conn._outbox.events.length, 3);
        drain();
        assert.deepEqual(sent.map(m => m.t), ['spell', 'duel', 'stop', 'p']);
        assert.equal(sent[3].s.p[0], 9999);
    } finally { conn._outbox?.dispose(); }
});

test('throttled large messages preserve their complete piece order and causal event order', () => {
    const { net, conn, sent } = link(), receiver = new Network(), incoming = [];
    // Reassembly belongs to one connection, including all its pieces.
    const receiveConn = {};
    conn.send = m => { sent.push(m); conn.dataChannel.bufferedAmount += 8000; const v = receiver._unpiece(receiveConn, m); if (v) incoming.push(v); };
    const welcome = { t: 'welcome', edits: Array.from({ length: 5000 }, (_, i) => [i, 0, i, 3]) };
    try {
        net._sendConn(conn, welcome);
        net._sendConn(conn, { t: 'blk', l: [[1, 0, 1, 0]] });
        net._sendConn(conn, { t: 'spell', name: 'Bombardo' });
        for (let i = 0; conn._outbox.events.length && i < 100; i++) { conn.dataChannel.bufferedAmount = 0; conn._outbox.pump(); }
        assert.deepEqual(incoming.map(m => m.t), ['welcome', 'blk', 'spell']);
        assert.deepEqual(incoming[0], welcome);
        assert.ok(sent.length > 5);
    } finally { conn._outbox?.dispose(); }
});

test('coalesced zombie snapshots retain removed IDs and never overwrite a following death hit', () => {
    const { net, conn, sent, drain } = link();
    try {
        net._sendConn(conn, { t: 'z', from: 'H', l: [['alive', 1]], rm: ['removed'] });
        for (let i = 0; i < 100; i++) net._sendConn(conn, { t: 'z', from: 'H', l: [['alive', i]], rm: [] });
        net._sendConn(conn, { t: 'zhit', from: 'H', id: 'alive', res: 'dead' });
        drain();
        assert.deepEqual(sent.map(m => m.t), ['z', 'zhit']);
        assert.deepEqual(sent[0].rm, ['removed']);
        assert.equal(sent[0].l[0][1], 99);
    } finally { conn._outbox?.dispose(); }
});

test('respawn discards a queued death-position pose; a temporary send failure retains the cast once', () => {
    const { net, conn, sent, drain } = link();
    try {
        net._sendConn(conn, { t: 'p', id: 'g', s: { p: [100, 0, 100] } });
        net._sendConn(conn, { t: 'prespawn', by: 'g', p: [1, 2, 3] });
        const send = conn.send;
        conn.send = () => { throw new Error('temporarily full'); };
        drain(); assert.equal(conn._outbox.events.length, 1);
        conn.send = send; drain();
        assert.deepEqual(sent.map(m => m.t), ['prespawn']);
        drain(); assert.equal(sent.length, 1);
    } finally { conn._outbox?.dispose(); }
});

test('a queued spell keeps its cast-time coordinates even when its caller reuses an array', () => {
    const { net, conn, sent, drain } = link(), origin = [1, 2, 3];
    try {
        net._sendConn(conn, { t: 'spell', name: 'Bombardo', o: origin });
        origin[0] = 200;
        drain();
        assert.deepEqual(sent[0].o, [1, 2, 3]);
    } finally { conn._outbox?.dispose(); }
});

test('coalescing weapon motion retains the final sleeping pose and applies removal afterwards', () => {
    const { net, conn, sent, drain } = link();
    try {
        net._sendConn(conn, { t: 'w', from: 'H', l: [['sleeping', 1], ['moving', 0]] });
        for (let i = 1; i <= 100; i++) net._sendConn(conn, { t: 'w', from: 'H', l: [['moving', i]] });
        net._sendConn(conn, { t: 'wgone', from: 'H', w: 'moving' });
        drain();
        assert.deepEqual(sent.map(m => m.t), ['w', 'wgone']);
        assert.deepEqual(sent[0].l, [['sleeping', 1], ['moving', 100]]);
    } finally { conn._outbox?.dispose(); }
});

test('an hour of congested multiplayer keeps NPC snapshots bounded and preserves sleeping item deltas', () => {
    const { net, conn, sent, drain } = link();
    try {
        net._sendConn(conn, { t: 'ipos', from: 'H', l: [['asleep', 2, 0, 3, 1]] });
        for (let i = 0; i < 18000; i++) {
            net._sendConn(conn, { t: 'vil', from: 'H', l: [['npc', i]] });
            net._sendConn(conn, { t: 'an', from: 'H', l: [['horse', i]] });
            net._sendConn(conn, { t: 'ipos', from: 'H', l: [['moving', i, 1, 2, 0]] });
        }
        assert.equal(conn.open, true);
        assert.equal(conn._outbox.events.length, 0);
        assert.equal(conn._outbox.states.size, 3);
        net._sendConn(conn, { t: 'igone', from: 'H', uid: 'moving' });
        net._sendConn(conn, { t: 'spell', name: 'Bombardo' });
        drain();
        assert.deepEqual(sent.map(m => m.t), ['ipos', 'igone', 'spell', 'vil', 'an']);
        assert.deepEqual(sent[0].l, [['asleep', 2, 0, 3, 1], ['moving', 17999, 1, 2, 0]]);
        assert.equal(sent[3].l[0][1], 17999);
        assert.equal(sent[4].l[0][1], 17999);
    } finally { conn._outbox?.dispose(); }
});

test('Cardilon spends the shield after older queued NPC/player poses, so congestion cannot restore the old shield', () => {
    const { net, conn, sent, drain } = link();
    try {
        net._sendConn(conn, { t: 'vil', from: 'H', l: [['npc', 'shield']] });
        net._sendConn(conn, { t: 'p', from: 'guest', c: [1] });
        net._sendConn(conn, { t: 'cdl', from: 'H', by: 'guest', id: 'bomb' });
        net._sendConn(conn, { t: 'p', from: 'guest', c: [0] });
        drain();
        assert.deepEqual(sent.map(m => m.t), ['vil', 'p', 'cdl', 'p']);
        assert.equal(sent[1].c[0], 1); assert.equal(sent[3].c[0], 0);
    } finally { conn._outbox?.dispose(); }
});
