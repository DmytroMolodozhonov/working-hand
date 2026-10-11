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
 * the hand (fast, ~0.7 s over 10 m) and acts only when it touches. It flies
 * where the hand points (as the player sees it — in flight too): a creature is
 * its target only when the hand points right at it (a few degrees beside the
 * body at most; the nearest one along that line), and towards it the charge
 * turns a little (AIM.BEND, ~7°, in all) — never round after it. Whatever body
 * it really touches on its way is hit; nothing touched — it flies on straight.
 * Until it touches, the target can:
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
import { sharpJerk } from './Jerk.js';
import { spiderBody, spiderCenter } from './Spider.js';
import { DUEL_SPELL_NAME } from './Mana.js';
export { JERK, sharpJerk } from './Jerk.js';

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
    CONTACT_ANGLE: 0.9, // rad: hand still on the opponent (~50°: aiming roughly is enough)
    CONTACT_GRACE: 0.25, // s off the opponent before a flick counts as "shaking it off"
    PUSH: 0.16, // how fast the meeting point moves per unit of strength difference
    LUCK: 0.1, // ±10 % random
    STUN_TIME: 15,
    CLASH_FATIGUE: 1, // mana per second while pushing (free world), each side
    MAXIMA_BOOST: 0.05, // «Максима» shouted in a clash: the meeting point goes 5 % of the way a second faster to the opponent (they add up)
    MAXIMA_COST: 5, // mana, at once
    MAXIMA_EVERY: 3, // s: at most once every 3 seconds
};

/**
 * The extra push of «Максима» shouts in a clash (a's shouts minus b's; only a hand still on the
 * opponent pushes): +5 % of the way a second towards the opponent for each shout.
 */
export function maximaPush(boostA = 0, boostB = 0) {
    return DUEL.MAXIMA_BOOST * (Math.max(0, boostA | 0) - Math.max(0, boostB | 0));
}

/** Where a charge goes: along the hand; a target only right on that line, and only a small correction towards it. */
export const AIM = {
    CONE: 0.07, // rad (4°): how far beside a body the hand may point and still mean it
    BEND: 0.12, // rad (~7°): the most a charge ever turns off the line it was cast along
    TURN: 2.0, // rad/s: how fast it turns while correcting
};

/** Body sizes (metres) as a charge touches them: a line a–b and a radius around it. */
export const BODY = {
    HERO: { DOWN: 1.3, UP: 2.15, R: 0.7 }, // a wizard: from the soles (2.0 below the body origin) to the hair (2.85 above), along the body
    ZOMBIE: { DOWN: -0.1, UP: 2.0, R: 0.7 },
    VILLAGER: { DOWN: 1.25, UP: 2.0, R: 0.7 },
    BIRD: 0.6,
};

const _sa = new THREE.Vector3(), _sb = new THREE.Vector3(), _bx = new THREE.Vector3();
const _ch = new THREE.Vector3(), _cd = new THREE.Vector3(), _co = new THREE.Vector3();

/**
 * Where the line from `o` along the unit direction `d` (forwards only) comes closest to
 * the segment a–b: {along: how far along the line, k: 0…1 on the segment, dist: how close}.
 */
export function rayToSegment(o, d, a, b, out = {}) {
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
    const wx = o.x - a.x, wy = o.y - a.y, wz = o.z - a.z;
    const B = d.x * ux + d.y * uy + d.z * uz, C = ux * ux + uy * uy + uz * uz;
    const D = d.x * wx + d.y * wy + d.z * wz, E = ux * wx + uy * wy + uz * wz;
    const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
    let k = 0;
    const den = C - B * B;
    if (C > 1e-9) k = den > 1e-9 ? clamp01((E - B * D) / den) : 0;
    const t = Math.max(0, k * B - D);
    if (C > 1e-9) k = clamp01((E + t * B) / C);
    const px = wx + t * d.x - k * ux, py = wy + t * d.y - k * uy, pz = wz + t * d.z - k * uz;
    out.along = t;
    out.k = k;
    out.dist = Math.sqrt(px * px + py * py + pz * pz);
    return out;
}

/**
 * Where the segment p–q (a charge's move this frame) comes closest to the segment a–b:
 * {s: 0…1 on p–q, k: 0…1 on a–b, dist}.
 */
export function segmentToSegment(p, q, a, b, out = {}) {
    const d1x = q.x - p.x, d1y = q.y - p.y, d1z = q.z - p.z;
    const d2x = b.x - a.x, d2y = b.y - a.y, d2z = b.z - a.z;
    const rx = p.x - a.x, ry = p.y - a.y, rz = p.z - a.z;
    const A = d1x * d1x + d1y * d1y + d1z * d1z, E = d2x * d2x + d2y * d2y + d2z * d2z;
    const F = d2x * rx + d2y * ry + d2z * rz;
    const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
    let s = 0, k = 0;
    if (A <= 1e-12 && E <= 1e-12) { s = 0; k = 0; }
    else if (A <= 1e-12) { s = 0; k = clamp01(F / E); }
    else {
        const C = d1x * rx + d1y * ry + d1z * rz;
        if (E <= 1e-12) { k = 0; s = clamp01(-C / A); }
        else {
            const Bv = d1x * d2x + d1y * d2y + d1z * d2z;
            const den = A * E - Bv * Bv;
            s = den > 1e-12 ? clamp01((Bv * F - C * E) / den) : 0;
            k = (Bv * s + F) / E;
            if (k < 0) { k = 0; s = clamp01(-C / A); }
            else if (k > 1) { k = 1; s = clamp01((Bv - C) / A); }
        }
    }
    const px = rx + d1x * s - d2x * k, py = ry + d1y * s - d2y * k, pz = rz + d1z * s - d2z * k;
    out.s = s;
    out.k = k;
    out.dist = Math.sqrt(px * px + py * py + pz * pz);
    return out;
}

/**
 * The body the hand points at: the line from `o` along `d` passes it within AIM.CONE
 * plus the body's own angular size (a big body is easier to point at), and of those the
 * nearest along the line. bodies: [{a, b, r, …}]. → {body, along, k, dist, miss} | null
 * (miss: how far beside the body the line goes, rad; 0 = right through it).
 */
export function pickBody(o, d, bodies, range = DUEL.RANGE) {
    let best = null;
    const c = {};
    for (const body of bodies) {
        rayToSegment(o, d, body.a, body.b, c);
        if (c.along < 0.5 || c.along > range) continue;
        if (Math.atan2(c.dist, c.along) > AIM.CONE + Math.atan2(body.r, c.along)) continue;
        if (!best || c.along < best.along) best = { body, along: c.along, k: c.k, dist: c.dist, miss: Math.max(0, Math.atan2(c.dist - body.r, c.along)) };
    }
    return best;
}

/**
 * A flying charge corrects its way a little: `dir` turns towards `want` by at most `step`
 * rad now, and never more than `maxBend` off the line it was cast along (`d0`), however
 * far its target is. Unit vectors; `dir` is changed and returned.
 */
export function bendToward(dir, d0, want, step, maxBend = AIM.BEND) {
    const ang = dir.angleTo(want);
    if (ang > 1e-7 && step > 0) {
        _bx.crossVectors(dir, want);
        if (_bx.lengthSq() > 1e-14) dir.applyAxisAngle(_bx.normalize(), Math.min(step, ang));
    }
    const off = dir.angleTo(d0);
    if (off > maxBend) {
        _bx.crossVectors(d0, dir);
        if (_bx.lengthSq() > 1e-14) dir.copy(d0).applyAxisAngle(_bx.normalize(), maxBend);
        else dir.copy(d0);
    }
    return dir.normalize();
}

/** The first of `bodies` the move p→q touches: {body, s (0…1 along the move), k} | null. */
export function firstTouched(p, q, bodies) {
    let best = null;
    const c = {};
    for (const body of bodies) {
        segmentToSegment(p, q, body.a, body.b, c);
        if (c.dist > body.r) continue;
        if (!best || c.s < best.s) best = { body, s: c.s, k: c.k };
    }
    return best;
}

const _v1 = new THREE.Vector3();
const _qInv = new THREE.Quaternion();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _vFrom = new THREE.Vector3();
const _c2 = new THREE.Color();
const _da = new THREE.Vector3(), _db = new THREE.Vector3(), _dd = new THREE.Vector3(), _ds = new THREE.Vector3(), _du = new THREE.Vector3();

let nextId = 1;

/** Marker colours of wizards in a clash (blue, orange, magenta, green): who is who. */
export const DUEL_MARK = [0x2f7dff, 0xff8a1a, 0xff2fd0, 0x3dff6e];
/** The two wizards' marker slots: their own, never the same. */
export function markSlots(sa, sb) { return [sa, sb === sa ? (sa + 1) % DUEL_MARK.length : sb]; }
/** From A's side: lead −1…1 (+ = A is winning), push −1…1 (who pushes harder right now). */
export function clashLead(p, v) {
    return { lead: Math.max(-1, Math.min(1, (p - 0.5) * 2)), push: Math.max(-1, Math.min(1, (v || 0) / 0.12)) };
}
const _Y = new THREE.Vector3(0, 1, 0), _Z = new THREE.Vector3(0, 0, 1), _mA = new THREE.Vector3(), _mB = new THREE.Vector3();
let _ringGeo = null;

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
        this.markPools = {}; // the thin core of each wizard's beam, in their marker colour
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
    /** Where my spell leaves this hand (the wand's tip, else the hand) and where the hand points. */
    _myRay(side, outPos, outDir) {
        const g = this.game, ch = g.character;
        if (g.castOrigin) g.castOrigin(side, outPos);
        else ch.getHandWorldPosition(side, outPos);
        // (as the player sees it: in flight without the body's forward tilt)
        if (ch.getPointingDirection) ch.getPointingDirection(side, outDir);
        else ch.getHandDirection(side, outDir);
        return outDir;
    }

    /**
     * The creature this hand points at: a wizard, a zombie, an animal, a castle person or a
     * book-bird right on the line of the hand (see pickBody). {kind, id, dist, miss} | null
     */
    findTarget(side) {
        const o = new THREE.Vector3(), d = new THREE.Vector3();
        this._myRay(side, o, d);
        const hit = pickBody(o, d, this._bodies(this.me));
        return hit ? { kind: hit.body.kind, id: hit.body.id, dist: hit.along, miss: hit.miss } : null;
    }

    /**
     * Every body a charge can touch (`skip`: the caster — never his own), as capsules
     * {kind, id, a, b, r}. (The entries are reused: read them before the next call.)
     */
    _bodies(skip = null) {
        const g = this.game;
        const pool = this._bpool || (this._bpool = []);
        const out = [];
        const put = (kind, id) => {
            let e = pool[out.length];
            if (!e) e = pool[out.length] = { kind, id, a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 };
            e.kind = kind; e.id = id;
            out.push(e);
            return e;
        };
        if (skip !== this.me && g.character && !g.combat?.dead && !g.isDeadLocal) this._heroBody(g.character.group, put('p', this.me));
        for (const [id, r] of g.remotes || []) if (!r.dead && id !== skip) this._heroBody(r.character.group, put('p', id));
        for (const z of g.zombies || []) if (!z.isDead) this._zombieBody(z, put('z', z.id));
        // animals and castle people are creatures too (Авада, Остолбеней… work on them)
        for (const a of g.animals?.targets() || []) this._roundBody('a', a, put('a', a.id));
        for (const v of g.castleLife?.targets() || []) this._villagerBody(v, put('v', v.id));
        for (const t of g.livingTrees?.targets() || []) this._treeBody(t, put('t', t.id));
        for (const bd of g.books?.birds?.values() || []) if (bd.state !== 'fall') this._roundBody('b', bd, put('b', bd.id));
        // the giant spider: its whole (big) body, nose to tail
        for (const sp of g.spiders?.targets() || []) spiderBody(sp, put('s', sp.id));
        return out;
    }

    /** One creature's body (as in _bodies), or null when it is gone. */
    _bodyOf(kind, id, e) {
        const g = this.game;
        e.kind = kind; e.id = id;
        if (kind === 'p') {
            if (id === this.me) return g.combat?.dead || g.isDeadLocal ? null : this._heroBody(g.character.group, e);
            const r = g.remotes?.get(id);
            return r && !r.dead ? this._heroBody(r.character.group, e) : null;
        }
        if (kind === 'z') {
            const z = g.zombieById?.get(id);
            return z && !z.isDead ? this._zombieBody(z, e) : null;
        }
        if (kind === 's') { const sp = g.spiders?.byId(id); return sp ? spiderBody(sp, e) : null; }
        const c = this._creature(kind, id);
        if (!c) return null;
        return kind === 'v' ? this._villagerBody(c, e) : kind === 't' ? this._treeBody(c, e) : this._roundBody(kind, c, e);
    }

    /** A wizard's hero: along the body (upright, or lying flat flying like Superman). */
    _heroBody(group, e) {
        const up = _sa.set(0, 1, 0).applyQuaternion(group.quaternion);
        e.a.copy(group.position).addScaledVector(up, -BODY.HERO.DOWN);
        e.b.copy(group.position).addScaledVector(up, BODY.HERO.UP);
        e.r = BODY.HERO.R;
        return e;
    }

    _zombieBody(z, e) {
        const p = z.group.position;
        e.a.set(p.x, p.y - BODY.ZOMBIE.DOWN, p.z);
        e.b.set(p.x, p.y + BODY.ZOMBIE.UP, p.z);
        e.r = BODY.ZOMBIE.R;
        return e;
    }

    _villagerBody(v, e) {
        // (the model's origin is the hip, as the player's: the feet 1.95 below it)
        const p = v.group ? v.group.position : _sb.set(v.x, v.y + 1.95, v.z);
        e.a.set(p.x, p.y - BODY.VILLAGER.DOWN, p.z);
        e.b.set(p.x, p.y + BODY.VILLAGER.UP, p.z);
        e.r = BODY.VILLAGER.R;
        return e;
    }

    /** A living tree: from its root feet up into its crown. */
    _treeBody(t, e) {
        const p = t.model.position, s = t.model.userData.s || 1;
        e.a.set(p.x, p.y + 0.5, p.z);
        e.b.set(p.x, p.y + 8.5 * s, p.z);
        e.r = 1.1 * s;
        return e;
    }

    /** An animal / a book-bird: a ball round its middle. */
    _roundBody(kind, c, e) {
        this._creaturePoint(c, e.a);
        e.b.copy(e.a);
        e.r = kind === 'a' ? this._animalBody(c).r : BODY.BIRD;
        return e;
    }

    /**
     * Which hand casts: a raised one pointing right at a creature (the spell hand when
     * both do). A hand hanging along the body points at nothing — in the air it would
     * point at whatever is below.
     */
    pickSide(preferPlayers = false) {
        const g = this.game, ch = g.character;
        const pref = g.magicHand || g.lastMagicHand || 'right';
        let best = null;
        for (const side of [pref, pref === 'right' ? 'left' : 'right']) {
            if (ch.isArmRaised && !ch.isArmRaised(side)) continue;
            const t = this.findTarget(side);
            if (!t || (preferPlayers && t.kind !== 'p')) continue;
            // (the hand pointing more truly at its target)
            if (!best || t.miss < best.t.miss - 0.005) best = { side, t };
        }
        return best;
    }

    /** The middle of an animal / a villager (where a charge flies). */
    _creaturePoint(c, out) {
        if (c.isBird) return out.copy(c.model.position);
        if (c.isLivingTree) return out.copy(c.model.position).add(_v2.set(0, 4.5 * (c.model.userData.s || 1), 0));
        if (c.isAnimal) return out.copy(c.group.position).add(_v2.set(0, this._animalBody(c).y, 0));
        return out.set(c.x, c.y + 2.4, c.z);
    }

    /** The middle of an animal's body above its feet and how big it is (measured once from the model). */
    _animalBody(a) {
        if (!a._body) {
            const box = new THREE.Box3().setFromObject(a.model || a.group);
            const size = box.getSize(new THREE.Vector3());
            a._body = { y: (box.min.y + box.max.y) / 2 - a.group.position.y, r: Math.max(0.6, Math.max(size.x, size.y, size.z) * 0.45) };
        }
        return a._body;
    }

    _creature(kind, id) {
        const g = this.game;
        if (kind === 'a') { const a = g.animals?.byId.get(id); return a && !a.dead ? a : null; }
        if (kind === 'v') { const v = g.castleLife?.byId.get(id); return v && !v.dead ? v : null; }
        if (kind === 'b') { const b = g.books?.birds?.get(id); return b && b.state !== 'fall' ? b : null; }
        if (kind === 't') { const t = g.livingTrees?.byId.get(id); return t && !t.isDead ? t : null; }
        return null;
    }

    _targetPos(b, out) {
        const g = this.game;
        if (b.tk === 'a' || b.tk === 'v' || b.tk === 'b' || b.tk === 't') { const c = this._creature(b.tk, b.tid); return c ? this._creaturePoint(c, out) : null; }
        if (b.tk === 's') { const sp = g.spiders?.byId(b.tid); return sp ? spiderCenter(sp, out) : null; }
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
            this._myRay(side, outPos, outDir);
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
     * Cast a duel spell from my hand: it flies where the hand points.
     * @param {string} spell  key of DUEL_SPELLS
     * @param {object} [aim] {side, t} from pickSide (else: from the spell hand, at whatever it points at)
     */
    cast(spell, aim = null, handSide = null) {
        const side = aim ? aim.side : (handSide || this.game.magicHand || this.game.lastMagicHand || 'right');
        const origin = new THREE.Vector3(), dir = new THREE.Vector3();
        this._myRay(side, origin, dir);
        // the body it may turn a little towards: the one pointed at — and where on it
        // the line of the hand comes closest (the head, the legs…)
        let tk = 'n', tid = null, ak = 0.5;
        const t = aim ? aim.t : (() => { const f = pickBody(origin, dir, this._bodies(this.me)); return f ? { kind: f.body.kind, id: f.body.id } : null; })();
        const body = t ? this._bodyOf(t.kind, t.id, this._tmpBody()) : null;
        if (body) { tk = t.kind; tid = t.id; ak = rayToSegment(origin, dir, body.a, body.b).k; }
        const b = this._addBolt({ id: `${this.me}:${nextId++}`, by: this.me, spell, side, tk, tid, ak, o: origin, d: dir });
        const g = this.game;
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
        this._addBolt({ id: m.id, by: m.by, spell: m.s, side: m.side, tk: m.tk || 'n', tid: m.tid ?? null, ak: m.ak ?? 0.5, o: new THREE.Vector3(...m.o), d: new THREE.Vector3(...m.d) });
    }

    _addBolt(o) {
        const b = {
            ...o,
            front: o.o.clone(),
            dir: o.d.clone().normalize(),
            d0: o.d.clone().normalize(), // the line of the hand it was cast along (it never turns far from it)
            ak: o.ak ?? 0.5,
            traveled: 0,
            state: 'flying',
            age: 0,
            clash: null,
        };
        this.bolts.set(b.id, b);
        return b;
    }

    _tmpBody() {
        return this._tb || (this._tb = { kind: 'n', id: null, a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 });
    }

    /** The point on its target a charge corrects its way towards (follows the body), or null. */
    _aimPoint(b, out) {
        const body = b.tk !== 'n' ? this._bodyOf(b.tk, b.tid, this._tmpBody()) : null;
        return body ? out.copy(body.a).lerp(body.b, b.ak) : null;
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
        if (b.state === 'flying' && !this._fly(b, dt)) return;
        this._drawBolt(b.spell, origin, b.front, b.by);
        if (b.state === 'arrived') this._arrive(b, dt);
    }

    /**
     * One step of a flying charge: along the line of the hand, correcting its way a little
     * towards its target (never round after it), until it touches a body (→ 'arrived'),
     * the ground, or flies out of range. false: it is gone.
     */
    _fly(b, dt) {
        const g = this.game;
        if (b.tk !== 'n') {
            const tp = this._aimPoint(b, _v3);
            const want = tp ? _v2.subVectors(tp, b.front) : null;
            // the target is gone, or the charge has flown past it: it just flies on straight
            if (!want || want.dot(b.d0) <= 0) { b.tk = 'n'; b.tid = null; }
            else bendToward(b.dir, b.d0, want.normalize(), AIM.TURN * dt);
        }
        const step = (DUEL_SPELLS[b.spell]?.speed || DUEL.SPEED) * dt;
        const from = _vFrom.copy(b.front);
        b.front.addScaledVector(b.dir, step);
        b.traveled += step;
        // (book-birds are bodies like any other creature: touched below, not by a blast radius)
        if (g.authority && g.spiders?.boltAt(b.front, b.spell, b.by)) { this._end(b, 'fizzle'); return false; }
        // it hits the first body it really touches on its way (along the whole step: at a
        // low FPS a charge moves a metre and more per frame) — its target or anybody else
        const hit = firstTouched(from, b.front, this._bodies(b.by));
        if (hit) {
            b.front.lerpVectors(from, b.front, hit.s);
            b.state = 'arrived';
            b.tk = hit.body.kind;
            b.tid = hit.body.id;
            b.waitT = 0;
            this._note({ ev: 'touch', id: b.id, kind: b.tk, tid: b.tid });
            return true;
        }
        const t = g.terrain;
        if (b.traveled > DUEL.RANGE || (t && t.data.isSolidAt(b.front.x, b.front.y, b.front.z))) { this._end(b, 'fizzle'); return false; }
        return true;
    }

    /** The charge touched a body: who decides what happens? */
    _arrive(b, dt) {
        if (b.tk === 'p' && b.tid === this.me) { this._arriveAtMe(b); return; } // (my own computer: it knows my shield)
        if (b.tk === 'z' && this._referee()) { this._arriveAtZombie(b); return; }
        if ((b.tk === 'a' || b.tk === 'v' || b.tk === 'b' || b.tk === 't') && this._referee()) { this._arriveAtCreature(b); return; }
        if (b.tk === 's' && this._referee()) { const sp = this.game.spiders?.byId(b.tid); this._end(b, 'fizzle'); if (sp) this.game.spiders.boltHit(sp, b.spell, b.by); return; }
        // another computer decides (the wizard it touched, or the host): wait for its word
        b.waitT += dt;
        if (b.waitT > 2) this._end(b, 'fizzle', false);
    }

    _arriveAtMe(b) {
        if (!b.noted) { b.noted = true; this._note({ ev: 'arrive', id: b.id, by: b.by }); }
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
        this.applyToMe(b.spell, b.by, b.side);
    }

    _arriveAtZombie(b) {
        const z = this.game.zombieById.get(b.tid);
        this._end(b, 'hit');
        if (z) this.applyToZombie(b.spell, z, b.by, b.o);
    }

    _arriveAtCreature(b) {
        const c = this._creature(b.tk, b.tid);
        this._end(b, 'hit');
        if (c) this.applyToCreature(b.spell, c, b.by, b.o);
    }

    /** A duel spell landed on an animal or a castle villager (decided by the host). */
    applyToCreature(spell, c, byId, from = null) {
        const g = this.game;
        const src = from || this._casterAt(byId, c);
        const p = this._creaturePoint(c, _v1);
        this._burst(p, DUEL_SPELLS[spell].color, 30);
        // a book-bird: any charge knocks it out of the air (it falls as a book)
        // («Левиоса» doesn't hurt: the bird is only jolted and flies on)
        if (c.isBird) { if (spell !== 'LevitateDuel') g.books.hitBird(c, 99); return; }
        // a living tree: no duel spell hurts it (only fire does) — «Авада Кедавра» neither
        if (c.isLivingTree) { g.livingTrees.hit(c, spell === 'AvadaKedavra' ? 999 : 10, spell); return; }
        const hit = (dmg, opts = {}) => (c.isAnimal ? g.animals.hit(c, dmg, null, byId) : g.castleLife.hit(c, dmg, null, byId, { spell: true, ...opts }));
        if (spell === 'AvadaKedavra') {
            g.fx.lightFlash(p, 0x2dff5a, 4, 0.5, 25);
            hit(25, { pierce: true }); // (not a killing curse: −25 HP at once, no armour stops it)
            if (!c.dead) g.creatureImpact?.spellHit(c, 'AvadaKedavra', src, byId); // (thrown on its back)
        } else if (spell === 'Stupefy') {
            c.stunT = DUEL.STUN_TIME;
            // falls stiff on its back and lies while the spell holds it (then gets up by itself)
            g.creatureImpact?.spellHit(c, 'Stupefy', src, byId, null, { down: DUEL.STUN_TIME });
        } else if (spell === 'IceDuel') {
            c.stunT = 8; c.frozenLook = 8;
            for (let i = 0; i < 20; i++) g.fx.spark(p, 0xbfe9ff, 0.12, _v2.set((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3), 0.8);
        } else if (spell === 'LevitateDuel') {
            if (c.isAnimal) g.animals.push(c, _v2.set(0, 13, 0), 2.5);
            else { c.stunT = 3; c.vy = 11; }
        } else if (spell === 'SapiraDuel') {
            g.fx.lightFlash(p, 0x8e2de2, 3, 0.4, 20);
            hit(10);
            if (!c.dead) g.creatureImpact?.spellHit(c, 'SapiraDuel', src, byId);
        }
    }

    /** Where the caster's hand is (for the way a spell pushes): their hand, or a step before the target. */
    _casterAt(byId, target) {
        const out = new THREE.Vector3();
        if (this._handOf(byId, 'right', out, new THREE.Vector3())) return out;
        return out.copy(target.group?.position || new THREE.Vector3()).add(new THREE.Vector3(0, 0, -3));
    }

    // ============================================================ effects
    /** A duel spell landed on my wizard. */
    _note(e) {
        this.log.push({ t: Math.round(this._t * 100) / 100, ...e });
        if (this.log.length > 30) this.log.shift();
    }

    applyToMe(spell, byId, side = 'right') {
        this._note({ ev: 'hitMe', spell, byId });
        const g = this.game;
        const c = g.combat;
        const p = c.center(_v1);
        this._burst(p, DUEL_SPELLS[spell].color, 40);
        // the way the charge pushes: from the caster's hand to me
        const hand = new THREE.Vector3();
        const from = this._handOf(byId, side || 'right', hand, new THREE.Vector3()) ? hand : null;
        const push = (k) => { const d = p.clone().sub(from || p.clone().add(_v2.set(0, 0, -1).applyAxisAngle(_v3.set(0, 1, 0), g.character.group.rotation.y))).setY(0); if (d.lengthSq() < 1e-6) d.set(0, 0, 1); return d.normalize().multiplyScalar(k); };
        if (spell === 'AvadaKedavra') {
            g.fx.lightFlash(p, 0x2dff5a, 6, 0.6, 30);
            g.hud.flashColor?.('rgba(40, 255, 90, 0.75)');
            // the body crumples back (off the feet; up again by a squat)
            g.knock?.knock({ dir: 'back', down: 1.5, by: byId, kind: 'avada' });
            // (not a killing curse: −25 HP at once)
            if (c.enabled) c.damage(25, byId, 'AvadaKedavra');
            else g.hud.setVoice('💚 Авада Кедавра попала в вас: −25 HP (здесь не ранит)', true);
        } else if (spell === 'Stupefy') {
            c.stun(DUEL.STUN_TIME, byId);
            // falls stiff on the back (the shield was checked on arrival); once the stun ends — the get-up squat
            g.impact?.apply({ v: push(4), from, by: byId, spell: 'Stupefy', always: { down: 1.5 }, noShield: true });
        } else if (spell === 'IceDuel') {
            if (c.enabled) c.freeze(byId);
            else c.stun(5, byId);
        } else if (spell === 'LevitateDuel') {
            // Lifted like a thing: my body hangs in front of the caster's hand and follows it
            // (until they let go — a fall from up there hurts — or my «Protection» breaks it)
            g.levitation.liftMe(byId, side || 'right');
        } else if (spell === 'SapiraDuel') {
            g.fx.lightFlash(p, 0x8e2de2, 4, 0.4, 20);
            g.hud.flashColor?.('rgba(142, 45, 226, 0.6)');
            if (c.enabled) c.damage(4, byId, 'Sapira');
            else g.hud.setVoice('💜 Сапира попала в вас', true);
            g.impact?.apply({ v: push(12), from, by: byId, spell: 'SapiraDuel', jolt: 3, noShield: true });
        }
    }

    applyToZombie(spell, z, byId, from = null) {
        const g = this.game;
        const src = from || this._casterAt(byId, z);
        const p = _v1.copy(z.group.position).add(_v2.set(0, 1, 0));
        this._burst(p, DUEL_SPELLS[spell].color, 30);
        if (spell === 'AvadaKedavra') {
            g.fx.lightFlash(p, 0x2dff5a, 4, 0.5, 25);
            g.damageZombie(z, 25, false, _v2.set(0, 0, 1), byId); // (−25 HP, not certain death)
            if (!z.isDead) g.creatureImpact?.spellHit(z, 'AvadaKedavra', src, byId);
        } else if (spell === 'Stupefy') {
            z.stunTimer = DUEL.STUN_TIME;
            g.creatureImpact?.spellHit(z, 'Stupefy', src, byId, null, { down: DUEL.STUN_TIME });
        } else if (spell === 'IceDuel') {
            z.freezeProgress = 1;
            z.freeze();
        } else if (spell === 'LevitateDuel') {
            z.vy = Math.max(z.vy || 0, 13);
        } else if (spell === 'SapiraDuel') {
            g.fx.lightFlash(p, 0x8e2de2, 3, 0.4, 20);
            g.damageZombie(z, 10, true, _v2.set(0, 0, 1), byId);
            if (!z.isDead) g.creatureImpact?.spellHit(z, 'SapiraDuel', src, byId);
        }
    }

    _end(b, res, broadcast = true) {
        if (!this.bolts.has(b.id)) return;
        this.bolts.delete(b.id);
        if (res === 'hit' && b.by === this.me) this._manaHit(b.spell);
        if (res === 'blocked' || res === 'fizzle') this._burst(b.front, DUEL_SPELLS[b.spell].color, 15);
        if (broadcast && this.game.sync && (b.by === this.me || res === 'hit' || res === 'blocked')) this.game.sync.duelEnd(b.id, res);
    }

    /** Another computer finished a charge (hit / blocked / fizzled). */
    remoteEnd(id, res) {
        const b = this.bolts.get(id);
        if (!b) return;
        this.bolts.delete(id);
        if (res === 'hit' && b.by === this.me) this._manaHit(b.spell);
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
        this.clashes.push({ a, b, p, t: 0, luckA: 0, luckB: 0, luckT: 0, lostA: 0, lostB: 0, v: 0, k: 3, pNet: null, rings: [], ringT: 0, marks: this._marks(a.by, b.by) });
        if (this.game.sound) this.game.sound.playThunder?.();
        if (a.by === this.me || b.by === this.me) this.game.hud.setVoice('⚡ ДУЭЛЬ! Держите руку на сопернике', true);
    }

    /** The referee's view of a message from the host. */
    remoteClash(m) {
        const a = this.bolts.get(m.a), b = this.bolts.get(m.b);
        if (!a || !b) return;
        let c = this.clashes.find((x) => x.a === a && x.b === b);
        if (!c) { this._startClash(a, b, m.p); c = this.clashes.find((x) => x.a === a && x.b === b); }
        // (glides to the host's value — it comes 10 times a second — instead of jumping)
        if (c) { c.pNet = m.p; c.v = m.v ?? 0; c.k = m.k ?? 3; }
    }

    _marks(aBy, bBy) {
        const [ma, mb] = markSlots(this._slot(aBy), this._slot(bBy));
        return [DUEL_MARK[ma], DUEL_MARK[mb]];
    }

    _markPool(hex) {
        return this.markPools[hex] || (this.markPools[hex] = new SegmentPool(this.game.scene, { capacity: 120, radius: 0.045, color: hex, transparent: true, opacity: 1, blending: THREE.AdditiveBlending }));
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
            // (own vectors: _playerPos writes into _v2 — the hand's direction must survive it)
            const hand = _ch, dir = this._myRay(bolt.side, _ch, _cd);
            const op = this._playerPos(opponentId, _co);
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
        if (!this._referee() && c.pNet != null) c.p += (c.pNet + c.v * 0.05 - c.p) * Math.min(1, dt * 10);
        // Draw both charges up to the meeting point
        const ha = new THREE.Vector3(), hb = new THREE.Vector3(), d = new THREE.Vector3();
        const okA = this._handOf(a.by, a.side, ha, d), okB = this._handOf(b.by, b.side, hb, d);
        if (okA && okB) {
            const m = ha.clone().lerp(hb, c.p);
            // each wizard's beam has a thin core of their own marker colour (the glow keeps the spell's)
            this._drawBolt(a.spell, ha, m, a.by, this._markPool(c.marks[0]));
            this._drawBolt(b.spell, hb, m, b.by, this._markPool(c.marks[1]));
            if (Math.random() < 0.7) this._burst(m, c.marks[Math.random() < 0.5 ? 0 : 1], 3);
            // each wand hand glows in its owner's colour: a colour is a person
            if (Math.random() < 0.6) { g.fx.spark(ha, c.marks[0], 0.2, _v3.set(0, 0.6, 0), 0.25); g.fx.spark(hb, c.marks[1], 0.2, _v3.set(0, 0.6, 0), 0.25); }
            // where they meet: who is winning, and who pushes now
            this._showMarker(c, ha, hb, m, dt);
            a.front.copy(m);
            b.front.copy(m);
        }
        if (a.by === this.me || b.by === this.me) {
            const mineA = a.by === this.me;
            g.hud.setDuelBar?.({ me: c.marks[mineA ? 0 : 1], them: c.marks[mineA ? 1 : 0], share: mineA ? c.p : 1 - c.p });
            this._barNow = true;
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
        c.v = (sa - sb) * DUEL.PUSH + maximaPush(ca.ok ? c.boostA : 0, cb.ok ? c.boostB : 0);
        c.k = (ca.ok ? 1 : 0) | (cb.ok ? 2 : 0);
        c.p = Math.min(1, Math.max(0, c.p + c.v * dt + (Math.random() - 0.5) * 0.02));

        // Leaving: hand calmly off the opponent first, then a flick = the duel just ends;
        // a flick straight from aiming (no calm move away first) = giving up
        let loser = null, dissolve = false;
        if (c.p >= 1) loser = b.by;
        else if (c.p <= 0) loser = a.by;
        else if (ca.jerk) { if (c.lostA > DUEL.CONTACT_GRACE) dissolve = true; else loser = a.by; }
        else if (cb.jerk) { if (c.lostB > DUEL.CONTACT_GRACE) dissolve = true; else loser = b.by; }

        c.sendT = (c.sendT || 0) - dt;
        if (c.sendT <= 0 && g.sync) { c.sendT = 0.1; g.sync.duelClash(a.id, b.id, c.p, c.v, c.k); }
        if (loser || dissolve) {
            this._note({ ev: 'clashEnd', loser, dissolve, p: Math.round(c.p * 100) / 100, lostA: c.lostA, lostB: c.lostB, jerkA: ca.jerk, jerkB: cb.jerk, a: a.by, b: b.by });
            this._finishClash(c, loser);
            if (g.sync) g.sync.duelClashEnd(a.id, b.id, loser);
        }
    }

    // ============================================================ «Максима»
    /**
     * «Максима» shouted alone during my clash: −5 mana at once, +5 % to my push in this
     * clash (it adds up), at most once every 3 s. The host does the push maths: a guest tells it.
     * @returns {string|null} 'Maxima' when it worked
     */
    maxima(isFinal = true) {
        const g = this.game;
        const c = this.clashes.find((x) => x.a.by === this.me || x.b.by === this.me);
        if (!c) return null;
        const now = performance.now();
        if (now - (this._maximaAt || -1e9) < DUEL.MAXIMA_EVERY * 1000) {
            if (isFinal) g.hud.setVoice(`⚡ «Максима» — не чаще раза в ${DUEL.MAXIMA_EVERY} секунды`, true);
            return null;
        }
        const cm = g.combat;
        if (cm.enabled && cm.fatigue < DUEL.MAXIMA_COST) {
            const msg = `😮‍💨 Не хватает маны: нужно ${DUEL.MAXIMA_COST}, есть ${Math.floor(cm.fatigue)}`;
            if (isFinal) g.hud.setVoice(msg, true);
            return null;
        }
        this._maximaAt = now;
        if (cm.enabled) cm.fatigue = Math.max(0, cm.fatigue - DUEL.MAXIMA_COST);
        this.applyMaxima(c.a.id, c.b.id, this.me);
        g.sync?.duelMaxima?.(c.a.id, c.b.id);
        return 'Maxima';
    }

    /** (everybody) a wizard shouted «Максима» in this clash: the host counts it; all see the pulse. */
    applyMaxima(aId, bId, by) {
        const c = this.clashes.find((x) => x.a.id === aId && x.b.id === bId);
        if (!c || (by !== c.a.by && by !== c.b.by)) return false;
        const A = by === c.a.by;
        if (this._referee()) {
            // (the host keeps the 3-second limit too: a guest can't push more often)
            const key = A ? 'maxAtA' : 'maxAtB';
            if (c.t - (c[key] ?? -1e9) < DUEL.MAXIMA_EVERY - 0.25) return false;
            c[key] = c.t;
            if (A) c.boostA = (c.boostA || 0) + 1; else c.boostB = (c.boostB || 0) + 1;
        }
        c.pulse = { t: 0, side: A ? 0 : 1 };
        this._note({ ev: 'maxima', by, boostA: c.boostA || 0, boostB: c.boostB || 0 });
        const g = this.game;
        if (g.sound) g.sound.playThunder?.();
        if (by === this.me) g.hud.setVoice('⚡ <b>МАКСИМА!</b> Ваш напор сильнее', true);
        else if (c.a.by === this.me || c.b.by === this.me) g.hud.setVoice('⚡ Соперник крикнул «Максима» — держитесь!', true);
        return true;
    }

    _finishClash(c, loser) {
        this.clashes = this.clashes.filter((x) => x !== c);
        const { a, b } = c;
        this.bolts.delete(a.id);
        this.bolts.delete(b.id);
        const winnerBolt = loser === a.by ? b : loser === b.by ? a : null;
        this._burst(a.front, winnerBolt && c.marks ? c.marks[winnerBolt === a ? 0 : 1] : 0xffffff, 40);
        if (!winnerBolt) {
            if (a.by === this.me || b.by === this.me) this.game.hud.setVoice('⚡ Дуэль прервана — никто не пострадал', true);
            return;
        }
        if (loser === this.me) this.applyToMe(winnerBolt.spell, winnerBolt.by, winnerBolt.side);
        else if (winnerBolt.by === this.me) {
            this.game.hud.setVoice(`⚡ Вы победили в дуэли: ${DUEL_SPELLS[winnerBolt.spell].name}!`, true);
            this._manaHit(winnerBolt.spell); // (my charge reached them)
            this._won = { id: loser, at: performance.now() }; // +5 mana if it kills them
        }
    }

    /** Mana: my duel charge hit (+1 to the maximum, Mana.js). */
    _manaHit(spell) {
        this.game.mana?.success(DUEL_SPELL_NAME[spell] || spell);
    }

    /** Someone I killed died: a clash I just won against them = a real duel won (+5 mana). */
    opponentDied(id) {
        const w = this._won;
        if (!w || w.id !== id || performance.now() - w.at > 8000) return false;
        this._won = null;
        this.game.mana?.duelWon();
        return true;
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
            if (w) this.applyToMe(w.spell, w.by, w.side);
        }
    }

    // ============================================================ hands
    _trackHands() {
        const ch = this.game.character;
        // in the body's own turn: turning round with the arm out is no jerk of the hand
        const inv = ch.group.quaternion ? _qInv.copy(ch.group.quaternion).invert() : null;
        for (const side of ['left', 'right']) {
            const h = ch.getHandWorldPosition(side, _v1).sub(ch.group.position);
            if (inv) h.applyQuaternion(inv);
            const list = this.jerk[side];
            list.push({ t: this._t, x: h.x, y: h.y, z: h.z });
            while (list.length && this._t - list[0].t > 0.5) list.shift();
        }
    }

    /** A real sharp jerk of this hand just now (see sharpJerk). */
    _jerked(side) {
        return sharpJerk(this.jerk[side]);
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
    _drawBolt(spell, from, to, by, core = null) {
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
            (core || pool.core).add(prev, p, this._segLife || 0.05);
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
     * Where two charges meet: a ball split in two — each half in its wizard's own
     * colour, facing them; the winner's half swells, the loser's shrinks (a hand
     * off the opponent: its half goes dim); a white core between; and rings in the
     * colour of whoever pushes harder right now roll towards the one giving way.
     */
    _showMarker(c, ha, hb, m, dt) {
        let mk = this._orbs[this._orbsUsed];
        if (!mk) {
            const mat = (o) => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
            const half = new THREE.SphereGeometry(0.3, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
            mk = { a: new THREE.Mesh(half, mat(0.9)), b: new THREE.Mesh(half, mat(0.9)), core: new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), mat(1)), rings: [] };
            mk.a.renderOrder = mk.b.renderOrder = mk.core.renderOrder = 5;
            this.game.scene.add(mk.a, mk.b, mk.core);
            this._orbs.push(mk);
        }
        this._orbsUsed++;
        const [colA, colB] = c.marks;
        const { lead, push } = clashLead(c.p, c.v);
        const toB = _mB.subVectors(hb, ha).normalize(), toA = _mA.copy(toB).negate();
        let pulse = 1 + Math.sin(c.t * 18) * 0.12;
        // «Максима»: the shouter's half flares up for half a second
        let flareA = 0, flareB = 0;
        if (c.pulse) {
            c.pulse.t += dt;
            const k = Math.max(0, 1 - c.pulse.t / 0.5);
            if (c.pulse.side === 0) flareA = k; else flareB = k;
            pulse += 0.5 * k;
            if (k <= 0) c.pulse = null;
        }
        for (const o of [mk.a, mk.b, mk.core]) { o.position.copy(m); o.visible = true; }
        mk.a.quaternion.setFromUnitVectors(_Y, toA);
        mk.b.quaternion.setFromUnitVectors(_Y, toB);
        mk.a.scale.setScalar(pulse * (1 + 0.45 * lead) * (1 + 0.6 * flareA));
        mk.b.scale.setScalar(pulse * (1 - 0.45 * lead) * (1 + 0.6 * flareB));
        mk.core.scale.setScalar(pulse);
        mk.a.material.color.setHex(colA);
        mk.b.material.color.setHex(colB);
        mk.a.material.opacity = c.k & 1 ? 0.9 : 0.3;
        mk.b.material.opacity = c.k & 2 ? 0.9 : 0.3;
        c.ringT -= dt;
        if (Math.abs(push) > 0.08 && c.ringT <= 0) {
            c.ringT = 0.45 - 0.3 * Math.abs(push);
            c.rings.push({ t: 0, to: push > 0 ? 'b' : 'a', col: push > 0 ? colA : colB });
        }
        c.rings = c.rings.filter((r) => (r.t += dt) < 0.6);
        let i = 0;
        for (const r of c.rings) {
            let ring = mk.rings[i++];
            if (!ring) {
                ring = new THREE.Mesh(_ringGeo || (_ringGeo = new THREE.TorusGeometry(0.34, 0.035, 6, 28)), new THREE.MeshBasicMaterial({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
                ring.renderOrder = 5;
                this.game.scene.add(ring);
                mk.rings.push(ring);
            }
            const k = r.t / 0.6, dir = r.to === 'a' ? toA : toB, hand = r.to === 'a' ? ha : hb;
            ring.position.copy(m).addScaledVector(dir, k * Math.min(1.6, m.distanceTo(hand) * 0.4)); // (never up to the face)
            ring.quaternion.setFromUnitVectors(_Z, dir);
            ring.scale.setScalar(1 + k * 0.9);
            ring.material.color.setHex(r.col);
            ring.material.opacity = 0.9 * (1 - k);
            ring.visible = true;
        }
        for (; i < mk.rings.length; i++) mk.rings[i].visible = false;
        c.view = { colA, colB, lead, push, rings: c.rings.length };
    }

    /** Called by the effects' update (segment pools fade the flicker). */
    updateVisuals(dt) {
        for (const p of Object.values(this.pools)) { p.core.update(dt); p.glow.update(dt); }
        for (const p of Object.values(this.markPools)) p.update(dt);
        // markers of duels that ended this frame disappear
        for (let i = this._orbsUsed; i < this._orbs.length; i++) { const o = this._orbs[i]; o.a.visible = o.b.visible = o.core.visible = false; for (const r of o.rings) r.visible = false; }
        this._orbsUsed = 0;
        if (this._barOn && !this._barNow) this.game.hud.setDuelBar?.(null);
        this._barOn = this._barNow;
        this._barNow = false;
    }
}
