/**
 * GroundVortex.js — «Ground Vortex» (a scroll; held): the earth rises and circles round the hero. Rules, numbers and the
 * «who / what» table — GroundVortexRules.js (read its header first); the blocks are drawn by src/fx/GroundVortexFx.js.
 *
 *   «Ground Vortex»  the wand on the ground (≤ 16 m) + the words (20 mana, then 1 a second). Pointing at the ground lifts
 *                    blocks (2.5 a second), every turn of the hand more (a full turn ~10); they circle in a funnel round the hero.
 *   the hand         stops going round and points, calm → the vortex leaves the hero and follows the wand as a snake (a train).
 *   «Атака» / a sharp throw of the wand hand → the blocks fly where the wand points (a volley / a salvo of 12).
 *   «Shield»         the blocks close into a shield round the hero: a spell that would hit him hits the blocks facing it.
 *   the end          «стоп», no mana, death, a stun, the wand put away: the blocks fall and are laid back as blocks.
 *
 * Network ('gv'): the caster's computer owns the blocks (it takes them out of the ground and lays them back, as edits);
 * its state goes ~10×/s (+ the list of blocks when it changes); a volley / a shield blow / the end are events everybody replays.
 * Who decides a hit: a player's own computer (it knows its shield); the host — the other creatures.
 */

import * as THREE from 'three';
import { BLOCK, BASE_COLORS } from '../world/Terrain.js';
import { isEnchanted } from '../world/EnchantedStone.js';
import { SwingMeter } from './WaterVortex.js';
import { sharpJerk } from './Jerk.js';
import { castingHand } from './WandAim.js';
import { occupied } from './Stitching.js';
import { fallDir } from './Impact.js';
import { BlockSwarmFx, swarmColor } from '../fx/GroundVortexFx.js';
import * as R from './GroundVortexRules.js';

const { GV } = R;
const TAU = Math.PI * 2;
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const r2 = (v) => Math.round(v * 100) / 100;
const ease = (u) => u * u * (3 - 2 * u);
const ARRIVE = 0.8; // s a lifted block takes to fly from its hole into the funnel
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _ax = new THREE.Vector3();
const _o = {}, _t1 = {}, _t2 = {}, _cc = {};
const _col = new THREE.Color();

/** Which game mode counts as «free»: Creative and the test mode need no wand and pay no mana. */
const freeMode = (g) => g.config?.mode === 'creative' || g.config?.mode === 'test';

function newSwarm(by, mine) {
    return {
        by, mine, B: [], n: 0, angle: 0, spin: GV.SPIN_MIN, yaw: 0, yawT: 0, k: 0, tk: 0, rk: 0, rtk: 0, sk: 0, shield: false, cloud: new THREE.Vector3(), cloudInit: false,
        body: new THREE.Vector3(), head: new THREE.Vector3(), hist: [], spot: null, t: 0, at: 0, lush: false,
        tbody: new THREE.Vector3(), thead: new THREE.Vector3(),
    };
}

export class GroundVortex {
    constructor(game) {
        this.game = game;
        this.state = null; // my vortex (a swarm + my own fields)
        this.remote = new Map(); // by -> another player's swarm
        this.flights = []; // blocks thrown (everyone's)
        this.falls = []; // blocks falling after the end / a broken shield
        this.log = [];
        this.meter = new SwingMeter();
        this._t = 0;
        this._sendT = 0;
        this._sent = false;
        this._mDirty = true;
        this._edits = [];
        this._editT = 0;
        this._plan = [];
        this._planSpot = null;
        this._seq = 0;
        this._hitAt = new Map(); // victim key -> {t, n}
        this.fx = game.scene ? new BlockSwarmFx(game.scene) : null;
    }

    get me() { return this.game.localId; }
    get busy() { return !!this.state; }
    get shielding() { return !!(this.state && this.state.shield && this.state.sk > 0.6); }
    get data() { return this.game.terrain?.data || null; }

    _note(e) { this.log.push({ t: r2(this._t), ...e }); if (this.log.length > 60) this.log.shift(); }
    _hint(text, isFinal = true) { if (isFinal) this.game.hud?.setVoice?.(text, true); return null; }
    _send(m) { this.game.sync?.groundVortex?.(m); }

    // ================================================================ voice
    /** Voice words that belong here: undefined = not mine; else what castLocalSpell returns. */
    voice(name, text, isFinal = true) {
        if (name === GV.NAME) return this.cast(isFinal);
        if (name === GV.SHIELD_NAME) return this.sayShield(isFinal);
        if (name === 'Attack' && this.state) return this.attack(isFinal);
        return undefined;
    }

    _castSide() {
        const g = this.game;
        const w = g.items?.heldOf?.('wand');
        if (w) return w.side;
        if (!freeMode(g)) return null;
        const hand = castingHand(g);
        return hand ? hand.side : (g.magicHand || g.lastMagicHand || 'right');
    }

    _hand(side) {
        const g = this.game, ch = g.character;
        const o = g.castOrigin ? g.castOrigin(side, _a) : ch.getHandWorldPosition(side, _a);
        const d = ch.getPointingDirection ? ch.getPointingDirection(side, _b) : ch.getHandDirection(side, _b);
        return { o, d };
    }

    /** Where the wand shows ground: {x, y, z, L, dist} | null. */
    _aimSpot(side, out = {}) {
        const data = this.data;
        if (!data) return null;
        const { o, d } = this._hand(side);
        if (d.y > 0.45) return null; // (up in the sky)
        const hit = data.raycast(o, d, GV.REACH);
        if (!hit) return null;
        const x = Math.round(hit.x), z = Math.round(hit.z), L = Math.max(data.topLayer(x, z), Math.floor(hit.y + 1.5));
        if (data.landMade && !data.landMade(x, z)) return null;
        const me = this.game.character.group.position;
        out.x = x; out.y = hit.y; out.z = z; out.L = L; out.dist = Math.hypot(x - me.x, z - me.z);
        return out;
    }

    _skip() {
        const g = this.game, data = this.data;
        return (x, L, z) => !!(data?.godGiftAt?.(x, L, z) || g.wards?.forbids?.(this._hand(this._castSide() || 'right').o, _d.set(x, L - 1, z)) || g.ships?.footprintAt?.(x, L - 1, z) || occupied(g, { x, L: L + 1, z }));
    }

    cast(isFinal = true) {
        const g = this.game;
        if (this.state) return null; // (the interim and the final version of one phrase)
        if (g._inDuel?.()) return this._hint('⚡ Идёт дуэль — другие заклинания не работают', isFinal);
        const side = this._castSide();
        const spot = side ? this._aimSpot(side, {}) : null;
        const data = this.data;
        let why = R.castBlock({ side, spot, dist: spot?.dist, ward: !!(spot && g.wards?.forbids?.(this._hand(side).o, _c.set(spot.x, spot.L - 1, spot.z))), ship: !!(spot && g.ships?.footprintAt?.(spot.x, spot.L - 1, spot.z)) });
        if (!why && spot.dist < GV.NEAR) why = 'ground';
        if (!why && data) {
            const cells = R.digCells((x, L, z) => data.get(x, L, z), (x, z) => data.topLayer(x, z), spot, g.character.group.position, 1, this._skip());
            if (!cells.length) why = isEnchanted(data.get(spot.x, spot.L, spot.z)) || data.godGiftAt?.(spot.x, spot.L, spot.z) ? 'holy' : 'nothing';
        }
        if (why) return this._hint(R.hintFor(why), isFinal);
        const tired = g.combat.check(GV.NAME);
        if (tired) return this._hint(tired, true);
        g.combat.pay(GV.NAME);
        g._manaLater = true; // (mana: it counts at the first real lift)
        this.meter.reset();
        const s = this.state = Object.assign(newSwarm(this.me, true), {
            side, intent: new R.SwarmIntent(), headT: new THREE.Vector3(), jerk: [], acc: 0, idle: 0, life: 0, lifted: false, fire: null, spotAt: -9, alarmAt: -9, worked: false, power: g.wandMagic?.power?.(GV.NAME) || 1,
        });
        s.lush = !!data?.lush;
        s.body.copy(g.character.group.position); s.head.copy(s.body); s.headT.copy(s.body);
        this._plan.length = 0; this._planSpot = null;
        this._note({ ev: 'cast' });
        this._mDirty = true;
        g.hud?.setVoice?.('🌪️ Земля слушается… <b>показывайте палочкой на землю</b> и крутите рукой — блоки поднимаются и кружат. «Атака» — бросить, «Shield» — заслон, «стоп» — отпустить', true);
        g.noteCaster?.(GV.NAME, this.me);
        return GV.NAME;
    }

    sayShield(isFinal = true) {
        const s = this.state;
        if (!s) return this._hint('🌪️ «Shield» — когда уже кружит «Ground Vortex»', isFinal);
        if (s.shield) { s.shield = false; this._note({ ev: 'shield', on: false }); this._hint('🌪️ Заслон открыт — блоки снова кружат', isFinal); return GV.SHIELD_NAME; }
        if (s.n < GV.SHIELD_MIN) return this._hint(`🧱 Блоков мало (${s.n} из ${GV.SHIELD_MIN}) — поднимите ещё, потом «Shield»`, isFinal);
        s.shield = true; s.fire = null;
        this._note({ ev: 'shield', on: true });
        this._hint('🛡️ Блоки сомкнулись в заслон: заклинание попадёт в них, а не в вас. «Shield» ещё раз — открыть', isFinal);
        return GV.SHIELD_NAME;
    }

    attack(isFinal = true) {
        const s = this.state;
        if (!s || s.n < 1) return this._hint('🌪️ Блоков нет — нечем бросать', isFinal);
        s.shield = false;
        // the wand raised completely up (≥ 70°): the circular burst; else a volley the way the wand points
        if (R.isUpAttack(this._hand(s.side).d)) { this._burst(s); this._note({ ev: 'burst' }); return 'Attack'; }
        s.fire = { rest: 0 };
        this._note({ ev: 'attack' });
        return 'Attack';
    }

    /** «стоп» / the caster can't go on. */
    stop(why = 'stop') {
        const s = this.state;
        if (!s) return false;
        this.state = null;
        this._flushEdits(true);
        this._note({ ev: 'end', why });
        this._releaseAll(s, true);
        this._send({ ev: 'end', why });
        this._sent = false;
        const say = { mana: '🌪️ Мана кончилась — земля посыпалась вниз', wand: '🌪️ Палочка не в руке — земля посыпалась вниз', idle: '🌪️ Нечего держать — вихрь рассыпался', down: '' }[why];
        if (say) this.game.hud?.setVoice?.(say, true);
        return true;
    }

    // ================================================================ blocks
    _colors(t, x, L, z) {
        const data = this.data;
        const f = (top) => _col.setHex(data?.faceColor ? data.faceColor(t, x, L, z, top) : (BASE_COLORS[t] ?? 0x888888));
        const c1 = f(false), side = [c1.r, c1.g, c1.b];
        const c2 = f(true);
        return { side, top: [c2.r, c2.g, c2.b] };
    }

    _newBlock(sw, i, t, x, L, z, src) {
        const col = this._colors(t, x, L, z);
        const b = { t, cx: x, cy: L - 1, cz: z, side: col.side, top: col.top, born: this._t, src: src || null, i, pos: new THREE.Vector3(), fs: R.funnelSlot(i, {}), tm: R.tumbleOf(i, {}), spin: hashAng(i) };
        sw.B[i] = b;
        sw.n++;
        return b;
    }

    _freeIndex(sw) {
        for (let i = 0; i < sw.B.length; i++) if (!sw.B[i]) return i;
        return sw.B.length;
    }

    /**
     * Where the blocks of a swarm are this frame (writes b.pos): a cloud hanging where the wand shows; wound into the funnel round the
     * hero when his hand goes round (rk); stretched along the wand's trail as a train (k); and, over all that, the dome before him
     * (sk) — in the dome every block is in its own slot and nothing pushes it.
     */
    _place(sw, dt) {
        const t = this._t, n = sw.B.length;
        const k = ease(sw.k), rk = ease(sw.rk), sk = ease(sw.sk);
        const gy = this.game.collision?.groundY ? this.game.collision.groundY(sw.head.x, sw.head.z) : sw.body.y - 2;
        R.cloudCenter(sw.head, sw.body, sw.n, gy, _cc);
        if (!sw.cloudInit) { sw.cloud.set(_cc.x, _cc.y, _cc.z); sw.cloudInit = true; } else R.lagHead(sw.cloud, _cc, dt);
        const bx = sw.body.x, by = sw.body.y, bz = sw.body.z;
        let rank = 0; // (the dome's slots go to the blocks in order: a broken block's place is taken by the next — a far one comes in)
        const kd = 1 - Math.exp(-8 * dt);
        for (let i = 0; i < n; i++) {
            const b = sw.B[i];
            if (!b) continue;
            b.slot = rank++;
            const p = b.pos;
            // the cloud
            R.cloudSlot(i, _o);
            p.set(sw.cloud.x + _o.x, sw.cloud.y + _o.y + 0.1 * Math.sin(t * 1.7 + i * 2.3), sw.cloud.z + _o.z);
            // the funnel
            if (rk > 0.001) {
                R.ringOffset(i, sw.angle, t, _t1, b.fs);
                p.x += (bx + _t1.x - p.x) * rk; p.y += (by + _t1.y - p.y) * rk; p.z += (bz + _t1.z - p.z) * rk;
            }
            // the train
            if (k > 0.001) {
                const tau = i * GV.TRAIN_STEP;
                R.trailAt(sw.hist, t, tau, _t1); R.trailAt(sw.hist, t, tau + 0.07, _t2);
                _a.set(_t1.x - _t2.x, _t1.y - _t2.y, _t1.z - _t2.z);
                if (_a.lengthSq() < 1e-6) _a.set(0, 0, 1);
                _a.normalize();
                _b.crossVectors(_a, _ax.set(0, 1, 0));
                if (_b.lengthSq() < 1e-4) _b.set(1, 0, 0);
                _b.normalize();
                _c.crossVectors(_a, _b);
                const th = b.fs.ph + sw.angle * 1.3, rad = GV.TRAIN_R * (0.75 + 0.5 * R.hash2(i, 23)) * (0.6 + 0.4 * Math.min(1, i / 20));
                const tx = _t1.x + (_b.x * Math.cos(th) + _c.x * Math.sin(th)) * rad, ty = _t1.y + (_b.y * Math.cos(th) + _c.y * Math.sin(th)) * rad, tz = _t1.z + (_b.z * Math.cos(th) + _c.z * Math.sin(th)) * rad;
                p.x += (tx - p.x) * k; p.y += (ty - p.y) * k; p.z += (tz - p.z) * k;
            }
            // the dome (its slot), or far outside when it has none
            if (sk > 0.001) {
                if (!R.domeOffset(b.slot, sw.yaw, _t1)) R.farOffset(b.slot - R.DOME.length, sw.angle, t, _t1);
                p.x += (bx + _t1.x - p.x) * sk; p.y += (by + _t1.y - p.y) * sk; p.z += (bz + _t1.z - p.z) * sk;
                // (each block goes to its slot on a spring — no jump when a broken one's place is taken)
                if (!b.sp) b.sp = p.clone(); else b.sp.lerp(p, kd);
                p.copy(b.sp);
            } else b.sp = null;
            const u = (t - b.born) / ARRIVE;
            if (b.src && u < 1) {
                const e = ease(clamp(u, 0, 1));
                p.x = b.src.x + (p.x - b.src.x) * e; p.z = b.src.z + (p.z - b.src.z) * e;
                p.y = b.src.y + (p.y - b.src.y) * e + 2.5 * Math.sin(Math.PI * clamp(u, 0, 1));
            } else if (b.src) b.src = null;
        }
        // things do not overlap: nearer than SEP m are pushed apart (a grid, not every pair) — never in the dome (its slots are apart)
        if (sk < 0.001 && (rk > 0.001 || k > 0.001)) {
            const P = sw._P || (sw._P = []);
            P.length = n;
            for (let i = 0; i < n; i++) P[i] = sw.B[i] ? sw.B[i].pos : null;
            R.separate(P, GV.SEP, 2, this._cell || (this._cell = new Map()));
        }
    }

    // ================================================================ update
    update(dt) {
        if (!(dt > 0)) return;
        this._t += dt;
        if (this.state) this._updateMine(dt);
        for (const [by, sw] of this.remote) {
            if (this._t - sw.at > GV.STALE) { this._releaseAll(sw, false); this.remote.delete(by); continue; }
            this._updateRemote(sw, dt);
        }
        this._updateFlights(dt);
        this._updateFalls(dt);
        this._draw(dt);
    }

    _updateMine(dt) {
        const g = this.game, s = this.state, ch = g.character, c = g.combat;
        if (c?.dead || g.isDeadLocal || c?.frozen || c?.stunned) { this.stop('down'); return; }
        const side = this._castSide();
        if (!side) { this.stop('wand'); return; }
        s.side = side;
        if (c && !freeMode(g) && (c.drain(GV.DRAIN * dt, dt) === false || c.manaOut())) { this.stop('mana'); return; }
        s.life += dt; s.t = this._t;
        if (s.life > GV.MAX_LIFE) { this.stop('time'); return; }
        const body = ch.group.position;
        s.body.copy(body);
        const { o, d } = this._hand(side);
        const hand = ch.getHandWorldPosition(side, _c).sub(body);
        const turns = this.meter.push(this._t, hand);
        const sp = this.meter.speed;
        // the spot the wand shows (held for a moment: a hand going round loses the ground now and then)
        const spot = this._aimSpot(side, s._spotTmp || (s._spotTmp = {}));
        if (spot) { s.spot = s.spot || new THREE.Vector3(); s.spot.set(spot.x, spot.y, spot.z); s.spotL = spot.L; s.spotAt = this._t; }
        const pointing = this._t - s.spotAt < 1.5 && s.spot;
        // lifting
        if (pointing && !s.shield) {
            s.acc += GV.BASE * dt + turns * R.turnBlocks(sp);
            this._lift(s, dt);
        } else s.acc = Math.min(s.acc, 1);
        if (!s.n) { s.idle += dt; if (s.idle > GV.IDLE_END) { this.stop('idle'); return; } } else s.idle = 0;
        this._flushEdits(false, dt);
        // the funnel turns as fast as the hand
        const target = Math.max(GV.SPIN_MIN, this.meter.rate * TAU * 1.1);
        s.spin += (target - s.spin) * Math.min(1, dt * (1.2 + 2 * sp));
        s.angle += s.spin * dt;
        s.yawT = this._facing();
        s.yaw += wrapAng(s.yawT - s.yaw) * (1 - Math.exp(-GV.DOME_LAG * dt)); // (the dome turns with the hero, with a lag)
        // ring ↔ train, and the throw: only a clear intent of the hand switches them (SwarmIntent, the numbers — INTENT in ObjectSwarm)
        s.jerk.push({ t: this._t, x: hand.x, y: hand.y, z: hand.z });
        while (s.jerk.length && this._t - s.jerk[0].t > 0.5) s.jerk.shift();
        const salvo = s.intent.step(this._t, dt, this.meter.rate, sp, d, s.jerk, sharpJerk, !s.shield && s.n > 0);
        s.tk = (s.intent.train && !s.shield && s.n > 0) ? 1 : 0;
        s.rtk = (s.intent.ring && !s.shield && s.n > 0) ? 1 : 0; // (circling winds the cloud into the funnel; the shield wants neither)
        s.k = clamp(s.k + (s.tk - s.k) * Math.min(1, dt * GV.TRAIN_IN * 2), 0, 1);
        if (Math.abs(s.k - s.tk) < 0.02) s.k = s.tk;
        s.rk = clamp(s.rk + (s.rtk - s.rk) * Math.min(1, dt * GV.TRAIN_IN * 1.5), 0, 1);
        if (Math.abs(s.rk - s.rtk) < 0.02) s.rk = s.rtk;
        s.sk = clamp(s.sk + (s.shield ? 1 : -1) * GV.SHIELD_IN * dt, 0, 1);
        this._head(s, o, d, body);
        R.lagHead(s.head, s.headT, dt); // (the head follows the wand with a lag — the tail does not jump)
        R.trailPush(s.hist, this._t, s.head.x, s.head.y, s.head.z);
        if (salvo) this._volley(s, Math.min(GV.SALVO, s.n), d);
        // «Атака»: a stream of blocks where the wand points
        if (s.fire) {
            s.fire.rest += GV.VOLLEY * dt;
            const k = Math.min(Math.floor(s.fire.rest), s.n, 12);
            if (k >= 1 && (k >= 6 || s.fire.rest >= s.n)) { s.fire.rest -= k; this._volley(s, k, d); }
            if (!s.n) s.fire = null;
        }
        this._place(s, dt);
        // news
        this._sendT += dt;
        if (this._sendT >= GV.SEND) {
            this._sendT = 0;
            const flags = (s.shield ? 1 : 0) | (pointing ? 2 : 0) | (s.rtk ? 4 : 0);
            const msg = { ev: 'st', s: [r2(body.x), r2(body.y), r2(body.z), r2(s.head.x), r2(s.head.y), r2(s.head.z), r2(s.angle), r2(s.spin), r2(s.k), r2(s.sk), flags, r2(s.spot?.x || 0), r2(s.spot?.y || 0), r2(s.spot?.z || 0), s.n, r2(s.yaw)] };
            if (this._mDirty || this._t - (s.mAt || -9) > 2) { msg.m = this._rle(s); s.mAt = this._t; this._mDirty = false; }
            this._send(msg);
            this._sent = true;
        }
    }

    /** The way the hero faces (the view's horizontal direction): yaw ψ with forward = (sin ψ, cos ψ). */
    _facing() {
        const cam = this.game.camera;
        if (!cam?.getWorldDirection) return this.state ? this.state.yaw : 0;
        cam.getWorldDirection(_d);
        return Math.atan2(_d.x, _d.z);
    }

    /** Where the head of the train is: along the wand, short of what is in the way, not under the ground. */
    _head(s, o, d, body) {
        const data = this.data;
        let len = GV.TRAIN_REACH;
        if (data) {
            const hit = data.raycast(o, d, len);
            if (hit) len = Math.max(1.5, hit.dist - 1.2);
        }
        s.headT.set(o.x + d.x * len, o.y + d.y * len, o.z + d.z * len);
        const gy = this.game.collision?.groundY ? this.game.collision.groundY(s.headT.x, s.headT.z) : body.y - 2;
        if (s.headT.y < gy + 1.4) s.headT.y = gy + 1.4;
    }

    /** Take blocks out of the ground while `acc` has them. */
    _lift(s, dt) {
        const g = this.game, data = this.data;
        if (!data) return;
        let took = 0;
        const me = g.character.group.position;
        while (s.acc >= 1 && s.n < GV.MAX_BLOCKS && took < GV.TAKE_PER_FRAME) {
            if (!this._plan.length || !this._planSpot || Math.hypot(this._planSpot.x - s.spot.x, this._planSpot.z - s.spot.z) > 1.6) {
                this._planSpot = { x: Math.round(s.spot.x), z: Math.round(s.spot.z), L: s.spotL };
                this._plan = R.digCells((x, L, z) => data.get(x, L, z), (x, z) => data.topLayer(x, z), this._planSpot, me, 24, this._skip());
                if (!this._plan.length) { s.acc = 0; return; }
            }
            const [x, L, z, b] = this._plan.shift();
            if (!R.liftable(data.get(x, L, z))) continue;
            s.acc -= 1; took++;
            data.set(x, L, z, BLOCK.AIR);
            this._edits.push([x, L, z, BLOCK.AIR]);
            const i = this._freeIndex(s);
            this._newBlock(s, i, R.lifted(b), x, L, z, new THREE.Vector3(x, L - 1, z));
            this._mDirty = true;
            const fx = g.fx;
            if (fx) { _a.set(x, L - 0.5, z); fx.spark(_a, 0xc9b48a, 0.22, _b.set((Math.random() - 0.5) * 3, 1 + Math.random() * 2, (Math.random() - 0.5) * 3), 0.7); }
            s.lifted = true;
            if (!s.worked) { s.worked = true; g.mana?.success?.(GV.NAME); }
        }
        if (took && this._t - s.alarmAt > 4) { s.alarmAt = this._t; g.castleLife?.alarm?.({ x: s.spot.x, y: s.spot.y, z: s.spot.z }, 'uproot', this.me, 6); }
    }

    _flushEdits(force, dt = 0) {
        this._editT += dt;
        if (!this._edits.length || (!force && this._editT < GV.SEND_EDITS)) return;
        this._editT = 0;
        const g = this.game, data = this.data;
        const list = this._edits.splice(0);
        const water = data?._flood?.(list.filter((e) => e[3] === BLOCK.AIR).map((e) => ({ x: e[0], y: e[1] - 1, z: e[2] }))) || [];
        for (const [x, L, z] of water) list.push([x, L, z, BLOCK.WATER]);
        g.builder?._sendEdits(list, true); // (what the taken blocks held may come down — Structure / Collapse)
        const e = list[0];
        g.castleLife?.breakWays?.({ x: e[0], y: e[1], z: e[2] }, 8);
    }

    _rle(s) {
        const out = [];
        let last = -1, run = 0;
        for (let i = 0; i < s.B.length; i++) {
            const t = s.B[i] ? s.B[i].t : 0;
            if (t === last) run++; else { if (run) out.push(last, run); last = t; run = 1; }
        }
        if (run) out.push(last, run);
        return out;
    }

    // ================================================================ the volley and its flight
    /** Throw k blocks of swarm `sw` along d (the caster's computer; the others replay it). */
    _volley(sw, k, d) {
        if (!k) return;
        const ids = [];
        // (the blocks nearest to where the wand points go first)
        const cand = [];
        for (let i = 0; i < sw.B.length; i++) if (sw.B[i]) cand.push([i, sw.B[i].pos.distanceToSquared(_a.copy(sw.body).addScaledVector(d, 6))]);
        cand.sort((a, b) => a[1] - b[1]);
        for (let j = 0; j < Math.min(k, cand.length); j++) ids.push(cand[j][0]);
        const seed = ++this._seq * 977 + (this._t * 100 | 0);
        this._replayVolley(sw, ids, d, seed);
        this._mDirty = true;
        this._send({ ev: 'volley', ids, d: [r2(d.x), r2(d.y), r2(d.z)], seed });
        if (this.game.sound) this.game.sound.playStep?.();
        this.game.castleLife?.alarm?.({ x: sw.body.x, y: sw.body.y, z: sw.body.z }, 'uproot', this.me, 8);
    }

    /** The wand raised completely up + «Атак»: every block flies out of the hero in a ring (a circular burst; the hero himself is not hit). */
    _burst(sw) {
        const ids = [];
        for (let i = 0; i < sw.B.length; i++) if (sw.B[i]) ids.push(i);
        if (!ids.length) return;
        const seed = ++this._seq * 977 + (this._t * 100 | 0);
        this._replayBurst(sw, ids, seed);
        this._mDirty = true;
        this._send({ ev: 'burst', ids, seed });
        const g = this.game;
        g.sound?.playStep?.();
        if (g.fx) g.fx.shake = Math.max(g.fx.shake || 0, 0.5);
        g.castleLife?.alarm?.({ x: sw.body.x, y: sw.body.y, z: sw.body.z }, 'uproot', this.me, 14);
    }

    _replayBurst(sw, ids, seed) {
        ids.forEach((i, j) => {
            const b = sw.B[i];
            if (!b) return;
            R.burstVelocity(b.pos.x - sw.body.x, b.pos.z - sw.body.z, seed, j, _o);
            this.flights.push({ b, pos: b.pos.clone(), vel: new THREE.Vector3(_o.x, _o.y, _o.z), age: 0, by: sw.by, mine: sw.by === this.me, last: b.pos.clone(), spin: b.tm, burst: true });
            sw.B[i] = null; sw.n--;
        });
    }

    _replayVolley(sw, ids, d, seed) {
        const dir = _d.copy(d).normalize();
        ids.forEach((i, j) => {
            const b = sw.B[i];
            if (!b) return;
            R.salvoVelocity(dir, seed, j, _o);
            this.flights.push({ b, pos: b.pos.clone(), vel: new THREE.Vector3(_o.x, _o.y, _o.z), age: 0, by: sw.by, mine: sw.by === this.me, last: b.pos.clone(), spin: b.tm });
            sw.B[i] = null; sw.n--;
        });
    }

    _updateFlights(dt) {
        const g = this.game, data = this.data;
        for (let i = this.flights.length - 1; i >= 0; i--) {
            const f = this.flights[i];
            f.age += dt;
            f.last.copy(f.pos);
            f.vel.y -= GV.GRAV * dt;
            f.pos.addScaledVector(f.vel, dt);
            let end = null;
            if (f.age > GV.FLIGHT_LIFE) end = 'time';
            else if (data && data.isSolidAt?.(f.pos.x, f.pos.y, f.pos.z)) end = 'wall';
            else if (data && data.get(Math.round(f.pos.x), Math.floor(f.pos.y + 1.5), Math.round(f.pos.z)) === BLOCK.WATER) end = 'water';
            if (!end) end = this._flightHits(f);
            if (end) { this.flights.splice(i, 1); this._flightEnd(f, end); }
        }
    }

    /** Creatures and me against a flying block. Returns 'hit' when it is spent. */
    _flightHits(f) {
        const g = this.game, duel = g.duel;
        _c.copy(f.pos).add(f.last).multiplyScalar(0.5);
        // me: my computer knows my shield
        const c = g.combat;
        if (f.by !== this.me && c && !c.dead && !g.isDeadLocal) {
            const cp = c.center(_b);
            if (cp.distanceTo(f.pos) < 0.95 || cp.distanceTo(_c) < 0.95) {
                if (this._cool('me')) {
                    if (c.hitBySpell(GV.NAME, f.last, f.by, null) !== false) {
                        const n = this._recent('me');
                        if (n >= 3 && g.knock && !g.flight?.active) g.knock.knock({ dir: fallDir(f.vel.x, f.vel.z, g.character.group.rotation.y), down: 1.2, by: f.by, kind: 'GroundVortex', strength: 0.6 });
                    }
                }
                return 'hit';
            }
        }
        if (!g.authority || !duel) return null;
        for (const b of duel._bodies(null)) {
            if (b.kind === 'p' || b.kind === 'b' || b.kind === 't' || b.kind === 'f' || b.kind === 'o' || b.kind === 'G') continue; // (a ghost: the blocks fly through it)
            if (b.kind === 'D') { if (this._near(b, f, _c)) { g.dragons?.hit?.(duel._creature('D', b.id), 0, GV.NAME, f.by); return 'hit'; } continue; }
            if (!this._near(b, f, _c)) continue;
            const key = b.kind + ':' + b.id;
            if (this._cool(key)) this._hitBody(b, f);
            return 'hit';
        }
        return null;
    }

    _near(b, f, mid) {
        const R2 = (b.r + GV.BODY_R) ** 2;
        return segDistSq(f.pos, b.a, b.b) < R2 || segDistSq(mid, b.a, b.b) < R2;
    }

    _cool(key) {
        const e = this._hitAt.get(key);
        if (e && this._t - e.t < GV.HIT_EVERY) return false;
        const n = e && this._t - e.t < GV.KNOCK_WINDOW ? e.n + 1 : 1;
        this._hitAt.set(key, { t: this._t, n });
        if (this._hitAt.size > 64) for (const [k, v] of this._hitAt) if (this._t - v.t > 3) this._hitAt.delete(k);
        return true;
    }
    _recent(key) { return this._hitAt.get(key)?.n || 1; }

    _hitBody(b, f) {
        const g = this.game, by = f.by, dmg = GV.BLOCK_DMG;
        const dir = _a.copy(f.vel).setY(0);
        if (dir.lengthSq() < 1e-4) dir.set(0, 0, 1);
        dir.normalize();
        const n = this._recent(b.kind + ':' + b.id);
        const push = { volume: GV.PUSH * Math.min(3, n), power: 1, dir: dir.clone(), by };
        this._note({ ev: 'hit', kind: b.kind, id: b.id, n });
        if (b.kind === 'z') {
            const z = g.zombieById?.get(b.id);
            if (z && !z.isDead) { z.damageCooldown = 0; g.damageZombie(z, dmg, false, dir, by); g.vortex?._push?.(push, 'z', b.id); }
            return;
        }
        const cr = g.duel._creature(b.kind, b.id);
        if (!cr) return;
        if (b.kind === 'a') { g.animals?.hit?.(cr, dmg, null, by); g.vortex?._push?.(push, 'a', b.id); }
        else if (b.kind === 'v') { g.castleLife?.hit?.(cr, dmg, null, by, { spell: true }); g.vortex?._push?.(push, 'v', b.id); }
        else if (b.kind === 'c') g.ships?.crew?.hit?.(cr, dmg, null, by, { spell: true, kind: 'thrown' });
        else if (b.kind === 's') g.spiders?.hit?.(cr, dmg, 'thrown', by);
        else if (b.kind === 'I') g.iceCastle?.hit?.(cr, dmg, 'thrown', by);
    }

    /** A thrown block stops: laid back where it stopped (the caster's computer) or crumbled. */
    _flightEnd(f, why) {
        const g = this.game, data = this.data;
        if (g.fx) for (let k = 0; k < 5; k++) g.fx.spark(f.pos, 0xb9a98a, 0.16, _b.set((Math.random() - 0.5) * 5, Math.random() * 3, (Math.random() - 0.5) * 5), 0.6);
        if (why !== 'wall' && why !== 'time') return; // (a creature, the water: it crumbles)
        if (!f.mine || !data || Math.random() < 0.3) return;
        const x = Math.round(f.last.x), z = Math.round(f.last.z), L = Math.floor(f.last.y + 1.5);
        this._lay(x, L, z, f.b.t);
    }

    /** Lay a block back into the world (the caster's computer). true if it was laid. */
    _lay(x, L, z, t) {
        const g = this.game, data = this.data;
        if (!data || data.get(x, L, z) !== BLOCK.AIR) return false;
        if (data.godGiftAt?.(x, L, z) || g.wards?.forbids?.(g.character.group.position, _d.set(x, L - 1, z)) || g.ships?.footprintAt?.(x, L - 1, z) || occupied(g, { x, L, z })) return false;
        const under = data.get(x, L - 1, z);
        if (under === BLOCK.AIR && data.get(x + 1, L, z) === BLOCK.AIR && data.get(x - 1, L, z) === BLOCK.AIR && data.get(x, L, z + 1) === BLOCK.AIR && data.get(x, L, z - 1) === BLOCK.AIR) return false; // (nothing hangs in the air)
        data.set(x, L, z, t);
        g.builder?._sendEdits([[x, L, z, t]]);
        return true;
    }

    // ================================================================ falls
    /** The swarm ends (or is gone): every block falls. `mine` — lays them back as blocks. */
    _releaseAll(sw, mine, scatter = false) {
        for (let i = 0; i < sw.B.length; i++) {
            const b = sw.B[i];
            if (!b) continue;
            const out = _a.set(b.pos.x - sw.body.x, 0, b.pos.z - sw.body.z);
            const L = out.length() || 1;
            out.divideScalar(L);
            const v = new THREE.Vector3(out.x * (2 + Math.random() * 2 + (scatter ? 5 : 0)) - out.z * sw.spin * 0.6, 1.5 + Math.random() * 2 + (scatter ? 3 : 0), out.z * (2 + Math.random() * 2 + (scatter ? 5 : 0)) + out.x * sw.spin * 0.6);
            this.falls.push({ b, pos: b.pos.clone(), vel: v, mine, crumble: scatter, age: 0 });
            sw.B[i] = null;
        }
        sw.n = 0;
        if (mine) this._mDirty = true;
    }

    _updateFalls(dt) {
        const g = this.game, data = this.data;
        let laid = 0;
        for (let i = this.falls.length - 1; i >= 0; i--) {
            const f = this.falls[i];
            f.age += dt;
            f.vel.y -= GV.FALL_G * dt;
            f.pos.addScaledVector(f.vel, dt);
            const gy = g.collision?.groundY ? g.collision.groundY(f.pos.x, f.pos.z) : -1e9;
            if (f.pos.y - 0.5 > gy && f.age < 6) continue;
            // (a dozen laid this frame already: this one waits on the ground for the next — it was lost before)
            if (f.mine && !f.crumble && data && laid >= 12) { f.vel.set(0, 0, 0); f.pos.y = Math.max(f.pos.y, gy + 0.5); continue; }
            this.falls.splice(i, 1);
            if (g.fx) for (let k = 0; k < 3; k++) g.fx.spark(f.pos, 0xb9a98a, 0.15, _b.set((Math.random() - 0.5) * 4, Math.random() * 2, (Math.random() - 0.5) * 4), 0.5);
            if (f.mine && !f.crumble && data && laid++ < 12) {
                const cell = R.landingCell((x, L, z) => data.get(x, L, z), (x, z) => data.topLayer(x, z), f.pos.x, f.pos.z);
                if (cell) this._lay(cell[0], cell[1], cell[2], f.b.t);
            }
        }
    }

    /** Saving / leaving: every block of mine goes back into the ground at once (nothing is lost). */
    returnAll() {
        const g = this.game, data = this.data;
        const s = this.state;
        const mine = [];
        if (s) { for (const b of s.B) if (b) mine.push(b.t); s.B.length = 0; s.n = 0; this.state = null; this._send({ ev: 'end', why: 'save' }); }
        for (const f of this.flights) if (f.mine) mine.push(f.b.t);
        for (const f of this.falls) if (f.mine && !f.crumble) mine.push(f.b.t);
        this.flights.length = 0; this.falls.length = 0;
        this._flushEdits(true);
        if (!data || !mine.length) return 0;
        const p = g.character.group.position;
        const cells = R.spiralCells((x, L, z) => data.get(x, L, z), (x, z) => data.topLayer(x, z), p.x, p.z, mine.length, (x, L, z) => !!(data.godGiftAt?.(x, L, z) || g.ships?.footprintAt?.(x, L - 1, z)));
        const edits = [];
        cells.forEach((c, i) => { data.set(c[0], c[1], c[2], mine[i]); edits.push([c[0], c[1], c[2], mine[i]]); });
        if (edits.length) g.builder?._sendEdits(edits);
        this._note({ ev: 'returned', n: edits.length, of: mine.length });
        return edits.length;
    }

    /**
     * (host) A player left holding blocks (closed the window, lost the link): only their computer would have laid
     * them back — the host puts them into the ground where the swarm was (as returnAll), else the holes stay for good.
     * (Only on leaving: a swarm gone quiet for a moment (GV.STALE) may still be held — laying it would double it.)
     */
    onLeave(id) {
        const sw = this.remote.get(id);
        if (!sw) return 0;
        this.remote.delete(id);
        const g = this.game, data = this.data;
        if (!g.authority || !data) { this._releaseAll(sw, false); return 0; }
        const types = [];
        for (const b of sw.B) if (b) types.push(b.t);
        sw.B.length = 0; sw.n = 0;
        if (!types.length) return 0;
        const cells = R.spiralCells((x, L, z) => data.get(x, L, z), (x, z) => data.topLayer(x, z), sw.body.x, sw.body.z, types.length, (x, L, z) => !!(data.godGiftAt?.(x, L, z) || g.ships?.footprintAt?.(x, L - 1, z)));
        const edits = [];
        cells.forEach((c, i) => { data.set(c[0], c[1], c[2], types[i]); edits.push([c[0], c[1], c[2], types[i]]); });
        if (edits.length) g.builder?._sendEdits(edits);
        this._note({ ev: 'returned', n: edits.length, of: types.length, left: id });
        return edits.length;
    }

    // ================================================================ the shield
    /** The bearing (rad) from the hero to a point. */
    _bearing(from) {
        const p = this.game.character.group.position;
        return Math.atan2(from.z - p.z, from.x - p.x);
    }
    /** The indices of the live blocks in order: slot k of the dome belongs to block list[k]. */
    _slots(s) { const out = []; for (let i = 0; i < s.B.length; i++) if (s.B[i]) out.push(i); return out; }

    /** Does the shield stand between the hero and `from`? (Combat.shieldFactor asks) */
    covers(from) {
        const s = this.state;
        if (!s || !s.shield || s.sk < 0.6 || s.n < 1) return false;
        return R.domeCovers(this._slots(s).length, () => true, s.yaw, this._bearing(from));
    }

    /**
     * A spell of `kind` from `from` strikes the shield (Combat._blocked): the blocks facing it break. → true: held; false: it goes on.
     * The gods' spells sweep the whole shield away and go on.
     */
    take(from, kind, power = 1) {
        const s = this.state;
        if (!s) return false;
        const g = this.game;
        if (R.sweepsShield(kind)) {
            s.shield = false; s.sk = 0;
            this._releaseAll(s, true, true);
            this._mDirty = true;
            this._send({ ev: 'sweep' });
            g.hud?.setVoice?.('💥 Заслон из земли разметало!', true);
            this._stopSoon = true;
            return false;
        }
        const want = Math.max(0, Math.round(R.hitBlocks(kind) * power));
        const list = this._slots(s);
        const ids = R.domeBreak(list.length, () => true, s.yaw, this._bearing(from), want).map((k) => list[k]);
        this._breakBlocks(s, ids, true);
        this._send({ ev: 'hit', ids });
        g.hud?.setVoice?.(`🛡️ Заслон принял удар: −${ids.length} блоков`, true);
        if (s.n < GV.SHIELD_MIN) { s.shield = false; g.hud?.setVoice?.('🌪️ Блоков осталось мало — заслон открылся', true); }
        return true;
    }

    _breakBlocks(sw, ids, mine) {
        const g = this.game;
        for (const i of ids) {
            const b = sw.B[i];
            if (!b) continue;
            const out = _a.set(b.pos.x - sw.body.x, 0.5, b.pos.z - sw.body.z).normalize();
            this.falls.push({ b, pos: b.pos.clone(), vel: new THREE.Vector3(out.x * 6, 3, out.z * 6), mine, crumble: true, age: 0 });
            if (g.fx) for (let k = 0; k < 3; k++) g.fx.spark(b.pos, 0xd8c8a0, 0.2, _b.set(out.x * 4 + (Math.random() - 0.5) * 3, 2 + Math.random() * 2, out.z * 4 + (Math.random() - 0.5) * 3), 0.6);
            sw.B[i] = null; sw.n--;
        }
        if (mine) this._mDirty = true;
        if (g.sound && ids.length) g.sound.playHit?.();
    }

    // ================================================================ network
    onNet(m) {
        if (!m || !m.by || m.by === this.me) return;
        let sw = this.remote.get(m.by);
        if (m.ev === 'end') { if (sw) { this._releaseAll(sw, false); this.remote.delete(m.by); } return; }
        if (m.ev === 'st') {
            const s = m.s;
            if (!Array.isArray(s) || s.length < 16 || !s.every(Number.isFinite)) return;
            if (!sw) {
                if (this.remote.size >= 3) return;
                sw = newSwarm(m.by, false);
                sw.body.set(s[0], s[1], s[2]); sw.head.set(s[3], s[4], s[5]);
                this.remote.set(m.by, sw);
            }
            sw.tbody.set(s[0], s[1], s[2]); sw.thead.set(s[3], s[4], s[5]);
            if (Math.abs(s[6] - sw.angle) > 1.5) sw.angle = s[6];
            sw.spin = clamp(s[7], 0, 40); sw.tk = clamp(s[8], 0, 1); sw.shield = !!(s[10] & 1);
            sw.spotOn = !!(s[10] & 2);
            sw.spot = sw.spot || new THREE.Vector3(); sw.spot.set(s[11], s[12], s[13]);
            sw.yawT = s[15]; sw.rtk = (s[10] & 4) ? 1 : 0;
            if (!sw.yawSeen) { sw.yaw = s[15]; sw.yawSeen = true; }
            sw.at = this._t;
            if (Array.isArray(m.m)) this._applyRle(sw, m.m);
            return;
        }
        if (!sw) return;
        if (m.ev === 'volley' && Array.isArray(m.ids) && Array.isArray(m.d)) this._replayVolley(sw, m.ids.filter(Number.isInteger).slice(0, 40), _d.set(+m.d[0] || 0, +m.d[1] || 0, +m.d[2] || 1), m.seed | 0);
        else if (m.ev === 'burst' && Array.isArray(m.ids)) this._replayBurst(sw, m.ids.filter(Number.isInteger).slice(0, GV.MAX_BLOCKS + 8), m.seed | 0);
        else if (m.ev === 'hit' && Array.isArray(m.ids)) this._breakBlocks(sw, m.ids.filter(Number.isInteger).slice(0, 40), false);
        else if (m.ev === 'sweep') { sw.shield = false; sw.sk = 0; this._releaseAll(sw, false, true); }
    }

    _applyRle(sw, m) {
        let i = 0;
        const types = [];
        for (let j = 0; j + 1 < m.length && types.length < GV.MAX_BLOCKS + 8; j += 2) { for (let r = 0; r < (m[j + 1] | 0); r++) types.push(m[j] | 0); }
        const data = this.data;
        sw.lush = !!data?.lush;
        for (i = 0; i < types.length; i++) {
            const t = types[i], b = sw.B[i];
            if (!t) { if (b) { sw.B[i] = null; sw.n--; } continue; }
            if (b && b.t === t) continue;
            if (b) { sw.B[i] = null; sw.n--; }
            const src = sw.spot ? sw.spot.clone() : null;
            const nb = this._newBlock(sw, i, t, i * 7, i * 3, i * 5, src);
            swarmColor(t, i, false, _col); nb.side = [_col.r, _col.g, _col.b];
            swarmColor(t, i, true, _col); nb.top = [_col.r, _col.g, _col.b];
            nb.cx = i * 3; nb.cy = i; nb.cz = i * 5; // (the pattern's anchor: any cell will do)
        }
        for (let j = types.length; j < sw.B.length; j++) if (sw.B[j]) { sw.B[j] = null; sw.n--; }
    }

    _updateRemote(sw, dt) {
        const q = 1 - Math.exp(-dt * 8);
        sw.body.lerp(sw.tbody, q); sw.head.lerp(sw.thead, q);
        sw.angle += sw.spin * dt;
        sw.k += (sw.tk - sw.k) * Math.min(1, dt * GV.TRAIN_IN * 2);
        sw.rk += (sw.rtk - sw.rk) * Math.min(1, dt * GV.TRAIN_IN * 1.5);
        sw.yaw += wrapAng(sw.yawT - sw.yaw) * (1 - Math.exp(-GV.DOME_LAG * dt));
        sw.sk = clamp(sw.sk + (sw.shield ? 1 : -1) * GV.SHIELD_IN * dt, 0, 1);
        const av = this.game.remotes?.get(sw.by);
        if (av?.position) { sw.tbody.copy(av.position); }
        R.trailPush(sw.hist, this._t, sw.head.x, sw.head.y, sw.head.z);
        this._place(sw, dt);
    }

    // ================================================================ drawing
    _draw(dt) {
        const fx = this.fx;
        if (!fx) return;
        fx.begin(this.data?.lush);
        const put = (b, p, spinT, scale, sw = null) => {
            // the cloud turns about the vertical axis only (neighbours never touch); wound into the funnel / the train a block tumbles
            const tum = sw ? Math.max(ease(sw.rk), ease(sw.k)) : 1;
            _ax.set(0, 1, 0);
            _q.setFromAxisAngle(_ax, b.tm.w * 0.3 * spinT);
            if (tum > 0.001) { _ax.set(b.tm.ax, b.tm.ay, b.tm.az); _q2.setFromAxisAngle(_ax, b.tm.w * spinT); _q.slerp(_q2, tum); }
            const sk = sw ? ease(sw.sk) : 0;
            if (sk > 0.001 && b.slot != null && b.slot < R.DOME.length) {
                // in the dome a block is a whole cube turned along the surface (no tumble, full size): they do not touch
                _q.slerp(domeQuaternion(b.slot, sw.yaw, _q2), sk);
                scale += (1 - scale) * sk;
            }
            fx.add(b, p, _q, scale);
        };
        const t = this._t;
        if (this.state) for (const b of this.state.B) if (b) put(b, b.pos, t, b.tm.s, this.state);
        for (const sw of this.remote.values()) for (const b of sw.B) if (b) put(b, b.pos, t, b.tm.s, sw);
        for (const f of this.flights) put(f.b, f.pos, t + f.age * 2, 0.96);
        for (const f of this.falls) put(f.b, f.pos, t + f.age * 3, f.b.tm.s);
        fx.end();
        // dust off the funnel
        const g = this.game;
        if (g.fx && this.state && this.state.n > 4 && Math.random() < 0.5) {
            const s = this.state, b = s.B.find((x, i) => x && i === ((Math.random() * s.B.length) | 0));
            if (b) g.fx.spark(b.pos, 0xb9a98a, 0.12, _b.set(-Math.sin(s.angle) * 2, 0.3, Math.cos(s.angle) * 2), 0.5);
        }
    }

    /** For Game.prewarm: the blocks' shader is made on the loading screen. */
    sampleModels() { return this.fx ? [this.fx.sample()] : []; }

    clear() {
        this.returnAll();
        this.remote.clear();
    }

    dispose() {
        this.clear();
        this.fx?.dispose();
    }
}

const wrapAng = (a) => ((a + Math.PI) % TAU + TAU) % TAU - Math.PI;

/** The quaternion of dome cube i: turned along the surface (yaw about the vertical, then the slope). Drawn and tested the same. */
export function domeQuaternion(i, yaw, out = new THREE.Quaternion()) {
    const a = R.domeAngles(i, yaw, {});
    return out.setFromEuler(_eu.set(-a.pitch, a.yaw, 0, 'YXZ'));
}
const _eu = new THREE.Euler();

function hashAng(i) { return R.hash2(i, 29) * TAU; }

/** Squared distance from p to the segment a–b. */
function segDistSq(p, a, b) {
    const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z;
    const L = abx * abx + aby * aby + abz * abz;
    const k = L > 1e-9 ? clamp(((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / L, 0, 1) : 0;
    const dx = a.x + abx * k - p.x, dy = a.y + aby * k - p.y, dz = a.z + abz * k - p.z;
    return dx * dx + dy * dy + dz * dz;
}
