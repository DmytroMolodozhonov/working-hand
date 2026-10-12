/**
 * CreatureImpact.js — pushes, staggers, knockdowns and head jolts for EVERY creature that is not a
 * player: zombies, villagers (farmers, knights, the king… and anybody else CastleLife runs), animals
 * (cows, pigs, sheep, horses) — and any new kind another module registers (`registerKind`).
 *
 * The same physics as a player's body (Impact.js): the blow gives the body a speed (heavier bodies
 * get less: v / mass; four legs stand firmer), and that speed decides:
 *   stagger    the body is shoved back (it slides), leans away, the arms flail / the legs scramble;
 *              for under a second it does nothing else, then its own mind takes over again.
 *   knockdown  it tips over the way it was pushed (pivoting on its feet: on its back, on its face,
 *              on a side — four-legged animals always fall on a side), lies at least 1.5 s (or as
 *              long as the spell says), then gets up BY ITSELF (its AI resumes after rising).
 *   head jolt  a blow on the head snaps it the way it was hit (a damped spring, as a player's).
 * A fall from a height after Leviosa knocks it over too (Levitation counts the damage).
 *   tumble     thrown by «Джолт»: the body flips over in the air (whole turns, round its middle)
 *              while it flies, and lands lying.
 *   daze       afterwards (once it is up again) it is dizzy for a while: it sways, and now and then
 *              it stumbles a step aside and can do nothing for a moment (`c.dazeT`: a wizard aims badly).
 *
 * Who decides: the host (it runs the creatures' bodies and minds). It moves the body and tells every
 * computer what happened (`cimp` events), so everybody sees the same fall. A guest's hands hitting a
 * creature send the blow to the host (`cstrike`), which checks it and applies it.
 *
 * The tilt is drawn by a pivot inside the creature's own model (its group still holds the AI's
 * place and heading): villagers already have one at the feet (model.root); for zombies and animals
 * the model's parts are moved under a pivot at the feet the first time they fall.
 */

import * as THREE from 'three';
import { IMPACT, KD, KD_NAME, classify, fallDir, quadFallDir, headKick, HeadJolt, SPELL_PHYSICS, spellPush, bodyOf } from './Impact.js';

export const CREATURE = { FALL_T: 0.45, RISE_T: 0.8, MIN_DOWN: 1.5, STAGGER_MAX: 0.8, FRICTION: 4, FRICTION_DOWN: 8, G: 24, GUEST_RISE: 20, REACH: 7 };

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _q = new THREE.Quaternion();
const HALF_PI = Math.PI / 2;

/** Add `add` to a rotation the creature's own animation may have set this frame (or not). */
export function overlay(obj, axis, add) {
    if (!obj) return;
    const u = obj.userData.impRot || (obj.userData.impRot = {});
    const cur = obj.rotation[axis];
    const was = u[axis];
    const base = was && Math.abs(cur - was.w) < 1e-9 ? was.w - was.a : cur;
    const w = base + add;
    obj.rotation[axis] = w;
    if (add === 0) delete u[axis]; else u[axis] = { w, a: add };
}

/** The parts of a model moved under one pivot (at local height `y`): it tips the whole body over. */
function wrapPivot(group, y = 0) {
    if (group.userData.impPivot) return group.userData.impPivot;
    const pivot = new THREE.Group();
    pivot.name = 'impact-pivot';
    pivot.position.y = y;
    const inner = new THREE.Group();
    inner.position.y = -y;
    for (const ch of [...group.children]) inner.add(ch);
    pivot.add(inner);
    group.add(pivot);
    group.userData.impPivot = pivot;
    pivot.userData.base = y;
    return pivot;
}

// ------------------------------------------------------------------ kinds
/**
 * A kind of creature: how to find it, which way it faces, its body, where it tips over, how its
 * own mind is paused and how it is moved. Other modules add theirs with `registerKind`.
 *   faces   −1: it looks along local −Z (villagers, animals); +1: along +Z (zombies)
 *   body(c) a CREATURE_BODY name (mass, four legs)
 *   pivot(c) {obj, base (local y of the pivot at rest), lie (extra height lying), scale}
 */
export const KINDS = {
    z: {
        name: 'zombie', faces: 1,
        list: (g) => g.zombies || [],
        get: (g, id) => g.zombieById?.get(id) || g.zombieById?.get(+id),
        alive: (c) => !c.isDead && !c.isDying && c.group?.visible !== false,
        body: (c) => (c.isTree ? 'tree' : 'zombie'),
        centre: (c, out) => out.copy(c.group.position).add(_w.set(0, 0.6, 0)),
        pivot: (c) => ({ obj: wrapPivot(c.group, -0.6), base: -0.6, lie: 0.1 }),
        head: (c) => c.head, arms: (c) => [c.leftArm, c.rightArm], legs: (c) => [c.leftLeg, c.rightLeg],
        move(g, c, dx, dz) { const p = c.group.position; p.x += dx; p.z += dz; g.collision?.resolveCylinder?.(p, 0.88, p.y - 1.0, 3.5, 1.05); },
        toss(g, c, vy) { c.vy = Math.max(c.vy || 0, vy); },
        hold(g, c, t) { c.stunTimer = Math.max(c.stunTimer || 0, t); c.isAttacking = false; },
        frozen: (c) => !!c.isFrozen,
        shatter(g, c, by) { g.damageZombie?.(c, 1, false, null, by); },
    },
    v: {
        name: 'villager', faces: -1,
        list: (g) => (g.castleLife ? [...g.castleLife.byId.values()] : []),
        get: (g, id) => g.castleLife?.byId.get(id),
        alive: (c) => !c.dead && !c.seated,
        body: (c) => (c.role === 'knight' || c.role === 'king' || c.role === 'wizard' ? c.role : 'person'),
        centre: (c, out) => out.set(c.x, c.y + 2.6, c.z),
        pivot: (c) => ({ obj: c.model.root, base: c.model.root.userData.impBase ?? (c.model.root.userData.impBase = c.model.root.position.y), lie: 0.5 }),
        head: (c) => c.model.head, arms: (c) => [c.model.leftArm, c.model.rightArm], legs: (c) => [c.model.leftLeg, c.model.rightLeg],
        move(g, c, dx, dz) {
            const cl = g.castleLife;
            if (!cl?._walkable || cl._walkable(c.x + dx, c.z + dz, c.y)) { c.x += dx; c.z += dz; }
            else if (cl._walkable(c.x + dx, c.z, c.y)) c.x += dx;
            else if (cl._walkable(c.x, c.z + dz, c.y)) c.z += dz;
        },
        toss(g, c, vy) { c.vy = Math.max(c.vy || 0, vy); },
        hold(g, c, t) { c.stunT = Math.max(c.stunT || 0, t); c.mode = 'idle'; c.speed = 0; },
        frozen: () => false,
    },
    a: {
        name: 'animal', faces: -1, quadFall: true,
        list: (g) => g.animals?.list || [],
        get: (g, id) => g.animals?.byId.get(id) || g.animals?.byId.get(+id),
        alive: (c) => !c.dead,
        body: (c) => c.type,
        centre: (c, out) => out.copy(c.group.position).add(_w.set(0, 0.5 * (c.group.scale.y || 1), 0)),
        pivot: (c) => { const s = c.group.scale.y || 1; return { obj: wrapPivot(c.group, 0), base: 0, lie: Math.max(0, 0.45 - 0.5 / s) }; },
        head: () => null, arms: () => [], legs: (c) => c.model?.userData?.legs || [],
        move(g, c, dx, dz) { const p = c.group.position; p.x += dx; p.z += dz; g.collision?.resolveCylinder?.(p, 0.6 * (c.group.scale.x || 1), p.y - 0.5, 2, 1.1); },
        toss(g, c, vy) { g.animals?.push?.(c, _w.set(0, vy, 0), 0.5); },
        hold(g, c, t) { c.stunT = Math.max(c.stunT || 0, t); },
        frozen: () => false,
        noKnock: (g, c) => !!c.rider, // (a horse with a rider on it stays up — it only reels)
    },
};

// a living tree («Alive»): heavy, rooted — it reels from a blow, it never falls over (its own fall is its death)
KINDS.T = {
    name: 'tree', faces: -1,
    list: (g) => g.livingTrees?.list || [],
    get: (g, id) => g.livingTrees?.byId.get(id),
    alive: (c) => c.phase === 'alive' || c.phase === 'rise',
    body: () => 'tree',
    centre: (c, out) => out.copy(c.model.position).add(_w.set(0, 3 * (c.model.userData.s || 1), 0)),
    pivot: (c) => ({ obj: wrapPivot(c.model, 0), base: 0, lie: 0 }),
    head: (c) => c.model.userData.head || null, arms: () => [], legs: () => [],
    move(g, c, dx, dz) { const p = c.model.position; p.x += dx; p.z += dz; g.collision?.resolveCylinder?.(p, 0.95 * (c.model.userData.s || 1), p.y, 3.0, 1.05); },
    toss() {}, hold() {}, frozen: () => false, noKnock: () => true,
};

/** Another module's creatures (wizards, living trees…) get pushed and knocked down too. */
export function registerKind(ck, kind) { KINDS[ck] = kind; }

/** Which kind an object is (null: not a creature this module knows). */
export function kindOf(c) {
    if (!c) return null;
    if (c.ck && KINDS[c.ck]) return c.ck;
    if (c.isAnimal) return 'a';
    if (c.isVillager) return 'v';
    if (c.isLivingTree) return 'T';
    if (c.isPlayer || c.isBoss || c.isBird) return null;
    if (typeof c.takeDamage === 'function' && c.group) return 'z';
    return null;
}

const ease = (k) => 1 - Math.cos(Math.min(1, Math.max(0, k)) * HALF_PI);
const smooth = (k) => { k = Math.min(1, Math.max(0, k)); return k * k * (3 - 2 * k); };

export class CreatureImpact {
    constructor(game) {
        this.game = game;
        this.active = new Map(); // ck|id → {ck, c, s (state)}
        this._out = [];
        this.log = []; // (tests) what happened to whom
    }

    get auth() { return this.game.authority !== false; }

    /** The creature's facing as a hero-style yaw (0 → looking along −Z). */
    _yaw(K, c) {
        c.group.getWorldQuaternion?.(_q) ?? _q.copy(c.group.quaternion);
        _v.set(0, 0, K.faces).applyQuaternion(_q);
        return Math.atan2(-_v.x, -_v.z);
    }

    _state(ck, c) {
        const key = ck + '|' + c.id;
        let e = this.active.get(key);
        if (!e) {
            e = { ck, c, s: { state: 'up', dir: 'back', t: 0, minDown: 0, lean: 0, leanDir: 'back', staggerT: 0, vx: 0, vz: 0, jolt: new HeadJolt(), flail: 0 } };
            this.active.set(key, e);
        }
        return e;
    }

    /** Is this creature lying / falling / getting up? */
    isDown(c) { const ck = kindOf(c); const e = ck && this.active.get(ck + '|' + c.id); return !!e && ['falling', 'down', 'rising'].includes(e.s.state); }
    stateOf(c) { const ck = kindOf(c); const e = ck && this.active.get(ck + '|' + c.id); return e ? e.s.state : 'up'; }

    /**
     * (host) A blow / push / spell on a creature.
     * o: {v: Vector3 impulse (hero m/s, y = toss), by, kind|spell, always: {down}|null, down, head: {lp, dir, speed} (head frame)
     *     | jolt (rad/s, from `from`), from, toss}
     * @returns 'none'|'stagger'|'knockdown'|'shatter'
     */
    apply(c, o) {
        const ck = kindOf(c);
        const K = ck && KINDS[ck];
        if (!K || !c.group || !K.alive(c)) return 'none';
        if (!this.auth) return 'none';
        if (c.lev) return 'none'; // (held up by Leviosa: the magic holds the body)
        // in a house's sphere of protection: a push / a spell from outside doesn't reach it (HouseWards.js)
        const src = o.from || (o.by != null ? this.game.wards?.casterAt?.(o.by) : null);
        if (src && this.game.wards?.shields(src, K.centre(c, _v))) return 'none';
        const B = bodyOf(K.body(c));
        const v = Math.hypot(o.v.x, o.v.z);
        let res = classify(v, { mass: B.mass, quad: B.quad, frozen: K.frozen(c) });
        if (o.always && res !== 'shatter') res = 'knockdown';
        if (v / B.mass >= IMPACT.KNOCK_ANY && res === 'stagger') res = 'knockdown';
        if (res === 'knockdown' && K.noKnock?.(this.game, c)) res = 'stagger';
        this._note(ck, c, o, res);
        if (res !== 'none') K.struck?.(this.game, c, o); // (the kind's own answer to it: a sailor's crew takes offence)
        if (res === 'shatter') { K.shatter?.(this.game, c, o.by); return res; }
        const e = this._state(ck, c), s = e.s;
        // the push: the body slides (heavier: slower) — unless its own physics already throws it (noSlide)
        if (!o.noSlide) { s.vx += o.v.x / B.mass; s.vz += o.v.z / B.mass; }
        const toss = Math.max(o.toss || 0, o.v.y > 2 ? o.v.y : 0) / Math.sqrt(B.mass);
        if (toss > 2 && !o.noSlide) {
            K.toss(this.game, c, toss);
            if (o.fly) s.airT = Math.max(s.airT || 0, 2 * toss / CREATURE.G); // (thrown: no ground to slow it until it comes down)
        }
        // the head
        const kick = this._kick(K, c, o);
        if (kick) { s.jolt.kick(kick); this._emit(ck, c, 'j', [r2(kick.pitch), r2(kick.yaw), r2(kick.roll)]); }
        const yaw = this._yaw(K, c);
        const dir = K.quadFall ? quadFallDir(o.v.x, o.v.z, yaw, -1, (c.id | 0) % 2 ? 1 : -1) : fallDir(o.v.x, o.v.z, yaw, -1);
        // thrown and tumbling over in the air («Джолт»): as long as it is in the air (at least a moment)
        const tumble = res === 'knockdown' && o.tumble > 0 && toss > 2 && !o.noSlide ? { turns: o.tumble | 0 || 1, dur: Math.max(0.5, 2 * toss / CREATURE.G + 0.15) } : null;
        if (res === 'knockdown') this._knock(ck, c, e, dir, o.always?.down ?? o.down ?? CREATURE.MIN_DOWN, true, tumble);
        else if (res === 'stagger') this._stagger(ck, c, e, dir, v / B.mass);
        // dizzy once it is up again (a heavy body less)
        if (o.daze > 0 && res !== 'none') this._daze(ck, c, e, o.daze / Math.sqrt(B.mass));
        return res;
    }

    _note(ck, c, o, res) {
        this.log.push({ ck, id: c.id, k: o.spell || o.kind || '?', res, v: Math.round(Math.hypot(o.v.x, o.v.z) * 10) / 10 });
        if (this.log.length > 40) this.log.shift();
    }

    /** A head kick (rad/s, head frame) for this blow, or null. */
    _kick(K, c, o) {
        const head = K.head(c);
        if (!head || (!o.head && !(o.jolt && o.from))) return null;
        head.getWorldQuaternion(_q).invert();
        if (o.head) {
            const d = _v.fromArray(o.head.dir).applyQuaternion(_q).normalize();
            return headKick(o.head.lp, [d.x, d.y, d.z], o.head.speed);
        }
        head.getWorldPosition(_w);
        const d = _v.copy(_w).sub(o.from).normalize().applyQuaternion(_q);
        return headKick([-d.x * 0.6, -d.y * 0.6, -d.z * 0.6], [d.x, d.y, d.z], o.jolt / (IMPACT.JOLT_GAIN * 0.7));
    }

    _knock(ck, c, e, dir, down, emit = true, tumble = null) {
        const s = e.s, K = KINDS[ck];
        const tum = tumble ? [tumble.turns, r2(tumble.dur)] : [];
        if (s.state === 'falling' || s.state === 'down') {
            s.minDown = Math.max(s.minDown, (s.state === 'down' ? s.t : 0) + down);
            if (tumble && !s.tum) this._tumble(K, c, s, tumble);
            if (emit) this._emit(ck, c, 'k', [KD[s.dir], down === Infinity ? -1 : r2(s.minDown - (s.state === 'down' ? s.t : 0)), ...tum]);
            return;
        }
        s.state = 'falling'; s.dir = dir; s.t = 0; s.minDown = down;
        s.riseDelay = 0.15 + ((typeof c.id === 'number' ? c.id : String(c.id).length) % 5) * 0.08;
        if (tumble) this._tumble(K, c, s, tumble);
        if (this.auth) K.hold(this.game, c, (tumble ? tumble.dur : 0) + CREATURE.FALL_T + Math.min(down, 60) + CREATURE.RISE_T + 1);
        if (emit) this._emit(ck, c, 'k', [KD[dir], down === Infinity ? -1 : r2(down), ...tum]);
    }

    /** It flips over in the air: whole turns round its middle (how high the middle is above the tilt's pivot). */
    _tumble(K, c, s, { turns, dur }) {
        let h = 1;
        try {
            const P = K.pivot(c), piv = P.obj;
            if (piv?.parent) {
                piv.parent.updateWorldMatrix?.(true, false);
                const base = piv.parent.localToWorld(_w.set(piv.position.x, P.base, piv.position.z));
                const sc = piv.parent.getWorldScale ? piv.parent.getWorldScale(new THREE.Vector3()).y || 1 : 1;
                h = (K.centre(c, _v).y - base.y) / sc;
            }
        } catch (e) { /* (no model yet) */ }
        s.tum = { turns: Math.max(1, Math.min(3, turns | 0)), dur: Math.max(0.3, Math.min(3, dur)), t: 0, h: Math.max(0.3, Math.min(4, h || 1)) };
    }

    /** Dizzy for `t` s once it is back on its feet (the longer one wins). */
    _daze(ck, c, e, t, emit = true) {
        const s = e.s;
        if (!(t > 0)) return;
        s.daze = Math.max(s.daze || 0, t);
        s.stumble = 0.8 + Math.random() * 0.6;
        if (this.auth) c.dazeT = Math.max(c.dazeT || 0, t + (['falling', 'down', 'rising'].includes(s.state) ? s.minDown + CREATURE.RISE_T + 1 : 0));
        if (emit) this._emit(ck, c, 'd', [r2(t)]);
    }

    _stagger(ck, c, e, dir, v, emit = true) {
        const s = e.s, K = KINDS[ck];
        if (s.state === 'falling' || s.state === 'down' || s.state === 'rising') return;
        s.state = 'stagger'; s.t = 0; s.leanDir = dir;
        s.staggerT = Math.min(CREATURE.STAGGER_MAX, 0.3 + v / 20);
        s.lean = Math.min(0.4, 0.14 + 0.014 * v);
        if (this.auth) K.hold(this.game, c, s.staggerT + 0.1);
        if (emit) this._emit(ck, c, 's', [KD[dir], r2(v)]);
    }

    _busy(s) { return s.state !== 'up' || s.jolt.busy || Math.abs(s.vx) + Math.abs(s.vz) > 0.05 || s.daze > 0 || !!s.tum; }

    _emit(ck, c, ev, args) {
        if (!this.auth || !this.game.sync) return;
        this._out.push([ck, c.id, ev, ...args]);
    }

    /** (guests) what the host says happened to its creatures. */
    onNet(list) {
        if (this.auth || !Array.isArray(list)) return;
        for (const it of list.slice(0, 200)) {
            if (!Array.isArray(it)) continue;
            const [ck, id, ev, a, b, c3, c4] = it;
            const K = KINDS[ck];
            const c = K?.get(this.game, id);
            if (!c || !c.group) continue;
            const e = this._state(ck, c);
            if (ev === 'k') this._knock(ck, c, e, KD_NAME[a] || 'back', b < 0 ? Infinity : Math.max(0.3, +b || 1.5) + 0.5, false, c3 > 0 ? { turns: +c3, dur: +c4 || 0.8 } : null);
            else if (ev === 'd') this._daze(ck, c, e, Math.min(30, +a || 0), false);
            else if (ev === 's') this._stagger(ck, c, e, KD_NAME[a] || 'back', +b || 4, false);
            else if (ev === 'r') { if (e.s.state === 'down' || e.s.state === 'falling') { e.s.state = 'rising'; e.s.t = 0; } }
            else if (ev === 'j') e.s.jolt.kick({ pitch: +a || 0, yaw: +b || 0, roll: +c3 || 0 });
        }
    }

    /**
     * (host) A guest's hands hit a creature: checked (that player stands near it, the blow is not
     * huge), then applied as if the host's own hands did it.
     */
    onStrike(m, fromId) {
        if (!this.auth) return 'none';
        const K = KINDS[m.ck];
        const c = K?.get(this.game, m.id);
        if (!c || !Array.isArray(m.i)) return 'none';
        const r = this.game.remotes?.get(fromId);
        if (r) { K.centre(c, _v); if (Math.hypot(_v.x - r.position.x, _v.z - r.position.z) > CREATURE.REACH) return 'none'; }
        const v = new THREE.Vector3(+m.i[0] || 0, +m.i[1] || 0, +m.i[2] || 0).clampLength(0, IMPACT.MAX_IMPULSE);
        const head = m.h && Array.isArray(m.h.lp) ? { lp: m.h.lp.slice(0, 3).map((x) => Math.max(-1.5, Math.min(1.5, +x || 0))), dir: v.clone().normalize().toArray(), speed: Math.min(20, +m.h.sp || 0) } : null;
        return this.apply(c, { v, by: fromId, kind: String(m.k || 'push').slice(0, 10), head });
    }

    // =============================================================== spells
    /**
     * (host) A spell reaches creatures: `pushAt(pos)` gives the push at a creature's centre (or null:
     * not reached) — the same function the spell uses for players. `kinds`: which kinds (all by default).
     */
    spellArea(name, casterId, pushAt, opts = {}) {
        if (!this.auth) return 0;
        const P = SPELL_PHYSICS[name] || {};
        let n = 0;
        for (const ck of opts.kinds || Object.keys(KINDS)) {
            const K = KINDS[ck];
            for (const c of K.list(this.game)) {
                if (!c.group || !K.alive(c) || opts.skip?.(c)) continue;
                const p = K.centre(c, new THREE.Vector3());
                const v = pushAt(p, c);
                if (!v) continue;
                const res = this.apply(c, { v: v.clone(), by: casterId, spell: name, jolt: P.jolt || 0, from: opts.from || null, noSlide: !!opts.noSlide?.(c), fly: !!opts.fly,
                    always: P.always ? { down: opts.down ?? P.down } : null, down: opts.down ?? P.down, toss: opts.toss ?? P.toss ?? 0 });
                if (res !== 'none') n++;
                opts.each?.(c, ck, res);
            }
        }
        return n;
    }

    /** (host) A spell from `from` hit this one creature (the push from SPELL_PHYSICS along from → it). */
    spellHit(c, name, from, casterId, push = null, opts = {}) {
        const ck = kindOf(c), K = ck && KINDS[ck];
        if (!K) return 'none';
        const P = SPELL_PHYSICS[name] || {};
        const centre = K.centre(c, new THREE.Vector3());
        let v;
        if (push) v = push.clone();
        else {
            v = centre.clone().sub(from).setY(0);
            if (v.lengthSq() < 1e-6) v.set(0, 0, 1);
            v.normalize().multiplyScalar(spellPush(name, centre.distanceTo(from)));
        }
        return this.apply(c, { v, by: casterId, spell: name, jolt: P.jolt || 0, from, always: P.always ? { down: opts.down ?? P.down } : null, down: opts.down ?? P.down, toss: P.toss || 0 });
    }

    // =============================================================== frame
    update(dt) {
        const g = this.game;
        for (const [key, e] of this.active) {
            const { ck, c, s } = e;
            const K = KINDS[ck];
            const gone = !c.group || !c.group.parent || !K.alive(c) || (ck === 'z' && g.zombieById && !g.zombieById.has(c.id)) || c.removable;
            if (gone) { this._release(K, c, s, true); this.active.delete(key); continue; }
            if (c.lev && s.state !== 'up') { this._release(K, c, s, false); s.state = 'up'; }
            s.t += dt;
            // the slide (host: it moves the body; friction is stronger lying on the ground)
            if (this.auth && (s.vx || s.vz)) {
                const lying = s.state === 'falling' || s.state === 'down';
                K.move(g, c, s.vx * dt, s.vz * dt);
                const air = s.airT > 0;
                if (air) s.airT -= dt;
                const f = air ? 1 : Math.max(0, 1 - (lying ? CREATURE.FRICTION_DOWN : CREATURE.FRICTION) * dt);
                s.vx *= f; s.vz *= f;
                if (Math.abs(s.vx) + Math.abs(s.vz) < 0.05) s.vx = s.vz = 0;
            }
            this._step(ck, K, c, s, dt);
            if (s.daze > 0 && s.state === 'up') this._dazed(K, c, s, dt);
            this._draw(K, c, s, dt);
            if (!this._busy(s)) { this._release(K, c, s, false); this.active.delete(key); }
        }
        if (this._out.length && g.sync) { g.sync.creatureImpacts?.(this._out.splice(0, 200)); this._out.length = 0; }
    }

    /** Dizzy on its feet: it sways; now and then (host) a stumble a step aside — and a moment of nothing. */
    _dazed(K, c, s, dt) {
        s.daze -= dt;
        s.dazeT2 = (s.dazeT2 || 0) + dt;
        if (s.daze <= 0) { s.daze = 0; if (this.auth) c.dazeT = 0; return; }
        if (this.auth) c.dazeT = s.daze;
        s.stumble = (s.stumble ?? 1) - dt;
        if (s.stumble > 0 || !this.auth) return;
        s.stumble = 0.9 + Math.random() * 1.1;
        const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 1.5;
        s.vx += Math.cos(a) * sp; s.vz += Math.sin(a) * sp;
        K.hold(this.game, c, 0.45);
        if (c.isAttacking) c.isAttacking = false;
    }

    _step(ck, K, c, s, dt) {
        switch (s.state) {
            case 'stagger':
                if (s.t >= s.staggerT) { s.state = 'up'; s.t = 0; }
                break;
            case 'falling':
                if (s.t >= CREATURE.FALL_T) {
                    s.state = 'down'; s.t = 0;
                    if (this.game.fx?.spark) for (let i = 0; i < 6; i++) this.game.fx.spark(K.centre(c, _v).setY(_v.y - 0.8), 0x8a7a60, 0.15, _w.set((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3), 0.5);
                }
                break;
            case 'down':
                if (this.auth) {
                    K.hold(this.game, c, CREATURE.RISE_T + 0.5);
                    // gets up by itself once it has lain long enough (each a moment apart)
                    if (s.minDown !== Infinity && s.t >= s.minDown + (s.riseDelay || 0)) { s.state = 'rising'; s.t = 0; this._emit(ck, c, 'r', []); }
                } else if (s.t > CREATURE.GUEST_RISE) { s.state = 'rising'; s.t = 0; }
                break;
            case 'rising':
                if (s.t >= CREATURE.RISE_T) { s.state = 'up'; s.t = 0; }
                break;
        }
    }

    /** The tilt, the head and the flailing limbs (every computer draws it the same way). */
    _draw(K, c, s, dt) {
        const P = K.pivot(c);
        const piv = P.obj;
        let ang = 0, lift = 0, dir = s.state === 'stagger' ? s.leanDir : s.dir;
        if (s.state === 'falling') { ang = HALF_PI * ease(s.t / CREATURE.FALL_T); lift = 0; }
        else if (s.state === 'down') { ang = HALF_PI; lift = 1; }
        else if (s.state === 'rising') { const k = 1 - smooth(s.t / CREATURE.RISE_T); ang = HALF_PI * k; lift = k; }
        else if (s.state === 'stagger') ang = s.lean * Math.sin(Math.PI * Math.min(1, s.t / s.staggerT));
        if (s.state === 'falling') lift = ease(s.t / CREATURE.FALL_T);
        s.angle = ang;
        // tumbling over in the air: whole turns on top of the fall (eased: it ends as the fall does)
        let spin = 0;
        if (s.tum) {
            s.tum.t += dt;
            const k = Math.min(1, s.tum.t / s.tum.dur);
            spin = s.tum.turns * Math.PI * 2 * smooth(k);
            if (k >= 1) spin = 0;
        }
        // dizzy on its feet: a slow sway from side to side
        let sway = 0;
        if (s.daze > 0 && s.state === 'up') sway = Math.min(1, s.daze / 1.5) * (0.13 * Math.sin((s.dazeT2 || 0) * 2.3) + 0.05 * Math.sin((s.dazeT2 || 0) * 5.1));
        if (piv) {
            const f = K.faces;
            const turn = (a) => { let x = 0, z = 0; if (dir === 'back') x = -f * a; else if (dir === 'front') x = f * a; else if (dir === 'right') z = f * a; else z = -f * a; return [x, z]; };
            const [rx, rz] = turn(ang);
            piv.rotation.x = rx; piv.rotation.z = rz + sway;
            piv.position.y = P.base + (P.lie || 0) * lift * Math.sin(ang);
            if (s.tum) {
                // round its middle, not its feet: the pivot moves so that the middle stays put
                if (s.tum.x0 == null) { s.tum.x0 = piv.position.x; s.tum.z0 = piv.position.z; }
                const [sx, sz] = turn(ang + spin), h = s.tum.h;
                piv.rotation.x = sx; piv.rotation.z = sz;
                // (0, h, 0) turned by x: (0, h cos, h sin); by z: (−h sin, h cos, 0)
                const dy = h * (Math.cos(rx) * Math.cos(rz) - Math.cos(sx) * Math.cos(sz));
                piv.position.x = s.tum.x0 + h * (Math.sin(sz) - Math.sin(rz));
                piv.position.y += dy;
                piv.position.z = s.tum.z0 + h * (Math.sin(rx) - Math.sin(sx));
                if (spin === 0) { piv.position.x = s.tum.x0; piv.position.z = s.tum.z0; s.tum = null; }
            }
        }
        // the head snaps and comes back
        const J = s.jolt.step(dt);
        const head = K.head(c);
        if (head) { overlay(head, 'x', J.pitch); overlay(head, 'y', J.yaw); overlay(head, 'z', J.roll); }
        // reeling: the arms flail, the legs step / scramble; falling: the arms go out
        const reel = s.state === 'stagger' ? Math.sin(Math.PI * Math.min(1, s.t / s.staggerT)) : s.state === 'falling' ? 1 - s.t / CREATURE.FALL_T : 0;
        s.flail += dt * 22;
        const [la, ra] = K.arms(c);
        const fl = reel * (0.5 + 0.35 * Math.sin(s.flail));
        overlay(la, 'z', -fl); overlay(ra, 'z', fl);
        const legs = K.legs(c);
        legs.forEach((l, i) => overlay(l, 'x', s.state === 'stagger' ? reel * 0.55 * Math.sin(s.flail * 0.6 + (i % 2 ? Math.PI : 0)) : 0));
    }

    /** Back to the creature's own animation (alive: upright; dead: its death takes over). */
    _release(K, c, s, dead) {
        if (!c.group) return;
        try {
            const P = K.pivot(c);
            // (a villager's own death fall turns the same root: only the sideways tilt is taken back)
            if (P.obj && dead && P.obj === c.model?.root) P.obj.rotation.z = 0;
            else if (P.obj) { P.obj.rotation.x = 0; P.obj.rotation.z = 0; P.obj.position.y = P.base; }
            if (P.obj && s.tum?.x0 != null) { P.obj.position.x = s.tum.x0; P.obj.position.z = s.tum.z0; }
            s.tum = null;
        } catch (e) { /* (a model already gone) */ }
        const head = K.head(c);
        if (head) { overlay(head, 'x', 0); overlay(head, 'y', 0); overlay(head, 'z', 0); }
        const [la, ra] = K.arms(c);
        overlay(la, 'z', 0); overlay(ra, 'z', 0);
        for (const l of K.legs(c)) overlay(l, 'x', 0);
        s.state = 'up';
    }
}

const r2 = (v) => Math.round(v * 100) / 100;
