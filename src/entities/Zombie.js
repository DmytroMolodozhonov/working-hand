/**
 * Zombie.js — enemy AI and visuals.
 *
 * The look is drawn from scratch (ZombieModel.js: rotten skin, torn clothes, a loose jaw, jointed arms and legs — the author 19.11:
 * «переделать полностью скин зомби с нуля… другие анимации… крутой зомби»). The body keeps its old size and joints' places, so every
 * blade, blast and hit test still lands where it did. Rewritten for performance:
 *   - geometries and textures are shared by all zombies (only four small per-zombie materials for
 *     the hit flash / ice tint / fire glow),
 *   - sand / ice-shatter / flying limbs / blood go through pooled FX systems
 *     instead of hundreds of meshes with their own requestAnimationFrame loops,
 *   - corpses are cleaned up after a while (endless waves no longer slow down),
 *   - zero allocations in update().
 *
 * How it moves: ONE pose (hips, knees, shoulders, elbows, spine, head, jaw) eased towards a target every frame; the target comes from what
 * it is doing — a limping shamble (each zombie has its own gait: which leg drags, how it holds its arms, how it stoops), standing and twitching,
 * three different blows (an overhead smash, a claw swipe, a lunge with a bite), a startled jerk on waking, a slumped doze, flailing while
 * it burns, and — what the author asked for — LIFE AFTER LOSS: without an arm it still strikes, without a leg it hobbles, without both legs it
 * crawls on its belly dragging itself by the arms, without arms it lunges and bites; the stumps bleed. Everything is the same on every
 * computer (the host sends the same flags and limb mask as before).
 */

import * as THREE from 'three';
import { slowFactor, tickSlow } from '../game/Slow.js';
import { zombieLook, zombiePartGeo, zombieMaterial } from './ZombieModel.js';

let SHARED = null;
function shared() {
    if (SHARED) return SHARED;
    SHARED = {
        crystal: new THREE.ConeGeometry(0.1, 0.3, 4),
        crystalMat: new THREE.MeshBasicMaterial({ color: 0xaaddff, transparent: true, opacity: 0.8 }),
        crystalMatSolid: new THREE.MeshBasicMaterial({ color: 0xaaddff, transparent: true, opacity: 1.0 }),
    };
    return SHARED;
}

const ICE = new THREE.Color(0xaaddff);
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _c = new THREE.Color();

export const ZOMBIE_GROUND_OFFSET = 1.0; // the origin, 1 m over the ground under its feet
/**
 * How a zombie walks and strikes (the author: «slow, stubborn; it comes up close, turns to you and hits»).
 * Its face (the glowing eyes, the arms held out) looks along its local +Z: yaw = atan2(dx, dz).
 */
export const ZOMBIE = {
    SPEED: 2.1, // m/s: a slow trudge (a hero walks 2.5, runs 9.75 — walking away it falls behind)
    STOP: 1.35, // m between its middle and the target's: it stands here, its hands on you
    REACH: 2.0, // m: as far as its blow reaches (the arms 1.2 m out in front, the target's body)
    FACE: 0.35, // rad: turned at least this close to the target — only then it strikes
    TURN: 4.0, // rad/s: how fast it turns round
    STRIDE: 1.6, // m walked in one full cycle of the legs (two steps)
    SWING: 0.75, // s: one blow — the arms go up, come down
    HIT_AT: 0.62, // the part of the swing when the arms come down on the target
    EVERY: 1.3, // s between two blows
    CRAWL_SPEED: 0.9, // m/s: dragging itself on its belly (no legs left)
    CRAWL_STOP: 0.95, // m: a crawler strikes from closer
    CRAWL_PITCH: 1.32, // rad: the body tipped forward onto its belly
    CRAWL_GOFF: 0.5, // m: the origin's height over the ground while crawling
};
const HIP = 0.3, LEG_H = 0.6; // (the legs hang from the hips, inside the body: the feet come down to the ground)
const SHOULDER_Y = 1.4, SHOULDER_Z = -0.1, ARM_H = 0.6;
const PI = Math.PI, HALF = PI / 2;
const wrapA = (a) => { while (a > PI) a -= PI * 2; while (a < -PI) a += PI * 2; return a; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const DUMMY_HEALTH = 60; // the training dummy (a plain zombie has 5): a head cut (999) still ends it
export const CORPSE_LIFETIME = 25;

/** The pose: every angle the body is built from. Targets and the live pose have the same fields. */
const poseOf = () => ({
    hipL: 0, hipR: 0, kneeL: 0.1, kneeR: 0.1, // legs (hip: + swings the foot back), knees bend back
    armL: -HALF, armR: -HALF, elbL: 0.4, elbR: 0.4, sideL: 0, sideR: 0, // arms (−π/2: straight out in front; 0: hanging; π: over the head), elbows, spread out
    lean: 0.18, twist: 0, roll: 0, bob: 0, // the spine
    hp: 0.15, hy: 0, hr: 0, jaw: 0.2, // head and jaw
});
const POSE_KEYS = Object.keys(poseOf());

/** A small stable number from an id (a gait that is the same on every computer). */
function idHash(id) {
    let h = 2166136261;
    const s = String(id);
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0);
}

export class Zombie {
    /**
     * @param {THREE.Scene} scene
     * @param {THREE.Vector3} startPos
     * @param {number|string} id
     * @param {object} ctx  {fx, sound}
     */
    constructor(scene, startPos, id, ctx = {}) {
        this.scene = scene;
        this.id = id;
        this.ctx = ctx;
        this.group = new THREE.Group();
        this.group.position.set(startPos.x, 0.5, startPos.z);
        this.group.rotation.order = 'YXZ'; // (yaw first, then the pitch: a crawler or a corpse lies along ITS way, not the world's)
        this.group.scale.set(1, 1.12, 1);
        this.sizeK = 1; // (the training dummy is bigger: setDummy)
        this.gOff = ZOMBIE_GROUND_OFFSET; // origin height over the feet's ground

        const h = idHash(id);
        // its own manner: which leg is bad (−1 right, 0 none, +1 left), how it holds its arms, how deep it stoops, how it twitches
        this.gait = { limp: [0, 0, 1, -1][h % 4], arms: (h >> 3) % 4, stoop: 0.14 + ((h >> 6) % 7) * 0.025, lurch: 0.8 + ((h >> 9) % 5) * 0.1, twitchy: ((h >> 12) % 3) / 2 };
        this.baseSpeed = ZOMBIE.SPEED;
        this.speed = this.baseSpeed;
        this.health = 5;
        this.isDead = false;
        this.isDying = false;
        this.velocity = new THREE.Vector3();
        this.vy = 0; // vertical speed (thrown by explosions, stepping off ledges)
        this.rotVelocity = new THREE.Vector3();
        this.bodyParts = [];
        this.materials = [];
        this.pose = poseOf();
        this.tgt = poseOf();
        this.jolt = { x: 0, z: 0, hx: 0 }; // (a blow's jolt: the spine and the head, fading away)
        this.spin = 0; // (the dizzy head)
        this.crawling = false;
        this.baseX = 0; // the body's pitch at rest (0 upright, CRAWL_PITCH on its belly)
        this.createBody();
        scene.add(this.group);

        this.damageCooldown = 0;
        this.hitFlashTimer = 0;
        this.walkCycle = 0;
        this.isSleeping = false;
        this.wakeT = 0; // s of the startled jerk after waking
        this.isFrozen = false;
        this.frozenTimer = 0;
        this.freezeProgress = 0;
        this.isStunned = false;
        this.stunTimer = 0;
        this.iceCrystals = new THREE.Group();
        this.group.add(this.iceCrystals);
        this.lastAttackTime = 0;
        this.isAttacking = false;
        this.attackStyle = 0; // 0 overhead smash, 1 claw swipe, 2 lunge and bite
        this.attackSide = 1;
        this.struck = false; // (host) the arms have just come down: Game sees whether they reached somebody
        this.yaw = 0; // where it faces (its rotation.y)
        this.burning = 0; // s left burning in the sunlight (shown on every computer)
        this.attackAnimProgress = 0;
        this.animVariation = (h % 1000) / 100; // (the same on every computer)
        this.lastDistSq = Infinity;
        this.corpseTimer = 0;
        this.removable = false;
        this._skipAccum = 0;
        this._bleedT = 0;
        this._twitchT = 1 + (h % 7) * 0.4;
        this._twitch = 0;
        this._fireT = 0;
        this._charK = 0;
        this._glow = 0;
        this._pumpT = 0;
        this.remote = false; // true on multiplayer clients (host simulates)
        this.limbMask = 0; // bit 0 head, 1 lArm, 2 rArm, 3 lLeg, 4 rLeg (severed)
    }

    _mat(part) {
        const m = zombieMaterial(part, this.look);
        this.materials.push(m);
        return m;
    }

    createBody() {
        const look = this.look = zombieLook(this.id);
        const mHead = this._mat('head'), mTorso = this._mat('torso'), mArm = this._mat('arm'), mLeg = this._mat('leg');
        this.headMat = mHead;
        const mesh = (piece, mat) => new THREE.Mesh(zombiePartGeo(piece), mat);
        // the trunk: everything above the hips hangs from it, so a lean or a twist of the spine carries the head and the arms
        this.torso = new THREE.Group();
        this.group.add(this.torso);

        this.head = mesh('skull', mHead);
        this.head.position.y = 2.1;
        this.torso.add(this.head);
        this.bodyParts.push(this.head);
        this.jaw = mesh('jaw', mHead); // (loose on its hinge under the cheeks: it hangs, rattles and snaps)
        this.jaw.position.set(0, -0.47, -0.46);
        this.head.add(this.jaw);
        this.eyes = []; // (the eyes are painted into the head and glow through its emissive map — setThrall turns that violet)

        const makeArm = (x) => {
            const arm = new THREE.Group();
            arm.position.set(x, SHOULDER_Y, 0.5);
            arm.add(mesh('upper', mArm));
            arm.fore = new THREE.Group(); // (the elbow: its pivot is the middle of the arm)
            arm.fore.add(mesh('fore', mArm));
            arm.add(arm.fore);
            return arm;
        };
        this.leftArm = makeArm(-0.7);
        this.rightArm = makeArm(0.7);
        this.torso.add(this.leftArm, this.rightArm);
        this.bodyParts.push(this.leftArm, this.rightArm);

        this.body = mesh('torso', mTorso);
        this.body.position.y = 0.75;
        this.torso.add(this.body);
        this.bodyParts.push(this.body);

        const makeLeg = (x) => {
            const leg = new THREE.Group();
            leg.position.set(x, 0, 0);
            leg.add(mesh('thigh', mLeg));
            leg.shin = new THREE.Group(); // (the knee)
            leg.shin.add(mesh('shin', mLeg));
            leg.add(leg.shin);
            return leg;
        };
        this.leftLeg = makeLeg(-0.3);
        this.rightLeg = makeLeg(0.3);
        this.group.add(this.leftLeg, this.rightLeg);
        this.bodyParts.push(this.leftLeg, this.rightLeg);
        for (const k of POSE_KEYS) this.pose[k] = this.tgt[k];
        this._applyPose();
    }

    /**
     * A leg turned at its hip (not round its middle — that slid the feet like oars, «it floats»):
     * its top stays in the body, its foot comes down to the ground (local y −0.9 → 1 m under the origin).
     */
    _setLeg(leg, a, knee = 0) {
        leg.rotation.x = a;
        leg.position.y = HIP - LEG_H * Math.cos(a);
        leg.position.z = -LEG_H * Math.sin(a);
        leg.shin.rotation.x = knee;
    }

    _setLegs(swing) { this._setLeg(this.leftLeg, swing); this._setLeg(this.rightLeg, -swing); }

    /** An arm turned at its shoulder (−π/2: held straight out in front), `side`: spread outwards (+ away from the body). */
    _setArm(arm, a, elbow = 0, side = 0) {
        const left = arm === this.leftArm;
        arm.rotation.x = a;
        arm.rotation.z = left ? -side : side;
        arm.position.x = (left ? -0.7 : 0.7) + (left ? -1 : 1) * ARM_H * Math.sin(side) * Math.cos(a);
        arm.position.y = SHOULDER_Y - ARM_H * Math.cos(a);
        arm.position.z = SHOULDER_Z - ARM_H * Math.sin(a);
        arm.fore.rotation.x = -elbow; // (the elbow folds the hand forward and up)
    }

    /** What the pose is now, written onto the bones. */
    _applyPose() {
        const P = this.pose, J = this.jolt;
        this.torso.rotation.set(P.lean + J.x, P.twist, P.roll + J.z);
        this.torso.position.y = P.bob;
        this.head.rotation.set(P.hp + J.hx, P.hy + this.spin, P.hr);
        this.jaw.rotation.x = P.jaw;
        this._setArm(this.leftArm, P.armL, P.elbL, P.sideL);
        this._setArm(this.rightArm, P.armR, P.elbR, P.sideR);
        this._setLeg(this.leftLeg, P.hipL, P.kneeL);
        this._setLeg(this.rightLeg, P.hipR, P.kneeR);
    }

    /** Ease the pose towards the target (k per frame at 60 FPS, the same at any speed) and put it on the bones. */
    _pump(dt, rate = 0.22) {
        const k = 1 - Math.pow(1 - rate, dt * 60), P = this.pose, T = this.tgt;
        for (const key of POSE_KEYS) P[key] += (T[key] - P[key]) * k;
        const f = Math.pow(0.9, dt * 60);
        this.jolt.x *= f; this.jolt.z *= f; this.jolt.hx *= f;
        if (!this.isStunned) this.spin *= f;
        this._applyPose();
    }

    // ------------------------------------------------------------------ the targets (what it is doing)
    _reset(T) {
        T.hipL = T.hipR = 0; T.kneeL = T.kneeR = 0.12;
        T.armL = T.armR = -HALF; T.elbL = T.elbR = 0.4; T.sideL = T.sideR = 0;
        T.lean = this.gait.stoop; T.twist = T.roll = T.bob = 0;
        T.hp = 0.15; T.hy = T.hr = 0; T.jaw = 0.2;
    }

    _hasArm(left) { return !(this.limbMask & (left ? 2 : 4)); }

    /** Arms held out the way this zombie holds them (what it was in life, how it died). */
    _holdArms(T, t, c, amp = 1) {
        const g = this.gait.arms, lh = this._hasArm(true), rh = this._hasArm(false);
        if (g === 0) { // both reaching, a little apart
            T.armL = -HALF + 0.1 + Math.sin(t * 0.9) * 0.08 * amp; T.armR = -HALF - 0.05 + Math.cos(t * 0.8) * 0.08 * amp;
            T.elbL = 0.55; T.elbR = 0.35; T.sideL = 0.12; T.sideR = 0.12;
        } else if (g === 1) { // hanging low and swinging, the hands dangling
            T.armL = -0.35 + Math.sin(c) * 0.32 * amp; T.armR = -0.35 - Math.sin(c) * 0.32 * amp;
            T.elbL = 0.25; T.elbR = 0.25; T.sideL = 0.1; T.sideR = 0.1;
        } else if (g === 2) { // one arm up and reaching, one dangling
            T.armL = -HALF - 0.5 + Math.sin(t * 1.1) * 0.12 * amp; T.armR = -0.2 + Math.sin(c) * 0.25 * amp;
            T.elbL = 0.3; T.elbR = 0.3; T.sideL = 0.05; T.sideR = 0.15;
        } else { // bent at the elbows, clawing the air
            T.armL = -HALF + 0.35 + Math.sin(t * 2.1) * 0.18 * amp; T.armR = -HALF + 0.35 + Math.cos(t * 1.9) * 0.18 * amp;
            T.elbL = 1.1; T.elbR = 1.1; T.sideL = 0.2; T.sideR = 0.2;
        }
        if (!lh) { T.armL = 0.1; T.elbL = 0.1; T.sideL = 0.05; }
        if (!rh) { T.armR = 0.1; T.elbR = 0.1; T.sideR = 0.05; }
    }

    /** The shamble: a heavy limping lurch — the bad leg drags, the shoulders roll, the head lolls a beat behind. */
    _tgtWalk() {
        const T = this.tgt, G = this.gait, c = this.walkCycle + this.animVariation, s = Math.sin(c), co = Math.cos(c);
        this._reset(T);
        const lm = this.limbMask;
        const badL = G.limp === 1 || (lm & 8), badR = G.limp === -1 || (lm & 16);
        const goneL = !!(lm & 8), goneR = !!(lm & 16);
        const strideL = (badL ? 0.5 : 1) * G.lurch, strideR = (badR ? 0.5 : 1) * G.lurch;
        T.hipL = s * 0.5 * strideL; T.hipR = -s * 0.5 * strideR;
        // a leg swinging forward lifts its knee; the bad one barely does and scrapes its foot
        T.kneeL = (badL ? 0.12 : Math.max(0, -co) * 0.95) + 0.08;
        T.kneeR = (badR ? 0.12 : Math.max(0, co) * 0.95) + 0.08;
        if (goneL && goneR) { T.hipL = T.hipR = 0; }
        T.lean = G.stoop + 0.05 * Math.abs(s) + (goneL || goneR ? 0.12 : 0);
        T.twist = s * 0.16;
        T.roll = (badL ? 0.12 : badR ? -0.12 : 0) * (0.6 + 0.4 * Math.abs(co)) + s * 0.07 + ((goneL ? 0.22 : 0) - (goneR ? 0.22 : 0));
        T.bob = -Math.abs(s) * 0.07 - (badL || badR ? 0.04 : 0);
        T.hp = 0.2 + 0.12 * Math.cos(c * 2 - 0.8); // the head nods a beat late
        T.hy = Math.sin(c * 0.45) * 0.2;
        T.hr = -T.roll * 1.7 + Math.sin(c * 0.7 + 1) * 0.1;
        T.jaw = 0.3 + 0.18 * Math.sin(c * 2 + 1);
        this._holdArms(T, c, c, 1);
        if (this.burning > 0) this._tgtBurn(T, c);
    }

    /** Standing: breathing, a sway, a sudden twitch now and then. */
    _tgtIdle(t) {
        const T = this.tgt, G = this.gait, c = t * 1.3 + this.animVariation;
        this._reset(T);
        const lm = this.limbMask;
        T.lean = G.stoop + Math.sin(c) * 0.025 + (lm & 24 ? 0.12 : 0);
        T.roll = (G.limp * 0.08 + Math.sin(c * 0.6) * 0.04) + ((lm & 8 ? 0.22 : 0) - (lm & 16 ? 0.22 : 0));
        T.hp = 0.2 + Math.sin(c * 0.8) * 0.05;
        T.hy = Math.sin(c * 0.35) * 0.25;
        T.hr = Math.sin(c * 0.5 + 2) * 0.12;
        T.jaw = 0.3 + 0.08 * Math.sin(c * 1.7);
        T.bob = Math.sin(c) * 0.015;
        this._holdArms(T, t, c * 0.5, 0.6);
        if (this._twitch > 0) { // a twitch: the head jerks, a hand clenches, the jaw snaps
            const k = this._twitch;
            T.hy += Math.sin(t * 40) * 0.35 * k; T.hp += 0.2 * k; T.jaw = 0.1 + 0.6 * (1 - k); T.armL += 0.15 * k; T.elbR += 0.5 * k;
        }
        if (this.burning > 0) this._tgtBurn(T, t * 6);
    }

    /** Burning in the sun: it flails, the head thrashes, the mouth is wide. */
    _tgtBurn(T) {
        const t = performance.now() * 0.001 + this.animVariation, f = Math.sin(t * 17), g = Math.cos(t * 13);
        if (this._hasArm(true)) { T.armL = -2.3 + f * 0.7; T.elbL = 0.9 + g * 0.3; T.sideL = 0.5 + g * 0.3; }
        if (this._hasArm(false)) { T.armR = -2.1 + g * 0.7; T.elbR = 0.8 + f * 0.3; T.sideR = 0.5 + f * 0.3; }
        T.hy = Math.sin(t * 11) * 0.5; T.hp = -0.2 + Math.sin(t * 9) * 0.3; T.jaw = 0.85;
        T.lean = 0.05 + Math.sin(t * 7) * 0.12; T.twist += Math.sin(t * 8) * 0.2;
    }

    /** Dozing on its feet: slumped, the head down, the arms hanging. */
    _tgtSleep(t) {
        const T = this.tgt, c = t * 0.9 + this.animVariation;
        this._reset(T);
        T.lean = 0.5 + Math.sin(c) * 0.03; T.hp = 0.75; T.hy = Math.sin(c * 0.3) * 0.15; T.hr = 0.2; T.jaw = 0.55 + Math.sin(c * 0.7) * 0.05;
        T.armL = 0.12; T.armR = 0.18; T.elbL = 0.2; T.elbR = 0.25; T.sideL = 0.1; T.sideR = 0.12;
        T.kneeL = T.kneeR = 0.35; T.hipL = 0.05; T.hipR = -0.05; T.bob = -0.12 + Math.sin(c) * 0.02; T.roll = 0.06;
    }

    /** Woken: the head jerks up, the arms fly out, the jaw gapes — then it settles into the shamble. */
    _tgtWake(k) {
        const T = this.tgt;
        this._reset(T);
        const x = Math.sin(clamp(k, 0, 1) * PI);
        T.lean = -0.1 * x + this.gait.stoop * (1 - x); T.hp = -0.45 * x; T.jaw = 0.95 * x + 0.2; T.armL = -2.0 * x - HALF * (1 - x); T.armR = -2.2 * x - HALF * (1 - x);
        T.elbL = 0.6; T.elbR = 0.6; T.sideL = 0.6 * x; T.sideR = 0.6 * x;
    }

    /** The blow. Style 0: both arms up over the head and down; 1: a claw swipe across; 2: a lunge with a bite. */
    _tgtAttack(p) {
        const T = this.tgt, H = ZOMBIE.HIT_AT, wind = p < H ? Math.sin((p / H) * HALF) : 1;
        const q = p < H ? 0 : (p - H) / (1 - H); // after the hit
        this._reset(T);
        const lh = this._hasArm(true), rh = this._hasArm(false), armless = !lh && !rh;
        const style = armless ? 2 : this.attackStyle;
        const crawl = this.crawling;
        if (style === 0) {
            const a = p < H ? -HALF - 1.0 * wind : -HALF - 1.0 + 1.5 * Math.min(1, q * 2.5) - 0.5 * Math.max(0, q - 0.4) / 0.6;
            T.armL = a; T.armR = a + 0.08; T.elbL = p < H ? 1.0 * wind : 0.2; T.elbR = T.elbL; T.sideL = 0.15; T.sideR = 0.15;
            T.lean = p < H ? -0.12 * (p / H) : 0.28 * Math.sin(Math.min(1, q) * PI);
            T.hp = T.lean * 1.4; T.jaw = p < H ? 0.5 : 0.9 * (1 - q) + 0.2;
        } else if (style === 1) { // a swipe: the winding arm goes back out wide, then rakes across and down
            const side = this.attackSide, hand = side > 0 ? rh : lh;
            const w = p < H ? wind : Math.max(0, 1 - q * 2); // the arm's drawn-back share
            const sw = p < H ? -wind : Math.min(1, q * 3) - 0.1; // −1 drawn back, +1 swept across
            const A = hand ? side : -side;
            const big = -HALF + 0.1 - 0.3 * w;
            if (A > 0) { T.armR = big; T.sideR = 0.9 * (-sw) + 0.2; T.elbR = 0.5 + 0.7 * w; T.armL = -0.2; }
            else { T.armL = big; T.sideL = 0.9 * (-sw) + 0.2; T.elbL = 0.5 + 0.7 * w; T.armR = -0.2; }
            T.twist = A * 0.45 * (p < H ? -wind : q * 1.2 - 0.2);
            T.lean = 0.2 + 0.2 * Math.sin(clamp(p, 0, 1) * PI); T.hy = -T.twist * 0.6; T.jaw = 0.6;
            if (!lh) { T.armL = 0.1; T.elbL = 0.1; }
            if (!rh) { T.armR = 0.1; T.elbR = 0.1; }
        } else { // a lunge: the body flings forward, the arms clutch, the jaw snaps shut on whatever is there
            const lunge = p < H ? wind * 0.35 : 0.35 + 0.35 * Math.sin(Math.min(1, q) * PI) * (1 - 0.3 * q);
            T.lean = this.gait.stoop + lunge; T.hp = 0.1 - lunge * 0.5 + (p >= H ? 0.5 * Math.sin(Math.min(1, q) * PI) : 0);
            T.jaw = p < H ? 0.2 + 0.85 * wind : Math.max(0.05, 0.95 - q * 4);
            if (lh) { T.armL = -HALF + 0.2 + 0.3 * (1 - wind); T.elbL = 0.7; T.sideL = 0.3 * (1 - wind); }
            if (rh) { T.armR = -HALF + 0.2 + 0.3 * (1 - wind); T.elbR = 0.7; T.sideR = 0.3 * (1 - wind); }
            if (!lh) { T.armL = 0.1; T.elbL = 0.1; }
            if (!rh) { T.armR = 0.1; T.elbR = 0.1; }
            T.hipL = -0.25 * wind; T.hipR = 0.2 * wind;
        }
        if (crawl) { // on its belly it claws with one arm and bites
            T.armL = PI - 0.4 + (style === 1 && this.attackSide < 0 ? -0.8 * wind : 0); T.armR = PI - 0.4 + (style === 1 && this.attackSide > 0 ? -0.8 * wind : 0);
            T.hp = -1.0 - 0.3 * Math.sin(clamp(p, 0, 1) * PI); T.jaw = style === 2 ? T.jaw : 0.5; T.elbL = T.elbR = 0.3; T.lean = 0; T.hipL = T.hipR = 0.1;
            if (!lh) { T.armL = 0.1; T.elbL = 0.1; }
            if (!rh) { T.armR = 0.1; T.elbR = 0.1; }
        }
        if (this.limbMask & 24 && !crawl) { T.roll += (this.limbMask & 8 ? 0.2 : 0) - (this.limbMask & 16 ? 0.2 : 0); }
    }

    /** Dragging itself along on its belly by the arms, the head up, the legs trailing. */
    _tgtCrawl(moving) {
        const T = this.tgt, c = this.walkCycle + this.animVariation, s = Math.sin(c), t = performance.now() * 0.001 + this.animVariation;
        this._reset(T);
        const lh = this._hasArm(true), rh = this._hasArm(false);
        const pull = moving ? 1 : 0.15;
        T.armL = lh ? PI - 0.25 + s * 0.7 * pull : 0.1; T.armR = rh ? PI - 0.25 - s * 0.7 * pull : 0.1;
        T.elbL = lh ? 0.5 - s * 0.45 * pull : 0.1; T.elbR = rh ? 0.5 + s * 0.45 * pull : 0.1;
        T.sideL = 0.35; T.sideR = 0.35;
        T.lean = 0; T.twist = s * 0.2 * pull; T.roll = 0; T.bob = 0;
        T.hp = -1.05 + Math.sin(c * 2) * 0.06; T.hy = Math.sin(c * 0.5) * 0.25 + Math.sin(t * 0.8) * 0.1; T.hr = s * 0.1; T.jaw = 0.4 + Math.sin(c * 2 + 1) * 0.15;
        T.hipL = 0.1 + s * 0.12 * pull; T.hipR = 0.1 - s * 0.12 * pull; T.kneeL = 0.15; T.kneeR = 0.3;
        if (this._twitch > 0) { T.hy += Math.sin(t * 40) * 0.3 * this._twitch; T.jaw = 0.1 + 0.6 * (1 - this._twitch); }
        if (this.burning > 0) this._tgtBurn(T);
    }

    /** Falling: the knees give way, the arms fly up, the head snaps back. */
    _tgtDying(k) {
        const T = this.tgt;
        this._reset(T);
        const x = clamp(k, 0, 1);
        T.kneeL = 0.9 * x; T.kneeR = 0.7 * x; T.hipL = -0.5 * x; T.hipR = -0.3 * x;
        T.armL = -2.4 * x - HALF * (1 - x); T.armR = -2.0 * x - HALF * (1 - x); T.elbL = 0.8; T.elbR = 0.9; T.sideL = 0.7 * x; T.sideR = 0.8 * x;
        T.lean = -0.25 * x; T.hp = -0.6 * x; T.hr = 0.3 * x; T.jaw = 0.95; T.roll = 0.1 * x;
    }

    /** A corpse: sprawled, then a last few convulsions. */
    _tgtCorpse(t) {
        const T = this.tgt;
        this._reset(T);
        const left = Math.max(0, 1 - this.corpseTimer / 3.5), j = (this._twitch > 0 ? 1 : 0.6) * left; // (the convulsions die away over 3.5 s)
        T.lean = 0; T.hp = -0.35; T.hr = 0.2; T.jaw = 0.85; T.hipL = 0.15; T.hipR = -0.12; T.kneeL = 0.15; T.kneeR = 0.3;
        T.armL = -0.7; T.armR = -1.3; T.elbL = 0.5; T.elbR = 0.9; T.sideL = 0.9; T.sideR = 0.7;
        if (j > 0) { T.armL += Math.sin(t * 31) * 0.5 * j; T.armR += Math.sin(t * 27 + 1) * 0.5 * j; T.hipL += Math.sin(t * 23) * 0.4 * j; T.hy = Math.sin(t * 35) * 0.3 * j; T.jaw = 0.2 + 0.6 * Math.abs(Math.sin(t * 20)); }
    }

    /** Legs and arms back to standing, slowly: stopped — standing, or lying low if it crawls. */
    _relax() {
        if (this.crawling) this._tgtCrawl(false);
        else this._tgtIdle(performance.now() * 0.001);
    }

    /** Turns towards a yaw, at most TURN rad/s. → how far it still is from it (rad). */
    turnTo(yaw, dt) {
        this.yaw = this.group.rotation.y; // (what others turned it to — a blow, «Левиоса» — counts too)
        const d = wrapA(yaw - this.yaw), m = ZOMBIE.TURN * dt;
        this.yaw = wrapA(this.yaw + Math.max(-m, Math.min(m, d)));
        this.group.rotation.y = this.yaw;
        return Math.abs(wrapA(yaw - this.yaw));
    }

    /** Can its blow reach a body at p (horizontally within REACH, not far above/below, its face turned to it)? */
    reaches(p, extra = 0) {
        const pos = this.group.position;
        const feet = pos.y - this.gOff;
        if (p.y < feet - 1.2 || p.y > feet + 3.2) return false; // (p: the target's middle/eyes/feet — a body standing by it)
        const reach = this.crawling ? ZOMBIE.CRAWL_STOP + 0.6 : ZOMBIE.REACH;
        return Math.hypot(p.x - pos.x, p.z - pos.z) < reach * this.sizeK + extra && this.faces(p);
    }

    /** Is it turned to a point (its face to it, within FACE)? */
    faces(p) {
        const pos = this.group.position;
        return Math.abs(wrapA(Math.atan2(p.x - pos.x, p.z - pos.z) - this.yaw)) < ZOMBIE.FACE;
    }

    setSleeping(sleeping) { this.isSleeping = sleeping; }

    _setColor(hex) {
        for (const m of this.materials) m.color.setHex(hex);
    }

    _restoreColor() {
        for (const m of this.materials) {
            _c.setHex(m.userData.origColor);
            if (this._charK > 0) _c.multiplyScalar(1 - this._charK * 0.8); // (a burning zombie chars)
            if (this.freezeProgress > 0) _c.lerp(ICE, Math.min(1, this.freezeProgress));
            m.color.copy(_c);
        }
    }

    /** Which way it goes about on: upright, or on its belly once both legs are gone. */
    _syncStance() {
        const crawl = (this.limbMask & 24) === 24;
        if (crawl === this.crawling) return;
        this.crawling = crawl;
        this.baseX = crawl ? ZOMBIE.CRAWL_PITCH : 0;
        this.gOff = (crawl ? ZOMBIE.CRAWL_GOFF : ZOMBIE_GROUND_OFFSET) * this.sizeK; // (the ground comes up to it: it drops onto its belly)
        if (crawl) this.baseSpeed = this.speed = Math.min(this.speed, ZOMBIE.CRAWL_SPEED);
    }

    /**
     * @param {number} dt
     * @param {THREE.Vector3|null} targetPos  nearest player position
     * @param {THREE.Camera|null} camera
     * @param {CollisionWorld|null} collision
     */
    update(dt, targetPos, camera, collision) {
        this._think(dt, targetPos, camera, collision);
        this._finish(dt);
    }

    /** The pose of this frame goes onto the bones (far ones less often: nobody sees their feet). */
    _finish(dt) {
        if (this.isFrozen || this.isDead) return; // (a corpse and an ice statue keep their pose; the dying and the dead pump themselves)
        if (this.lastDistSq > 2500) {
            this._pumpT += dt;
            if (this._pumpT < 0.12) return;
            dt = this._pumpT; this._pumpT = 0;
        }
        this._pump(dt, this.isStunned ? 0.4 : this.isAttacking ? 0.45 : 0.22);
    }

    _think(dt, targetPos, camera, collision) {
        const pos = this.group.position;
        // (the per-frame slowing down of a blow's push and sway, as it was at 60 frames a second — the same on a
        // slow computer: at 20 frames a blow used to tip a zombie over flat, out of a blade's reach for long)
        const decay = (f) => f ** (dt * 60);
        this.lastDistSq = targetPos ? pos.distanceToSquared(targetPos) : Infinity;
        const ground = collision ? (collision.groundAt ? collision.groundAt(pos.x, pos.z, pos.y - 1.0 + 1.1) : collision.groundY(pos.x, pos.z)) : -0.5;
        this._syncStance();

        if (this.damageCooldown > 0) this.damageCooldown -= dt;
        tickSlow(this, dt); // («Даст»: slowed for a while)
        this._spinHalo(dt);
        this._life(dt); // (twitches, blood from the stumps, the flames)
        // Blown by «Вайнд»: slides away, slowing down (also when stunned or frozen)
        if (this.windVel && !this.isDead && !this.isDying) {
            pos.addScaledVector(this.windVel, dt);
            this.windVel.multiplyScalar(Math.max(0, 1 - 1.8 * dt));
            if (this.windVel.lengthSq() < 0.05) this.windVel = null;
            // carried by the wind: can't walk until it calms down
            else if (this.windVel.lengthSq() > 2.25) { this._settleY(dt, ground); return; }
        }
        if (this.hitFlashTimer > 0) {
            this.hitFlashTimer -= dt;
            if (this.hitFlashTimer <= 0) this._restoreColor();
        }

        if (this.isDying) {
            this.deathAnimTimer -= dt;
            this._tgtDying(1 - this.deathAnimTimer / 0.6);
            this._pump(dt, 0.3);
            const targetRot = -Math.PI / 2;
            this.group.rotation.x += (targetRot - this.group.rotation.x) * 5 * dt;
            const restY = ground + 0.8 * this.sizeK;
            if (pos.y > restY) {
                this.vy -= 25 * dt;
                pos.y = Math.max(restY, pos.y + Math.min(this.vy, -2) * dt);
            } else { pos.y = restY; this.vy = 0; }
            pos.addScaledVector(this.velocity, dt);
            this.velocity.multiplyScalar(decay(0.95));
            if (this.deathAnimTimer <= 0) {
                this.isDying = false;
                this.group.rotation.x = targetRot;
                pos.y = restY;
            }
            return;
        }

        if (this.isDead) {
            if (this.lastDistSq < 2500 && this.corpseTimer < 4) { this._tgtCorpse(performance.now() * 0.001); this._pump(dt, 0.3); } // (the last convulsions; after that the corpse keeps its pose)
            if (this.lev) return; // (held up by «Вингардиум Левиоса»: Levitation carries it)
            // Corpse: lie for a while, then sink into the ground and get removed.
            if (!this.group.visible) { this.removable = this.corpseTimer > 6; this.corpseTimer += dt; return; }
            this.corpseTimer += dt;
            // (the ground under it broken — a blast, a ruin: the body falls down to what is left)
            if (this.corpseTimer <= CORPSE_LIFETIME) {
                const restY = ground + 0.8 * this.sizeK;
                if (pos.y > restY + 0.05) { this.vy = (this.vy || 0) - 25 * dt; pos.y = Math.max(restY, pos.y + this.vy * dt); } else this.vy = 0;
            }
            if (this.corpseTimer > CORPSE_LIFETIME) {
                pos.y -= dt * 0.6;
                if (this.corpseTimer > CORPSE_LIFETIME + 4) this.removable = true;
            }
            return;
        }

        if (this.isFrozen) {
            this.frozenTimer -= dt;
            if (this.frozenTimer <= 0) this.unfreeze();
            return;
        }
        // «Остолбеней»: stands still
        if (this.stunTimer > 0) {
            this.stunTimer -= dt;
            if (pos.y > ground + this.gOff + 0.01) { this.vy = (this.vy || 0) - 25 * dt; pos.y = Math.max(ground + this.gOff, pos.y + this.vy * dt); }
            return;
        }

        if (this.isSleeping) {
            if (targetPos && Math.sqrt(this.lastDistSq) < 15) { this.isSleeping = false; this.wakeT = 0.7; }
            else { this._tgtSleep(performance.now() * 0.001); return; }
        }

        // Far zombies think less often (original optimisation, now time-correct)
        if (this.lastDistSq > 1600) {
            this._skipAccum += dt;
            if (this._skipAccum < 0.08) return;
            dt = Math.min(0.2, this._skipAccum);
        }
        this._skipAccum = 0;

        if (this.isStunned) {
            this.stunTimer -= dt;
            if (this.stunTimer <= 0) {
                this.isStunned = false;
            } else {
                this.spin += dt * 15;
                this.jolt.hx = Math.sin(performance.now() * 0.01) * 0.3;
                this._relax();
                pos.addScaledVector(this.velocity, dt);
                this.velocity.multiplyScalar(decay(0.9));
                this._settleY(dt, ground);
                return;
            }
        }

        pos.addScaledVector(this.velocity, dt);
        this.velocity.multiplyScalar(decay(0.9));
        this._settleY(dt, ground);

        this.group.rotation.z += this.rotVelocity.z * dt;
        this.group.rotation.x += this.rotVelocity.x * dt;
        this.rotVelocity.multiplyScalar(decay(0.9));
        if (this.dummy && !this.isFrozen && this.velocity.lengthSq() < 0.25) this._sway();
        if (this.velocity.lengthSq() < 0.01) {
            this.group.rotation.z *= decay(0.9);
            this.group.rotation.x = this.baseX + (this.group.rotation.x - this.baseX) * decay(0.9);
        }

        let walked = 0;
        if (targetPos && this.velocity.lengthSq() < 0.25) {
            _v.subVectors(targetPos, pos);
            _v.y = 0;
            const distance = _v.length();
            const stop = (this.crawling ? ZOMBIE.CRAWL_STOP : ZOMBIE.STOP) * this.sizeK;
            if (Number.isFinite(distance)) {
                const toT = Math.atan2(_v.x, _v.z);
                if (distance > stop && !this.isAttacking) {
                    if (distance > 0.1) _v.divideScalar(distance);
                    const sp = this.speed * slowFactor(this) * (this.pace ?? 1) * (this.burning > 0 ? 1.5 : 1); // (pace: slower when only wandering; afire it staggers on faster)
                    // round the others on its way (zombies, people, beasts — Crowd.js; the host's game sets it)
                    const st = this.steer ? this.steer(this, pos, _v.x, _v.z, distance - stop, sp, dt) : _v;
                    if (st) {
                        // it faces where it goes, and turns before it walks: never sideways, never backwards
                        const off = this.turnTo(Math.atan2(st.x, st.z), dt);
                        const go = sp * dt * Math.max(0, Math.cos(off)) * (off < 0.6 ? 1 : 0);
                        const step = Math.min(go, Math.max(0, distance - stop));
                        pos.x += st.x * step; pos.z += st.z * step;
                        walked = step;
                    } else this.turnTo(toT, dt); // (waiting for room: it looks at its prey)
                    if (this.velocity.lengthSq() < 0.01) this.group.rotation.z = 0;
                } else this.turnTo(toT, dt); // (close: it turns its face to the target)
            }
        }
        if (this.wakeT > 0) { this.wakeT -= dt; this._tgtWake(1 - this.wakeT / 0.7); }
        else if (walked > 1e-4) {
            // the legs step with the ground it covers (no sliding)
            this.walkCycle += (walked / (this.crawling ? ZOMBIE.STRIDE * 0.5 : ZOMBIE.STRIDE)) * Math.PI * 2;
            if (this.crawling) this._tgtCrawl(true); else this._tgtWalk();
        } else this._relax();
        if (this.isAttacking) this._animateAttack(dt);

        // Hide the head when it would clip through the FPV camera
        if (camera) {
            this.head.getWorldPosition(_v2);
            const close = _v2.distanceTo(camera.position) < 0.7;
            if (close && this.head.visible) { this.head.visible = false; this.wasHeadHiddenByCamera = true; }
            else if (!close && this.wasHeadHiddenByCamera) { this.head.visible = !(this.limbMask & 1); this.wasHeadHiddenByCamera = false; }
        }

        if (this.burning > 0) this._smoke(dt);
    }

    /** Twitches, blood from the stumps, flames — the small life that goes on whatever else it does. */
    _life(dt) {
        // an occasional twitch (a twitchy one more often)
        if (this._twitch > 0) this._twitch = Math.max(0, this._twitch - dt * 3.5);
        this._twitchT -= dt;
        if (this._twitchT <= 0) { this._twitchT = 1.4 + Math.random() * (3.5 - this.gait.twitchy * 1.5); this._twitch = 1; }
        // the stumps bleed (near the camera only: a far one is a dot)
        if ((this.limbMask & 30) && !this.isDead && this.lastDistSq < 3600) {
            this._bleedT -= dt;
            if (this._bleedT <= 0) { this._bleedT = 0.16; this._bleed(); }
        }
        if (this.burning > 0 && this.lastDistSq < 6400) this._flames(dt);
        else {
            this._lit = 0; // (the fire is out: next time it catches again from the first spark)
            if (this._glow > 0) this._setGlow(0);
        }
    }

    /** A drop from each stump: the arm's and the leg's root. */
    _bleed() {
        const fx = this.ctx.fx;
        if (!fx || !fx.spark) return;
        const bits = [[2, this.leftArm], [4, this.rightArm], [8, this.leftLeg], [16, this.rightLeg]];
        for (const [bit, part] of bits) {
            if (!(this.limbMask & bit) || Math.random() < 0.35) continue;
            part.updateWorldMatrix(true, false);
            _v2.set((Math.random() - 0.5) * 0.12, 0.45, (Math.random() - 0.5) * 0.12).applyMatrix4(part.matrixWorld);
            _v.set((Math.random() - 0.5) * 0.5, -0.6 - Math.random() * 0.8, (Math.random() - 0.5) * 0.5);
            fx.spark(_v2, Math.random() < 0.6 ? 0x8a0a14 : 0x5a0710, 0.07 + Math.random() * 0.05, _v, 0.8);
        }
    }

    /** Flames up its body and a red-orange glow on the skin, flickering; it chars as it burns. */
    _flames(dt) {
        const fx = this.ctx.fx;
        this._fireT += dt;
        // it CATCHES: smoke and a few sparks first, then in about a second the whole body goes up (the flames grow, the glow rises, a burst)
        const was = this._lit || 0;
        this._lit = Math.min(1, was + dt / 1.1);
        const lit = this._lit;
        const flick = 0.55 + 0.45 * Math.sin(this._fireT * 23) * Math.sin(this._fireT * 9.3 + 1);
        this._setGlow((0.1 + 0.5 * lit) * (0.6 + 0.4 * flick));
        const char = clamp(1 - this.health / 5, 0, 1);
        if (Math.abs(char - this._charK) > 0.04 && this.hitFlashTimer <= 0) { this._charK = char; this._restoreColor(); }
        if (!fx || !fx.spark) return;
        const p = this.group.position, s = this.sizeK;
        const burst = was < 0.45 && lit >= 0.45; // (the moment it catches: a whoosh of fire all over it)
        const n = burst ? 34 : dt * (12 + 64 * lit), whole = Math.floor(n) + (Math.random() < n - Math.floor(n) ? 1 : 0);
        for (let i = 0; i < whole; i++) {
            const y = Math.random() * 2.4 * s;
            _v2.set(p.x + (Math.random() - 0.5) * 0.9 * s, p.y + y - this.gOff * 0.6 + 0.4, p.z + (Math.random() - 0.5) * 0.8 * s);
            _v.set((Math.random() - 0.5) * (burst ? 2.4 : 0.7), (burst ? 2.6 : 1.8) + Math.random() * 1.6, (Math.random() - 0.5) * (burst ? 2.4 : 0.7));
            const r = Math.random();
            fx.spark(_v2, r < 0.5 ? 0xff8a1a : r < 0.8 ? 0xffc23a : 0xff4a10, 0.26 + Math.random() * 0.2, _v, 0.45 + Math.random() * 0.35);
        }
    }

    /** The burning glow on the cloth and skin (not the head: its glow is the eyes). */
    _setGlow(k) {
        this._glow = k;
        for (const m of this.materials) {
            if (m === this.headMat) continue;
            if (k <= 0) m.emissive.setHex(0x000000);
            else m.emissive.setRGB(k * 1.0, k * 0.34, k * 0.05);
        }
    }

    /** Makes this zombie the training dummy: 25% bigger — model, body parts, hits and collision all follow the one scale. */
    setDummy() {
        if (this.dummy) return;
        this.dummy = true;
        this.sizeK = 1.25;
        // it is there to practise on: blows don't fell it at once (two of them did — and then there was
        // nothing left to cut); a blade still takes its arms, legs and head, the head ends it
        this.health = DUMMY_HEALTH;
        this.group.scale.set(1.25, 1.12 * 1.25, 1.25);
        // the feet stay on the ground: the origin rises with the legs' length (the feet: local y −0.9)
        this.gOff = ZOMBIE_GROUND_OFFSET + 0.9 * 1.12 * 0.25;
        this.group.position.y += this.gOff - ZOMBIE_GROUND_OFFSET;
    }

    /** Training dummy: a slight sway so that it looks alive. */
    _sway() {
        this._tgtIdle(performance.now() * 0.001 + this.animVariation);
    }

    /** Stand on the ground, or fly/fall with gravity when thrown or stepping off a ledge. */
    _settleY(dt, ground) {
        const pos = this.group.position;
        const floor = ground + this.gOff;
        if (this.vy !== 0 || pos.y > floor + 0.05) {
            this.vy -= 25 * dt;
            pos.y += this.vy * dt;
            if (pos.y <= floor) { pos.y = floor; this.vy = 0; }
        } else {
            pos.y = floor;
        }
    }

    /** The blow of this frame: the target of the pose; `struck` at the moment the hands come down. */
    _animateAttack(dt) {
        const p0 = this.attackAnimProgress;
        const p = this.attackAnimProgress = p0 + dt / ZOMBIE.SWING;
        if (p0 < ZOMBIE.HIT_AT && p >= ZOMBIE.HIT_AT) this.struck = true;
        this._tgtAttack(Math.min(1, p));
        if (p >= 1) {
            this.isAttacking = false;
            this.attackAnimProgress = 0;
        }
    }

    triggerAttack() {
        if (this.isAttacking) return;
        this.isAttacking = true;
        this.attackAnimProgress = 0;
        this.struck = false;
        // which blow: it changes from one to the next (the same code on every computer picks its own — only the look differs)
        const r = Math.random();
        this.attackStyle = r < 0.45 ? 0 : r < 0.75 ? 1 : 2;
        this.attackSide = Math.random() < 0.5 ? -1 : 1;
    }

    /** Smoke and sparks off a zombie burning in the sunlight. */
    _smoke(dt) {
        this.burning -= dt;
        const fx = this.ctx.fx;
        if (!fx || Math.random() > dt * 14) return;
        const p = this.group.position;
        _v2.set(p.x + (Math.random() - 0.5) * 0.9, p.y + Math.random() * 2.2 * this.sizeK, p.z + (Math.random() - 0.5) * 0.9);
        _v.set((Math.random() - 0.5) * 0.4, 1.2 + Math.random(), (Math.random() - 0.5) * 0.4);
        fx.spark(_v2, Math.random() < 0.7 ? 0x3a3835 : 0x888580, 0.22, _v, 1.1);
    }

    /**
     * @param {number} amount
     * @param {boolean} isWeapon
     * @param {THREE.Vector3} [hitDir]  direction of the blow (physical knockback)
     * @param {function} [rand]  random source (host passes Math.random; events are replicated)
     * @returns {object} what happened (for network replication)
     */
    /**
     * @param {object} [hit] where a blade hit: {y: height above the zombie's origin,
     *   side: -1 left / +1 right, speed: m/s} — that part is cut off and flies along the blow
     */
    takeDamage(amount, isWeapon, hitDir = null, rand = Math.random, hit = null) {
        const result = { severed: -1, decap: false, died: false, shattered: false };
        if (this.isDead) return result;
        if (this.isFrozen) {
            this.shatter();
            result.shattered = true;
            return result;
        }
        this.health -= amount;
        this.damageCooldown = 0.4;
        this.isAttacking = false;
        this.attackAnimProgress = 0;
        this.isSleeping = false;

        this.hitFlashTimer = 0.15;
        this._setColor(0xff0000);

        // (arms, legs and the head come off only where a blade's edge really went through them:
        // Dismember.js cuts them — no more random cuts by the height of the blow)

        // Knockback: backwards from facing (original), or along the physical blow.
        if (hitDir) _v.set(hitDir.x, 0, hitDir.z).normalize();
        else _v.set(0, 0, -1).applyQuaternion(this.group.quaternion);
        // (the dummy stands its ground: a blow rocks it, it doesn't fly off out of the blade's reach)
        const kb = this.dummy ? 0.25 : 1;
        this.velocity.addScaledVector(_v, 3.9 * kb);
        this.isStunned = true;
        this.stunTimer = this.dummy ? 0.4 : 1.0;
        this.rotVelocity.z = (rand() - 0.5) * 10 * kb;
        this.rotVelocity.x = -(rand() * 5) * kb;
        if (this.head.visible) this.jolt.hx = -0.3; // (a jolt: the cube head bowed 45° sank its corner over the neck — no blade could get to it)
        this.jolt.x = -Math.PI / 6;

        if (this.health <= 0) {
            this.velocity.addScaledVector(_v, (isWeapon ? 8.0 : 5.0) * kb);
            this.die();
            result.died = true;
        }
        return result;
    }

    decapitate(vel = null) {
        if (this.limbMask & 1) return;
        this.limbMask |= 1;
        this.head.visible = false;
        this._spawnPart('head', vel);
        this._blood(2.1, 15);
    }

    severLimb(rand = Math.random, forced = -1, vel = null) {
        const limbs = [
            { bit: 2, part: this.leftArm, y: 1.4, type: 'arm' },
            { bit: 4, part: this.rightArm, y: 1.4, type: 'arm' },
            { bit: 8, part: this.leftLeg, y: 0.5, type: 'leg' },
            { bit: 16, part: this.rightLeg, y: 0.5, type: 'leg' },
        ];
        const alive = limbs.filter((l) => !(this.limbMask & l.bit));
        if (alive.length === 0) return -1;
        const chosen = forced >= 0 ? limbs.find((l) => l.bit === forced) : alive[Math.floor(rand() * alive.length)];
        if (!chosen || (this.limbMask & chosen.bit)) return -1;
        this.limbMask |= chosen.bit;
        chosen.part.visible = false;
        this._spawnPart(chosen.type, vel);
        if (chosen.type === 'leg') this.speed = (this.limbMask & 24) === 24 ? Math.min(this.speed, ZOMBIE.CRAWL_SPEED) : Math.max(0.5, this.speed - 1.0);
        this._blood(chosen.y, 8);
        return chosen.bit;
    }

    _spawnPart(type, vel = null) {
        const fx = this.ctx.fx;
        if (!fx) return;
        const startY = type === 'head' ? 2.1 : type === 'arm' ? 1.4 : 0.5;
        fx.flyingPart(type, this.group.position.x, this.group.position.y + startY, this.group.position.z, vel);
    }

    _blood(localY, count) {
        const fx = this.ctx.fx;
        if (!fx) return;
        _v.set(0, localY, 0);
        this.group.localToWorld(_v);
        fx.blood(_v, count);
    }

    die() {
        if (this.isDead) return;
        this.isDead = true;
        this.isDying = true;
        this.deathAnimTimer = 0.6;
        this.isAttacking = false;
        this.isStunned = false;
        this.corpseTimer = 0;
        this._twitch = 1;
        this._setGlow(0);
        if (this.ctx.sound && !this.dummy) this.ctx.sound.playDeath(this.group.position);
    }

    turnToSand() {
        if (this.isDead) return;
        this.isDead = true;
        this.group.visible = false;
        this.corpseTimer = 0;
        if (this.ctx.fx) this.ctx.fx.sandBurst(this.group.position);
    }

    applyChill(amount) {
        if (this.isDead || this.isFrozen) return;
        this.freezeProgress = (this.freezeProgress || 0) + amount;
        this.speed = Math.max(0, this.baseSpeed * (1.0 - this.freezeProgress));
        if (this.hitFlashTimer <= 0) this._restoreColor();
        if (Math.random() < amount * 10) this.spawnIceCrystalOnBody();
        const s = 0.5 + this.freezeProgress;
        for (const c of this.iceCrystals.children) c.scale.lerp(_v.set(s, s, s), 0.1);
        if (this.freezeProgress >= 1.0) this.freeze();
    }

    spawnIceCrystalOnBody() {
        const g = shared();
        const mesh = new THREE.Mesh(g.crystal, g.crystalMat);
        const angle = Math.random() * Math.PI * 2;
        const height = Math.random() * 2.0;
        mesh.position.set(Math.cos(angle) * 0.5, height, Math.sin(angle) * 0.5);
        mesh.lookAt(_v.set(0, height, 0));
        mesh.rotateX(-Math.PI / 2);
        mesh.rotation.x += (Math.random() - 0.5);
        mesh.scale.set(0.1, 0.1, 0.1);
        this.iceCrystals.add(mesh);
    }

    freeze() {
        if (this.isFrozen || this.isDead) return;
        this.isFrozen = true;
        this.frozenTimer = 120;
        const g = shared();
        for (const c of this.iceCrystals.children) c.material = g.crystalMatSolid;
    }

    unfreeze() {
        this.isFrozen = false;
        this.freezeProgress = 0;
        this.speed = this.baseSpeed;
        this.iceCrystals.clear();
        this._restoreColor();
    }

    shatter() {
        if (this.isDead) return;
        this.isDead = true;
        this.group.visible = false;
        this.corpseTimer = 0;
        if (this.ctx.fx) this.ctx.fx.iceShatter(this.group.position);
        if (this.ctx.sound) this.ctx.sound.playFrozenHit(this.group.position);
    }

    // ------------------------------------------------------------- «Брейнрот»
    /** Under a wizard's spell: violet eyes and a hypnotic ring turning over the head. */
    setThrall(on) {
        if (!!on === !!this.isThrall) return;
        this.isThrall = !!on;
        const g = shared();
        // (the eyes glow through the head's emissive map: tint it)
        if (this.headMat.emissiveMap) this.headMat.emissive.setHex(on ? 0xd65bff : 0xffffff);
        if (on && !this.halo) {
            if (!g.haloGeo) g.haloGeo = new THREE.TorusGeometry(0.55, 0.07, 6, 28);
            if (!g.haloMat) g.haloMat = new THREE.MeshBasicMaterial({ color: 0xc040ff, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
            this.halo = new THREE.Mesh(g.haloGeo, g.haloMat);
            this.halo.position.y = 3.0;
            this.halo.rotation.x = Math.PI / 2;
            this.group.add(this.halo);
        }
        if (this.halo) this.halo.visible = !!on;
    }

    _spinHalo(dt) {
        if (!this.halo || !this.halo.visible) return;
        this.halo.rotation.z += dt * 3;
        this.halo.scale.setScalar(1 + Math.sin(performance.now() / 180) * 0.12);
    }

    // ------------------------------------------------------------- networking
    serialize() {
        const p = this.group.position;
        const r = (v) => Math.round(v * 100) / 100;
        let flags = 0;
        if (this.isDead) flags |= 1;
        if (this.isFrozen) flags |= 2;
        if (this.isStunned) flags |= 4;
        if (this.isSleeping) flags |= 8;
        if (this.isAttacking) flags |= 16;
        if (!this.group.visible) flags |= 32;
        if (this.isThrall) flags |= 64;
        if (this.dummy) flags |= 128;
        if (this.burning > 0) flags |= 256;
        const state = [this.id, r(p.x), r(p.y), r(p.z), r(this.group.rotation.y), flags, this.limbMask, r(this.freezeProgress), r(this.group.rotation.x)];
        if (this.isDead && this.deathKick) state.push(this.deathKick);
        return state;
    }

    /** Client side: apply host snapshot (positions are interpolated by the caller). */
    applySnapshot(s) {
        const flags = s[5];
        const wasDead = this.isDead;
        this.isDead = !!(flags & 1);
        this.isStunned = !!(flags & 4);
        const asleep = !!(flags & 8);
        if (this.isSleeping && !asleep) this.wakeT = 0.7;
        this.isSleeping = asleep;
        if ((flags & 16) && !this.isAttacking) this.triggerAttack();
        if ((flags & 32) && this.group.visible) this.group.visible = false;
        this.setThrall(!!(flags & 64));
        if ((flags & 128) && !this.dummy) this.setDummy();
        this.burning = flags & 256 ? 0.5 : 0;
        const frozen = !!(flags & 2);
        if (frozen && !this.isFrozen) { this.freezeProgress = 1; this.freeze(); this._restoreColor(); }
        else if (!frozen && this.isFrozen) this.unfreeze();
        else if (!frozen && Math.abs(s[7] - this.freezeProgress) > 0.05) { this.freezeProgress = s[7]; this._restoreColor(); }
        if (this.isDead && !wasDead) { this.corpseTimer = 0; this.isDying = true; this.deathAnimTimer = 0.6; this._twitch = 1; }
        if (this.isDead && Array.isArray(s[9]) && s[9].length === 3 && s[9].every(Number.isFinite)) this.deathKick = s[9];
        this.netTarget = this.netTarget || new THREE.Vector3();
        this.netTarget.set(s[1], s[2], s[3]);
        this.netRotY = s[4];
        this.netRotX = s[8] || 0;
    }

    /** Client-side visual update: interpolate towards host state and animate. */
    updateRemote(dt, camera) {
        this._spinHalo(dt);
        this._syncStance();
        if (this.hitFlashTimer > 0) {
            this.hitFlashTimer -= dt;
            if (this.hitFlashTimer <= 0) this._restoreColor();
        }
        if (!this.netTarget) return;
        const pos = this.group.position;
        const k = Math.min(1, dt * 12);
        const x0 = pos.x, z0 = pos.z;
        const moved = Math.hypot(this.netTarget.x - pos.x, this.netTarget.z - pos.z);
        if (moved > 8) pos.copy(this.netTarget); else pos.lerp(this.netTarget, k);
        const dRot = wrapA(this.netRotY - this.group.rotation.y);
        this.group.rotation.y += dRot * k;
        this.yaw = this.group.rotation.y;
        this.group.rotation.x += (this.netRotX - this.group.rotation.x) * k;
        this._life(dt);
        if (this.burning > 0) this._smoke(dt);
        if (this.isFrozen) return;
        if (this.isDead) {
            if (this.isDying) { this.deathAnimTimer -= dt; this._tgtDying(1 - this.deathAnimTimer / 0.6); if (this.deathAnimTimer <= 0) this.isDying = false; }
            else { this.corpseTimer += dt; if (this.corpseTimer > 4) return; this._tgtCorpse(performance.now() * 0.001); }
            this._pump(dt, 0.3);
            return;
        }
        if (this.isStunned) { this.spin += dt * 15; this._relax(); this._pump(dt, 0.4); return; }
        const step = moved > 8 ? 0 : Math.hypot(pos.x - x0, pos.z - z0);
        if (this.isSleeping) this._tgtSleep(performance.now() * 0.001);
        else if (this.wakeT > 0) { this.wakeT -= dt; this._tgtWake(1 - this.wakeT / 0.7); }
        else if (this.dummy && moved < 0.02) this._sway();
        else if (step > 1e-3 && !this.isAttacking) { this.walkCycle += (step / (this.crawling ? ZOMBIE.STRIDE * 0.5 : ZOMBIE.STRIDE)) * Math.PI * 2; if (this.crawling) this._tgtCrawl(true); else this._tgtWalk(); } // (the same steps as on the host)
        else this._relax();
        if (this.isAttacking) { this._animateAttack(dt); this.struck = false; }
        if (camera) {
            this.head.getWorldPosition(_v2);
            const close = _v2.distanceTo(camera.position) < 0.7;
            this.head.visible = !close && !(this.limbMask & 1);
        }
        this._pump(dt, this.isAttacking ? 0.45 : 0.22);
    }

    dispose() {
        this.scene.remove(this.group);
        for (const m of this.materials) m.dispose();
        this.iceCrystals.clear();
    }
}
