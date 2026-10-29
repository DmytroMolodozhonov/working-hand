/**
 * VoiceChat.js — the players' voice chat (the author: «голосовая игра через весь мир… или только в радиусе… или отключить»).
 *
 * Transport: WebRTC media calls of PeerJS over the game's own connection server (no other service, nothing paid): with up to
 * MESH_MAX players each pair talks directly; more players — or a pair whose computers can't reach each other directly (two
 * strict routers) — through the host, who passes the voice on. Standard WebRTC encryption (DTLS-SRTP); Opus 24 kHz with
 * in-band error correction (lost packets) and no packets in silence; the microphone gated on the audio thread
 * (voicechat.worklet.js: only speech goes out — or only while the «talk» key is held). Only players of this game: the calls
 * are made and taken only between the ids of this game's player list.
 *
 * Playback: each friend → gain → low-pass (walls, water) → panner (radius: HRTF, the listener is the camera — THREE's
 * AudioListener on the same AudioContext) → his meter (the exact copy of what is played: EchoGuard 'play', the «говорит»
 * mark) → the chat bus → a local WebRTC loop into an <audio> element: Chrome's echo canceller only knows what media
 * elements play, never Web Audio — this way it takes the friends' voices out of the microphone too (and the element
 * can play on the output chosen in the settings). Where the loop can't be made: straight to the speakers.
 *
 * The echo guard (EchoGuard.js) lives here: the microphone's levels, every copy of the friends' voices, their own words.
 * Nothing is written to disk or sent to a server: the voice goes only to the other players; it is never logged.
 */

import { MODES, MODE_TITLE, normalizeSettings, loadSettings, saveSettings, myMode, carries, hearing, muffleHz, topology, pairKey, caller, opusSdp, voiceKbps, MESH_MAX } from './VoiceChatRules.js';
import { EchoGuard } from '../audio/EchoGuard.js';
import { realmAt, defaultRegistry } from '../world/Planets.js';

const HEAD = 1.4; // m: a player's mouth over his body's centre (group.y; eyes ≈ 3.4 m over the feet)
const CALL_WAIT = 12000; // ms a call has to bring a voice, or it failed
const RETRY = 8000; // ms between two tries of the same pair
const SPEAK_DB = -52; // dBFS a friend's played voice is «говорит» over
const STATE_EVERY = 5000; // ms: my state to the others (and at once on a change)

const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** A diary line of the voice chat (never what was said — the voice is not logged). */
function vlog(text) {
    const line = `${new Date().toLocaleTimeString('ru-RU')} 🎙 ${text}`;
    try { console.info(line); } catch (e) { /* ignore */ }
    if (typeof fetch === 'undefined' || typeof location === 'undefined' || !/^https?:/.test(location.protocol)) return;
    try { fetch('/api/perflog', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ line }) }).catch(() => {}); } catch (e) { /* ignore */ }
}

export class VoiceChat {
    /**
     * @param {object} o  { net, game, voice (VoiceService), serverMode (the host's choice at creation) }
     */
    constructor({ net, game, voice = null, serverMode = 'off' }) {
        this.net = net;
        this.game = game;
        this.voice = voice;
        this.s = loadSettings();
        this.serverMode = net?.isHost ? (MODES.includes(serverMode) ? serverMode : 'off') : 'off';
        this.mode = 'off';
        this.guard = new EchoGuard();
        this.peers = new Map(); // id → {mode, mic, uw, at, speakAt, out: {src, gain, filt, pan, meter, el, stream}}
        this.calls = new Map(); // key → {call, kind, src, dst, t0, ok}
        this.failed = new Set(); // pair keys that go through the host
        this.tries = new Map(); // pair key → last try time
        this.ctx = null;
        this.mic = null; // {stream, src, node, dest, outStream}
        this.micState = 'none'; // 'none' | 'asking' | 'on' | 'denied' | 'busy' | 'absent'
        this.pttDown = false;
        this.speakingMe = 0;
        this._t = 0; this._tState = 0; this._tTrack = 0; this._tWall = 0; this._tUi = 0;
        this._envOut = []; // my own voice's frames waiting to go out ('vce')
        this._levelsSeen = 0;
        this._off = [];
        this._onCall = (call) => this._incoming(call);
        this._keys = (e) => this._key(e);
        this.onChange = null; // (the menus redraw)
        if (net) {
            this._off.push(net.on('peer-leave', (p) => this._leave(p.id)));
            // (a guest learns that someone left from the host's new list of players)
            this._off.push(net.on('players', () => { for (const id of [...this.peers.keys()]) if (!net.players.has(id)) this._leave(id); this._wantCalls(); }));
            this._off.push(net.on('peer-join', ({ id }) => { if (net.isHost) net.sendTo(id, this._modeMsg()); this._sendState(); }));
        }
        if (typeof window !== 'undefined') { window.addEventListener('keydown', this._keys, true); window.addEventListener('keyup', this._keys, true); window.addEventListener('blur', this._keys); }
        if (net?.isClient) net.send({ t: 'vcq', by: this.me }); // (what is the server's voice chat? — the host answers)
        this._apply();
    }

    get me() { return this.net?.localId || 'solo'; }
    get settings() { return { ...this.s }; }

    // ------------------------------------------------------------------ modes and settings

    /** Change my settings (any of normalizeSettings' fields); takes effect at once and is remembered. */
    set(patch) {
        const old = this.s;
        this.s = saveSettings({ ...this.s, ...patch });
        if (patch.mic !== undefined && patch.mic !== old.mic) this._closeMic();
        if (['aec', 'ns', 'agc'].some((k) => patch[k] !== undefined && patch[k] !== old[k])) this._closeMic();
        this._sendWorklet({ sens: this.s.sens, ptt: this.s.ptt });
        if (patch.out !== undefined) this._applyOut();
        this._apply();
    }

    /** The host: the voice chat for everybody on this server (changed on the go — Escape). */
    setServerMode(mode) {
        if (!MODES.includes(mode)) return;
        if (this.net?.isHost || !this.net?.active) {
            this.serverMode = mode;
            this.s = saveSettings({ ...this.s, mode });
            if (this.net?.isHost) this.net.send(this._modeMsg());
            vlog(`режим сервера: ${MODE_TITLE[mode]}`);
            this._apply();
        }
    }

    _modeMsg() { return { t: 'vcm', mode: this.serverMode, failed: [...this.failed] }; }

    /** The mode changed (mine, the server's, the settings): the microphone and the calls follow. */
    _apply() {
        const was = this.mode;
        this.mode = this.net?.active ? myMode(this.serverMode, this.s.me) : 'off';
        if (was !== this.mode) {
            vlog(`голосовой чат: ${MODE_TITLE[this.mode]}${this.serverMode !== this.mode ? ` (на сервере — ${MODE_TITLE[this.serverMode]})` : ''}`);
            if (this.mode === 'world' || this.mode === 'radius') this.game?.hud?.notify?.(this.mode === 'world' ? '🎙 Голосовой чат: вас слышат все игроки этого мира' : '🎙 Голосовой чат: вас слышат игроки рядом с вами', 5000);
        }
        if (carries(this.mode)) this._openMic();
        else if (this.mode === 'own' && this.voice?.engine !== 'native') this._openMic(); // (levels for the echo guard: the browser hears the microphone anyway)
        else this._closeMic();
        if (!carries(this.mode)) this._hangAll();
        this._sendState();
        this._wantCalls();
        this.onChange?.();
    }

    // ------------------------------------------------------------------ the audio graph

    _context() {
        if (this.ctx) return this.ctx;
        const sound = this.game?.sound;
        // (the game's own context: THREE's AudioListener there follows the camera — the panners hear from it)
        this.ctx = sound?.context || new (window.AudioContext || window.webkitAudioContext)();
        this._ownCtx = !sound?.context;
        this.bus = this.ctx.createGain();
        this.bus.gain.value = 1;
        this._loopOut();
        this._worklet = this.ctx.audioWorklet ? this.ctx.audioWorklet.addModule(new URL('../audio/voicechat.worklet.js', import.meta.url).href).then(() => true, (e) => { vlog(`звуковой поток не загрузился: ${e?.message || e}`); return false; }) : Promise.resolve(false);
        // the game's own sounds (music, spells) — a copy for the echo guard: not a friend, not my voice either
        const master = sound?.audioListener?.gain;
        if (master) this._worklet.then((ok) => {
            if (!ok || this.ctx !== master.context) return;
            const meter = new AudioWorkletNode(this.ctx, 'vc-meter', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
            const mute = this.ctx.createGain();
            mute.gain.value = 0;
            meter.port.onmessage = (e) => { const t0 = this._perf(e.data.t); for (let k = 0; k < e.data.lv.length; k++) this.guard.ref('game', 'game', t0 + k * 10, e.data.lv[k]); };
            master.connect(meter).connect(mute).connect(this.ctx.destination);
            this._gameTap = { master, meter, mute };
        });
        return this.ctx;
    }

    /**
     * The chat bus → a local WebRTC loop → an <audio> element (Chrome's echo canceller hears it; the output can be chosen).
     * Firefox and Safari cancel Web Audio's own sound already: there (and when the loop fails) — straight to the speakers.
     */
    async _loopOut() {
        const ctx = this.ctx;
        const chrome = typeof navigator !== 'undefined' && /Chrome\//.test(navigator.userAgent) && typeof RTCPeerConnection !== 'undefined';
        const direct = () => { try { this.bus.disconnect(); } catch (e) { /* ignore */ } this.bus.connect(ctx.destination); this.outPath = 'direct'; };
        if (!chrome || !ctx.createMediaStreamDestination) { direct(); return; }
        try {
            const dest = ctx.createMediaStreamDestination();
            this.bus.connect(dest);
            const a = new RTCPeerConnection(), b = new RTCPeerConnection();
            a.onicecandidate = (e) => { if (e.candidate) b.addIceCandidate(e.candidate).catch(() => {}); };
            b.onicecandidate = (e) => { if (e.candidate) a.addIceCandidate(e.candidate).catch(() => {}); };
            const got = new Promise((res) => { b.ontrack = (e) => res(e.streams[0] || new MediaStream([e.track])); });
            for (const t of dest.stream.getAudioTracks()) a.addTrack(t, dest.stream);
            const offer = await a.createOffer();
            await a.setLocalDescription({ type: 'offer', sdp: opusSdp(offer.sdp, 64).replace('stereo=0', 'stereo=1') });
            await b.setRemoteDescription(a.localDescription);
            const ans = await b.createAnswer();
            await b.setLocalDescription(ans);
            await a.setRemoteDescription(b.localDescription);
            const stream = await Promise.race([got, new Promise((_, rej) => setTimeout(() => rej(new Error('нет звука петли')), 4000))]);
            const el = new Audio();
            el.autoplay = true;
            el.srcObject = stream;
            this.outEl = el;
            this.loop = { a, b, dest };
            this._applyOut();
            await el.play().catch(() => {});
            this.outPath = 'loop';
            vlog('голоса друзей идут через петлю: браузер убирает их из микрофона');
        } catch (e) {
            vlog(`петля для эхоподавления не вышла (${e?.message || e}) — голоса друзей прямо в колонки`);
            try { this.loop?.a.close(); this.loop?.b.close(); } catch (_) { /* ignore */ }
            this.loop = null;
            direct();
        }
    }

    /** The output chosen in the settings (only where the browser can: setSinkId). */
    _applyOut() {
        const el = this.outEl;
        if (!el || typeof el.setSinkId !== 'function') return;
        el.setSinkId(this.s.out || '').catch((e) => vlog(`выход звука не выбран: ${e?.name || e}`));
    }

    /** Can the browser choose the output here? (the menu shows the choice only then) */
    get canChooseOutput() { return typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype; }

    async _openMic() {
        if (this.mic || this._micOpening || typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
            if (!navigator?.mediaDevices?.getUserMedia) this.micState = 'absent';
            return;
        }
        this._micOpening = true;
        const ctx = this._context();
        const want = this.s;
        this.micState = 'asking';
        let stream = null;
        try {
            const audio = { echoCancellation: want.aec, noiseSuppression: want.ns, autoGainControl: want.agc, channelCount: 1 };
            if (want.mic) audio.deviceId = { exact: want.mic };
            try { stream = await navigator.mediaDevices.getUserMedia({ audio }); } catch (e) {
                if (want.mic && (e?.name === 'OverconstrainedError' || e?.name === 'NotFoundError')) { delete audio.deviceId; stream = await navigator.mediaDevices.getUserMedia({ audio }); } // (the chosen one is gone: the system's)
                else throw e;
            }
            this.micState = 'on';
        } catch (e) {
            // (no microphone, refused, taken by another program: the friends are still heard; my voice does not go)
            this.micState = e?.name === 'NotAllowedError' ? 'denied' : e?.name === 'NotReadableError' || e?.name === 'AbortError' ? 'busy' : 'absent';
            vlog(`микрофон для голосового чата: ${({ denied: 'доступ не разрешён', busy: 'занят другой программой', absent: 'не найден' })[this.micState]} (${e?.name || e})`);
            if (carries(this.mode)) this.game?.hud?.notify?.(this.micState === 'denied' ? '🎙 Друзья вас не слышат: браузер не дал доступ к микрофону. Разрешите его в адресной строке (значок 🔒) — вы их слышите и так.' : this.micState === 'busy' ? '🎙 Друзья вас не слышат: микрофон занят другой программой. Закройте её — вы их слышите и так.' : '🎙 Микрофон не найден — друзья вас не слышат, но вы их слышите.', 9000);
        }
        const ok = await this._worklet;
        if (!this._micOpening) { stream?.getTracks().forEach((t) => t.stop()); return; } // (closed meanwhile)
        const dest = ctx.createMediaStreamDestination();
        let src = null, node = null;
        if (stream) {
            src = ctx.createMediaStreamSource(stream);
            if (ok) {
                node = new AudioWorkletNode(ctx, 'vc-mic', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
                node.port.onmessage = (e) => this._micLevels(e.data);
                src.connect(node).connect(dest);
                node.port.postMessage({ sens: want.sens, ptt: want.ptt, down: this.pttDown });
            } else {
                src.connect(dest); // (no audio thread here: the voice goes as it is)
            }
        }
        this.mic = { stream, src, node, dest, outStream: dest.stream };
        this._micOpening = false;
        // (the calls already on: the new voice in them)
        for (const c of this.calls.values()) this._replaceTrack(c);
        if (stream) vlog(`микрофон чата включён${want.mic ? ' (выбранный)' : ''}: эхоподавление ${want.aec ? 'да' : 'нет'}, шумоподавление ${want.ns ? 'да' : 'нет'}, усиление ${want.agc ? 'да' : 'нет'}`);
        this._wantCalls();
        this.onChange?.();
    }

    _closeMic() {
        this._micOpening = false;
        const m = this.mic;
        if (!m) return;
        this.mic = null;
        try { m.stream?.getTracks().forEach((t) => t.stop()); } catch (e) { /* ignore */ }
        try { m.src?.disconnect(); m.node?.disconnect(); } catch (e) { /* ignore */ }
        this.micState = 'none';
        this.speakingMe = 0;
    }

    _sendWorklet(msg) { try { this.mic?.node?.port.postMessage(msg); } catch (e) { /* ignore */ } }

    /** The context's clock → performance.now() (ms). */
    _perf(ctxT) {
        const ts = this.ctx?.getOutputTimestamp?.();
        if (ts && Number.isFinite(ts.contextTime) && ts.performanceTime > 0) return ts.performanceTime + (ctxT - ts.contextTime) * 1000;
        return now() - ((this.ctx?.currentTime || 0) - ctxT) * 1000;
    }

    /** My microphone's 10 ms levels (the audio thread, 10× a second). */
    _micLevels(d) {
        const t0 = this._perf(d.t) - (this.ctx?.baseLatency || 0) * 1000;
        let speak = false;
        for (let k = 0; k < d.lv.length; k++) {
            const t = t0 + k * 10;
            if (this.voice?.engine !== 'native') this.guard.mic(t, d.lv[k]); // (the native voice gives its own levels: nativeLevels)
            if (d.vad[k]) speak = true;
            this._envOut.push([t, d.lv[k]]);
        }
        if (speak && (!this.s.ptt || this.pttDown)) this.speakingMe = now();
    }

    /**
     * The native voice without a copy of the speakers (macOS, Linux): the friends' voices the game plays go to it as that copy
     * (POST /api/voice/ref, 50 ms at a time, only while they sound) — its echo canceller then takes them out of the microphone
     * before the speech network hears it. Windows has the speakers' own copy («loopback»): nothing to send there.
     */
    _refTap() {
        const want = carries(this.mode) && this.voice?.engine === 'native' && !!this.voice.native?.status?.pageRef && !this.voice.native.status.aec;
        if (!want) {
            if (this._tap) { try { this.bus.disconnect(this._tap); this._tap.disconnect(); } catch (e) { /* ignore */ } this._tap = null; }
            return;
        }
        if (this._tap || this._tapping || !this.ctx) return;
        this._tapping = true;
        this._worklet.then((ok) => {
            this._tapping = false;
            if (!ok || this._tap || !this.bus) return;
            const tap = new AudioWorkletNode(this.ctx, 'vc-tap', { numberOfInputs: 1, numberOfOutputs: 0 });
            let busy = 0;
            tap.port.onmessage = (e) => {
                if (busy > 3) return; // (the server is slow: a piece is let go rather than a queue piling up)
                busy++;
                fetch('/api/voice/ref', { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body: e.data, cache: 'no-store' })
                    .catch(() => {}).finally(() => { busy--; });
            };
            this.bus.connect(tap);
            this._tap = tap;
            vlog('голоса друзей идут в нейросеть голоса как копия колонок: она убирает их из микрофона');
        });
    }

    /** The native voice's levels (voice_native.py: the microphone as it is, and the speakers' copy — Windows). */
    nativeLevels(d, off) {
        // (what the speech network heard: the microphone after the echo canceller — where it has a copy of the speakers,
        // most of the friend's voice is out already; what is left of it is still like his voice, and the guard finds that)
        const lv = d.db || d.raw;
        const n = lv?.length || 0;
        if (!n) return;
        const base = Number.isFinite(d.t) && Number.isFinite(off) ? d.t + off : now() - 70;
        for (let j = 0; j < n; j++) {
            const t = base - (n - j) * 10;
            this.guard.mic(t, lv[j]);
            if (d.far && Number.isFinite(d.far[j])) this.guard.ref('spk', 'spk', t, d.far[j]);
            if (!this.mic) this._envOut.push([t, lv[j]]);
        }
    }

    // ------------------------------------------------------------------ calls

    _peerId(id) {
        if (id !== 'H') return id;
        if (this.net.isHost) return this.net.peer?.id;
        return this.net.hostConn?.peer;
    }

    _idOf(peerId) {
        if (this.net.isClient && peerId === this.net.hostConn?.peer) return 'H';
        return peerId;
    }

    /** The players in this game (never anybody else: the calls are only between them). */
    _players() { return this.net?.active ? [...this.net.players.keys()].filter((id) => id !== this.me) : []; }

    /** Does this friend carry voices (his mode), as far as I know? */
    _carries(id) { const p = this.peers.get(id); return !!p && carries(p.mode); }

    /** Which calls should be on now — make the missing ones, end the ones not wanted. */
    _wantCalls() {
        if (!this.net?.active || !this.net.peer) return;
        if (!this._listening && this.net.peer) { this.net.peer.on('call', this._onCall); this._listening = this.net.peer; }
        const ids = this._players();
        const topo = topology(ids.length + 1, this.failed);
        const want = new Set();
        if (carries(this.mode)) {
            for (const id of ids) {
                if (!this._carries(id)) continue;
                const host = this.me === 'H' || id === 'H';
                if (host || !topo.relayPair(this.me, id)) want.add('d:' + id);
            }
            // the host passes on the voices of pairs that can't talk directly
            if (this.net.isHost) {
                for (const a of ids) for (const b of ids) {
                    if (a === b || !this._carries(a) || !this._carries(b) || !topo.relayPair(a, b)) continue;
                    want.add(`f:${a}>${b}`);
                }
            }
        }
        for (const [key, c] of this.calls) {
            // (a voice the host passes on to me is the host's to end — while its speaker is in the game and carries voices)
            if (key.startsWith('r:') && carries(this.mode) && this.net.players.has(c.src) && this._carries(c.src)) continue;
            if (!want.has(key)) this._hang(key, c);
        }
        const t = now();
        for (const key of want) {
            if (this.calls.has(key)) continue;
            if (key.startsWith('d:')) {
                const id = key.slice(2);
                if (caller(this.me, id) !== this.me) continue; // (he calls me)
                if (t - (this.tries.get(key) || -1e9) < RETRY) continue;
                if (!this.mic && !this._micOpening && this.micState !== 'none') { /* no voice of mine: a call still brings his */ }
                this.tries.set(key, t);
                this._call(id, key, this.me, this._outStream());
            } else {
                const [a, b] = key.slice(2).split('>');
                const inA = this._incomingStream(a);
                if (!inA) continue; // (his voice is not here yet)
                if (t - (this.tries.get(key) || -1e9) < RETRY) continue;
                this.tries.set(key, t);
                this._call(b, key, a, inA);
            }
        }
    }

    _outStream() {
        if (this.mic?.outStream) return this.mic.outStream;
        // (no microphone: a silent voice — the call still brings the friend's)
        const ctx = this._context();
        if (!this._silent) this._silent = ctx.createMediaStreamDestination();
        return this._silent.stream;
    }

    _incomingStream(id) { return this.peers.get(id)?.out?.stream || null; }

    _sdp() { const k = voiceKbps(!!this.net?.relayed); return (sdp) => opusSdp(sdp, k); }

    _call(id, key, src, stream) {
        const pid = this._peerId(id);
        if (!pid || !this.net.peer || this.net.peer.destroyed) return;
        let call;
        try { call = this.net.peer.call(pid, stream, { metadata: { vc: 1, src, key: key.startsWith('f:') ? 'f' : 'd' }, sdpTransform: this._sdp() }); } catch (e) { vlog(`звонок ${id} не начат: ${e?.message || e}`); return; }
        if (!call) return;
        this._track(key, call, key.startsWith('f:') ? 'fwd' : 'direct', key.startsWith('f:') ? src : id, id);
    }

    _incoming(call) {
        const md = call.metadata || {};
        if (!md.vc) return; // (not ours)
        const from = this._idOf(call.peer);
        // (only a player of this game, only while I carry voices)
        if (!this.net.players.has(from) || !carries(this.mode)) { try { call.close(); } catch (e) { /* ignore */ } return; }
        const fwd = md.key === 'f';
        const src = fwd ? String(md.src || '') : from;
        if (fwd && (from !== 'H' || !this.net.players.has(src))) { try { call.close(); } catch (e) { /* ignore */ } return; } // (only the host passes voices on)
        const key = fwd ? `r:${src}` : `d:${from}`;
        const old = this.calls.get(key);
        if (old) this._hang(key, old);
        try { call.answer(fwd ? undefined : this._outStream(), { sdpTransform: this._sdp() }); } catch (e) { return; }
        this._track(key, call, fwd ? 'relayed' : 'direct', src, from);
    }

    _track(key, call, kind, src, with_) {
        const c = { call, kind, src, with: with_, t0: now(), ok: false };
        this.calls.set(key, c);
        call.on('stream', (stream) => {
            if (this.calls.get(key) !== c) return;
            c.ok = true;
            if (kind !== 'fwd') this._play(src, stream, kind);
            vlog(`голос ${this._name(src)}: ${kind === 'direct' ? 'напрямую' : kind === 'relayed' ? 'через хоста' : 'передаю дальше ' + this._name(with_)}`);
            if (this.net.isHost) this._wantCalls(); // (a voice that can now be passed on)
        });
        const end = () => { if (this.calls.get(key) === c) { this.calls.delete(key); if (kind !== 'fwd' && !this._otherCallFor(src, key)) this._stopPlay(src); } };
        call.on('close', end);
        call.on('error', () => { end(); this._failed(key, c); });
        call.on('iceStateChanged', (st) => {
            if (st === 'failed') { end(); this._failed(key, c); }
            else if ((st === 'connected' || st === 'completed') && kind === 'fwd') c.ok = true; // (passing a voice on: nothing comes back)
        });
        setTimeout(() => { if (this.calls.get(key) === c && !c.ok) { this._hang(key, c); this._failed(key, c); } }, CALL_WAIT);
    }

    _otherCallFor(src, except) { for (const [k, c] of this.calls) if (k !== except && c.src === src && c.ok && c.kind !== 'fwd') return true; return false; }

    /** A direct link between two guests failed: they go through the host from now on (the host is told). */
    _failed(key, c) {
        if (c.kind !== 'direct' || !key.startsWith('d:')) return;
        const id = key.slice(2);
        if (this.me === 'H' || id === 'H') return; // (with the host there is no other way: tried again later)
        const pk = pairKey(this.me, id);
        if (this.failed.has(pk)) return;
        vlog(`с ${this._name(id)} напрямую не вышло — голос пойдёт через хоста`);
        this.failed.add(pk);
        this.net.send({ t: 'vcf', by: this.me, a: this.me, b: id }, false);
        this._wantCalls();
    }

    _hang(key, c) {
        this.calls.delete(key);
        try { c.call.close(); } catch (e) { /* ignore */ }
        if (c.kind !== 'fwd' && !this._otherCallFor(c.src, key)) this._stopPlay(c.src);
    }

    _hangAll() { for (const [k, c] of [...this.calls]) this._hang(k, c); }

    _replaceTrack(c) {
        if (c.kind === 'relayed' || c.kind === 'fwd') return;
        const track = this._outStream().getAudioTracks()[0];
        for (const s of c.call.peerConnection?.getSenders?.() || []) if (s.track?.kind === 'audio' || !s.track) s.replaceTrack(track).catch(() => {});
    }

    _name(id) { return id === this.me ? 'вы' : this.net?.players.get(id)?.name || this.game?.remotes?.get(id)?.name || id; }

    // ------------------------------------------------------------------ playback

    _peer(id) {
        let p = this.peers.get(id);
        if (!p) { p = { mode: 'off', mic: false, uw: false, at: 0, speakAt: 0, out: null, wall: false }; this.peers.set(id, p); }
        return p;
    }

    _play(id, stream, kind) {
        const ctx = this._context();
        const p = this._peer(id);
        if (p.out?.stream === stream) return;
        this._stopPlay(id);
        // (Chrome: a remote voice flows into Web Audio only while a media element holds it too — muted)
        const el = new Audio();
        el.muted = true;
        el.srcObject = stream;
        el.play().catch(() => {});
        const src = ctx.createMediaStreamSource(stream);
        const gain = ctx.createGain();
        gain.gain.value = 0;
        const filt = ctx.createBiquadFilter();
        filt.type = 'lowpass';
        filt.frequency.value = 12000;
        const pan = ctx.createPanner();
        pan.panningModel = 'HRTF';
        pan.distanceModel = 'inverse';
        pan.refDistance = 1e4; // (the loudness by distance is ours: VoiceChatRules.hearing)
        pan.rolloffFactor = 0;
        src.connect(gain).connect(filt).connect(pan);
        let tail = pan;
        this._worklet.then((ok) => {
            if (!ok || p.out?.stream !== stream) { if (p.out?.stream === stream) pan.connect(this.bus); return; }
            const meter = new AudioWorkletNode(ctx, 'vc-meter', { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
            meter.port.onmessage = (e) => this._played(id, e.data);
            pan.connect(meter).connect(this.bus);
            p.out.meter = meter;
        });
        p.out = { stream, el, src, gain, filt, pan, meter: null, kind, tail };
        this._place(id, true);
    }

    _stopPlay(id) {
        const p = this.peers.get(id);
        const o = p?.out;
        if (!o) return;
        p.out = null;
        try { o.src.disconnect(); o.gain.disconnect(); o.filt.disconnect(); o.pan.disconnect(); o.meter?.disconnect(); } catch (e) { /* ignore */ }
        try { o.el.srcObject = null; } catch (e) { /* ignore */ }
        this.guard.drop('play:' + id);
    }

    /** A friend's voice as played here (10 ms levels): the echo guard's exact copy; the «говорит» mark. */
    _played(id, d) {
        const p = this.peers.get(id);
        if (!p?.out) return; // (the last levels of a voice already gone)
        const t0 = this._perf(d.t);
        let loud = false;
        for (let k = 0; k < d.lv.length; k++) {
            this.guard.ref('play:' + id, 'play', t0 + k * 10, d.lv[k]);
            if (d.lv[k] > SPEAK_DB) loud = true;
        }
        if (loud) p.speakAt = now();
    }

    /** Where and how loud a friend is heard now (radius: the distance, walls, water, air). */
    _place(id, atOnce = false) {
        const p = this.peers.get(id);
        const o = p?.out;
        if (!o || !this.ctx) return;
        const g = this.game, r = g?.remotes?.get(id);
        const cam = g?.camera?.position;
        let h;
        if (this.mode === 'radius' && r && cam) {
            const pos = r.position;
            const hx = pos.x, hy = pos.y + HEAD, hz = pos.z;
            const reg = g.space?.planets || defaultRegistry();
            const meRealm = realmAt(cam.x, cam.y, cam.z, reg), himRealm = realmAt(hx, hy, hz, reg);
            h = hearing({ mode: 'radius', dist: Math.hypot(hx - cam.x, hy - cam.y, hz - cam.z), wall: p.wall, meRealm, himRealm,
                airless: (realm) => realm !== 'earth' && realm !== 'space' && reg.get?.(realm)?.air === 'none',
                meWater: !!g.swim?.underwater, himWater: !!p.uw, volume: this.s.volume / 100 });
            const t = this.ctx.currentTime;
            if (o.pan.positionX) { o.pan.positionX.setTargetAtTime(hx, t, 0.05); o.pan.positionY.setTargetAtTime(hy, t, 0.05); o.pan.positionZ.setTargetAtTime(hz, t, 0.05); }
            else o.pan.setPosition(hx, hy, hz);
            p.why = h.why;
        } else {
            h = hearing({ mode: this.mode === 'radius' ? 'radius' : 'world', volume: this.s.volume / 100, dist: Infinity });
            // (the whole world: no place — the voice right at the listener)
            if (cam && o.pan.positionX) { const t = this.ctx.currentTime; o.pan.positionX.setTargetAtTime(cam.x, t, 0.05); o.pan.positionY.setTargetAtTime(cam.y, t, 0.05); o.pan.positionZ.setTargetAtTime(cam.z, t, 0.05); }
            p.why = h.why;
        }
        const t = this.ctx.currentTime, k = atOnce ? 0.01 : 0.12;
        o.gain.gain.setTargetAtTime(h.gain, t, k);
        o.filt.frequency.setTargetAtTime(muffleHz(h.muffle), t, k);
        p.gain = h.gain;
    }

    // ------------------------------------------------------------------ the network

    /** A voice chat message (NetSync passes every 'vc…' here). */
    onNet(m) {
        const by = m.by || m.from;
        switch (m.t) {
            case 'vcm': // the server's mode (from the host)
                if (this.net.isHost || (m.from && m.from !== 'H')) break; // (only the host sets it)
                if (MODES.includes(m.mode)) this.serverMode = m.mode;
                this._gotMode = true;
                if (Array.isArray(m.failed)) this.failed = new Set(m.failed.filter((k) => typeof k === 'string').slice(0, 200));
                this._apply();
                break;
            case 'vcq': if (this.net.isHost) this.net.sendTo(m.from, this._modeMsg()); break;
            case 'vcf': // a pair of guests can't talk directly: through me (the host) from now on
                if (this.net.isHost && typeof m.a === 'string' && typeof m.b === 'string' && this.net.players.has(m.a) && this.net.players.has(m.b)) {
                    const k = pairKey(m.a, m.b);
                    if (!this.failed.has(k)) { this.failed.add(k); this.net.send(this._modeMsg()); this._wantCalls(); }
                }
                break;
            case 'vcs': { // a friend's state
                if (!by || by === this.me || !this.net.players.has(by)) break;
                const p = this._peer(by);
                const was = p.mode;
                p.mode = MODES.includes(m.m) ? m.m : 'off';
                p.mic = !!m.mic; p.uw = !!m.uw; p.at = now();
                if (was !== p.mode) this._wantCalls();
                break;
            }
            case 'vce': { // a friend's own voice, as his game heard it (only his voice: what his speakers brought is out)
                if (!by || by === this.me || !this.net.players.has(by) || typeof m.d !== 'string' || !Number.isFinite(m.i)) break;
                const off = this.guard.clock(by, +m.n, now());
                if (off == null) break;
                const bytes = b64bytes(m.d);
                for (let k = 0; k < bytes.length && k < 64; k++) this.guard.ref('net:' + by, 'net', (m.i + k) * 10 + off, bytes[k] ? bytes[k] - 140 : -120);
                const p = this._peer(by);
                if (bytes.some((b) => b > 0)) p.speakAt = Math.max(p.speakAt, now());
                break;
            }
            case 'vcw': { // a spell a friend said (his own game heard it as his)
                if (!by || by === this.me || typeof m.s !== 'string') break;
                const off = this.guard.clock(by, +m.n, now());
                if (off == null || !Number.isFinite(+m.a)) break;
                this.guard.friendWord(by, m.s.slice(0, 40), +m.a + off, (Number.isFinite(+m.b) ? +m.b : +m.a) + off);
                break;
            }
            default: break;
        }
    }

    _sendState() {
        if (!this.net?.active) return;
        this._tState = now();
        this.net.send({ t: 'vcs', by: this.me, m: this.mode, mic: this.micState === 'on', uw: !!this.game?.swim?.underwater }, true);
    }

    /** I said a spell (judged mine): the others know it is my voice, not theirs, when their microphones hear it. */
    said(spell, from, to) {
        if (!this.net?.active || this.mode === 'off' || !spell || !Number.isFinite(from)) return;
        this.net.send({ t: 'vcw', by: this.me, s: String(spell).slice(0, 40), a: Math.round(from), b: Math.round(Number.isFinite(to) ? to : from), n: Math.round(now()) }, true);
    }

    /** My own voice's frames (only those louder than any echo: never a friend's voice passed back) → 'vce', 10× a second. */
    _sendEnv() {
        if (this.mode === 'off' || !this.net?.active || !this._players().length) { this._envOut.length = 0; return; }
        const t = now(), ready = t - 120; // (the copies of the friends' voices of the same moment have come by then)
        const take = [];
        while (this._envOut.length && this._envOut[0][0] <= ready) take.push(this._envOut.shift());
        if (this._envOut.length > 400) this._envOut.splice(0, this._envOut.length - 400);
        if (!take.length) return;
        const i0 = Math.floor(take[0][0] / 10);
        const bytes = new Uint8Array(Math.min(64, take.length));
        let any = false;
        for (let k = 0; k < bytes.length; k++) {
            const [ft, db] = take[k];
            const mine = this.guard.frameMine(ft) && (!this.s.ptt || this.pttDown || this.mode === 'own');
            bytes[k] = mine ? Math.max(1, Math.min(255, Math.round(db + 140))) : 0;
            if (mine) any = true;
        }
        if (!any) return;
        this.net.send({ t: 'vce', by: this.me, i: i0, d: bytes64(bytes), n: Math.round(t) }, true);
    }

    // ------------------------------------------------------------------ every frame

    /** Called by the game each frame (cheap: places 10×/s, walls 2×/s, the guard 4×/s). */
    frame(dt) {
        if (!this.net?.active) return;
        const t = now();
        if (t - this._tState > STATE_EVERY) this._sendState();
        // (a guest whose question came before his game was on: asks again until the host's answer comes)
        if (this.net.isClient && !this._gotMode && t - (this._tAsk || 0) > 2000) { this._tAsk = t; this.net.send({ t: 'vcq', by: this.me }); }
        if (this._uw !== !!this.game?.swim?.underwater) { this._uw = !!this.game?.swim?.underwater; this._sendState(); }
        if (t - this._t >= 100) {
            this._t = t;
            for (const id of this.peers.keys()) this._place(id);
            this._sendEnv();
            this._browserLevels();
        }
        if (t - this._tTrack >= 250) { this._tTrack = t; this.guard.track(t); this._wantCalls(); this._refTap(); }
        if (this.mode === 'radius' && t - this._tWall >= 500) { this._tWall = t; this._walls(); }
        if (t - this._tUi >= 250) { this._tUi = t; this._marks(); }
    }

    /** Walls / rock between the camera and each friend near enough to hear (a sampled line: Collision.lineOfSight). */
    _walls() {
        const g = this.game, col = g?.collision, cam = g?.camera?.position;
        if (!col?.lineOfSight || !cam) return;
        for (const [id, p] of this.peers) {
            const r = g.remotes?.get(id);
            if (!r || !p.out) continue;
            const pos = r.position;
            const d = Math.hypot(pos.x - cam.x, pos.z - cam.z);
            if (d > 62) { p.wall = false; continue; }
            p.wall = !col.lineOfSight(cam.x, cam.y, cam.z, pos.x, pos.y + HEAD, pos.z, 1.5);
        }
    }

    /** Without a chat microphone, the browser's voice meter (50 ms) feeds the echo guard. */
    _browserLevels() {
        if (this.mic?.node || this.voice?.engine === 'native') return;
        const L = this.voice?._levels;
        if (!L?.length) return;
        for (const [time, db] of L) {
            if (time <= this._levelsSeen) continue;
            this._levelsSeen = time;
            for (let k = 0; k < 5; k++) { this.guard.mic(time - 40 + k * 10, db); this._envOut.push([time - 40 + k * 10, db]); }
        }
    }

    /** «Говорит» marks: over the friends' names and in the corner. */
    _marks() {
        const t = now();
        const list = [];
        for (const [id, p] of this.peers) {
            const on = t - p.speakAt < 350 && (this.mode === 'own' || (p.gain ?? 0) > 0.001);
            const r = this.game?.remotes?.get(id);
            r?.setSpeaking?.(on);
            if (on) list.push(this._name(id));
        }
        const meOn = carries(this.mode) && t - this.speakingMe < 350;
        this.game?.hud?.voiceChat?.({ mode: this.mode, me: meOn, ptt: this.s.ptt && carries(this.mode), key: keyLabel(this.s.pttKey), down: this.pttDown, mic: this.micState, speakers: list });
    }

    // ------------------------------------------------------------------ the «talk» key

    _key(e) {
        if (e.type === 'blur') { if (this.pttDown) { this.pttDown = false; this._sendWorklet({ down: false }); } return; } // (the window lost the keyboard: the key is let go)
        if (!this.s.ptt || e.code !== this.s.pttKey) return;
        const t = e.target?.tagName;
        if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
        e.stopPropagation(); // (not one of the game's own keys while it means «talk»)
        if (e.repeat) return;
        const down = e.type === 'keydown';
        if (down === this.pttDown) return;
        this.pttDown = down;
        this._sendWorklet({ down });
        if (down) this.speakingMe = now();
    }

    // ------------------------------------------------------------------ the villagers

    /**
     * Am I talking with friends now (the author: «голос игрока не принимается жителем как разговор с ним без обращения»)?
     * Then a villager hears me only when I address him (look at him, call him, talk with him already) — not just because he
     * stands nearest.
     */
    chatting() {
        if (!this.net?.active || this.mode === 'off' || !this._players().length) return false;
        if (this.mode !== 'radius') return true;
        for (const p of this.peers.values()) if ((p.gain ?? 0) > 0.001) return true;
        return false;
    }

    // ------------------------------------------------------------------ leaving

    _leave(id) {
        for (const [k, c] of [...this.calls]) if (c.with === id || c.src === id || k.includes(id)) this._hang(k, c);
        this._stopPlay(id);
        this.peers.delete(id);
        this.guard.drop('net:' + id);
        this.guard.drop('play:' + id);
        for (const k of [...this.failed]) if (k.split('|').includes(id)) this.failed.delete(k);
        this.game?.remotes?.get(id)?.setSpeaking?.(false);
    }

    dispose() {
        this._hangAll();
        for (const id of [...this.peers.keys()]) this._stopPlay(id);
        this._closeMic();
        for (const off of this._off) try { off(); } catch (e) { /* ignore */ }
        this._off = [];
        try { this._listening?.off?.('call', this._onCall); } catch (e) { /* ignore */ }
        if (typeof window !== 'undefined') { window.removeEventListener('keydown', this._keys, true); window.removeEventListener('keyup', this._keys, true); window.removeEventListener('blur', this._keys); }
        try { this.loop?.a.close(); this.loop?.b.close(); } catch (e) { /* ignore */ }
        try { this._tap?.disconnect(); } catch (e) { /* ignore */ }
        this._tap = null;
        try { this.bus?.disconnect(); } catch (e) { /* ignore */ }
        try { if (this._gameTap) { this._gameTap.master.disconnect(this._gameTap.meter); this._gameTap.meter.disconnect(); this._gameTap.mute.disconnect(); } } catch (e) { /* ignore */ }
        try { if (this.outEl) this.outEl.srcObject = null; } catch (e) { /* ignore */ }
        if (this._ownCtx) this.ctx?.close?.().catch(() => {});
        this.game?.hud?.voiceChat?.(null);
    }

    /** For the menus: what is on now (state shown to the player). */
    status() {
        const t = now();
        return {
            server: this.serverMode, mode: this.mode, mic: this.micState, out: this.outPath || 'direct', host: !!this.net?.isHost,
            peers: [...this.peers.entries()].map(([id, p]) => ({ id, name: this._name(id), mode: p.mode, heard: !!p.out, gain: p.gain ?? 0, why: p.why || '', speaking: t - p.speakAt < 350 })),
            calls: [...this.calls.values()].filter((c) => c.ok).length, relay: this._players().length + 1 > MESH_MAX || this.failed.size > 0,
        };
    }
}

/** 'KeyT' → 'T', 'Digit5' → '5' (the key's name for the player). */
export const keyLabel = (code) => String(code || '').replace(/^Key/, '').replace(/^Digit/, '');

function bytes64(u8) {
    let s = '';
    for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]);
    return typeof btoa === 'function' ? btoa(s) : Buffer.from(u8).toString('base64');
}

function b64bytes(str) {
    try {
        if (typeof atob === 'function') { const s = atob(str); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
        return new Uint8Array(Buffer.from(str, 'base64'));
    } catch (e) { return new Uint8Array(0); }
}

export { normalizeSettings };
