/**
 * opushka-net.js — multiplayer in the world «Опушка» (the author 23.11: «дай возможность также в мультиплеере играть в этом режиме, при
 * создании карты в мультиплеере можно будет выбрать именно мир „Опушка“»).
 *
 * The same network as the game (Network.js: PeerJS, a star — the host and his guests; the server list «SRV1…» of the menu, a game by code).
 * The menu sends here: `?mp=host&name=…&srv=…` (a server in the list), `?mp=code&name=…` (a game by code), `?mp=join&code=…&name=…`.
 *
 * What goes over the net:
 *   'p'    — each player's pose ~15 times a second: place, turn, look, jump/crouch, both arms from his camera (the same directions the
 *            ArmSolver gave his own wizard) and the fingers of the free hand. Each friend is a whole wizard here (the same body, his own
 *            bones, cape and wand), moved by that pose — the arms exactly as his camera saw them, else the walking swing.
 *   'pigs' — the flying pigs: the host's pigs are the pigs (each guest's pig only follows the host's: one herd for all); the host's pigs
 *            are frightened by any player, not only by the host (the author's rule: the host is a player like the others).
 *   'tod'  — the time of day: the host's.
 * The world itself is the same for all without sending it: «Опушка» is made from fixed seeds.
 *
 * «А если»: a friend leaves / the line breaks — his wizard goes away (no ghost left standing); the host leaves — the guests are told and the
 * world stays (each can go back to the menu); a pose late or lost — the wizard goes on smoothly toward the last one, a long silence (3 s) —
 * he stands where he was; two friends with one name — the network numbers them («Игрок 2»); a guest's pig never decides anything itself.
 */
import { Network } from '../src/net/Network.js';

const SEND_DT = 1 / 15;      // a pose: 15 times a second (each ~0.3 KB)
const PIGS_DT = 0.2;         // the pigs: 5 times a second
const PIG_STATES = ['ground', 'fly', 'land', 'takeoff', 'ko'];
const r3 = (v) => Math.round(v * 1000) / 1000;
const r2 = (v) => Math.round(v * 100) / 100;

export class OpushkaNet {
    /**
     * @param {object} api the page's world: { THREE, scene, player(), arms (ZnsArms), rig() (my wizard), buildAvatar(), animateAvatar(rig, dt, speed, P),
     *   pigs, groundH(x, z), setTod(k), tod(), hud(text) }
     */
    constructor(api) {
        this.api = api;
        const q = new URLSearchParams(location.search);
        this.mode = q.get('mp') || '';           // '' — alone
        this.q = q;
        this.net = null;
        this.remotes = new Map();                // id → {name, rig|null, building, P, target, last, tag}
        this._sendT = 0; this._pigT = 0;
        this._others = [];
        this.status = '';
    }

    get on() { return !!this.net?.active; }

    /** Players other than me (for the pigs' fright): their places. */
    others() { return this._others; }

    async start() {
        if (!this.mode) return;
        const q = this.q, name = (q.get('name') || 'Игрок').slice(0, 16), server = q.get('server') || '';
        const net = this.net = new Network();
        net.on('message', (m) => this._message(m));
        net.on('peer-leave', ({ id }) => this._drop(id));
        net.on('players', (list) => { const ids = new Set((list || []).map((p) => p.id)); for (const id of [...this.remotes.keys()]) if (!ids.has(id)) this._drop(id); });
        net.on('peer-join', ({ id, name: who }) => {
            this._say(`🧙 Вошёл: ${who}`);
            // (a newcomer: this world is «Опушка» — a guest still in the game's menu goes there; the time of day, now)
            net.sendTo(id, { t: 'welcome', config: { mode: 'opushka' } });
            net.sendTo(id, { t: 'tod', k: this.api.tod() });
        });
        net.on('disconnected', ({ reason }) => { this._say('⚠️ ' + (reason || 'Связь потеряна') + ' — мир остаётся, можно вернуться в меню'); for (const id of [...this.remotes.keys()]) this._drop(id); });
        net.on('status', (t) => this._say('⚠️ ' + t));
        addEventListener('beforeunload', () => { try { net.sayGoodbye(); net.leave(); } catch (e) { /* ignore */ } });
        try {
            if (this.mode === 'join') {
                this._say('⏳ Подключаемся…');
                await net.join(String(q.get('code') || '').toUpperCase(), name, server);
                // (a guest starts a few steps from the host: not inside him)
                const P = this.api.player(), a = Math.random() * Math.PI * 2;
                P.pos.x += Math.cos(a) * 3; P.pos.z += Math.sin(a) * 3; P.pos.y = this.api.groundH(P.pos.x, P.pos.z);
                this._say('🟢 Вы в мире «Опушка» вместе с друзьями');
            } else {
                const code = await net.host(name, server, null, { slots: this.mode === 'host' });
                net.info = { name: (q.get('srv') || `Сервер ${name}`).slice(0, 24), mode: 'opushka', playing: true };
                this._say(this.mode === 'host' ? `🟢 Сервер «${net.info.name}» в списке у всех · код ${code}` : `🔑 Код вашей игры: ${code} — друг входит: «Мультиплеер» → «Войти по коду»`);
                this.code = code;
            }
        } catch (e) {
            this._say('❌ ' + (e?.message || e));
        }
    }

    /** The host changed the time of day: everybody's sky follows. */
    todChanged(k) { if (this.net?.isHost) this.net.send({ t: 'tod', k }); }

    _say(text) { this.status = text; this.api.hud(text); }

    /** Once a frame: send my pose (and the host — the pigs), move the friends' wizards. */
    update(dt) {
        const net = this.net;
        if (!net?.active) return;
        this._sendT -= dt;
        if (this._sendT <= 0) { this._sendT = SEND_DT; net.send(this._pose(), true); }
        if (net.isHost) {
            this._pigT -= dt;
            if (this._pigT <= 0) { this._pigT = PIGS_DT; net.send(this._pigs()); }
        }
        this._others.length = 0;
        const now = performance.now();
        for (const R of this.remotes.values()) {
            if (!R.target) continue;
            this._others.push(R.P.pos);
            if (!R.rig) continue;
            const T = R.target, P = R.P, k = 1 - Math.exp(-dt * 12), stale = now - R.last > 3000;
            if (!stale) { // (toward his newest place, carried on by his speed for the time it took to come)
                const lead = Math.min(0.15, (now - R.last) / 1000);
                P.pos.x += (T.x + T.vx * lead - P.pos.x) * k; P.pos.z += (T.z + T.vz * lead - P.pos.z) * k; P.pos.y += (T.y - P.pos.y) * k;
            }
            P.faceYaw += wrapA(T.fy - P.faceYaw) * k; P.yaw += wrapA(T.yaw - P.yaw) * k; P.pitch += (T.pitch - P.pitch) * k;
            P.vel.set(stale ? 0 : T.vx, 0, stale ? 0 : T.vz);
            const was = P.grounded;
            P.vy = T.vy; P.grounded = T.g; P.crouch = T.c; P.airStyle = T.leap ? 'leap' : 'tuck'; P.view = T.third ? 'third' : 'first'; P.landT = T.landT;
            if (!was && P.grounded) P.justLanded = Math.min(-2, T.vyWas || -4);
            const speed = Math.hypot(P.vel.x, P.vel.z);
            this.api.animateAvatar(R.rig, dt, speed, P);
            P.justLanded = 0;
            R.fall = (R.fall || 0) + (((R.st & 1) || (R.st & 8) ? 1 : 0) - (R.fall || 0)) * (1 - Math.exp(-dt * 5));
            R.rig.holder.rotation.order = 'YXZ'; R.rig.holder.rotation.x = -R.fall * Math.PI * 0.47;
            const hand = R.rig.fingers?.[R.rig.activeHand];
            if (hand?.wand) {
                hand.wand.visible = !(R.st & 4);
                hand.gripSaved ||= hand.grip;
                hand.grip = R.st & 20 ? null : hand.gripSaved;
                const stowed = !!(R.st & 16);
                if (stowed !== !!hand.stowed) {
                    hand.stowed = stowed;
                    hand.heldAt ||= { position: hand.wand.position.clone(), quaternion: hand.wand.quaternion.clone() };
                    if (stowed) {
                        R.rig.B.hips.add(hand.wand);
                        hand.wand.position.set(hand.s * -0.08, -0.26, 0.15);
                        hand.wand.rotation.set(-0.20, 0, hand.s * 0.25);
                    } else {
                        hand.hb.palm.add(hand.wand);
                        hand.wand.position.copy(hand.heldAt.position);
                        hand.wand.quaternion.copy(hand.heldAt.quaternion);
                    }
                }
            }
            this.spells?.friendIce(R, !!(R.st & 2));
            R.tag.position.set(P.pos.x, P.pos.y + 2.12, P.pos.z);
        }
    }

    /** My pose for the others. */
    _pose() {
        const P = this.api.player(), rig = this.api.rig(), Z = rig?.arms || this.api.arms; // (a raised arm to cast without the camera too)
        const arm = (K) => {
            const D = Z.dirs[K];
            if (!D.ok) return 0;
            const v = (x) => [r3(x.x), r3(x.y), r3(x.z)];
            // (the wand hand: its steadied aim and palm instead of the raw hand — the friend's wand points where it points here)
            const wa = K === rig?.activeHand && D.aim;
            return [...v(D.u), ...v(D.f), ...(D.hand || wa ? [...v(wa ? D.aim : D.h), ...v(wa ? (D.np || D.n) : D.n)] : [])];
        };
        const free = rig?.fingers?.[rig?.activeHand === 'L' ? 'R' : 'L'];
        const curl = free?.cur ? Array.from(free.cur, r2) : 0;
        const fl = (P.grounded ? 1 : 0) | (P.crouch ? 2 : 0) | (P.airStyle === 'leap' ? 4 : 0) | (P.view === 'third' ? 8 : 0);
        const look = this.api.look?.();
        const appearance = look ? [look.skin, look.hairColor, look.topColor, look.hair, look.face] : undefined;
        return { t: 'p', appearance, s: [r2(P.pos.x), r2(P.pos.y), r2(P.pos.z), r3(P.faceYaw), r3(P.yaw), r3(P.pitch), r2(P.vel.x), r2(P.vel.z), r2(P.vy), fl, r2(P.landT || 0), this.spells?.stateBits() || 0], a: [arm('L'), arm('R')], c: curl };
    }

    _pigs() {
        const a = [];
        for (const pg of this.api.pigs) a.push(r2(pg.pos.x), r2(pg.pos.y), r2(pg.pos.z), r3(pg.yaw), Math.max(0, PIG_STATES.indexOf(pg.state)), r2(pg.glide || 0), (pg.dead ? 1 : 0) | (pg.frozen > 0 ? 2 : 0));
        return { t: 'pigs', a };
    }

    _message(m) {
        const net = this.net;
        if (m.t === 'p' && m.from && m.from !== net.localId) { this._pose_in(m.from, m); return; }
        if (m.t === 'pigs' && net.isClient) {
            const pigs = this.api.pigs, a = m.a || [];
            for (let i = 0; i < pigs.length && i * 7 + 6 < a.length; i++) {
                const j = i * 7;
                pigs[i].net = { x: a[j], y: a[j + 1], z: a[j + 2], yaw: a[j + 3], st: PIG_STATES[a[j + 4]] || 'ground', gl: a[j + 5], f: a[j + 6] | 0 };
            }
            return;
        }
        if (m.t === 'tod' && net.isClient && m.k) { this.api.setTod(m.k); return; }
        // the spells: a friend's charge flies here too; a pig a guest's charge reached — the host decides; who fell to whom
        if (m.t === 'cast' && m.from !== net.localId) { this.spells?.netCast(m); return; }
        if (net.isClient && m.from === 'H' && m.t === 'opclash') { this.spells?.netClash(m); return; }
        if (net.isClient && m.from === 'H' && m.t === 'opimpact' && m.who === net.localId && Array.isArray(m.dir) && m.dir.every(Number.isFinite)) {
            this.spells?.hurtMe(m.spell, new this.api.THREE.Vector3(...m.dir), m.by);
            return;
        }
        if (m.t === 'died' && m.from !== net.localId) {
            const who = this.net.players.get(m.from)?.name || 'Игрок', by = m.by === net.localId ? 'вы' : m.by ? this.net.players.get(m.by)?.name : null;
            this._say(by ? `☠️ ${who} пал${by === 'вы' ? ' от вашего заклинания' : ' — ' + by}` : `☠️ ${who} пал`);
        }
    }

    _pose_in(id, m) {
        let R = this.remotes.get(id);
        if (!R) {
            const name = this.net.players.get(id)?.name || 'Игрок';
            const THREE = this.api.THREE;
            R = { name, rig: null, P: { pos: new THREE.Vector3(), vel: new THREE.Vector3(), faceYaw: 0, yaw: 0, pitch: 0, vy: 0, grounded: true, crouch: false, airStyle: 'tuck', view: 'first', landT: 0, justLanded: 0, jumpPrep: 0 },
                target: null, last: 0, tag: nameTag(THREE, name), arms: remoteArms() };
            this.api.scene.add(R.tag);
            this.remotes.set(id, R);
            const appearance = Array.isArray(m.appearance) ? m.appearance : [];
            const [skin, hairColor, topColor, hair, face] = appearance;
            this._build(id, R, (m.s?.[11] & 32) ? 'L' : 'R', { skin, hairColor, topColor, hair, face });
        }
        const s = m.s;
        if (!Array.isArray(s) || s.length < 11 || !s.slice(0, 9).every(Number.isFinite)) return;
        const T = R.target || (R.target = {});
        if (!R.last) R.P.pos.set(s[0], s[1], s[2]);
        T.vyWas = T.vy;
        T.x = s[0]; T.y = s[1]; T.z = s[2]; T.fy = s[3]; T.yaw = s[4]; T.pitch = s[5]; T.vx = s[6]; T.vz = s[7]; T.vy = s[8];
        R.st = s[11] | 0; R.dead = !!(R.st & 8);
        T.g = !!(s[9] & 1); T.c = !!(s[9] & 2); T.leap = !!(s[9] & 4); T.third = !!(s[9] & 8); T.landT = s[10] || 0;
        R.last = performance.now();
        // his arms (the directions his own camera gave) and the fingers of his free hand
        const A = R.arms.dirs;
        ['L', 'R'].forEach((K, i) => {
            const v = m.a?.[i], D = A[K];
            if (!Array.isArray(v) || v.length < 6 || !v.every(Number.isFinite)) { D.ok = false; return; }
            put(D.u, v, 0); put(D.f, v, 3); D.ok = true;
            D.hand = v.length >= 12; if (D.hand) { put(D.h, v, 6); put(D.n, v, 9); }
            if (K === ((R.st & 32) ? 'L' : 'R')) { if (D.hand) { D.aim = D.aim || new this.api.THREE.Vector3(); D.aim.set(D.h.x, D.h.y, D.h.z); D.np = D.n; } else D.aim = null; }
        });
        const free = A[(R.st & 32) ? 'R' : 'L'], c = m.c;
        if (Array.isArray(c) && c.length === 15 && c.every(Number.isFinite)) { free.curl ||= new Float32Array(15); free.curl.set(c); }
        else free.curl = null;
    }

    /** His wizard: the same body as mine (made once, copied — a moment), his own bones. */
    async _build(id, R, hand, look) {
        try {
            const rig = await this.api.buildAvatar(hand, look);
            if (this.remotes.get(id) !== R) { rig.holder.removeFromParent(); return; } // (he left while it was being made)
            rig.arms = R.arms;
            R.rig = rig;
        } catch (e) { console.warn('[Опушка] avatar', e); }
    }

    _drop(id) {
        const R = this.remotes.get(id);
        if (!R) return;
        this.remotes.delete(id);
        R.tag.removeFromParent(); R.tag.material.map?.dispose(); R.tag.material.dispose(); R.ice?.removeFromParent();
        if (R.rig) {
            R.rig.holder.removeFromParent();
            R.rig.holder.traverse((o) => { if (o.geometry && !o.geometry.userData?.shared) o.geometry.dispose(); });
        }
        this._say(`🚪 Вышел: ${R.name}`);
    }
}

function remoteArms() {
    const mk = () => ({ u: { x: 0, y: -1, z: 0 }, f: { x: 0, y: -1, z: 0 }, h: { x: 0, y: -1, z: 0 }, n: { x: 1, y: 0, z: 0 }, ok: false, hand: false, curl: null });
    return { dirs: { L: mk(), R: mk() }, solve() { /* (his own camera solved them on his computer) */ } };
}
function put(o, v, i) { const l = Math.hypot(v[i], v[i + 1], v[i + 2]) || 1; o.x = v[i] / l; o.y = v[i + 1] / l; o.z = v[i + 2] / l; }
function wrapA(a) { return a - Math.round(a / (Math.PI * 2)) * Math.PI * 2; }

/** A name over a friend's head: soft parchment letters with a dark edge, always readable, not lit by the scene. */
function nameTag(THREE, name) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 128;
    const x = c.getContext('2d');
    x.font = '600 56px Georgia, "Times New Roman", serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    const w = Math.min(500, x.measureText(name).width + 60);
    x.fillStyle = 'rgba(12,14,10,0.55)'; x.beginPath(); x.roundRect?.(256 - w / 2, 22, w, 84, 42); x.fill();
    x.lineWidth = 8; x.strokeStyle = 'rgba(0,0,0,0.6)'; x.strokeText(name, 256, 66);
    x.fillStyle = '#efe6cf'; x.fillText(name, 256, 66);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false }));
    s.scale.set(0.9, 0.225, 1); s.renderOrder = 10;
    return s;
}
