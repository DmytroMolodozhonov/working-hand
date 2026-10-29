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
// PeerJS's JSON channel refuses a message of 16300 bytes or more (and calls it a connection error — the
// player was dropped): a bigger one (the world for a newcomer, a castle's people, a fallen building…) goes
// in pieces, put back together on the other side (Network._sendConn / _unpiece)
export const PIECE_BYTES = 15000;
const PIECE_CHARS = 4800;
export const PIECES_MAX = 4000; // (pieces of one message at most: ~60 MB — anything more is no message of the game)
/** Messages only the host's network itself sends: a guest's copy is never passed on or believed. */
const HOST_ONLY = new Set(['players', 'host-left', 'full', 'version', 'info', 'welcome']);

/** UTF-8 bytes of a string (without making the bytes). */
export function utf8Bytes(s) {
    let n = 0;
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        n += c < 0x80 ? 1 : c < 0x800 ? 2 : c >= 0xd800 && c < 0xdc00 ? (i++, 4) : 3;
    }
    return n;
}

/** A long JSON text cut into pieces small enough for the channel (never inside a surrogate pair). */
export function splitPieces(text) {
    const out = [];
    for (let i = 0; i < text.length;) {
        let n = Math.min(PIECE_CHARS, text.length - i);
        for (;;) {
            if (n > 1 && i + n < text.length) { const c = text.charCodeAt(i + n - 1); if (c >= 0xd800 && c < 0xdc00) n--; }
            if (n <= 64 || utf8Bytes(JSON.stringify(text.slice(i, i + n))) < PIECE_BYTES - 200) break;
            n = Math.floor(n / 2);
        }
        out.push(text.slice(i, i + n));
        i += n;
    }
    return out;
}

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
        this.fullVersion = ''; // (its whole commit id: a guest with another version downloads exactly this one)
        this.relayed = false; // a link goes through the slow go-between (TURN): send less
        this.joinedAt = new Map(); // host: peerId -> when it came
        this.talked = new Set(); // host: peers that sent anything but pings (their game runs)
        this._joining = null; // one pending join owns its peer, timeout and callbacks
        this._serverKey = '';
        this._probes = new Set();
        this._joinSession = randomCode(16); // one menu instance, not the lasting pid shared by two tabs
        this._pieceId = 0;
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
            if (!this.isHost) { conn.close(); return; }
            const id = conn.peer;
            // Repeated channels/attempts from one menu must never create extra avatars.
            // Separate browser tabs still work: they have different join sessions.
            const session = conn.metadata?.joinSession;
            if (this.conns.has(id) || (session && [...this.conns.values()].some((c) => c.metadata?.joinSession === session))) {
                try { conn.close(); } catch (e) { /* ignore */ }
                return;
            }
            const theirs = conn.metadata?.v || '';
            netLog(`игрок «${String(conn.metadata?.name || '?').slice(0, 16)}» соединился напрямую (его версия ${theirs || 'старая'}, моя ${this.version || '?'})`);
            if (this.version && theirs && theirs !== this.version) { // another version of the game: things would go wrong in odd ways
                this._sendConn(conn, { t: 'version', host: this.version, full: this.fullVersion });
                this.emit('status', `Игрок «${String(conn.metadata?.name || '?').slice(0, 16)}» входит с другой версией игры — у него сейчас скачается ваша версия, и он войдёт сам`);
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
        conn.on('data', (raw) => {
            if (this.conns.get(conn.peer) !== conn) return; // a rejected or obsolete channel owns no player
            this.lastSeen.set(conn.peer, performance.now());
            if (!raw || typeof raw !== 'object') return;
            if (raw.t === 'ping') return;
            this.talked.add(conn.peer);
            const msg = this._unpiece(conn, raw);
            if (!msg || typeof msg !== 'object' || HOST_ONLY.has(msg.t)) return; // (a guest can't tell the others who plays, or that the host left)
            if (msg.t === 'bye') { this._dropClient(conn.peer); return; }
            msg.from = conn.peer;
            this.emit('message', msg);
            if (msg.relay) this.broadcast(msg, conn.peer);
        });
        const drop = () => { if (this.conns.get(conn.peer) === conn) this._dropClient(conn.peer); };
        conn.on('close', drop);
        conn.on('error', (err) => { if (!tooBig(err)) drop(); }); // (one message refused is not a lost player)
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
        const clean = String(code || '').trim().toUpperCase();
        const serverKey = (server || '').trim();
        if (this._joining) {
            if (this._joining.code === clean && this._joining.server === serverKey) return this._joining.promise;
            return Promise.reject(Object.assign(new Error('Подключение уже идёт — дождитесь результата'), { type: 'connecting' }));
        }
        if (this.active) {
            if (this.isClient && this.code === clean && this._serverKey === serverKey) return Promise.resolve(this.localId);
            return Promise.reject(Object.assign(new Error('Вы уже подключены к игре'), { type: 'connected' }));
        }
        this.leave();
        this.name = name || 'Игрок';
        const Peer = this._PeerCtor();
        const attempt = { code: clean, server: serverKey, promise: null, cancel: null };
        this._joining = attempt;
        const t0 = performance.now();
        const sec = () => ((performance.now() - t0) / 1000).toFixed(1) + ' с';
        netLog(`вход по коду ${clean}${server ? ' (свой сервер связи ' + server + ')' : ''}, версия ${this.version || '?'}`);
        attempt.promise = new Promise((resolve, reject) => {
            let peer;
            try { peer = new Peer(parseServer(server)); } catch (err) { this._joining = null; reject(err); return; }
            let settled = false;
            const stage = { broker: false, ice: '', candidates: 0 };
            const fail = (err) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                if (this._joining === attempt) this._joining = null;
                netLog(`вход не удался (${sec()}): ${err?.type || ''} — сервер связи ${stage.broker ? 'ответил' : 'НЕ ответил'}, прямое соединение: ${stage.ice || 'не началось'}, адресов найдено ${stage.candidates}`);
                peer.destroy();
                reject(Object.assign(new Error(humanError(err)), { type: err?.type, stage }));
            };
            // no answer in time: say whose fault — the connection server, or the direct link
            const timer = setTimeout(() => fail({ type: stage.broker ? 'p2p' : 'timeout' }), JOIN_WAIT);
            attempt.cancel = () => fail({ type: 'cancelled' });
            peer.on('error', (err) => {
                if (!settled) fail(err);
                else if (this.peer === peer && this.isClient) this.emit('status', humanError(err));
            });
            peer.on('open', (myId) => {
                if (settled || this._joining !== attempt || peer.destroyed) return;
                stage.broker = true;
                netLog(`сервер связи ответил (${sec()}), ищем игру ${clean}…`);
                const conn = peer.connect(PREFIX + clean, { reliable: true, serialization: 'json', metadata: { name: this.name, v: this.version, pid: this.pid, joinSession: this._joinSession } });
                const lost = () => {
                    if (!settled) { fail({ type: 'p2p' }); return; }
                    if (this.role !== 'client' || this.hostConn !== conn) return;
                    this.leave();
                    this.emit('disconnected', { reason: 'Хост закрыл игру или связь потеряна' });
                };
                conn.on('iceStateChanged', (st) => {
                    stage.ice = st;
                    if (st === 'failed' && !settled) fail({ type: 'p2p' });
                });
                const pc = conn.peerConnection;
                if (pc) pc.addEventListener('icecandidate', (e) => { if (e.candidate) stage.candidates++; });
                conn.on('open', () => {
                    if (settled || this._joining !== attempt || peer.destroyed) { try { conn.close(); } catch (e) { /* ignore */ } return; }
                    clearTimeout(timer);
                    settled = true;
                    this._joining = null;
                    netLog(`соединились с хостом напрямую (${sec()})`);
                    this.peer = peer;
                    this.hostConn = conn;
                    this.role = 'client';
                    this.code = clean;
                    this._serverKey = serverKey;
                    this.localId = myId;
                    this.lastSeen.set('H', performance.now());
                    this._startHeartbeat();
                    this._checkRelay(conn, 'хостом');
                    resolve(myId);
                });
                conn.on('data', (raw) => {
                    if (this.hostConn !== conn || this.peer !== peer || !this.isClient) return;
                    this.lastSeen.set('H', performance.now());
                    if (!raw || typeof raw !== 'object' || raw.t === 'ping') return;
                    const msg = this._unpiece(conn, raw);
                    if (!msg || typeof msg !== 'object') return;
                    if (msg.t === 'full') {
                        this.leave();
                        this.emit('disconnected', { reason: `Сервер заполнен (${msg.max || MAX_PLAYERS} из ${msg.max || MAX_PLAYERS})` });
                        return;
                    }
                    if (msg.t === 'version') {
                        netLog(`у хоста другая версия игры: ${msg.host}, у меня ${this.version}`);
                        this.leave();
                        // (the menu gets the host's version for this computer at once, then joins again)
                        const ev = { host: String(msg.host || ''), full: String(msg.full || ''), handled: false };
                        this.emit('version', ev);
                        if (!ev.handled) this.emit('disconnected', { reason: humanError({ type: 'version' }) });
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
                conn.on('error', (err) => { if (tooBig(err)) return; if (!settled) fail({ type: 'p2p', message: err?.message }); else lost(); });
                this._watchIce(conn, lost);
            });
        });
        return attempt.promise;
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
            let finished = false, helper = null, conn = null, onOpen = null;
            const unknown = () => done({ online: false, unknown: true, players: [] });
            const onErr = (err) => {
                if (err?.type === 'peer-unavailable') {
                    if (!String(err.message || '').endsWith(id)) return;
                    done({ online: false, players: [] });
                } else if (!helper?.open || helper.destroyed) unknown();
            };
            const done = (r) => {
                if (finished) return;
                finished = true;
                clearTimeout(timer);
                if (onOpen) helper?.off('open', onOpen);
                helper?.off('error', onErr);
                helper?.off('close', unknown);
                helper?.off('disconnected', unknown);
                this._probes.delete(unknown);
                try { conn?.close(); } catch (e) { /* ignore */ }
                resolve(r);
            };
            // Merely sending an offer proves nothing: empty slots may not answer at all.
            // Only an established data channel (or info) proves that a host exists.
            const timer = setTimeout(() => done(conn?.open
                ? { online: true, noInfo: true, players: [] }
                : { online: false, unknown: true, players: [] }), 9000);
            const go = (peer) => {
                if (finished || peer.destroyed) return;
                try { conn = peer.connect(id, { reliable: true, serialization: 'json', metadata: { probe: true } }); }
                catch (e) { unknown(); return; }
                conn.on('data', (msg) => {
                    if (finished || msg?.t !== 'info') return;
                    done({ online: true, players: msg.players || [], playing: !!msg.playing, name: msg.name || '', mode: msg.mode || '', max: msg.max || MAX_PLAYERS });
                });
                conn.on('error', unknown);
                conn.on('close', unknown);
            };
            const use = (peer) => {
                helper = peer;
                this._probes.add(unknown);
                peer.on('error', onErr);
                peer.on('close', unknown);
                peer.on('disconnected', unknown);
                onOpen = () => go(peer); // PeerJS open passes its id, not the peer object
                if (peer.open) go(peer); else peer.once('open', onOpen);
            };
            const p = this._probePeer;
            if (p && !p.destroyed && !p.disconnected && this._probeKey === key) {
                use(p);
                return;
            }
            this.stopProbe();
            // (a switched-off server is normal: no error logs; asking a room needs no go-between —
            // the connection server alone tells that the room is there)
            const opts = parseServer(server);
            const peer = new Peer({ ...opts, debug: 0, config: { ...opts.config, iceServers: ICE.filter((s) => !s.username) } });
            this._probePeer = peer;
            this._probeKey = key;
            // the helper couldn't reach the connection server at all
            peer.on('error', (err) => {
                if (peer.open) return;
                if (this._probePeer === peer) this._probePeer = null;
                try { peer.destroy(); } catch (e) { /* ignore */ }
            });
            use(peer);
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
        for (const finish of [...this._probes]) finish();
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
        try {
            const text = JSON.stringify(msg);
            if (text.length * 3 < PIECE_BYTES || utf8Bytes(text) < PIECE_BYTES) { conn.send(msg); return; }
            const parts = splitPieces(text);
            if (parts.length > PIECES_MAX) { netLog(`сообщение «${msg?.t}» слишком большое (${text.length} знаков) — не отправлено`); return; }
            const k = ++this._pieceId;
            for (let i = 0; i < parts.length; i++) conn.send({ t: '_pc', k, i, n: parts.length, s: parts[i] });
        } catch (e) { /* channel closing */ }
    }

    /** A piece of a big message (_sendConn): null until its last piece came, then the whole message. */
    _unpiece(conn, msg) {
        if (msg.t !== '_pc') return msg;
        const n = msg.n | 0;
        let st = conn._pieces;
        if (msg.i === 0 || !st || st.k !== msg.k) st = conn._pieces = { k: msg.k, n, parts: [] };
        // (the channel is ordered: a piece out of turn means a broken message — forget it)
        if (n < 1 || n > PIECES_MAX || n !== st.n || msg.i !== st.parts.length || typeof msg.s !== 'string') { conn._pieces = null; return null; }
        st.parts.push(msg.s);
        if (st.parts.length < n) return null;
        conn._pieces = null;
        try { return JSON.parse(st.parts.join('')); } catch (e) { return null; }
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
                    this.leave();
                    this.emit('disconnected', { reason: 'Нет связи с хостом' });
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
        this._joining?.cancel?.();
        this._joining = null;
        clearInterval(this._heartbeat);
        this._heartbeat = null;
        // Invalidate ownership before closing: close/error callbacks must not re-enter leave().
        this.role = null;
        const conns = [...this.conns.values()];
        this.conns.clear();
        for (const c of conns) { try { c.close(); } catch (e) { /* ignore */ } }
        if (this.hostConn) { try { this.hostConn.close(); } catch (e) { /* ignore */ } }
        this.hostConn = null;
        if (this.peer) { try { this.peer.destroy(); } catch (e) { /* ignore */ } }
        this.peer = null;
        this.role = null;
        this.code = null;
        this._serverKey = '';
        this.localId = 'solo';
        this.players.clear();
        this.lastSeen.clear();
        this.joinedAt.clear();
        this.talked.clear();
        this.relayed = false;
    }
}

/** PeerJS refused one message as too big for the channel: the link itself is fine. */
const tooBig = (err) => err?.type === 'message-too-big';

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
        case 'cancelled': return 'Подключение отменено';
        default: return err?.message || String(err || 'Ошибка сети');
    }
}
