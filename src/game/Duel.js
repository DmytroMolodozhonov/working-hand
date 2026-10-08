/**
 * Duel.js — duel magic: spells cast straight at a creature (a wizard or a zombie).
 *
 *   Остолбеней (Stupefy)      the target can't move or cast for 15 s
 *   Авада Кедавра             instant death (green)
 *   Айс on a wizard           freezes them (20 s, any hit shatters)
 *   Вингардиум Левиоса        on a creature: throws it up into the air
 *   Сапира                    a slow, heavy violet charge: 4 HP to a wizard, 10 to a zombie
 *
 * A duel spell is not an instant beam: a crackling, jagged charge flies from
 * the hand to the target (fast, ~0.7 s over 10 m) and acts only when
 * it touches. Until then the target can:
 *   - raise a shield («Protection») — the charge bursts on it, or
 *   - answer with any duel spell aimed back: the two charges meet and push
 *     against each other. The meeting point slides towards the weaker wizard;
 *     who it reaches loses and gets the other's spell. Strength: fatigue
 *     first, then HP, plus ~10 % luck. Both must keep the hand on the
 *     opponent — a hand taken off stops pushing (the point creeps to you).
 *     To leave safely: first move the hand calmly off the opponent, THEN
 *     flick it (shake the spell off) — the duel ends, nobody is hit.
 *     A flick while still aiming at the opponent (or at yourself) = giving
 *     up: the opponent's spell hits you.
 *
 * Network: the caster announces a charge ('duel'); the target's own computer
 * decides a hit on a wizard (it knows its shield), the host decides zombies
 * and referees duels ('clash' / 'clashend').
 */

import * as THREE from 'three';
import { SegmentPool } from '../fx/Particles.js';
import { PVP } from './Combat.js';

export const DUEL_SPELLS = {
    Stupefy: { color: 0xff3b3b, name: 'Остолбеней' },
    AvadaKedavra: { color: 0x2dff5a, name: 'Авада Кедавра' },
    IceDuel: { color: 0x8fdcff, name: 'Айс' },
    LevitateDuel: { color: 0xffd36e, name: 'Вингардиум Левиоса' },
    // Slower and thicker: a dark-violet ball of force rolling through the air
    SapiraDuel: { color: 0x8e2de2, name: 'Сапира', speed: 7, core: 0.09, glow: 0.42, coreColor: 0xe6c8ff },
};

export const DUEL = {
    SPEED: 15, // m/s — fast (≈0.7 s over 10 m), but still visible and answerable
    RANGE: 30, // m
    CONE: 0.4, // rad: what the hand is pointing at
    HIT_RADIUS: 0.8,
    CONTACT_ANGLE: 0.75, // rad: hand still on the opponent
    CONTACT_GRACE: 0.25, // s off the opponent before a flick counts as "shaking it off"
    PUSH: 0.16, // how fast the meeting point moves per unit of strength difference
    LUCK: 0.1, // ±10 % random
    STUN_TIME: 15,
    CLASH_FATIGUE: 1.5, // fatigue per second while pushing (free world)
};

const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _c2 = new THREE.Color();
const _da = new THREE.Vector3(), _db = new THREE.Vector3(), _dd = new THREE.Vector3(), _ds = new THREE.Vector3(), _du = new THREE.Vector3();

let nextId = 1;

export class Duel {
    constructor(game) {
        this.game = game;
        this.bolts = new Map(); // id -> bolt
        this.clashes = []; // {a, b, p, ...}
        this._t = 0;
        // Crackling charges: a thin bright core + a soft glow, one pair per spell AND
        // wizard: the same spell looks a bit different for each player (own shade and
        // core colour), so two charges pushing against each other stay apart
        this.pools = {};
        for (const key of Object.keys(DUEL_SPELLS)) this._pool(key, 0);
        // Glowing "centre of force" where two charges meet
        this._orbs = [];
        this._orbsUsed = 0;
        this.jerk = { left: [], right: [] }; // hand history for "giving up"
        this.log = []; // last duel events (for testing / debugging)
    }

    /** 0..3: this wizard's colour signature (same on every computer). */
    _slot(by) {
        const p = this.game.net?.players?.get?.(by);
        if (p && Number.isFinite(p.color)) return p.color % 4;
        let h = 0;
        for (const ch of String(by)) h = (h * 31 + ch.charCodeAt(0)) | 0;
        return Math.abs(h) % 4;
    }

    /** Colours of `spell` cast by wizard `by`: {glow, core}. */
    colors(spell, by) {
        const slot = typeof by === 'number' ? by : this._slot(by);
        const s = DUEL_SPELLS[spell];
        const shift = [0, 0.085, -0.085, 0.17][slot];
        const glow = new THREE.Color(s.color).offsetHSL(shift, 0, slot ? 0.04 : 0).getHex();
        const core = slot === 0 ? (s.coreColor || 0xffffff) : [0xffffff, 0xfff08a, 0x9ff3ff, 0xffb3ec][slot];
        return { glow, core };
    }

    _pool(spell, by) {
        const slot = typeof by === 'number' ? by : this._slot(by);
        const key = spell + '|' + slot;
        if (!this.pools[key]) {
            const s = DUEL_SPELLS[spell];
            const c = this.colors(spell, slot);
            this.pools[key] = {
                core: new SegmentPool(this.game.scene, { capacity: 200, radius: s.core || 0.055, color: c.core, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending }),
                glow: new SegmentPool(this.game.scene, { capacity: 200, radius: s.glow || 0.24, color: c.glow, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending }),
            };
        }
        return this.pools[key];
    }

    get me() {
        return this.game.localId;
    }

    // ============================================================ targets
    /** Creatures the hand points at: wizards (other players) and zombies. */
    findTarget(side) {
        const g = this.game;
        const ch = g.character;
        const hand = ch.getHandWorldPosition(side, new THREE.Vector3());
        const dir = ch.getHandDirection(side, new THREE.Vector3());
        let best = null;
        const consider = (kind, id, pos) => {
            const to = _v1.subVectors(pos, hand);
            const d = to.length();
            if (d > DUEL.RANGE || d < 0.5) return;
            const ang = dir.angleTo(to.normalize());
            if (ang > DUEL.CONE) return;
            const score = ang * 8 + d * 0.05;
            if (!best || score < best.score) best = { kind, id, score, dist: d };
        };
        for (const [id, r] of g.remotes) if (!r.dead) consider('p', id, r.position.clone().add(_v2.set(0, 0.6, 0)));
        for (const z of g.zombies) if (!z.isDead) consider('z', z.id, z.group.position.clone().add(_v2.set(0, 1.0, 0)));
        return best;
    }

    /** Which hand casts: the one pointing at a creature (or the spell hand). */
    pickSide(preferPlayers = false) {
        let best = null;
        for (const side of ['right', 'left']) {
            const t = this.findTarget(side);
            if (!t || (preferPlayers && t.kind !== 'p')) continue;
            if (!best || t.score < best.t.score) best = { side, t };
        }
        return best;
    }

    _targetPos(b, out) {
        const g = this.game;
        if (b.tk === 'p') {
            if (b.tid === this.me) return g.combat.center(out);
            const r = g.remotes.get(b.tid);
            return r ? out.copy(r.position).add(_v2.set(0, 0.6, 0)) : null;
        }
        if (b.tk === 'z') {
            const z = g.zombieById.get(b.tid);
            return z && !z.isDead ? out.copy(z.group.position).add(_v2.set(0, 1.0, 0)) : null;
        }
        return null;
    }

    _handOf(by, side, outPos, outDir) {
        const g = this.game;
        if (by === this.me) {
            g.character.getHandWorldPosition(side, outPos);
            g.character.getHandDirection(side, outDir);
            return true;
        }
        const r = g.remotes.get(by);
        if (!r) return false;
        const hp = r.handPose(side);
        outPos.copy(hp.origin);
        outDir.copy(hp.dir);
        return true;
    }

    // =============================================================== cast
    /**
     * Cast a duel spell from my hand.
     * @param {string} spell  key of DUEL_SPELLS
     * @param {object} [aim] {side, t} from pickSide (else: straight ahead from the spell hand)
     */
    cast(spell, aim = null, handSide = null) {
        const g = this.game;
        const side = aim ? aim.side : (handSide || g.magicHand || g.lastMagicHand || 'right');
        const origin = g.character.getHandWorldPosition(side, new THREE.Vector3());
        const dir = g.character.getHandDirection(side, new THREE.Vector3());
        const b = this._addBolt({
            id: `${this.me}:${nextId++}`, by: this.me, spell, side,
            tk: aim ? aim.t.kind : 'n', tid: aim ? aim.t.id : null,
            o: origin, d: dir,
        });
        if (g.sync) g.sync.duelCast(b);
        if (g.sound) g.sound.playSapira?.();
        // the spell leaves the hand with a flash
        const col = this.colors(spell, this.me).glow;
        this._burst(origin, col, 18);
        g.fx.lightFlash(origin, col, 2.5, 0.25, 12);
        return b;
    }

    /** A charge announced by another player. */
    remoteCast(m) {
        if (this.bolts.has(m.id)) return;
        this._addBolt({ id: m.id, by: m.by, spell: m.s, side: m.side, tk: m.tk, tid: m.tid, o: new THREE.Vector3(...m.o), d: new THREE.Vector3(...m.d) });
    }

    _addBolt(o) {
        const b = {
            ...o,
            front: o.o.clone(),
            dir: o.d.clone().normalize(),
            traveled: 0,
            state: 'flying',
            age: 0,
            clash: null,
        };
        this.bolts.set(b.id, b);
        return b;
    }

    // ============================================================= update
    update(dt) {
        this._t += dt;
        // segments live exactly one frame, whatever the frame rate
        this._segLife = dt + 1e-4;
        this._trackHands();
        for (const b of [...this.bolts.values()]) this._updateBolt(b, dt);
        if (this._referee()) this._detectClashes();
        for (const c of [...this.clashes]) this._updateClash(c, dt);
    }

    /** Am I the one deciding zombies and duels? (host, or alone) */
    _referee() {
        return this.game.authority;
    }

    _updateBolt(b, dt) {
        b.age += dt;
        if (b.state === 'clash') return;
        if (b.age > 14) { this._end(b, 'fizzle'); return; }
        const origin = b._origin || (b._origin = new THREE.Vector3());
        const hdir = b._hdir || (b._hdir = new THREE.Vector3());
        if (!this._handOf(b.by, b.side, origin, hdir)) origin.copy(b.o);
        const tp = b.tk !== 'n' ? this._targetPos(b, new THREE.Vector3()) : null;
        if (b.tk !== 'n' && !tp) { this._end(b, 'fizzle'); return; }
        // The charge homes in on its target (or flies straight)
        if (tp) b.dir.copy(tp).sub(b.front).normalize();
        const step = (DUEL_SPELLS[b.spell]?.speed || DUEL.SPEED) * dt;
        b.front.addScaledVector(b.dir, step);
        this.game.books?.hitAt(b.front, 0.4);
        if (this.game.authority && this.game.spiders?.boltAt(b.front, b.spell)) { this._end(b, 'fizzle'); return; }
        b.traveled += step;
        this._drawBolt(b.spell, origin, b.front, b.by);
        if (!tp) {
            const t = this.game.terrain;
            if (b.traveled > DUEL.RANGE || (t && t.data.isSolidAt(b.front.x, b.front.y, b.front.z))) this._end(b, 'fizzle');
            return;
        }
        if (b.front.distanceTo(tp) > DUEL.HIT_RADIUS) return;
        // Arrived: who decides?
        if (b.tk === 'p' && b.tid === this.me) this._arriveAtMe(b);
        else if (b.tk === 'z' && this._referee()) this._arriveAtZombie(b);
        else if (b.state === 'flying') { b.state = 'waiting'; b.waitT = 0; }
        if (b.state === 'waiting') {
            b.waitT += dt;
            b.front.copy(tp);
            if (b.waitT > 2) this._end(b, 'fizzle', false);
        }
    }

    _arriveAtMe(b) {
        this._note({ ev: 'arrive', id: b.id, by: b.by });
        const g = this.game;
        // Answered with a charge aimed back? Then the referee will start a duel — wait.
        for (const o of this.bolts.values()) if (o.by === this.me && o.tk === 'p' && o.tid === b.by && o.state === 'flying') return;
        const caster = this._handOf(b.by, b.side, _v1, _v2) ? _v1.clone() : b.o;
        if (g.combat.shieldFactor(caster) >= 1) {
            g.combat._blocked(caster);
            this._end(b, 'blocked');
            return;
        }
        this._end(b, 'hit');
        this.applyToMe(b.spell, b.by);
    }

    _arriveAtZombie(b) {
        const z = this.game.zombieById.get(b.tid);
        this._end(b, 'hit');
        if (z) this.applyToZombie(b.spell, z, b.by);
    }

    // ============================================================ effects
    /** A duel spell landed on my wizard. */
    _note(e) {
        this.log.push({ t: Math.round(this._t * 100) / 100, ...e });
        if (this.log.length > 30) this.log.shift();
    }

    applyToMe(spell, byId) {
        this._note({ ev: 'hitMe', spell, byId });
        const g = this.game;
        const c = g.combat;
        const p = c.center(_v1);
        this._burst(p, DUEL_SPELLS[spell].color, 40);
        if (spell === 'AvadaKedavra') {
            g.fx.lightFlash(p, 0x2dff5a, 6, 0.6, 30);
            g.hud.flashColor?.('rgba(40, 255, 90, 0.75)');
            if (c.enabled) c.die(byId, 'avada');
            else g.hud.setVoice('💚 Авада Кедавра попала в вас (вне «Свободного мира» не смертельно)', true);
        } else if (spell === 'Stupefy') {
            c.stun(DUEL.STUN_TIME, byId);
        } else if (spell === 'IceDuel') {
            if (c.enabled) c.freeze(byId);
            else c.stun(5, byId);
        } else if (spell === 'LevitateDuel') {
            // Thrown ~3 m up, falls back down. (Lifted past the ground-snap margin so the
            // ground-following doesn't pull the player straight back down; flying ends.)
            const ch = g.character;
            if (g.flight?.active) g.flight.land?.('levitate');
            ch.group.position.y += 0.8;
            ch.verticalVelocity = 11;
            ch.onGround = false;
            if (c.enabled) setTimeout(() => c.damage(1, byId, 'Levitation'), 1600);
        } else if (spell === 'SapiraDuel') {
            g.fx.lightFlash(p, 0x8e2de2, 4, 0.4, 20);
            g.hud.flashColor?.('rgba(142, 45, 226, 0.6)');
            if (c.enabled) c.damage(4, byId, 'Sapira');
            else g.hud.setVoice('💜 Сапира попала в вас', true);
        }
    }

    applyToZombie(spell, z, byId) {
        const g = this.game;
        const p = _v1.copy(z.group.position).add(_v2.set(0, 1, 0));
        this._burst(p, DUEL_SPELLS[spell].color, 30);
        if (spell === 'AvadaKedavra') {
            g.fx.lightFlash(p, 0x2dff5a, 4, 0.5, 25);
            g.damageZombie(z, 999, false, _v2.set(0, 0, 1), byId);
        } else if (spell === 'Stupefy') {
            z.stunTimer = DUEL.STUN_TIME;
        } else if (spell === 'IceDuel') {
            z.freezeProgress = 1;
            z.freeze();
        } else if (spell === 'LevitateDuel') {
            z.vy = Math.max(z.vy || 0, 13);
        } else if (spell === 'SapiraDuel') {
            g.fx.lightFlash(p, 0x8e2de2, 3, 0.4, 20);
            g.damageZombie(z, 10, true, _v2.set(0, 0, 1), byId);
        }
    }

    _end(b, res, broadcast = true) {
        if (!this.bolts.has(b.id)) return;
        this.bolts.delete(b.id);
        if (res === 'blocked' || res === 'fizzle') this._burst(b.front, DUEL_SPELLS[b.spell].color, 15);
        if (broadcast && this.game.sync && (b.by === this.me || res === 'hit' || res === 'blocked')) this.game.sync.duelEnd(b.id, res);
    }

    /** Another computer finished a charge (hit / blocked / fizzled). */
    remoteEnd(id, res) {
        const b = this.bolts.get(id);
        if (!b) return;
        this.bolts.delete(id);
        this._burst(b.front, DUEL_SPELLS[b.spell].color, res === 'hit' ? 30 : 15);
        this.clashes = this.clashes.filter((c) => c.a !== b && c.b !== b);
    }

    // ============================================================= duels
    _detectClashes() {
        for (const a of this.bolts.values()) {
            if (a.state === 'clash' || a.tk !== 'p') continue;
            for (const b of this.bolts.values()) {
                if (b === a || b.state === 'clash' || b.tk !== 'p') continue;
                if (a.tid !== b.by || b.tid !== a.by || a.id > b.id) continue;
                // Charges aimed at each other: do their fronts meet?
                        const L = this._casterDistance(a.by, b.by);
                if (L == null) continue;
                if (a.traveled + b.traveled < L - 0.6 && a.front.distanceTo(b.front) > 0.8) continue;
                const p = Math.min(0.9, Math.max(0.1, a.traveled / Math.max(0.1, a.traveled + b.traveled)));
                this._startClash(a, b, p);
                if (this.game.sync) this.game.sync.duelClash(a.id, b.id, p);
            }
        }
    }

    _casterDistance(x, y) {
        const px = this._playerPos(x, new THREE.Vector3());
        const py = this._playerPos(y, new THREE.Vector3());
        return px && py ? px.distanceTo(py) : null;
    }

    _playerPos(id, out) {
        if (id === this.me) return this.game.combat.center(out);
        const r = this.game.remotes.get(id);
        return r ? out.copy(r.position).add(_v2.set(0, 0.6, 0)) : null;
    }

    _startClash(a, b, p) {
        this._note({ ev: 'clashStart', a: a.id, b: b.id, p });
        if (this.clashes.some((c) => c.a === a || c.b === b || c.a === b || c.b === a)) return;
        a.state = 'clash';
        b.state = 'clash';
        this.clashes.push({ a, b, p, t: 0, luckA: 0, luckB: 0, luckT: 0, lostA: 0, lostB: 0 });
        if (this.game.sound) this.game.sound.playThunder?.();
        if (a.by === this.me || b.by === this.me) this.game.hud.setVoice('⚡ ДУЭЛЬ! Держите руку на сопернике', true);
    }

    /** The referee's view of a message from the host. */
    remoteClash(m) {
        const a = this.bolts.get(m.a), b = this.bolts.get(m.b);
        if (!a || !b) return;
        let c = this.clashes.find((x) => x.a === a && x.b === b);
        if (!c) { this._startClash(a, b, m.p); c = this.clashes.find((x) => x.a === a && x.b === b); }
        if (c) c.p = m.p;
    }

    /** Strength in a duel: fatigue first, HP second, a little luck. */
    _strength(id, luck) {
        const g = this.game;
        let fatigue = 30, hp = PVP.MAX_HP;
        if (id === this.me) { fatigue = g.combat.fatigue; hp = g.combat.hp; }
        else {
            const r = g.remotes.get(id);
            if (r) { fatigue = r.fatigue ?? 30; hp = r.hp ?? PVP.MAX_HP; }
        }
        return (fatigue / 30) * 1.0 + (hp / PVP.MAX_HP) * 0.35 + luck;
    }

    /** Is this wizard still holding the duel (hand on the opponent)? jerk = gave up sharply. */
    _contact(id, bolt, opponentId) {
        if (id === this.me) {
            const hand = this.game.character.getHandWorldPosition(bolt.side, _v1);
            const dir = this.game.character.getHandDirection(bolt.side, _v2);
            const op = this._playerPos(opponentId, _v3);
            const ok = op ? dir.angleTo(op.sub(hand).normalize()) < DUEL.CONTACT_ANGLE : false;
            return { ok, jerk: this._jerked(bolt.side) };
        }
        const r = this.game.remotes.get(id);
        if (!r || r.dead) return { ok: false, jerk: true };
        return { ok: r.duelContact !== 0, jerk: r.duelJerk === 1 };
    }

    _updateClash(c, dt) {
        const g = this.game;
        const { a, b } = c;
        c.t += dt;
        // Draw both charges up to the meeting point
        const ha = new THREE.Vector3(), hb = new THREE.Vector3(), d = new THREE.Vector3();
        const okA = this._handOf(a.by, a.side, ha, d), okB = this._handOf(b.by, b.side, hb, d);
        if (okA && okB) {
            const m = ha.clone().lerp(hb, c.p);
            this._drawBolt(a.spell, ha, m, a.by);
            this._drawBolt(b.spell, hb, m, b.by);
            const colA = this.colors(a.spell, a.by).glow, colB = this.colors(b.spell, b.by).glow;
            if (Math.random() < 0.7) this._burst(m, Math.random() < 0.5 ? colA : colB, 3);
            // The centre of force: pulses, and takes the colour of whoever is pushing harder
            this._showOrb(m, colA, colB, c.p, c.t);
            a.front.copy(m);
            b.front.copy(m);
        }
        // Fatigue drains while pushing (free world)
        if ((a.by === this.me || b.by === this.me) && g.combat.enabled) g.combat.fatigue = Math.max(0, g.combat.fatigue - DUEL.CLASH_FATIGUE * dt);
        if (!this._referee()) return;

        c.luckT -= dt;
        if (c.luckT <= 0) {
            c.luckT = 0.5;
            c.luckA = (Math.random() * 2 - 1) * DUEL.LUCK;
            c.luckB = (Math.random() * 2 - 1) * DUEL.LUCK;
        }
        const ca = this._contact(a.by, a, b.by), cb = this._contact(b.by, b, a.by);
        c.lostA = ca.ok ? 0 : c.lostA + dt;
        c.lostB = cb.ok ? 0 : c.lostB + dt;
        // A hand off the opponent doesn't push at all
        const sa = ca.ok ? this._strength(a.by, c.luckA) : 0;
        const sb = cb.ok ? this._strength(b.by, c.luckB) : 0;
        c.p = Math.min(1, Math.max(0, c.p + (sa - sb) * DUEL.PUSH * dt + (Math.random() - 0.5) * 0.02));

        // Leaving: hand calmly off the opponent first, then a flick = the duel just ends;
        // a flick straight from aiming (no calm move away first) = giving up
        let loser = null, dissolve = false;
        if (c.p >= 1) loser = b.by;
        else if (c.p <= 0) loser = a.by;
        else if (ca.jerk) { if (c.lostA > DUEL.CONTACT_GRACE) dissolve = true; else loser = a.by; }
        else if (cb.jerk) { if (c.lostB > DUEL.CONTACT_GRACE) dissolve = true; else loser = b.by; }

        c.sendT = (c.sendT || 0) - dt;
        if (c.sendT <= 0 && g.sync) { c.sendT = 0.1; g.sync.duelClash(a.id, b.id, c.p); }
        if (loser || dissolve) {
            this._note({ ev: 'clashEnd', loser, dissolve, p: Math.round(c.p * 100) / 100, lostA: c.lostA, lostB: c.lostB, jerkA: ca.jerk, jerkB: cb.jerk, a: a.by, b: b.by });
            this._finishClash(c, loser);
            if (g.sync) g.sync.duelClashEnd(a.id, b.id, loser);
        }
    }

    _finishClash(c, loser) {
        this.clashes = this.clashes.filter((x) => x !== c);
        const { a, b } = c;
        this.bolts.delete(a.id);
        this.bolts.delete(b.id);
        const winnerBolt = loser === a.by ? b : loser === b.by ? a : null;
        this._burst(a.front, 0xffffff, 40);
        if (!winnerBolt) {
            if (a.by === this.me || b.by === this.me) this.game.hud.setVoice('⚡ Дуэль прервана — никто не пострадал', true);
            return;
        }
        if (loser === this.me) this.applyToMe(winnerBolt.spell, winnerBolt.by);
        else if (winnerBolt.by === this.me) this.game.hud.setVoice(`⚡ Вы победили в дуэли: ${DUEL_SPELLS[winnerBolt.spell].name}!`, true);
    }

    remoteClashEnd(m) {
        const a = this.bolts.get(m.a), b = this.bolts.get(m.b);
        const c = this.clashes.find((x) => (a && (x.a === a || x.b === a)) || (b && (x.a === b || x.b === b)));
        if (c) { this._finishClash(c, m.loser); return; }
        // The duel ended before this computer even saw it start: both charges are gone anyway
        this.bolts.delete(m.a);
        this.bolts.delete(m.b);
        if (m.loser === this.me) {
            const w = a && a.by !== this.me ? a : b && b.by !== this.me ? b : null;
            if (w) this.applyToMe(w.spell, w.by);
        }
    }

    // ============================================================ hands
    _trackHands() {
        const ch = this.game.character;
        for (const side of ['left', 'right']) {
            const h = ch.getHandWorldPosition(side, _v1).sub(ch.group.position);
            const list = this.jerk[side];
            list.push({ t: this._t, x: h.x, y: h.y, z: h.z });
            while (list.length && this._t - list[0].t > 0.5) list.shift();
        }
    }

    /** A fast, far movement of this hand in the last half second. */
    _jerked(side) {
        const list = this.jerk[side];
        if (list.length < 2) return false;
        const last = list[list.length - 1];
        for (const o of list) {
            if (last.t - o.t > 0.3) continue;
            if (Math.hypot(last.x - o.x, last.y - o.y, last.z - o.z) > 0.75) return true;
        }
        return false;
    }

    /** For the pose message: am I holding my duels? [contact, jerk] */
    myContact() {
        for (const c of this.clashes) {
            const mine = c.a.by === this.me ? c.a : c.b.by === this.me ? c.b : null;
            if (!mine) continue;
            const other = mine === c.a ? c.b.by : c.a.by;
            const r = this._contact(this.me, mine, other);
            return [r.ok ? 1 : 0, r.jerk ? 1 : 0];
        }
        return null;
    }

    // =========================================================== visuals
    /** A jagged, flickering electric charge from a to b. */
    _drawBolt(spell, from, to, by) {
        if (!DUEL_SPELLS[spell]) return;
        const pool = this._pool(spell, by);
        const col = this.colors(spell, by).glow;
        // own copies: the caller may pass the shared temp vectors
        const a = _da.copy(from), b = _db.copy(to);
        const len = a.distanceTo(b);
        if (len < 0.05) return;
        const n = Math.max(3, Math.min(24, Math.round(len * 1.6)));
        const dir = _dd.subVectors(b, a).divideScalar(len);
        const side = _ds.set(-dir.z, 0, dir.x);
        if (side.lengthSq() < 1e-4) side.set(1, 0, 0);
        side.normalize();
        const up = _du.crossVectors(dir, side).normalize();
        let prev = a.clone();
        const amp = Math.min(0.35, 0.08 + len * 0.02);
        for (let i = 1; i <= n; i++) {
            const t = i / n;
            const p = a.clone().lerp(b, t);
            if (i < n) {
                const k = Math.sin(Math.PI * t);
                p.addScaledVector(side, (Math.random() - 0.5) * 2 * amp * k).addScaledVector(up, (Math.random() - 0.5) * 2 * amp * k);
            }
            pool.core.add(prev, p, this._segLife || 0.05);
            pool.glow.add(prev, p, this._segLife || 0.05);
            prev = p;
        }
        // bright head, and a glow at the hand it comes from
        if (Math.random() < 0.8) this.game.fx.spark(b, col, 0.22, _v1.set((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2), 0.25);
        if (Math.random() < 0.5) this.game.fx.spark(a, col, 0.12, _v1.set((Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5, (Math.random() - 0.5) * 1.5), 0.2);
    }

    _burst(p, color, n) {
        const fx = this.game.fx;
        for (let i = 0; i < n; i++) fx.spark(p, i % 3 ? color : 0xffffff, 0.12 + Math.random() * 0.1, _v1.set((Math.random() - 0.5) * 7, (Math.random() - 0.3) * 6, (Math.random() - 0.5) * 7), 0.5);
    }

    /**
     * A pulsing ball where two charges meet. p = meeting point between the two
     * hands (0 = at A's hand): the ball leans to the colour of the one winning.
     */
    _showOrb(pos, colA, colB, p, t) {
        let orb = this._orbs[this._orbsUsed];
        if (!orb) {
            const mk = (r, o) => new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false }));
            orb = { inner: mk(0.22, 0.95), outer: mk(0.55, 0.45) };
            orb.inner.renderOrder = orb.outer.renderOrder = 5;
            this.game.scene.add(orb.inner, orb.outer);
            this._orbs.push(orb);
        }
        this._orbsUsed++;
        const pulse = 1 + Math.sin(t * 18) * 0.18 + Math.sin(t * 7.3) * 0.08;
        orb.inner.position.copy(pos);
        orb.outer.position.copy(pos);
        orb.inner.scale.setScalar(pulse);
        orb.outer.scale.setScalar(pulse * (1.1 + Math.abs(p - 0.5)));
        // p < 0.5: the point is near A's hand → B is pushing harder (B's colour)
        orb.outer.material.color.setHex(colA).lerp(_c2.setHex(colB), 1 - p);
        orb.inner.visible = orb.outer.visible = true;
    }

    /** Called by the effects' update (segment pools fade the flicker). */
    updateVisuals(dt) {
        for (const p of Object.values(this.pools)) { p.core.update(dt); p.glow.update(dt); }
        // orbs of duels that ended this frame disappear
        for (let i = this._orbsUsed; i < this._orbs.length; i++) this._orbs[i].inner.visible = this._orbs[i].outer.visible = false;
        this._orbsUsed = 0;
    }
}
