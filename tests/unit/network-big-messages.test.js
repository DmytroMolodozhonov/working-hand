// Multiplayer QA (docs/qa/multiplayer-report.md, MP-01, MP-02): PeerJS's JSON channel refuses a message of 16300
// bytes or more and reports it as a connection error. The world for a newcomer (built, blown up, castles' people…),
// a fallen building, a big castle's villagers are bigger than that: the newcomer never got the world and was
// dropped. Now a big message goes in pieces and is put back together; a guest can't fake the host's own messages.
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Network, splitPieces, utf8Bytes, PIECE_BYTES } from '../../src/net/Network.js';

const LIMIT = 16300; // (PeerJS 1.5: chunkedMTU — the JSON channel refuses this many bytes and more)

/** One end of a data channel that behaves like PeerJS's JSON channel. */
class Channel extends EventEmitter {
    constructor(peer, metadata = {}) {
        super();
        this.peer = peer;
        this.metadata = metadata;
        this.open = false;
        this.other = null;
        this.refused = 0;
        this.sentCount = 0;
    }
    send(msg) {
        const text = JSON.stringify(msg);
        if (Buffer.byteLength(text, 'utf8') >= LIMIT) { this.refused++; this.emit('error', { type: 'message-too-big', message: 'Message too big for JSON channel' }); return; }
        this.sentCount++;
        if (this.other?.open) this.other.emit('data', JSON.parse(text));
    }
    close() { if (!this.open) return; this.open = false; this.emit('close'); this.other?.close(); }
}

function pair(id, metadata) {
    const a = new Channel(id, metadata), b = new Channel('H');
    a.other = b; b.other = a;
    return { atHost: a, atGuest: b };
}

function hostWith(t, guests) {
    const prev = globalThis.window;
    globalThis.window = { Peer: class {} };
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
    const host = new Network();
    host.role = 'host'; host.players.set('H', { name: 'Хост', color: 0 });
    const got = new Map(), ends = new Map();
    host.on('message', (m) => { (got.get('H') || got.set('H', []).get('H')).push(m); });
    for (const id of guests) {
        const p = pair(id, { name: id });
        host._acceptClient(p.atHost);
        p.atHost.open = true; p.atGuest.open = true;
        p.atHost.emit('open');
        got.set(id, []);
        // (the guest's side: the same unpiecing as Network.join's handler)
        const guest = new Network();
        p.atGuest.on('data', (raw) => { const m = guest._unpiece(p.atGuest, raw); if (m && m.t !== 'ping') got.get(id).push(m); });
        ends.set(id, { ...p, guest });
    }
    t.after(() => { host.leave(); globalThis.window = prev; });
    return { host, got, ends };
}

const bigWorld = (n) => ({ t: 'welcome', edits: Array.from({ length: n }, (_, i) => [i, 40 + (i % 7), -i, i % 31]), castles: { cs0_2: { note: 'Тронный зал — «Ваше величество» 👑'.repeat(50) } } });

test('большое сообщение (мир для нового игрока) доходит целиком, игрока не выкидывает', (t) => {
    const { host, got, ends } = hostWith(t, ['g1']);
    const msg = bigWorld(30000);
    assert.ok(utf8Bytes(JSON.stringify(msg)) > 20 * LIMIT, 'the test world is really big');
    host.sendTo('g1', msg);
    assert.equal(ends.get('g1').atHost.refused, 0, 'nothing refused by the channel');
    assert.equal(host.conns.has('g1'), true, 'the guest is still in the game');
    const w = got.get('g1').find((m) => m.t === 'welcome');
    assert.ok(w, 'the world came');
    assert.deepEqual(w, JSON.parse(JSON.stringify(msg)));
});

test('большое сообщение гостя (обломки здания) хост собирает и пересылает остальным', (t) => {
    const { got, ends, host } = hostWith(t, ['g1', 'g2']);
    const falls = { t: 'fal', relay: true, f: Array.from({ length: 300 }, (_, i) => ({ c: [[i, 50, i, 3]], d: 2.5, l: [[i, 40, i, 3]], b: [] })) };
    // (the guest sends through its own Network: the same pieces)
    const sender = ends.get('g1').guest;
    sender._sendConn(ends.get('g1').atGuest, falls);
    assert.equal(ends.get('g1').atGuest.refused, 0);
    const atHost = got.get('H').find((m) => m.t === 'fal');
    assert.ok(atHost && atHost.f.length === 300, 'the host got the whole building');
    const atG2 = got.get('g2').find((m) => m.t === 'fal');
    assert.ok(atG2 && atG2.f.length === 300, 'and the other guest too');
    assert.equal(host.conns.size, 2);
});

test('сообщение, которое всё же отклонено каналом, не считается обрывом связи', (t) => {
    const { host, ends } = hostWith(t, ['g1']);
    ends.get('g1').atHost.emit('error', { type: 'message-too-big' });
    assert.equal(host.conns.has('g1'), true);
});

test('гость не может подделать служебные сообщения хоста (список игроков, «хост вышел»)', (t) => {
    const { got, ends } = hostWith(t, ['g1', 'g2']);
    const g1 = ends.get('g1').atGuest;
    g1.send({ t: 'players', relay: true, players: [{ id: 'fake', name: 'Подделка' }] });
    g1.send({ t: 'host-left', relay: true });
    g1.send({ t: 'welcome', relay: true, config: {} });
    assert.equal(got.get('g2').some((m) => ['host-left', 'welcome'].includes(m.t) || (m.t === 'players' && m.players.some((p) => p.id === 'fake'))), false);
    assert.equal((got.get('H') || []).some((m) => ['players', 'host-left', 'welcome'].includes(m.t)), false);
});

test('куски: русский текст, эмодзи, кавычки — каждый кусок меньше предела, склейка точная', () => {
    const text = JSON.stringify({ s: '«Привет», — сказал \\ "рыцарь" 🐉🐉 '.repeat(4000) + '\u0000\n'.repeat(3000) });
    const parts = splitPieces(text);
    for (const p of parts) assert.ok(utf8Bytes(JSON.stringify({ t: '_pc', k: 1, i: 9999, n: 9999, s: p })) < LIMIT);
    assert.equal(parts.join(''), text);
    assert.ok(PIECE_BYTES < LIMIT);
});

test('кусок не по порядку — сообщение отбрасывается, следующее собирается нормально', () => {
    const n = new Network(), ch = {};
    assert.equal(n._unpiece(ch, { t: '_pc', k: 1, i: 0, n: 3, s: '{"t":' }), null);
    assert.equal(n._unpiece(ch, { t: '_pc', k: 1, i: 2, n: 3, s: '1}' }), null, 'a skipped piece: broken');
    assert.equal(n._unpiece(ch, { t: '_pc', k: 2, i: 0, n: 2, s: '{"t":"a",' }), null);
    assert.deepEqual(n._unpiece(ch, { t: '_pc', k: 2, i: 1, n: 2, s: '"x":1}' }), { t: 'a', x: 1 });
    assert.equal(n._unpiece(ch, { t: '_pc', k: 3, i: 0, n: 1e9, s: '' }), null, 'absurd piece count refused');
});
