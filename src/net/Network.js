/**
 * Network.js — peer-to-peer multiplayer transport (PeerJS / WebRTC).
 *
 * Star topology: the player who presses «Создать игру» is the host. Everybody
 * connects directly to the host; the host relays messages and is the
 * authority for zombies, chests, free weapons and world destruction.
 * No game server is needed — PeerJS's public broker only introduces the
 * browsers to each other (a custom PeerServer can be set in the menu).
 *
 * Server list: a created server takes one of SERVER_SLOTS well-known rooms
 * (SRV1, SRV2…). The menu asks all of them at once who is there, so everybody
 * sees the list of servers (name, mode, players) and joins with one click —
 * no codes (a code still works for a private game). Up to MAX_PLAYERS each.
 */

import { Emitter } from '../core/events.js';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I confusion
const PREFIX = 'zns-room-';
export const WORLD_CODE = 'ZNS-DMYTRO-WORLD'; // (the old single shared server)
export const SERVER_SLOTS = 12;
export const MAX_PLAYERS = 10;
export const slotCode = (i) => 'SRV' + i;
const ICE = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
];

export function randomCode(len = 5) {
    let s = '';
    for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    return s;
}

/** "host:port/path" → PeerJS options (empty → public PeerJS cloud). */
export function parseServer(str) {
    const opts = { config: { iceServers: ICE }, debug: 1 };
    const s = (str || '').trim();
    if (!s) return opts;
    const m = s.match(/^(?:(https?|wss?):\/\/)?([^/:]+)(?::(\d+))?(\/.*)?$/i);
    if (!m) return opts;
    opts.host = m[2];
    if (m[3]) opts.port = parseInt(m[3], 10);
    opts.path = m[4] || '/';
    const scheme = (m[1] || '').toLowerCase();
    opts.secure = scheme ? (scheme === 'https' || scheme === 'wss') : (typeof location !== 'undefined' && location.protocol === 'https:');
    return opts;
}

export class Network extends Emitter {
    constructor() {
        super();
        this.peer = null;
        this.role = null; // 'host' | 'client' | null
        this.code = null;
        this.localId = 'solo';
        this.name = 'Игрок';
        this.conns = new Map(); // host: peerId -> conn
        this.hostConn = null; // client: conn to host
        this.players = new Map(); // id -> {name, color}
        this.lastSeen = new Map();
        this._heartbeat = null;
        this._colorCounter = 1;
    }

    get isHost() { return this.role === 'host'; }
    get isClient() { return this.role === 'client'; }
    get active() { return this.role !== null; }

    _PeerCtor() {
        const P = typeof window !== 'undefined' ? window.Peer : null;
        if (!P) throw new Error('Модуль сети не загрузился (peerjs)');
        return P;
    }

    /**
     * Create a room. Resolves with the room code.
     * @param {string} [fixedCode]  a fixed room (the shared server) instead of a random code
     */
    host(name, server, fixedCode = null, { slots = false } = {}) {
        this.leave();
        this.name = name || 'Игрок';
        const Peer = this._PeerCtor();
        return new Promise((resolve, reject) => {
            let attempts = 0;
            const tryCode = () => {
                attempts++;
                const code = slots ? slotCode(attempts) : fixedCode || randomCode();
                const peer = new Peer(PREFIX + code, parseServer(server));
                // (no answer from the connection server: say so instead of waiting for ever)
                const timer = setTimeout(() => fail({ type: 'timeout' }), 20000);
                const fail = (err) => {
                    clearTimeout(timer);
                    peer.destroy();
                    if (err?.type === 'unavailable-id' && slots && attempts < SERVER_SLOTS) tryCode();
                    else if (err?.type === 'unavailable-id' && slots) reject(Object.assign(new Error('Все места для серверов заняты — попробуйте позже'), { type: 'full' }));
                    else if (err?.type === 'unavailable-id' && attempts < 5 && !fixedCode) tryCode();
                    else reject(Object.assign(new Error(humanError(err)), { type: err?.type }));
                };
                peer.once('error', fail);
                peer.once('open', () => {
                    clearTimeout(timer);
                    peer.off('error', fail);
                    this.peer = peer;
                    this.role = 'host';
                    this.code = code;
                    this.localId = 'H';
                    this.players.set('H', { name: this.name, color: 0 });
                    peer.on('connection', (conn) => this._acceptClient(conn));
                    peer.on('error', (err) => this.emit('status', humanError(err)));
                    peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { /* ignore */ } });
                    this._startHeartbeat();
                    resolve(code);
                });
            };
            tryCode();
        });
    }

    _acceptClient(conn) {
        // A menu asking "is the shared server on, who is in?" — answer and hang up
        if (conn.metadata?.probe) {
            conn.on('open', () => {
                this._sendConn(conn, { t: 'info', players: this.playerList().map((p) => p.name), playing: !!this.info?.playing, name: this.info?.name || this.name, mode: this.info?.mode || '', max: MAX_PLAYERS });
                setTimeout(() => { try { conn.close(); } catch (e) { /* ignore */ } }, 1500);
            });
            return;
        }
        conn.on('open', () => {
            const id = conn.peer;
            if (this.conns.size + 1 >= MAX_PLAYERS) { // full: say so and hang up
                this._sendConn(conn, { t: 'full', max: MAX_PLAYERS });
                setTimeout(() => { try { conn.close(); } catch (e) { /* ignore */ } }, 800);
                return;
            }
            const name = String(conn.metadata?.name || 'Игрок').slice(0, 16);
            this.conns.set(id, conn);
            this.players.set(id, { name, color: this._colorCounter++ });
            this.lastSeen.set(id, performance.now());
            this.emit('peer-join', { id, name });
            this.broadcast({ t: 'players', players: this.playerList() });
        });
        conn.on('data', (msg) => {
            this.lastSeen.set(conn.peer, performance.now());
            if (!msg || typeof msg !== 'object') return;
            if (msg.t === 'ping') return;
            if (msg.t === 'bye') { this._dropClient(conn.peer); return; }
            msg.from = conn.peer;
            this.emit('message', msg);
            if (msg.relay) this.broadcast(msg, conn.peer);
        });
        const drop = () => this._dropClient(conn.peer);
        conn.on('close', drop);
        conn.on('error', drop);
        this._watchIce(conn, drop);
    }

    /** React to a dead WebRTC link quickly (closed tab, lost Wi-Fi). */
    _watchIce(conn, onDead) {
        let timer = null;
        conn.on('iceStateChanged', (state) => {
            clearTimeout(timer);
            if (state === 'failed' || state === 'closed') onDead();
            else if (state === 'disconnected') timer = setTimeout(onDead, 5000); // give it a chance to recover
        });
    }

    _dropClient(id) {
        if (!this.conns.has(id)) return;
        const conn = this.conns.get(id);
        this.conns.delete(id);
        this.players.delete(id);
        this.lastSeen.delete(id);
        try { conn.close(); } catch (e) { /* ignore */ }
        this.emit('peer-leave', { id });
        this.broadcast({ t: 'players', players: this.playerList() });
    }

    /** Join a room by code. Resolves when connected to the host. */
    join(code, name, server) {
        this.leave();
        this.name = name || 'Игрок';
        const Peer = this._PeerCtor();
        const clean = String(code || '').trim().toUpperCase();
        return new Promise((resolve, reject) => {
            const peer = new Peer(parseServer(server));
            let settled = false;
            const fail = (err) => {
                if (settled) return;
                settled = true;
                peer.destroy();
                reject(new Error(humanError(err)));
            };
            const timer = setTimeout(() => fail({ type: 'timeout' }), 20000);
            peer.on('error', (err) => fail(Object.assign(err || {}, { type: err?.type })));
            peer.on('open', (myId) => {
                const conn = peer.connect(PREFIX + clean, { reliable: true, serialization: 'json', metadata: { name: this.name } });
                const lost = () => {
                    if (this.role !== 'client' || this.hostConn !== conn) return;
                    this.emit('disconnected', { reason: 'Хост закрыл игру или связь потеряна' });
                    this.leave();
                };
                conn.on('open', () => {
                    clearTimeout(timer);
                    settled = true;
                    peer.off('error', fail);
                    peer.on('error', (err) => this.emit('status', humanError(err)));
                    this.peer = peer;
                    this.hostConn = conn;
                    this.role = 'client';
                    this.code = clean;
                    this.localId = myId;
                    this.lastSeen.set('H', performance.now());
                    this._startHeartbeat();
                    resolve(myId);
                });
                conn.on('data', (msg) => {
                    this.lastSeen.set('H', performance.now());
                    if (!msg || typeof msg !== 'object' || msg.t === 'ping') return;
                    if (msg.t === 'full') {
                        this.role = null; this.hostConn = null;
                        try { peer.destroy(); } catch (e) { /* ignore */ }
                        this.emit('disconnected', { reason: `Сервер заполнен (${msg.max || MAX_PLAYERS} из ${msg.max || MAX_PLAYERS})` });
                        return;
                    }
                    if (msg.t === 'host-left') { lost(); return; }
                    if (msg.t === 'players') {
                        this.players = new Map(msg.players.map((p) => [p.id, { name: p.name, color: p.color }]));
                        this.emit('players', msg.players);
                    }
                    this.emit('message', msg);
                });
                conn.on('close', lost);
                conn.on('error', lost);
                this._watchIce(conn, lost);
            });
        });
    }

    /**
     * Is a room on? Resolves {online, players[], playing} (never rejects).
     * Uses one small helper connection to the broker, reused between checks.
     */
    probe(code, server) {
        const Peer = this._PeerCtor();
        const key = server || '';
        return new Promise((resolve) => {
            const done = (r) => { clearTimeout(timer); resolve(r); };
            const timer = setTimeout(() => done({ online: false, unknown: true, players: [] }), 9000);
            const go = (peer) => {
                const onErr = (err) => {
                    // (several checks share one helper: only this room's "not found" is ours)
                    if (err?.type === 'peer-unavailable' && err.message && !err.message.includes(PREFIX + code)) return;
                    peer.off('error', onErr);
                    if (err?.type === 'peer-unavailable') done({ online: false, players: [] });
                    else { this._probePeer = null; try { peer.destroy(); } catch (e) { /* ignore */ } done({ online: false, unknown: true, players: [] }); }
                };
                peer.on('error', onErr);
                const conn = peer.connect(PREFIX + code, { reliable: true, serialization: 'json', metadata: { probe: true } });
                conn.on('data', (msg) => {
                    if (msg?.t !== 'info') return;
                    peer.off('error', onErr);
                    done({ online: true, players: msg.players || [], playing: !!msg.playing, name: msg.name || '', mode: msg.mode || '', max: msg.max || MAX_PLAYERS });
                    try { conn.close(); } catch (e) { /* ignore */ }
                });
            };
            const p = this._probePeer;
            if (p && !p.destroyed && p.open && this._probeKey === key) { go(p); return; }
            if (p && !p.destroyed && !p.open && this._probeKey === key) { p.once('open', () => go(p)); return; } // (still connecting)
            try { p?.destroy(); } catch (e) { /* ignore */ }
            const peer = new Peer({ ...parseServer(server), debug: 0 }); // (a switched-off server is normal: no error logs)
            this._probePeer = peer;
            this._probeKey = key;
            peer.once('open', () => go(peer));
            peer.once('error', () => { this._probePeer = null; done({ online: false, unknown: true, players: [] }); });
        });
    }

    /** All server slots at once: [{slot, code, name, mode, players[], max}] of the ones that are on. */
    async listServers(server) {
        const codes = Array.from({ length: SERVER_SLOTS }, (_, i) => slotCode(i + 1));
        const res = await Promise.all(codes.map((c) => this.probe(c, server).then((r) => ({ ...r, code: c }))));
        if (res.every((r) => r.unknown)) return null; // no connection to the broker
        return res.filter((r) => r.online);
    }

    /** Stop checking the shared server (when playing). */
    stopProbe() {
        try { this._probePeer?.destroy(); } catch (e) { /* ignore */ }
        this._probePeer = null;
    }

    playerList() {
        return [...this.players.entries()].map(([id, p]) => ({ id, name: p.name, color: p.color }));
    }

    /** Client → host (relay=true forwards to everybody else too). Host → everybody. */
    send(msg, relay = false) {
        if (this.isClient) {
            if (relay) msg.relay = true;
            this._sendConn(this.hostConn, msg);
        } else if (this.isHost) {
            msg.from = 'H';
            this.broadcast(msg);
        }
    }

    broadcast(msg, exceptId = null) {
        if (!this.isHost) return;
        for (const [id, conn] of this.conns) {
            if (id !== exceptId) this._sendConn(conn, msg);
        }
    }

    sendTo(id, msg) {
        if (this.isHost) this._sendConn(this.conns.get(id), msg);
    }

    _sendConn(conn, msg) {
        if (!conn || !conn.open) return;
        try { conn.send(msg); } catch (e) { /* channel closing */ }
    }

    _startHeartbeat() {
        clearInterval(this._heartbeat);
        let lastTick = performance.now();
        const TIMEOUT = 30000;
        this._heartbeat = setInterval(() => {
            const now = performance.now();
            // If THIS tab was frozen (loading a level, tab in background), the
            // silence is our fault, not the other side's: don't drop anybody.
            if (now - lastTick > 4000) {
                for (const id of this.lastSeen.keys()) this.lastSeen.set(id, now);
            }
            lastTick = now;
            if (this.isHost) {
                this.broadcast({ t: 'ping' });
                for (const [id, seen] of this.lastSeen) if (now - seen > TIMEOUT) this._dropClient(id);
            } else if (this.isClient) {
                this._sendConn(this.hostConn, { t: 'ping' });
                if (now - (this.lastSeen.get('H') || now) > TIMEOUT) {
                    this.emit('disconnected', { reason: 'Нет связи с хостом' });
                    this.leave();
                }
            }
        }, 2000);
    }

    /** Tell the others we're leaving (closing the tab / back to menu). */
    sayGoodbye() {
        if (this.isClient) this._sendConn(this.hostConn, { t: 'bye' });
        else if (this.isHost) this.broadcast({ t: 'host-left' });
    }

    leave() {
        clearInterval(this._heartbeat);
        this._heartbeat = null;
        for (const c of this.conns.values()) { try { c.close(); } catch (e) { /* ignore */ } }
        this.conns.clear();
        if (this.hostConn) { try { this.hostConn.close(); } catch (e) { /* ignore */ } }
        this.hostConn = null;
        if (this.peer) { try { this.peer.destroy(); } catch (e) { /* ignore */ } }
        this.peer = null;
        this.role = null;
        this.code = null;
        this.localId = 'solo';
        this.players.clear();
        this.lastSeen.clear();
    }
}

function humanError(err) {
    switch (err?.type) {
        case 'peer-unavailable': return 'Игра с таким кодом не найдена';
        case 'network': return 'Нет связи с сервером соединения (проверьте интернет)';
        case 'server-error': return 'Сервер соединения недоступен';
        case 'unavailable-id': return 'Код занят, попробуйте ещё раз';
        case 'browser-incompatible': return 'Браузер не поддерживает WebRTC';
        case 'timeout': return 'Нет ответа от сервера связи — проверьте интернет (или попробуйте другой VPN / без VPN) и повторите';
        case 'socket-error': case 'socket-closed': return 'Соединение с сервером прервано';
        default: return err?.message || String(err || 'Ошибка сети');
    }
}
