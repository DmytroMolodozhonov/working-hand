import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Network, SERVER_SLOTS } from '../../src/net/Network.js';

class FakeConnection extends EventEmitter {
    constructor(peer, metadata = {}) {
        super();
        this.peer = peer;
        this.metadata = metadata;
        this.open = false;
        this.sent = [];
        this.closed = false;
    }
    send(msg) { this.sent.push(msg); }
    close() { this.closed = true; this.open = false; this.emit('close'); }
    connected() { this.open = true; this.emit('open'); }
}

function setup(t) {
    const peers = [];
    class FakePeer extends EventEmitter {
        constructor() { super(); this.setMaxListeners(64); this.open = false; this.destroyed = false; this.connections = []; peers.push(this); }
        connect(id, opts) { const c = new FakeConnection(id, opts.metadata); this.connections.push(c); return c; }
        destroy() { this.destroyed = true; this.open = false; for (const c of this.connections) c.close(); }
        connected(id = 'guest-peer') { this.open = true; this.emit('open', id); }
    }
    const previous = globalThis.window;
    globalThis.window = { Peer: FakePeer };
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });
    const net = new Network();
    t.after(() => { net.leave(); net.stopProbe(); globalThis.window = previous; });
    return { net, peers };
}

test('список: 12 неответивших слотов не превращаются в 12 серверов с вопросом', async (t) => {
    const { net, peers } = setup(t);
    const result = net.listServers('local');
    peers[0].connected();
    assert.equal(peers[0].connections.length, SERVER_SLOTS);
    t.mock.timers.tick(9000);
    assert.equal(await result, null);
    assert.equal(peers[0].listenerCount('error'), 1, 'only the helper lifecycle listener remains');
});

test('список: один реальный загружающийся хост, а не лишние неответившие слоты', async (t) => {
    const { net, peers } = setup(t);
    const result = net.listServers('local');
    peers[0].connected();
    peers[0].connections[0].connected();
    t.mock.timers.tick(9000);
    const servers = await result;
    assert.equal(servers.length, 1);
    assert.equal(servers[0].code, 'SRV1');
    assert.equal(servers[0].noInfo, true, 'an established host remains joinable even before its info arrives');
});

test('список: готовый хост возвращает имя и одного игрока; пустые слоты исключены', async (t) => {
    const { net, peers } = setup(t);
    const result = net.listServers('local');
    peers[0].connected();
    const [host, ...empty] = peers[0].connections;
    host.connected();
    host.emit('data', { t: 'info', name: 'Друг', players: ['Хост'], mode: 'creative' });
    for (const c of empty) peers[0].emit('error', { type: 'peer-unavailable', message: 'Could not connect to peer ' + c.peer });
    const servers = await result;
    assert.equal(servers.length, 1);
    assert.equal(servers[0].name, 'Друг');
    assert.deepEqual(servers[0].players, ['Хост']);
});

test('вход: десять повторных нажатий создают только одного гостя', async (t) => {
    const { net, peers } = setup(t);
    const first = net.join('SRV1', 'Гость', 'local');
    const all = [first];
    for (let i = 0; i < 10; i++) all.push(net.join('srv1', 'Гость', 'local'));
    assert.equal(peers.length, 1);
    assert.ok(all.every((p) => p === first));
    peers[0].connected();
    assert.equal(peers[0].connections.length, 1);
    peers[0].connections[0].connected();
    assert.deepEqual(await Promise.all(all), Array(11).fill('guest-peer'));
    assert.equal(await net.join('SRV1', 'Гость', 'local'), 'guest-peer');
    assert.equal(peers.length, 1, 'clicking again after connection must not replace the player');
});

test('вход: другой сервер не запускает параллельную попытку', async (t) => {
    const { net, peers } = setup(t);
    const first = net.join('SRV1', 'Гость', 'local');
    await assert.rejects(net.join('SRV2', 'Гость', 'local'), { type: 'connecting' });
    assert.equal(peers.length, 1);
    peers[0].connected(); peers[0].connections[0].connected();
    await first;
    assert.equal(net.code, 'SRV1');
});

test('вход: выход во время ожидания закрывает peer; поздний ответ не оживляет старую попытку', async (t) => {
    const { net, peers } = setup(t);
    const first = net.join('SRV1', 'Гость', 'local');
    const cancelled = assert.rejects(first, { type: 'cancelled' });
    const old = peers[0];
    old.connected();
    const oldConn = old.connections[0];
    net.leave();
    assert.equal(old.destroyed, true);
    const next = net.join('SRV2', 'Гость', 'local');
    oldConn.connected();
    oldConn.emit('data', { t: 'players', players: [{ id: 'clone', name: 'Клон' }] });
    assert.equal(net.active, false);
    assert.equal(net.players.size, 0);
    peers[1].connected('new-peer'); peers[1].connections[0].connected();
    await cancelled; await next;
    assert.equal(net.localId, 'new-peer');
    assert.equal(net.code, 'SRV2');
});

test('вход: отмена до ответа сервера связи не создаёт позднее соединение', async (t) => {
    const { net, peers } = setup(t);
    const pending = net.join('SRV1', 'Гость', 'local');
    const cancelled = assert.rejects(pending, { type: 'cancelled' });
    net.leave();
    peers[0].connected();
    assert.equal(peers[0].connections.length, 0);
    await cancelled;
});

test('вход: после ошибки можно повторить без оставленного гостя', async (t) => {
    const { net, peers } = setup(t);
    const first = net.join('SRV1', 'Гость', 'local');
    const failed = assert.rejects(first, { type: 'peer-unavailable' });
    peers[0].connected();
    peers[0].emit('error', { type: 'peer-unavailable' });
    await failed;
    assert.equal(peers[0].destroyed, true);
    const next = net.join('SRV1', 'Гость', 'local');
    peers[1].connected(); peers[1].connections[0].connected();
    await next;
    assert.equal(net.isClient, true);
});

test('хост: второй канал одного peer не создаёт клона и не удаляет первый канал', (t) => {
    const { net } = setup(t);
    net.role = 'host'; net.players.set('H', { name: 'Хост', color: 0 });
    let joins = 0, messages = 0;
    net.on('peer-join', () => joins++); net.on('message', () => messages++);
    const first = new FakeConnection('same-peer', { name: 'Гость' });
    net._acceptClient(first); first.connected();
    const duplicate = new FakeConnection('same-peer', { name: 'Гость' });
    net._acceptClient(duplicate); duplicate.connected();
    duplicate.emit('data', { t: 'pose' }); duplicate.emit('error', new Error('old channel'));
    assert.equal(duplicate.closed, true);
    assert.equal(net.conns.get('same-peer'), first);
    assert.equal(net.players.size, 2);
    assert.equal(joins, 1);
    assert.equal(messages, 0);
});

test('хост: два разных peer одного меню не создают клона; отдельная вкладка с тем же pid допустима', (t) => {
    const { net } = setup(t);
    net.role = 'host'; net.players.set('H', { name: 'Хост', color: 0 });
    let joins = 0;
    net.on('peer-join', () => joins++);
    const first = new FakeConnection('first', { name: 'Гость', pid: 'saved-player', joinSession: 'menu-one' });
    const duplicate = new FakeConnection('second', { name: 'Гость', pid: 'saved-player', joinSession: 'menu-one' });
    net._acceptClient(first); net._acceptClient(duplicate);
    first.connected(); duplicate.connected();
    assert.equal(duplicate.closed, true);
    assert.equal(net.players.size, 2);
    assert.equal(joins, 1);
    const tab = new FakeConnection('tab', { name: 'Гость', pid: 'saved-player', joinSession: 'menu-two' });
    net._acceptClient(tab); tab.connected();
    assert.equal(tab.closed, false);
    assert.equal(net.players.size, 3);
    assert.equal(net.players.get('tab').pid, '', 'a second tab still cannot claim the saved player');
    first.close();
    const retry = new FakeConnection('retry', { name: 'Гость', pid: 'saved-player', joinSession: 'menu-one' });
    net._acceptClient(retry); retry.connected();
    assert.equal(retry.closed, false, 'session released when its player leaves');
    assert.equal(net.conns.has('retry'), true);
});

test('вход: 25 секунд ожидания закрывают peer; позднее открытие не создаёт игрока', async (t) => {
    const { net, peers } = setup(t);
    const first = net.join('SRV1', 'Гость', 'local');
    const failed = assert.rejects(first, { type: 'p2p' });
    peers[0].connected();
    t.mock.timers.tick(25000);
    await failed;
    assert.equal(peers[0].destroyed, true);
    peers[0].connections[0].connected();
    assert.equal(net.active, false);
});

test('проверки: остановка немедленно завершает все слоты и игнорирует поздний ответ', async (t) => {
    const { net, peers } = setup(t);
    const result = net.listServers('local');
    net.stopProbe();
    assert.equal(await result, null);
    assert.equal(net._probes.size, 0);
    assert.equal(peers[0].destroyed, true);
    peers[0].connected();
    assert.equal(peers[0].connections.length, 0);
});

test('выход: меню видит очищенное соединение и сразу может повторить вход', async (t) => {
    const { net, peers } = setup(t);
    const joined = net.join('SRV1', 'Гость', 'local');
    peers[0].connected(); peers[0].connections[0].connected(); await joined;
    let retry;
    net.on('disconnected', () => {
        assert.equal(net.active, false);
        assert.equal(net.hostConn, null);
        assert.equal(net.peer, null);
        retry = net.join('SRV2', 'Гость', 'local');
    });
    peers[0].connections[0].close();
    assert.equal(peers.length, 2);
    peers[1].connected(); peers[1].connections[0].connected(); await retry;
    assert.equal(net.code, 'SRV2');
});

test('версия и полный сервер: всё очищено до уведомления, повторный вход разрешён', async (t) => {
    const { net, peers } = setup(t);
    for (const type of ['full', 'version']) {
        const joined = net.join('SRV1', 'Гость', 'local');
        const peer = peers.at(-1);
        peer.connected(); peer.connections[0].connected(); await joined;
        let notified = false;
        const check = () => {
            notified = true;
            assert.equal(net.active, false);
            assert.equal(net.hostConn, null);
            assert.equal(net.peer, null);
            assert.equal(net._heartbeat, null);
        };
        const ev = type === 'version' ? 'version' : 'disconnected';
        net.on(ev, check);
        peer.connections[0].emit('data', { t: type, host: 'new', max: 10 });
        assert.equal(notified, true);
        net.off(ev, check);
    }
});