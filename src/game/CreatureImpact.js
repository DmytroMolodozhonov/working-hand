import { kickDeadDoll } from './DeathImpulse.js';
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
import { FX } from '../fx/WizardFx.js';
import { lieClearPush } from './LieClear.js';
import { stepBody, bounce, lieProbe, GUARD, guardWorld, standFree, freeSpot } from './SolidGuard.js';
import { Ragdoll, DOLL } from './Ragdoll.js';
import * as RagPose from './RagdollPose.js';
import { ANIMAL_RIG, hasDoll } from './AnimalRagdoll.js';

/**
 * The rag doll (Ragdoll.js, RagdollPose.js): a person knocked off his feet, thrown («Джолт», a blast, a blow) or killed is drawn BY the doll —
 * he flies, hits the wall, goes limp against it, a leg over the chest's lid, an arm along the bed's edge — and lies as he fell.
 * Only near the hero (NEAR m) and at most MAX bodies at once (the rest fall the old way: tilted over); the dolls' work a frame is held
 * to BUDGET_MS (a doll over it waits a frame). A doll asleep costs nothing.
 */
export const RAG = { NEAR: 45, MAX: 8, BUDGET_MS: 2.5, DEAD_TIP: 1.6, UP_MAX: 3.4, UP_NEAR: 0.07, BLEND_T: 0.25 };
import { FIRM, absoluteStops } from './FirmRules.js';
import { creatureHolds, creatureAbsolute, ordinaryOutcome, creatureSteady, windShieldRule, STEADY, braceProfile, braceTime, braceLean } from './Steadiness.js';
import { IMPACT, KD, KD_NAME, classify, fallDir, quadFallDir, headKick, HeadJolt, SPELL_PHYSICS, spellPush, bodyOf } from './Impact.js';

export const CREATURE = { FALL_T: 0.45, RISE_T: 0.8, MIN_DOWN: 5, EXTRA_DOWN: [1, 5], // (the author: knocked off its feet, it lies 5 s at least + 1…5 s by chance — knights don't spring up at once)
    STAGGER_MAX: 0.8, FRICTION: 4, FRICTION_DOWN: 8, G: 24, GUEST_RISE: 20, REACH: 7 };

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
    for (const ch of [...group.children]) if (!ch.userData.farOne) inner.add(ch); // (FarShape: its skinned mesh stays on the root — its bones are the parts inside)
    pivot.add(inner);
    group.add(pivot);
    group.userData.impPivot = pivot;
    pivot.userData.base = y;
    return pivot;
}

/** A body's half-width kept from a wall when it is pushed (m). */
const BODY_CLEAR = 0.45;

const _got = { x: 0, z: 0 }, _want = { x: 0, z: 0 };
const _pt = [0, 0, 0], _fr = new Float64Array(9);

/**
 * Move `p` by (dx, dz) in sub-steps of at most half the body's radius, each one pushed out of the blocks AND the boxes (a hard throw never
 * skips a wall or a bed). → the metres really moved {x, z} (a reused object).
 */
function slide(p, dx, dz, resolve, r = 0.6) {
    const x0 = p.x, z0 = p.z;
    const n = Math.max(1, Math.ceil(Math.hypot(dx, dz) / (r * GUARD.SUB_K)));
    for (let i = 0; i < n; i++) { p.x += dx / n; p.z += dz / n; resolve(p); }
    _got.x = p.x - x0; _got.z = p.z - z0;
    return _got;
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
        move(g, c, dx, dz) { return slide(c.group.position, dx, dz, (p) => g.collision?.resolveCylinder?.(p, 0.88, p.y - 1.0, 3.5, 1.05), 0.88); },
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
            // (thrown up into the air: only a wall stops it — a walker's step test would hold it in place)
            const base = c.vy && cl?._airFree ? (x, z) => cl._airFree(x, z, c.y) : (x, z) => !cl?._walkable || cl._walkable(x, z, c.y);
            // (the whole body, not its middle point: shoulders keep BODY_CLEAR from the wall, like a walking step does; the beds, chests
            // and every other box too — SolidGuard.js — and in sub-steps of half the radius, so a 60 m/s Jolt never skips one)
            const R = BODY_CLEAR * (c.role === 'knight' || c.role === 'king' ? 1.3 : 1);
            const W = guardWorld(g), feet = c.y;
            const ok = (x, z) => base(x, z) && base(x + R, z) && base(x - R, z) && base(x, z + R) && base(x, z - R);
            const o = stepBody({ boxes: W.boxes, solid: null }, c, dx, dz, R, feet, _got, ok); // (flying high over a bed: its feet clear the box — it passes over)
            // (on its feet or lying, it goes along the ground: up a slope it climbs it, never sinks into the hill)
            if (!c.vy) cl?._ground?.(c);
            if (c.arena) g.arenaDuels?.cageNpc?.(c); // (a duellist pushed at an arena in a duel: the dome's wall holds him, however hard the shove)
            return o;
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
        move(g, c, dx, dz) { return slide(c.group.position, dx, dz, (p) => g.collision?.resolveCylinder?.(p, 0.6 * (c.group.scale.x || 1), p.y - 0.5, 2, 1.1), 0.6 * (c.group.scale.x || 1)); },
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
    move(g, c, dx, dz) { return slide(c.model.position, dx, dz, (p) => g.collision?.resolveCylinder?.(p, 0.95 * (c.model.userData.s || 1), p.y, 3.0, 1.05), 0.95); },
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
        this.rnd = Math.random; // (tests: a fixed roll)
        this.deadRags = new Map(); // ck|id → {c, doll, ck} (a dead body still settling / lying as a rag doll)
        this._pose = [];
    }

    /** How many rag dolls are moving now (alive and dead; a doll asleep costs nothing and is not counted). */
    ragCount() { let n = 0; for (const r of this.deadRags.values()) if (!r.doll.asleep) n++; for (const e of this.active.values()) if (e.s.rag) n++; return n; }

    /** Is this body drawn by a rag doll now (its own place / fall / guard must not move it)? */
    ragOf(c) { const ck = kindOf(c); const e = ck && this.active.get(ck + '|' + c.id); return !!(e?.s.rag || e?.s.pose || this.deadRags.has(ck + '|' + c.id)); }

    /**
     * The rig of a humanoid body (RagdollPose.js): null — a VillagerModel (villagers, wizards, knights, the king, merchants, wanderers; a sailor
     * ashore), a rig object — a zombie, a Taron; false — no rag doll for it (an animal, a tree, a sailor on a moving deck, a body with no model).
     * (the ice giants, the Queen and the snowmen do not fall at all — noKnock, the author's rule; the gargoyles fly; Diabolos is chained)
     */
    _rig(ck, c) {
        if (ck === 'v') return c.model?.leftKnee && c.model.root ? null : false;
        if (ck === 'c') return !c.ship && c.model?.leftKnee && c.model.root ? null : false; // (on a deck: the ship moves under him — his own deck physics)
        if (ck === 'z') return c.group && c.leftArm && c.leftLeg && !c.isTree ? RagPose.ZOMBIE_RIG : false;
        if (ck === 'T') return c.model?.userData?.root && c.model.userData.kneeL ? RagPose.TARON_RIG : false;
        if (ck === 'a') return c.dead && hasDoll(c.type) && c.model?.userData?.legs?.length === 4 && c.model.userData.neck && c.model.userData.head ? ANIMAL_RIG : false; // (a DEAD cow, pig, sheep, horse — AnimalRagdoll.js; the living keep their own fall)
        return false;
    }

    /** May a doll start for this body (a humanoid with a model of parts, near the hero, room for one more)? */
    _ragOk(ck, c) {
        if (this._rig(ck, c) === false || c.seated || c.lev || c.carriedBy) return false;
        const me = this.game.character?.group?.position;
        const K = KINDS[ck];
        if (me && K) { K.centre(c, _v); if (Math.hypot(_v.x - me.x, _v.z - me.z) > RAG.NEAR) return false; }
        return this.ragCount() < RAG.MAX;
    }

    /** The doll takes the model's pose of this moment and flies with (vx, vy, vz); `tip` (rad/s) topples it over the way it is pushed. */
    _ragStart(ck, c, s, vx, vy, vz, tip = 0) {
        const rig = this._rig(ck, c);
        let doll;
        if (rig) {
            if (ck === 'z') KINDS.z.pivot(c); // (the zombie's parts under one pivot — made the first time it falls)
            rig.begin?.(c);
            doll = new Ragdoll(rig.spec(c));
            RagPose.fromRig(doll, rig, c);
        } else {
            doll = new Ragdoll();
            RagPose.fromModel(doll, c.model);
        }
        doll.tone = c.dead || c.isDead || c.hp <= 0 ? 0 : DOLL.TONE_LIVE; // (alive: half as slack as a dead body — it still holds itself)
        doll.launch(vx, vy, vz, 0);
        if (tip) {
            // (the upper body goes on with the push, the feet stay a moment: it topples — and Jolt's turns go over the head)
            const n = Math.hypot(vx, vz) || 1, dx = vx / n, dz = vz / n;
            let yc = 0;
            for (let i = 0; i < 11; i++) yc += doll.x[i * 3 + 1];
            yc /= 11;
            for (let i = 0; i < 11; i++) { const h = doll.x[i * 3 + 1] - yc; doll.o[i * 3] -= dx * h * tip * 1 / 60; doll.o[i * 3 + 2] -= dz * h * tip * 1 / 60; }
        }
        s.rag = doll; s.pose = null; s.rig = rig;
        c.rag = true;
        c.vy = 0; // (the doll flies — not the body's own fall: CastleLife._fallStep, the zombie's gravity)
        return doll;
    }

    // ---------------------------------------------------------------- «Вингардиум Левиоса» on a body: a rag doll in the air
    /**
     * (host) A body lifted by «Левиоса» hangs as a rag doll (the author 05.11: «при помощи Вингардиум Левиоса у него всё ещё продолжает он
     * быть тряпичной куклой… не должна вот эта анимация проигрываться»): held by the chest at the hand's point, the arms and legs hang and
     * swing by their weight — a living one holding itself at half (Ragdoll.tone), a dead one slack. → the doll, or null (no humanoid rig:
     * an animal keeps its own kicking).
     */
    levDoll(ck, c) {
        const key = ck + '|' + c.id;
        const had = this.levDolls?.get(key);
        if (had) return had.doll;
        const rig = this._rig(ck, c);
        if (rig === false) return null;
        const e = this.active.get(key);
        let doll = e?.s.rag || this.deadRags.get(key)?.doll || null;
        if (doll) { if (e) { e.s.rag = null; e.s.pose = null; this._release(KINDS[ck], c, e.s, false); this.active.delete(key); } this.deadRags.delete(key); }
        else if (rig) { if (ck === 'z') KINDS.z.pivot(c); rig.begin?.(c); doll = new Ragdoll(rig.spec(c)); RagPose.fromRig(doll, rig, c); doll.launch(0, 0, 0, 0); }
        else { doll = new Ragdoll(); RagPose.fromModel(doll, c.model); doll.launch(0, 0, 0, 0); }
        doll.tone = c.dead || c.isDead ? 0 : DOLL.TONE_LIVE;
        doll.wake();
        (this.levDolls || (this.levDolls = new Map())).set(key, { c, ck, doll, rig });
        c.rag = true;
        return doll;
    }

    /** (host) A frame of a held doll: its chest pulled to `at` (the hand's point), the rest by its weight; the model and the body's place follow. */
    levDollStep(ck, c, at, dt) {
        const r = this.levDolls?.get(ck + '|' + c.id);
        if (!r) return false;
        const d = r.doll, x = d.x, o = d.o;
        if (!Number.isFinite(at.x) || !Number.isFinite(at.y) || !Number.isFinite(at.z)) return true; // (never a NaN into the doll: the body would vanish)
        d.at(11, _pt); // (the chest: the shoulders' middle)
        // the hold carries the whole body along (every point moved alike, its swing kept) — the chest to `at`, smoothly
        const k = 1 - Math.exp(-dt * 14);
        const dx = (at.x - _pt[0]) * k, dy = (at.y - _pt[1]) * k, dz = (at.z - _pt[2]) * k;
        for (let i = 0; i < 11; i++) { const q = i * 3; x[q] += dx; x[q + 1] += dy; x[q + 2] += dz; o[q] += dx; o[q + 1] += dy; o[q + 2] += dz; }
        // the shoulders are where the magic grips: pinned (no fall, no spin of their own), the torso, arms and legs hang from them
        const S = this._pinS || (this._pinS = new Float64Array(6));
        for (let j = 0; j < 2; j++) for (let q = 0; q < 3; q++) S[j * 3 + q] = x[(1 + j) * 3 + q];
        d.asleep = false; d.age = Math.min(d.age, 1);
        d.step(guardWorld(this.game), dt);
        for (let j = 0; j < 2; j++) for (let q = 0; q < 3; q++) { x[(1 + j) * 3 + q] = S[j * 3 + q]; o[(1 + j) * 3 + q] = S[j * 3 + q]; }
        this._ragDraw(c, d, r.rig);
        d.at(12, _pt);
        if (r.rig) r.rig.place(c, _pt[0], _pt[1] - 1.9, _pt[2]);
        else { c.x = _pt[0]; c.z = _pt[2]; c.y = _pt[1] - 1.9; if (c.group) c.group.position.set(c.x, c.y + 1.95, c.z); }
        return true;
    }

    /** (host) Let go: the doll falls on with `vel` (a throw) — knocked down as by a blow (it lies, then gets up), or lies dead. */
    levDollRelease(ck, c, vel = null) {
        const key = ck + '|' + c.id;
        const r = this.levDolls?.get(key);
        if (!r) return false;
        this.levDolls.delete(key);
        const d = r.doll;
        if (vel) d.push(vel.x, vel.y, vel.z);
        d.wake();
        if (c.dead || c.isDead) { d.tone = 0; this.deadRags.set(key, { c, doll: d, ck, rig: r.rig }); return true; }
        const e = this._state(ck, c), s = e.s;
        const yaw = this._yaw(KINDS[ck], c);
        this._knock(ck, c, e, fallDir(vel?.x || 0, vel?.z || 0, yaw, -1), CREATURE.MIN_DOWN, true, null);
        s.rag = d; s.pose = null; s.rig = r.rig; s.vx = s.vz = 0;
        c.rag = true; c.vy = 0;
        return true;
    }

    /** Draw the body from its doll (`dy`: a corpse sinking at the end). */
    _ragDraw(c, doll, rig, dy = 0) { if (rig) RagPose.toRig(doll, rig, c, dy); else RagPose.toModel(doll, c.model); }

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
        if (this.game.temple?.wards?.(c.group.position)) return 'none'; // (in the Gods' temple: its golden ward — nobody is thrown)
        if (c.lev) return 'none'; // (held up by Leviosa: the magic holds the body)
        if (K.immune?.(this.game, c, o)) return 'none'; // (the kind's own «не действует»: a phoenix in the air and an earthquake)
        // in a house's sphere of protection: a push / a spell from outside doesn't reach it (HouseWards.js)
        const src = o.from || (o.by != null ? this.game.wards?.casterAt?.(o.by) : null);
        if (src && this.game.wards?.shields(src, K.centre(c, _v))) return 'none';
        const B = bodyOf(K.body(c));
        // (it holds fast where it stands — Captain Black Moustache and his skeletons on a deck, Sailors.BRACE: «держатся
        // на палубе»): braced, it gives a little along the deck, never falls, never flies; the damage is the spell's own
        if (K.braces?.(this.game, c, o)) {
            this._note(ck, c, o, 'brace');
            K.struck?.(this.game, c, o);
            K.brace(this.game, c, o.v.x / B.mass, o.v.z / B.mass);
            return 'stagger';
        }
        // «Wind» / «Wind Maxima» against a wizard's raised «Protection» (Steadiness.windShieldRule): the dome — not even the air gets
        // through; the hand shield, from the front — a Wind Maxima fells all but the steadier than its push (the Master: 100)
        const wind = ck === 'v' && STEADY.WIND_KINDS.has(o.spell) ? this._windShield(c, o) : null;
        if (wind === 'none') {
            this._note(ck, c, o, 'none');
            if (o.by != null && o.by === this.game.localId) this.game.hud?.setVoice?.('🛡️ Protection Maxima остановил даже воздух', true);
            return 'none';
        }
        const v = Math.hypot(o.v.x, o.v.z);
        let res = classify(v, { mass: B.mass, quad: B.quad, frozen: K.frozen(c) });
        if (o.always && res !== 'shatter') res = 'knockdown';
        if (v / B.mass >= IMPACT.KNOCK_ANY && res === 'stagger') res = 'knockdown';
        if (res === 'knockdown' && K.noKnock?.(this.game, c)) res = 'stagger';
        // «Устойчивость» (Steadiness.js): every creature has its own, fixed (creatureSteady). A SPELL that would knock it down
        // may find it on its feet — the same chance and exceptions as the hero's: it reels in the «устоял» pose, the shove
        // is halved, nothing flips it over (a hand, a horn, a sword, a ball are no spells: not resisted)
        let held = false;
        // ordinary villagers (Steadiness.ORDINARY): Overgrown / Wind Maxima / Jolt / Disarmor ignore steadiness — they work; a rare miss is still a recoil («держится»)
        const ord = res !== 'shatter' && !o.stand ? ordinaryOutcome(ck, c, o.spell, this.rnd) : null;
        if (o.stand && res !== 'shatter') { held = true; res = 'stagger'; } // (a snowball: a shove that never fells — the «устоял» pose, the push as given)
        else if (res === 'knockdown' && o.spell && !ord && creatureHolds(ck, c, o.spell, { cause: o.cause })) {
            held = true; res = 'stagger';
            o = { ...o, v: o.v.clone().multiplyScalar(STEADY.HELD_PUSH_K), toss: (o.toss || 0) * STEADY.HELD_PUSH_K, fly: false, tumble: 0 };
        }
        if (ord === 'works') res = 'knockdown'; // (even a weak reach: Overgrown at the edge of its range still throws him)
        else if (ord) { // (no effect, or the rare miss: the recoil — a foot set back, the push halved, no flip)
            held = true; res = 'stagger';
            o = { ...o, v: o.v.clone().multiplyScalar(STEADY.HELD_PUSH_K), toss: (o.toss || 0) * STEADY.HELD_PUSH_K, fly: false, tumble: 0 };
        }
        if (wind === 'held' && res !== 'shatter') { held = true; res = 'stagger'; o = { ...o, v: o.v.clone().multiplyScalar(STEADY.HELD_PUSH_K), toss: (o.toss || 0) * STEADY.HELD_PUSH_K, fly: false, tumble: 0 }; }
        else if (wind === 'fall' && res !== 'none' && res !== 'shatter') res = 'knockdown';
        // the mark of absolute steadiness (a wizard's, Steadiness.creatureAbsolute): nothing fells him — not the wind, not a blast, not a fall; the «устоял» pose, the push a fraction
        if (res === 'knockdown' && ck === 'v' && creatureAbsolute(ck, c) && absoluteStops(o.spell || o.kind) && !K.frozen(c)) {
            held = true; res = 'stagger';
            o = { ...o, v: o.v.clone().multiplyScalar(FIRM.PUSH_K), toss: 0, fly: false, tumble: 0 };
        }
        const vHeld = Math.hypot(o.v.x, o.v.z);
        this._note(ck, c, o, held ? 'held' : res);
        if (res === 'knockdown' && ck === 'v' && (o.spell === 'Wind' || o.spell === 'WindMaxima')) this.game.castleLife?.windKnocked?.(c, o.by); // (a wizard knocked down twice by the wind may teach a lesson — nothing else)
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
        // the rag doll: knocked off his feet near the hero — he is drawn by it (another blow on a body lying there pushes the doll on)
        if (res === 'knockdown' && !o.noSlide) {
            const tip = tumble ? (tumble.turns * Math.PI * 2) / tumble.dur : Math.min(6, 0.9 + Math.hypot(o.v.x, o.v.z) / B.mass * 0.12);
            if (s.rag) { s.rag.push(o.v.x / B.mass, toss, o.v.z / B.mass); s.pose = null; c.vy = 0; this._emit(ck, c, 'g', [r2(o.v.x / B.mass), r2(toss), r2(o.v.z / B.mass), 0, 1]); }
            else if (this._ragOk(ck, c)) { this._ragStart(ck, c, s, s.vx, toss, s.vz, tip); this._emit(ck, c, 'g', [r2(s.vx), r2(toss), r2(s.vz), r2(tip), 0]); }
        }
        else if (res === 'stagger') this._stagger(ck, c, e, dir, (held ? vHeld : v) / B.mass, true, held);
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
        // (the author: 5 s at least, and 1…5 s more by chance — the host draws it, the guests get it in 'k')
        if (down !== Infinity) down = Math.max(down ?? CREATURE.MIN_DOWN, CREATURE.MIN_DOWN) + (emit ? CREATURE.EXTRA_DOWN[0] + Math.random() * (CREATURE.EXTRA_DOWN[1] - CREATURE.EXTRA_DOWN[0]) : 0);
        const tum = tumble ? [tumble.turns, r2(tumble.dur)] : [];
        if (s.state === 'falling' || s.state === 'down') {
            s.minDown = Math.max(s.minDown, (s.state === 'down' ? s.t : 0) + down);
            if (tumble && !s.tum) this._tumble(K, c, s, tumble);
            if (emit) this._emit(ck, c, 'k', [KD[s.dir], down === Infinity ? -1 : r2(s.minDown - (s.state === 'down' ? s.t : 0)), ...tum]);
            return;
        }
        s.state = 'falling'; s.dir = dir; s.t = 0; s.minDown = down; s.slid = 0;
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
        // (a body that flies as a rag doll tumbles by itself — its drawn somersault must never wait for it: it used to be kept and played
        //  the moment the body stood up again — the villager stood, then went head over heels once more; the author 05.11, again and again)
        if (s.rag) { s.tum = null; return; }
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

    /** `held`: it stood against a spell («устоял» — a foot set back, a crouch, a lean into the blow, upright again). */
    _stagger(ck, c, e, dir, v, emit = true, held = false) {
        const s = e.s, K = KINDS[ck];
        if (s.state === 'falling' || s.state === 'down' || s.state === 'rising') return;
        s.state = 'stagger'; s.t = 0; s.leanDir = dir; s.held = held;
        s.staggerT = held ? braceTime(v) : Math.min(CREATURE.STAGGER_MAX, 0.3 + v / 20);
        s.lean = held ? braceLean(v) : Math.min(0.4, 0.14 + 0.014 * v);
        if (this.auth) K.hold(this.game, c, s.staggerT + 0.1);
        if (held) this.log.push({ ck, id: c.id, k: 'brace', res: 'held', v: r2(v) });
        if (emit) this._emit(ck, c, held ? 'h' : 's', [KD[dir], r2(v)]);
    }

    _busy(s) { return !!s.rag || !!s.pose || s.state !== 'up' || s.jolt.busy || Math.abs(s.vx) + Math.abs(s.vz) > 0.05 || s.daze > 0 || !!s.tum; }

    _emit(ck, c, ev, args) {
        if (!this.auth || !this.game.sync) return;
        this._out.push([ck, c.id, ev, ...args]);
    }

    /** (guests) what the host says happened to its creatures. */
    onNet(list) {
        if (this.auth || !Array.isArray(list)) return;
        for (const it of list.slice(0, 200)) {
            if (!Array.isArray(it)) continue;
            const [ck, id, ev, a, b, c3, c4] = it; // (it[7]: 'g' — pushed again)
            const K = KINDS[ck];
            const c = K?.get(this.game, id);
            if (!c || !c.group) continue;
            const e = this._state(ck, c);
            if (ev === 'k') this._knock(ck, c, e, KD_NAME[a] || 'back', b < 0 ? Infinity : Math.max(0.3, +b || 1.5) + 0.5, false, c3 > 0 ? { turns: +c3, dur: +c4 || 0.8 } : null);
            else if (ev === 'd') this._daze(ck, c, e, Math.min(30, +a || 0), false);
            else if (ev === 's') this._stagger(ck, c, e, KD_NAME[a] || 'back', +b || 4, false);
            else if (ev === 'h') this._stagger(ck, c, e, KD_NAME[a] || 'back', +b || 4, false, true);
            else if (ev === 'r') { if (e.s.state === 'down' || e.s.state === 'falling') { e.s.state = 'rising'; e.s.t = 0; } }
            else if (ev === 'j') e.s.jolt.kick({ pitch: +a || 0, yaw: +b || 0, roll: +c3 || 0 });
            else if (ev === 'g') { // (the host's doll started / was pushed again: ours does the same — each computer lies it on its own world)
                const cl = (x, m) => Math.max(-m, Math.min(m, +x || 0));
                if (e.s.rag && it[7]) e.s.rag.push(cl(a, 80), cl(b, 40), cl(c3, 80));
                else if (!e.s.rag && this._ragOk(ck, c)) this._ragStart(ck, c, e.s, cl(a, 80), cl(b, 40), cl(c3, 80), cl(c4, 12));
            }
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
        if (r) { K.centre(c, _v); if (Math.hypot(_v.x - r.position.x, _v.z - r.position.z) > CREATURE.REACH * (r.character?.size || 1)) return 'none'; } // (a monster's arm — MonsterForm.js — reaches 7× as far)
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
        // dragons: a great heavy body — it only sways a little, never knocked off its feet (Dragons.push)
        if (!opts.kinds) n += this.game.dragons?.push?.(name, casterId, pushAt, opts) || 0;
        return n;
    }

    /** The wizard's shield against a wind: 'none' (dome) | 'held' | 'fall' | null (no shield / not facing / not Wind Maxima). */
    _windShield(c, o) {
        const fx = c.fx | 0;
        const dome = !!(fx & FX.DOME), hand = !!(fx & FX.SHIELD);
        if (!dome && !hand) return null;
        let facing = false;
        if (hand && o.from && c.group) { // (the hand shield covers the front: the wind from behind finds no shield)
            const dx = o.from.x - c.group.position.x, dz = o.from.z - c.group.position.z, d = Math.hypot(dx, dz) || 1;
            const yaw = c.yaw ?? c.group.rotation.y;
            facing = (-Math.sin(yaw) * dx - Math.cos(yaw) * dz) / d > 0.25;
        }
        return windShieldRule(o.spell, { shield: dome ? 'dome' : 'hand', facing, steady: creatureSteady('v', c) });
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
        this._budget = performance.now() + RAG.BUDGET_MS;
        for (const [key, e] of this.active) {
            const { ck, c, s } = e;
            const K = KINDS[ck];
            const gone = !c.group || !c.group.parent || !K.alive(c) || (ck === 'z' && g.zombieById && !g.zombieById.has(c.id)) || c.removable;
            if (gone) {
                if (s.rag && (c.dead || c.isDead) && !this.deadRags.has(key)) { s.rag.tone = 0; s.rag.wake?.(); this.deadRags.set(key, { c, doll: s.rag, ck, rig: s.rig }); } // (killed while flying / lying: the same doll lies on, dead)
                s.rag = null; s.pose = null;
                this._release(K, c, s, true); this.active.delete(key); continue;
            }
            if (c.lev && s.state !== 'up') { this._release(K, c, s, false); s.state = 'up'; }
            s.t += dt;
            if (s.rag || s.pose) { this._ragFrame(ck, K, c, s, dt); if (!this._busy(s)) { this._release(K, c, s, false); this.active.delete(key); } continue; }
            // the slide (host: it moves the body; friction is stronger lying on the ground)
            if (this.auth && (s.vx || s.vz)) {
                const lying = s.state === 'falling' || s.state === 'down';
                _want.x = s.vx * dt; _want.z = s.vz * dt;
                const got = K.move(g, c, _want.x, _want.z);
                if (got) bounce(s, _want, got); // (it hit a wall / a bed: slides along it, a little comes back — it never goes on through)
                const air = s.airT > 0;
                if (air) s.airT -= dt;
                const f = air ? 1 : Math.max(0, 1 - (lying ? CREATURE.FRICTION_DOWN : CREATURE.FRICTION) * dt);
                s.vx *= f; s.vz *= f;
                if (Math.abs(s.vx) + Math.abs(s.vz) < 0.05) s.vx = s.vz = 0;
            }
            if (this.auth && (ck === 'v' || ck === 'z' || ck === 'a') && (s.state === 'falling' || s.state === 'down')) this._lieClear(K, c, s, dt, ck);
            else if (s.rest) s.rest = Math.max(0, s.rest - 3 * dt); // (up again: it comes down off whatever it lay on)
            this._step(ck, K, c, s, dt);
            if (s.daze > 0 && s.state === 'up') this._dazed(K, c, s, dt);
            this._draw(K, c, s, dt);
            if (!this._busy(s)) { this._release(K, c, s, false); this.active.delete(key); }
        }
        this._deadFrame(dt);
        // the bodies «Левиоса» holds as rag dolls: drawn again last (their own animation never wins); let go elsewhere — handed back
        if (this.levDolls?.size) for (const [key, r] of this.levDolls) {
            if (!r.c.lev || !r.c.group?.parent) { this.levDollRelease(r.ck, r.c, null); continue; }
            this._ragDraw(r.c, r.doll, r.rig);
        }
        if (this._out.length && g.sync) { g.sync.creatureImpacts?.(this._out.splice(0, 200)); this._out.length = 0; }
    }

    /**
     * A body drawn by its rag doll: the doll moves (as long as the frame's budget allows), the model follows it, the villager's place goes
     * with the hips (host); getting up — from the pose it lies in to standing, smoothly (RAG.RISE_T), facing where its head lay.
     */
    _ragFrame(ck, K, c, s, dt) {
        const g = this.game, doll = s.rag, rig = s.rig;
        s.vx = s.vz = 0; s.airT = 0; s.rest = 0;
        if (doll) {
            if (doll.asleep || performance.now() < this._budget) doll.step(guardWorld(g), dt); // (asleep: only a cheap look under it — Ragdoll.step)
            if (this.auth) {
                // the body's place goes with its hips (the AI, the others' computers, the targets see it there)
                doll.at(12, _pt);
                const fl = guardWorld(g).floor(_pt[0], _pt[2], _pt[1]);
                const fy = Number.isFinite(fl) ? Math.min(fl, _pt[1]) : _pt[1] - 1.9;
                if (rig) rig.place(c, _pt[0], fy, _pt[2]);
                else { c.x = _pt[0]; c.z = _pt[2]; c.y = fy; if (c.group) c.group.position.set(c.x, c.y + 1.95, c.z); }
                c.vy = 0;
                if (c.velocity?.set) c.velocity.set(0, 0, 0); // (a zombie's own slide: the doll moves it)
            }
        }
        const was = s.state;
        if (!s.getUp) this._step(ck, K, c, s, dt);
        if (doll && s.state === 'rising' && was !== 'rising' && !s.getUp) {
            // up: he gets up as the doll — pulled toward a man standing on a free spot by his hips, the world holding it (by a wall he gets
            // up along it, not through it); he faces his feet if he lay on his back (he sits up), his head if on his face (he pushes up)
            const W = guardWorld(g);
            doll.at(12, _pt);
            const fy = W.floor(_pt[0], _pt[2], _pt[1]);
            const rr = 0.45 * (doll.sp.h || 1);
            let sx = _pt[0], sz = _pt[2];
            if (!standFree(W, sx, sz, rr, fy)) { const f = freeSpot(W, sx, sz, rr, fy); if (f) { sx = f.x; sz = f.z; } }
            doll.frame(_fr);
            let fx = _fr[3], fz = _fr[5];
            const backY = _fr[7] * -doll.sp.faces; // (the back: right × up for a body looking along −Z, its opposite for one looking along +Z)
            if (backY < 0) { fx = -fx; fz = -fz; } // (on his back: the back looks down — he sits up facing his feet)
            if (Math.hypot(fx, fz) < 0.2) { fx = -Math.sin(c.yaw || 0); fz = -Math.cos(c.yaw || 0); }
            const up = doll.standUp(sx, fy, sz, fx, fz) || { fx, fz }; // (the doll turns up the shortest way: it says where it will face)
            s.getUp = { fx: up.fx, fz: up.fz, t: 0 };
        }
        if (s.getUp && doll) {
            s.getUp.t += dt;
            s.t = 0; // (still rising: not «up» until he stands)
            K.hold(g, c, 0.3);
            if (this.auth) {
                if (rig) rig.face(c, s.getUp.fx, s.getUp.fz);
                else { c.yaw = Math.atan2(-s.getUp.fx, -s.getUp.fz); if (c.group) c.group.rotation.y = c.yaw; }
            }
            if (s.getUp.t >= RAG.UP_MAX || doll.goalDist() < RAG.UP_NEAR) {
                if (rig) {
                    // (a zombie, a Taron: standing as the doll stood him — his own animation takes over from here)
                    RagPose.cleanRig(rig, c);
                    s.rag = null; s.rig = null; c.rag = false; s.getUp = null; s.state = 'up'; s.t = 0; s.tum = null;
                    return;
                }
                // standing: the last few centimetres go over to the model's own standing pose
                RagPose.toModel(doll, c.model);
                c.model.group.updateMatrixWorld(true);
                s.pose = RagPose.capture(c.model, []);
                s.poseFrom = (s.poseFrom || new THREE.Matrix4()).copy(c.model.group.matrixWorld);
                s.rag = null; c.rag = false; s.riseT = 0; s.getUp = null; s.tum = null; // (the doll did the tumbling: no drawn somersault left over)
            }
        }
        if (s.rag) { this._ragDraw(c, s.rag, rig); return; }
        if (s.pose) {
            s.riseT = (s.riseT || 0) + dt;
            const k = Math.min(1, s.riseT / RAG.BLEND_T);
            const tmp = this._pose;
            tmp.length = 0;
            for (let i = 0; i < s.pose.length; i++) tmp.push(s.pose[i]);
            RagPose.cleanOwn(c.model); // (the model's own standing, without what the doll left in it)
            if (c.model.group) RagPose.rebaseRoot(tmp, s.poseFrom, c.model.group);
            RagPose.blend(c.model, tmp, k * k * (3 - 2 * k));
            if (k >= 1) { s.pose = null; s.poseFrom = null; s.state = 'up'; s.t = 0; }
            else K.hold(g, c, 0.2);
        }
    }

    /**
     * (every computer) A humanoid died — a villager, a wizard, a knight, a sailor ashore, a zombie, a Taron: his body falls as a rag doll — the one
     * he flew as, or a new one from the pose he died in, toppling the way the last blow went (or backwards). A villager's settled pose goes to his
     * body (Death.reposeBody) — it lies so for good, and is sent and saved so; a zombie's / a Taron's lies so until the body is gone (sinking with it).
     */
    _deathKick(c, doll) {
        if (c.deathKick && !c._deathKickApplied) { kickDeadDoll(doll, c.deathKick); c._deathKickApplied = true; }
    }

    ragDeath(c) {
        const ck = kindOf(c) || (c?.isVillager ? 'v' : null);
        if (!c || !ck) return;
        const previous = this.deadRags.get(ck + '|' + c.id);
        if (previous) { this._deathKick(c, previous.doll); return; }
        const e = this.active.get(ck + '|' + c.id);
        if (e?.s.rag) { e.s.rag.tone = 0; e.s.rag.wake?.(); this.deadRags.set(ck + '|' + c.id, { c, doll: e.s.rag, ck, rig: e.s.rig }); this._deathKick(c, e.s.rag); e.s.rag = null; e.s.pose = null; e.s.rig = null; return; }
        if (!this._ragOk(ck, c)) return;
        const tmp = { };
        const K = KINDS[ck];
        const yaw = ck === 'T' ? c.model.rotation.y : (c.yaw ?? c.group?.rotation.y ?? 0);
        let vx = e?.s.vx || 0, vz = e?.s.vz || 0;
        // (no blow: he sinks back, away from where he looked — the model looks along −Z, a zombie along +Z)
        if (Math.hypot(vx, vz) < 0.5) { const f = K?.faces || -1; vx = Math.sin(yaw) * 0.8 * -f; vz = Math.cos(yaw) * 0.8 * -f; }
        let vy = 0;
        if (ck === 'a' && c.vel) { vx = c.vel.x; vy = c.vel.y; vz = c.vel.z; if (Math.hypot(vx, vz) < 0.5) { vx = Math.sin(yaw) * 0.8 * -K.faces; vz = Math.cos(yaw) * 0.8 * -K.faces; } } // (killed in the air / thrown: it goes on as it flew)
        this._ragStart(ck, c, tmp, vx, vy, vz, RAG.DEAD_TIP);
        this._deathKick(c, tmp.rag);
        this.deadRags.set(ck + '|' + c.id, { c, doll: tmp.rag, ck, rig: tmp.rig });
    }

    /** The zombies and Tarons that died this frame (they have no hook of their own into here): their bodies fall as dolls too. */
    _watchDeaths() {
        const g = this.game;
        const zs = g.zombies;
        if (zs) for (let i = 0; i < zs.length; i++) { const z = zs[i]; if (z.isDying && !z._ragSeen) { z._ragSeen = true; this.ragDeath(z); } }
        const ts = g.tarons?.list;
        if (ts) for (let i = 0; i < ts.length; i++) { const t = ts[i]; if (t.dead && !t._ragSeen) { t._ragSeen = true; this.ragDeath(t); } }
    }

    _deadFrame(dt) {
        this._watchDeaths();
        if (!this.deadRags.size) return;
        const g = this.game;
        for (const [key, r] of this.deadRags) {
            const { c, doll, rig } = r;
            if (rig) {
                // a zombie / a Taron: until its body is gone (sunk, unloaded)
                const gone = (r.ck === 'z' ? !c.group?.parent || c.removable || !c.group.visible : !c.model?.parent) || c.lev;
                if (gone) { this.deadRags.delete(key); continue; }
                if (doll.asleep || performance.now() < this._budget) doll.step(guardWorld(g), dt); // (asleep: only a cheap look under it — Ragdoll.step)
                let dy = 0;
                if (doll.asleep) { if (r.feet0 == null) r.feet0 = rig.feet(c); dy = Math.min(0, rig.feet(c) - r.feet0); }
                doll.at(12, _pt); rig.place(c, _pt[0], _pt[1] - 1.9, _pt[2]);
                this._ragDraw(c, doll, rig, dy);
                continue;
            }
            if (!c.group || !c.group.parent || !c.model?.root || !c.dead || c.lev || c.bodyMoved) { this.deadRags.delete(key); if (!c.dead) c.rag = false; continue; } // (carried off by «Левиоса», gone from the world, raised: the doll is done)
            if (doll.asleep || performance.now() < this._budget) doll.step(guardWorld(g), dt); // (asleep: only a cheap look under it — Ragdoll.step)
            RagPose.toModel(doll, c.model);
            if (doll.asleep && c.model.isDeadDone) {
                c.model.group.updateMatrixWorld(true);
                if (r.ck === 'v') g.death?.reposeBody?.('v', c.id, RagPose.capture(c.model, []), c.group);
                c.rag = 'done';
                this.deadRags.delete(key);
            }
        }
    }

    /**
     * (host) A body knocked down into a crater or against a wall lies with its head or legs in the rock: it slides
     * back out of it (at most a few metres in all), never through anything (K.move) — LieClear.js.
     */
    _lieClear(K, c, s, dt, ck) {
        const g = this.game;
        const td = g.terrain?.data || g.world?.terrain?.data;
        const piv = K.pivot(c).obj;
        if (!piv?.matrixWorld) return;
        if ((s.clearT = (s.clearT || 0) - dt) > 0) return;
        s.clearT = 0.05;
        piv.updateWorldMatrix(true, false);
        const feet = piv.getWorldPosition(_v);
        const ax = _w.set(0, 1, 0).transformDirection(piv.matrixWorld);
        const scale = ck === 'z' ? (c.sizeK || 1) * 2.2 : ck === 'a' ? 2.2 * (c.group.scale.y || 1) : 3.4;
        const d = 4 * 0.05;
        // 1) the blocks: the head or the legs in a wall → back along the body (K.move holds it to the sub-steps)
        if (td?.solidIn && ck !== 'a') {
            const push = lieClearPush((ix, iz, L) => td.solidIn(ix, iz, L, L), feet.x, feet.y - (ck === 'z' ? (c.gOff ?? 1) : 0), feet.z, ax.x, ax.z, scale);
            if (push && (s.slid || 0) <= 3) { s.slid = (s.slid || 0) + d; K.move(g, c, push.x * d, push.z * d); }
        }
        // 2) the boxes (a bed, a chest, a cauldron…): lain ON when low (it rests on top), shoved back out of when tall; SolidGuard.js
        const W = guardWorld(g);
        const floorY = ck === 'v' ? c.y : feet.y - (ck === 'z' ? (c.gOff ?? 1) : 0);
        const P = lieProbe(W, feet.x, feet.z, ax.x, ax.z, floorY, scale, ck === 'a' ? 0.45 : GUARD.LIE_W);
        s.restTo = P.rest;
        s.rest = (s.rest || 0) + (P.rest - (s.rest || 0)) * Math.min(1, 14 * 0.05); // (settles onto it, no jump)
        if (P.hit && (s.slid2 || 0) <= 4) {
            s.slid2 = (s.slid2 || 0) + d;
            K.move(g, c, P.pushX * d, P.pushZ * d);
            if (s.slid2 > 1 && !s.noted) { s.noted = true; g.castleLife?.alog?.decision?.(c, `тело вытолкнуто из ${P.tall?.kind === 'bed' ? 'кровати' : 'твёрдого предмета'} (лежало в нём)`); }
        }
    }

    /**
     * (host) A dead villager's body, come to rest: lain across a bed's edge or into a cupboard it is shoved back out (and where most of it
     * is on a bed, `deadRest` — it lies ON it: CastleLife._lieFloor). The same probe as a living body lying (SolidGuard.lieProbe).
     */
    guardDead(c, dt) {
        if (!this.auth || c.vy || !c.model?.root?.matrixWorld || !c.model.isDeadDone) return;
        if ((c.guardT = (c.guardT || 0) - dt) > 0) return;
        c.guardT = 0.25;
        const piv = c.model.root;
        piv.updateWorldMatrix(true, false);
        const feet = piv.getWorldPosition(_v);
        const ax = _w.set(0, 1, 0).transformDirection(piv.matrixWorld);
        const W = guardWorld(this.game);
        const floor = W.floor(c.x, c.z, c.y + 1.1);
        const P = lieProbe(W, c.x, c.z, ax.x, ax.z, floor, 3.4);
        c.deadRest = P.rest;
        if (P.hit && (c.deadSlid || 0) < 4) {
            c.deadSlid = (c.deadSlid || 0) + 0.5;
            KINDS.v.move(this.game, c, P.pushX * 0.5, P.pushZ * 0.5);
            this.game.death?.settle?.('v', c.id, c.x, c.y, c.z);
            if (!c.deadNoted) { c.deadNoted = true; this.game.castleLife?.alog?.decision?.(c, `мёртвое тело сдвинуто с ${P.tall?.kind === 'bed' ? 'края кровати' : 'твёрдого предмета'} (лежало в нём)`); }
        }
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
        const brace = s.state === 'stagger' && s.held ? braceProfile(s.t / s.staggerT) : 0;
        if (s.state === 'stagger') ang = s.held ? s.lean * brace : s.lean * Math.sin(Math.PI * Math.min(1, s.t / s.staggerT));
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
        if (brace > 0) sway = 0.05 * brace * Math.sin(s.t * 17) * (1 - Math.min(1, s.t / s.staggerT)); // (the body rocks to find its balance)
        if (s.daze > 0 && s.state === 'up') sway = Math.min(1, s.daze / 1.5) * (0.13 * Math.sin((s.dazeT2 || 0) * 2.3) + 0.05 * Math.sin((s.dazeT2 || 0) * 5.1));
        if (piv) {
            const f = K.faces;
            const turn = (a) => { let x = 0, z = 0; if (dir === 'back') x = -f * a; else if (dir === 'front') x = f * a; else if (dir === 'right') z = f * a; else z = -f * a; return [x, z]; };
            const [rx, rz] = turn(ang);
            piv.rotation.x = rx; piv.rotation.z = rz + sway;
            piv.position.y = P.base + (P.lie || 0) * lift * Math.sin(ang) - 0.14 * brace + (s.rest || 0) * Math.sin(ang); // (a little crouch to hold the ground)
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
        const legs = K.legs(c);
        if (s.held && s.state === 'stagger') {
            // the stance: one arm thrown out high for balance, the other low; the foot on the blow's side set back (or forward when pushed on)
            const side = s.leanDir === 'left' ? -1 : s.leanDir === 'right' ? 1 : 0, along = s.leanDir === 'back' ? 1 : s.leanDir === 'front' ? -1 : 0;
            overlay(la, 'z', -brace * (0.95 + 0.12 * Math.sin(s.t * 14) + (side > 0 ? 0.2 : 0)));
            overlay(ra, 'z', brace * (0.4 + 0.1 * Math.sin(s.t * 14 + 1) + (side < 0 ? 0.35 : 0)));
            const step = (along || 0.6) * K.faces * 0.75 * brace;
            legs.forEach((l, i) => { const main = i % 2 === 0; overlay(l, 'x', main ? step : -step * 0.35); overlay(l, 'z', side ? (main ? -0.4 : 0.15) * side * brace : 0); });
        } else {
            const fl = reel * (0.5 + 0.35 * Math.sin(s.flail));
            overlay(la, 'z', -fl); overlay(ra, 'z', fl);
            legs.forEach((l, i) => { overlay(l, 'x', s.state === 'stagger' ? reel * 0.55 * Math.sin(s.flail * 0.6 + (i % 2 ? Math.PI : 0)) : 0); overlay(l, 'z', 0); });
        }
    }

    /** Back to the creature's own animation (alive: upright; dead: its death takes over). */
    _release(K, c, s, dead) {
        if (!c.group) return;
        if (!dead && (s.rag || s.pose)) { if (s.rig) RagPose.cleanRig(s.rig, c); else if (c.model?.root) RagPose.cleanOwn(c.model); } // (the doll let go of him: his own animation again)
        if (!dead || !this.deadRags.has(kindOf(c) + '|' + c.id)) { if (c.rag !== 'done') c.rag = false; }
        s.rag = null; s.pose = null; s.getUp = null; s.rig = null;
        if (s.rag === null && dead && this.deadRags.has(kindOf(c) + '|' + c.id)) return; // (dead and lying as a doll: the doll draws it — the old tilt is not reset under it)
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
        for (const l of K.legs(c)) { overlay(l, 'x', 0); overlay(l, 'z', 0); }
        // A living knockback finishing after death must not straighten a carcass back onto its feet.
        if (dead && kindOf(c) === 'a') this.game.animals?._layDown?.(c);
        s.state = 'up'; s.held = false; s.rest = 0; s.slid = 0; s.slid2 = 0; s.noted = false;
    }
}

const r2 = (v) => Math.round(v * 100) / 100;
