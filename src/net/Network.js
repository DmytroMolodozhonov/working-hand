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
// Where each computer learns its address on the internet (several companies:
// when one is blocked in a country, another answers)
const ICE = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    // When no direct link is possible (two strict routers, a provider that shares one address
    // between many homes): a free public go-between, freeTURN (freeturn.net — free/free are its
    // published public login, for testing; slow: ~50 kbit/s per player, so the game sends less then)
    { urls: ['turn:freeturn.net:3478', 'turn:freeturn.net:3478?transport=tcp'], username: 'free', credential: 'free' },
];
const JOIN_WAIT = 25000; // ms: the host's computer must answer within this
const NEW_PLAYER_GRACE = 120000; // ms: a player who is still loading (camera…) isn't dropped for silence

/** A diary line about the network (zns-perf.log next to the game — a file the player can send). */
export function netLog(text) {
    const line = `${new Date().toLocaleTimeString('ru-RU')} 🌐 ${text}`;
    try { console.info(line); } catch (e) { /* ignore */ }
    if (typeof fetch === 'undefined' || typeof location === 'undefined' || !/^https?:/.test(location.protocol)) return;
    try { fetch('/api/perflog', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ line }) }).catch(() => {}); } catch (e) { /* ignore */ }
}

export function randomCode(len = 5) {
    let s = '';
    for (let i = 0; i < len; i++) s += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    return s;
}

/** "host:port/path" → PeerJS options (empty → public PeerJS cloud). */
export function parseServer(str) {
    const opts = { config: { iceServers: ICE }, debug: 1 };
    // (tests: no direct path at all — as when a router lets nothing through)
    if (typeof window !== 'undefined' && window.__ZNS_ICE_POLICY__) opts.config = { iceServers: ICE, iceTransportPolicy: window.__ZNS_ICE_POLICY__ };
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

/** A name nobody here has yet: «Игрок» taken → «Игрок 2», «Игрок 3»… */
export function uniqueName(name, taken) {
    const set = new Set(taken);
    if (!set.has(name)) return name;
    for (let i = 2; ; i++) {
        const n = `${name.slice(0, 13)} ${i}`;
        if (!set.has(n)) return n;
    }
}

export class Network extends Emitter {
    constructor() {
        super();
        this.peer = null;
        this.role = null; // 'host' | 'client' | null
        this.code = null;
        this.localId = 'solo';
        this.name = 'Игрок';
        this.pid = ''; // this player's own lasting id (kept by the browser): their saved things are theirs, whatever the name
        this.conns = new Map(); // host: peerId -> conn
        this.hostConn = null; // client: conn to host
        this.players = new Map(); // id -> {name, color}
        this.lastSeen = new Map();
        this._heartbeat = null;
        this._colorCounter = 1;
        this.version = ''; // this game's version (commit): host and guests must play the same one
        this.relayed = false; // a link goes through the slow go-between (TURN): send less
        this.joinedAt = new Map(); // host: peerId -> when it came
        this.talked = new Set(); // host: peers that sent anything but pings (their game runs)
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
                    if (err?.type !== 'unavailable-id') netLog(`создать сервер не вышло: ${err?.type || ''} ${err?.message || ''}`);
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
                    this.players.set('H', { name: this.name, color: 0, pid: this.pid });
                    peer.on('connection', (conn) => this._acceptClient(conn));
                    peer.on('error', (err) => this.emit('status', humanError(err)));
                    peer.on('disconnected', () => { try { peer.reconnect(); } catch (e) { /* ignore */ } });
                    this._startHeartbeat();
                    netLog(`сервер создан: код ${code}${server ? ' (свой сервер связи ' + server + ')' : ''}, версия ${this.version || '?'}`);
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
            const theirs = conn.metadata?.v || '';
            netLog(`игрок «${String(conn.metadata?.name || '?').slice(0, 16)}» соединился напрямую (его версия ${theirs || 'старая'}, моя ${this.version || '?'})`);
            if (this.version && theirs && theirs !== this.version) { // another version of the game: things would go wrong in odd ways
                this._sendConn(conn, { t: 'version', host: this.version });
                this.emit('status', `Игрок «${String(conn.metadata?.name || '?').slice(0, 16)}» пытался войти с другой версией игры — пусть запустит «Обновить и запустить игру»`);
                setTimeout(() => { try { conn.close(); } catch (e) { /* ignore */ } }, 1500);
                return;
            }
            if (this.conns.size + 1 >= MAX_PLAYERS) { // full: say so and hang up
                this._sendConn(conn, { t: 'full', max: MAX_PLAYERS });
                setTimeout(() => { try { conn.close(); } catch (e) { /* ignore */ } }, 800);
                return;
            }
            // two players may call themselves the same (both «Игрок»): the second becomes «Игрок 2»
            const name = uniqueName(String(conn.metadata?.name || 'Игрок').slice(0, 16), this.playerList().map((p) => p.name));
            // (the same lasting id twice — two tabs of one browser: the second one is nobody's)
            let pid = String(conn.metadata?.pid || '').slice(0, 40);
            if (pid && [...this.players.values()].some((p) => p.pid === pid)) pid = '';
            this.conns.set(id, conn);
            this.players.set(id, { name, color: this._colorCounter++, pid });
            this.lastSeen.set(id, performance.now());
            this.joinedAt.set(id, performance.now());
            this._checkRelay(conn, name);
            this.emit('peer-join', { id, name });
            this.broadcast({ t: 'players', players: this.playerList() });
        });
        conn.on('data', (msg) => {
            this.lastSeen.set(conn.peer, performance.now());
            if (!msg || typeof msg !== 'object') return;
            if (msg.t === 'ping') return;
            this.talked.add(conn.peer);
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

    /**
     * Did this link go straight between the computers, or through the go-between (TURN)?
     * Through it the game sends less (it is slow). Sets this.relayed.
     */
    _checkRelay(conn, who) {
        const pc = conn.peerConnection;
        if (!pc?.getStats) return;
        // (the first link found may go through the go-between and switch to a direct one a moment
        // later: look again a few times, and tell the player only about a link that stays slow)
        const checks = [1500, 6000, 15000, 30000, 60000];
        let i = 0, told = false, last = null;
        const look = async () => {
            if (!conn.open || !conn.peerConnection) return;
            try {
                const stats = await conn.peerConnection.getStats();
                let pair = null;
                stats.forEach((r) => { if (r.type === 'transport' && r.selectedCandidatePairId) pair = stats.get(r.selectedCandidatePairId); });
                if (!pair) stats.forEach((r) => { if (r.type === 'candidate-pair' && r.nominated && r.state === 'succeeded') pair = r; });
                const local = pair && stats.get(pair.localCandidateId), remote = pair && stats.get(pair.remoteCandidateId);
                const relay = local?.candidateType === 'relay' || remote?.candidateType === 'relay';
                conn._relayed = relay;
                this.relayed = this.isClient ? relay : [...this.conns.values()].some((c) => c._relayed);
                if (relay !== last) {
                    last = relay;
                    const rtt = pair?.currentRoundTripTime != null ? `, отклик ${Math.round(pair.currentRoundTripTime * 1000)} мс` : '';
                    netLog(`связь с ${who}: ${relay ? 'через посредника (медленнее)' : 'напрямую'} (${local?.candidateType || '?'} ↔ ${remote?.candidateType || '?'}${local?.protocol ? ', ' + local.protocol : ''}${rtt})`);
                }
                if (relay && !told && checks[i] >= 6000) { told = true; this.emit('relayed', { who }); }
            } catch (e) { /* ignore */ }
            if (++i < checks.length) setTimeout(look, checks[i] - checks[i - 1]);
        };
        setTimeout(look, checks[0]);
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
        this.joinedAt.delete(id);
        this.talked.delete(id);
        this.relayed = [...this.conns.values()].some((c) => c._relayed);
        try { conn.close(); } catch (e) { /* ignore */ }
        this.emit('peer-leave', { id });
        this.broadcast({ t: 'players', players: this.playerList() });
    }

    /**
     * Join a room by code. Resolves when connected to the host. On failure the
     * message says which step went wrong: the connection server, finding the
     * game, or the direct link between the two computers.
     */
    join(code, name, server) {
        this.leave();
        this.name = name || 'Игрок';
        const Peer = this._PeerCtor();
        const clean = String(code || '').trim().toUpperCase();
        const t0 = performance.now();
        const sec = () => ((performance.now() - t0) / 1000).toFixed(1) + ' с';
        netLog(`вход по коду ${clean}${server ? ' (свой сервер связи ' + server + ')' : ''}, версия ${this.version || '?'}`);
        return new Promise((resolve, reject) => {
            const peer = new Peer(parseServer(server));
            let settled = false;
            const stage = { broker: false, ice: '', candidates: 0 };
            const fail = (err) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                netLog(`вход не удался (${sec()}): ${err?.type || ''} — сервер связи ${stage.broker ? 'ответил' : 'НЕ ответил'}, прямое соединение: ${stage.ice || 'не началось'}, адресов найдено ${stage.candidates}`);
                peer.destroy();
                reject(Object.assign(new Error(humanError(err)), { type: err?.type, stage }));
            };
            // no answer in time: say whose fault — the connection server, or the direct link
            const timer = setTimeout(() => fail({ type: stage.broker ? 'p2p' : 'timeout' }), JOIN_WAIT);
            peer.on('error', (err) => fail(Object.assign(err || {}, { type: err?.type })));
            peer.on('open', (myId) => {
                stage.broker = true;
                netLog(`сервер связи ответил (${sec()}), ищем игру ${clean}…`);
                const conn = peer.connect(PREFIX + clean, { reliable: true, serialization: 'json', metadata: { name: this.name, v: this.version, pid: this.pid } });
                const lost = () => {
                    if (this.role !== 'client' || this.hostConn !== conn) return;
                    this.emit('disconnected', { reason: 'Хост закрыл игру или связь потеряна' });
                    this.leave();
                };
                conn.on('iceStateChanged', (st) => {
                    stage.ice = st;
                    if (st === 'failed' && !settled) fail({ type: 'p2p' });
                });
                const pc = conn.peerConnection;
                if (pc) pc.addEventListener('icecandidate', (e) => { if (e.candidate) stage.candidates++; });
                conn.on('open', () => {
                    clearTimeout(timer);
                    settled = true;
                    netLog(`соединились с хостом напрямую (${sec()})`);
                    peer.off('error', fail);
                    peer.on('error', (err) => this.emit('status', humanError(err)));
                    this.peer = peer;
                    this.hostConn = conn;
                    this.role = 'client';
                    this.code = clean;
                    this.localId = myId;
                    this.lastSeen.set('H', performance.now());
                    this._startHeartbeat();
                    this._checkRelay(conn, 'хостом');
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
                    if (msg.t === 'version') {
                        netLog(`у хоста другая версия игры: ${msg.host}, у меня ${this.version}`);
                        this.role = null; this.hostConn = null;
                        try { peer.destroy(); } catch (e) { /* ignore */ }
                        this.emit('disconnected', { reason: humanError({ type: 'version' }) });
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
                conn.on('error', (err) => { if (!settled) fail({ type: 'p2p', message: err?.message }); else lost(); });
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
        const id = PREFIX + code;
        return new Promise((resolve) => {
            let asked = false, finished = false;
            const done = (r) => { if (finished) return; finished = true; clearTimeout(timer); resolve(r); };
            // no "not found" from the connection server in time: the game IS there, only the direct
            // link to it didn't open (yet) — show it anyway (joining may still work, or say why not)
            const timer = setTimeout(() => done(asked ? { online: true, noInfo: true, players: [] } : { online: false, unknown: true, players: [] }), 9000);
            const go = (peer) => {
                asked = true;
                const onErr = (err) => {
                    // (several checks share one helper: only this room's "not found" is ours — SRV1 is not SRV10)
                    if (err?.type === 'peer-unavailable') {
                        if (!String(err.message || '').endsWith(id)) return;
                        peer.off('error', onErr);
                        done({ online: false, players: [] });
                        return;
                    }
                    if (peer.open && !peer.destroyed) return; // (something else on a working helper: not ours)
                    peer.off('error', onErr);
                    done({ online: false, unknown: true, players: [] });
                };
                peer.on('error', onErr);
                const conn = peer.connect(id, { reliable: true, serialization: 'json', metadata: { probe: true } });
                conn.on('data', (msg) => {
                    if (msg?.t !== 'info') return;
                    peer.off('error', onErr);
                    done({ online: true, players: msg.players || [], playing: !!msg.playing, name: msg.name || '', mode: msg.mode || '', max: msg.max || MAX_PLAYERS });
                    try { conn.close(); } catch (e) { /* ignore */ }
                });
                setTimeout(() => { peer.off('error', onErr); try { conn.close(); } catch (e) { /* ignore */ } }, 9500);
            };
            const p = this._probePeer;
            if (p && !p.destroyed && !p.disconnected && this._probeKey === key) {
                if (p.open) go(p); else p.once('open', () => go(p)); // (still connecting)
                return;
            }
            try { p?.destroy(); } catch (e) { /* ignore */ }
            // (a switched-off server is normal: no error logs; asking a room needs no go-between —
            // the connection server alone tells that the room is there)
            const opts = parseServer(server);
            const peer = new Peer({ ...opts, debug: 0, config: { ...opts.config, iceServers: ICE.filter((s) => !s.username) } });
            this._probePeer = peer;
            this._probeKey = key;
            peer.once('open', () => go(peer));
            // the helper couldn't reach the connection server at all
            peer.on('error', (err) => {
                if (peer.open) return;
                if (this._probePeer === peer) this._probePeer = null;
                try { peer.destroy(); } catch (e) { /* ignore */ }
                done({ online: false, unknown: true, players: [] });
            });
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
                for (const [id, seen] of this.lastSeen) {
                    // (a player still loading the game — the camera network can hold a slow computer for a while — gets longer)
                    const limit = this.talked.has(id) || now - (this.joinedAt.get(id) || 0) > NEW_PLAYER_GRACE ? TIMEOUT : NEW_PLAYER_GRACE;
                    if (now - seen > limit) { netLog(`игрок ${this.players.get(id)?.name || id} молчал ${((now - seen) / 1000).toFixed(0)} с — отключён`); this._dropClient(id); }
                }
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
        this.joinedAt.clear();
        this.talked.clear();
        this.relayed = false;
    }
}

function humanError(err) {
    switch (err?.type) {
        case 'peer-unavailable': return 'Игра с таким кодом не найдена';
        case 'network': return 'Нет связи с сервером соединения (проверьте интернет)';
        case 'server-error': return 'Сервер соединения недоступен';
        case 'unavailable-id': return 'Код занят, попробуйте ещё раз';
        case 'browser-incompatible': return 'Браузер не поддерживает WebRTC';
        case 'timeout': return 'Сервер связи (через него компьютеры находят друг друга) не ответил — проверьте интернет и повторите через минуту';
        case 'p2p': return 'Игра друга найдена, но ваши компьютеры не смогли соединиться напрямую: мешает роутер, провайдер, VPN или антивирус у одного из вас. Попробуйте: 1) пусть сервер создаст другой игрок; 2) другой интернет (например, раздать с телефона); 3) выключить VPN/прокси';
        case 'version': return 'У вас с хостом разные версии игры — закройте игру и запустите «Обновить и запустить игру» (обоим)';
        case 'socket-error': case 'socket-closed': return 'Соединение с сервером прервано';
        default: return err?.message || String(err || 'Ошибка сети');
    }
}
