/**
 * Weapons.js — how the player's hands interact with physical weapons.
 *
 * Realistic grabbing:
 *   - the palm must be at the handle and the fingers must CLOSE around it
 *     (an already-closed fist that bumps into the sword does not glue to it),
 *   - the sword is held at the exact point of the handle you grabbed, the
 *     handle settles across the palm and the fingers wrap around it,
 *   - you keep the direction you grabbed it in (blade up / down / sideways),
 *   - it leaves the hand only when the outstretched hand clearly opens, or in a
 *     real throw (wind-up, swing, the fingers let go) — with the hand's real
 *     velocity and spin (HandRelease.js); never by accident (a hand lost by the
 *     camera, a half-open hand at the side, running, a quick move).
 *
 * Combat: a hit is a real contact between the blade and a zombie's body while
 * the blade moves fast enough; damage and knockback come from the blade speed
 * and direction.
 */

import * as THREE from 'three';
import { Weapon } from '../entities/Weapon.js';
import { segmentSegmentDistSq, clamp } from '../core/math.js';
import { bladePower, overpowers, sweptBladeContact } from './BladeClash.js';
import { DropGate, DROP, ThrowDetector, poseBehind, holdsFast, handLog } from './HandRelease.js';
import { HandTrack, launchVelocity, launchPoint, spinFor } from './ThrowModel.js';
import { clampToCounter, BuyerGate } from './BuyerDeal.js';
import { enchantMul } from './Enchant.js';
import { boneLines } from './CutBodies.js';

const GRAB_RADIUS = 0.55; // palm-to-handle distance that allows a grab
const CLOSE_CURL = 0.55; // fingers closed
const OPEN_CURL = 0.35; // fingers open
const CLOSE_WINDOW_MS = 900; // hand must have been open this recently to count as "closing on" the handle
const GRIP_DIAGONAL = 0.2; // rad: the handle across the palm slants a little towards the fingers; the rest is the wrist's bend (SimplifiedHand.wristBend)
const SETTLE_TIME = 0.18; // seconds for the handle to settle into the grip
const MIN_SWING_SPEED = 3.2; // m/s at the tip to count as a strike
const STAB_SPEED = 4.5; // m/s of the point along the blade: a thrust that goes into the body
const STAB_DEPTH = 0.4; // m: how far the point goes in at most
const PULL_OUT = 0.28; // m the hand draws back along the blade to pull it out of the body
const SLIP_OFF = 0.95; // m the hand gets away from a stuck handle: the fingers slip off it
const BODY_R = 0.5; // a person's body round its axis (feet at -1.95, head top 2.7 in its frame)
const BONE_R = 0.06; // a limb's bone: the edge sinks into the flesh down to it

const _P = new THREE.Vector3();
const _X = new THREE.Vector3();
const _Y = new THREE.Vector3();
const _Z = new THREE.Vector3();
const _G = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d = new THREE.Vector3();
const _e = new THREE.Vector3();
const _f = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _qPalm = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const A0 = [0, 0, 0], A1 = [0, 0, 0], B0 = [0, 0, 0], B1 = [0, 0, 0];

export class WeaponSystem {
    /**
     * @param {object} game  needs: scene, renderer, world (collision), character, now()
     */
    constructor(game) {
        this.game = game;
        this.weapons = [];
        this.byId = new Map();
        this.hands = {
            left: this._handState(),
            right: this._handState(),
        };
        this.onHit = null; // (zombie, damage, dir, isWeapon, weapon) => void
        this.onGrab = null; // (weapon, side) => void
        this.onRelease = null; // (weapon, side) => void
    }

    _handState() {
        return { held: null, lastOpen: 0, lastOpenFrame: -1000, rel0: null, relC: null, settle: 0, tipPrev: new THREE.Vector3(), basePrev: new THREE.Vector3(), hasPrev: false, drop: new DropGate(), buyDrop: new BuyerGate(), thr: new ThrowDetector(), trk: new HandTrack(), arm: {} };
    }

    spawn(type, position, quaternion, id) {
        const w = new Weapon(this.game.scene, type, { position, quaternion, renderer: this.game.renderer, id, headless: !!this.game.headless });
        this.weapons.push(w);
        this.byId.set(w.id, w);
        return w;
    }

    /** Put a weapon lying flat on a surface at `centre` with yaw `yaw`. */
    spawnLying(type, x, surfaceY, z, yaw, id) {
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, yaw, 'XYZ'));
        const w = this.spawn(type, new THREE.Vector3(x, surfaceY + 0.12, z), q, id);
        // Let it settle physically for a moment, then it sleeps.
        w.wake();
        return w;
    }

    /** Chest reward: rises out of the chest and floats until grabbed. */
    /** A magic weapon (from a chest): glows, hits `bonus` % harder. */
    markMagic(w, bonus) {
        if (!w || !(bonus > 0)) return w;
        w.magic = true;
        w.bonus = bonus;
        w.applyMagicLook?.();
        return w;
    }

    /** byHandle: `pos` is where the middle of its handle floats (at the reaching hand's height). */
    spawnHovering(type, pos, id, { byHandle = false } = {}) {
        const q = new THREE.Quaternion();
        const w = this.spawn(type, pos.clone(), q, id);
        if (byHandle) {
            const sp = w.spec;
            w.position.y += (sp.com[1] - (sp.handle[0] + sp.handle[1]) / 2) * w.S;
            pos = w.position.clone();
        }
        w.sleeping = true;
        w.hover = { base: pos.clone(), t: 0, rise: 1.6 };
        w.position.y -= w.hover.rise;
        return w;
    }

    remove(w) {
        const i = this.weapons.indexOf(w);
        if (i >= 0) this.weapons.splice(i, 1);
        this.byId.delete(w.id);
        w.dispose();
    }

    // ------------------------------------------------------------------ frame
    update(dt, { allowGrab = true } = {}) {
        const now = this.game.now();
        this.frame = (this.frame || 0) + 1;
        const ch = this.game.character;
        const collision = this.game.world.collision;

        // Hover animation for chest rewards
        for (const w of this.weapons) {
            if (!w.hover || w.holder || w.remoteTarget) continue;
            const h = w.hover;
            // a hand reaching for it: the magic holds it still (no turning, no bobbing) to be taken
            if (!(ch && h.t > 1 && this._handNearHover(w, ch))) h.t += dt;
            const rise = Math.min(1, h.t / 1.0);
            const ease = 1 - Math.pow(1 - rise, 3);
            w.position.set(h.base.x, h.base.y - h.rise * (1 - ease) + Math.sin(h.t * 2) * 0.08 * ease, h.base.z);
            w.quaternion.setFromAxisAngle(_a.set(0, 1, 0), h.t * 0.8);
            w.mesh.updateMatrixWorld(true);
        }

        if (ch) {
            for (const side of ['left', 'right']) this._updateHand(side, dt, now, ch, allowGrab);
            this._handsStopAtHovering(ch);
        }

        this._updateStuck();
        // The player's visible hands are solid for free weapons nearby
        const handMeshes = ch ? this._handMeshes(ch) : null;
        for (const w of this.weapons) {
            if (w.hover && !w.holder) continue;
            if (w.stuckIn) continue; // moves with its zombie
            // (only just after letting go, or while it lies on a hand — reaching for a weapon
            // on the ground must not push it away)
            const fresh = w.onHand || now - (w.releasedAt || -1e9) < 3000;
            w.handMeshes = fresh && handMeshes && !w.holder && !w.remoteTarget && this._nearHands(w, ch) ? handMeshes : null;
            // (the hand that has just let go opens out of its way: for a moment it doesn't hold it up)
            if (w.handMeshes && w.releasedSide && now - (w.releasedAt || -1e9) < 600) w.handMeshes = this._handMeshes(ch, w.releasedSide === 'left' ? 'right' : 'left');
            if (!w.handMeshes) w.onHand = false;
            w.step(dt, collision);
        }

        this._anchorImpaled();
        // Blade against another player's blade: stopped, metal rings
        if (ch) this._bladeClash(dt, now);

        // Hand is blocked by what the blade hits (no clipping through walls)
        if (ch) {
            for (const side of ['left', 'right']) {
                const hs = this.hands[side];
                if (!hs.held || (hs.held.contactHard < 0.02 && !hs.held.stuckIn)) continue;
                this._pushHandBack(side, hs.held, ch);
            }
        }
    }

    // ------------------------------------------------------- blade vs blade
    /** A weapon in another player's hand (only those can block my blade). */
    _isForeignHeld(w) {
        if (w.stuckIn || w.hover) return false;
        if (w.foreignHeld) return true; // (tests)
        const o = this.game.sync?.weaponOwners?.get(w.id);
        return !!o && o !== this.game.localId;
    }

    /** How fast the tip moved since the last frame (m/s); keeps `_clashVel`. */
    _tipSpeed(w, dt) {
        const tip = w.getTipPosition(_e);
        if (!w._clashTip) { w._clashTip = tip.clone(); w._clashVel = new THREE.Vector3(); }
        else if (w._clashFrame === this.frame - 1) w._clashVel.subVectors(tip, w._clashTip).divideScalar(Math.max(dt, 1 / 240));
        else w._clashVel.set(0, 0, 0);
        w._clashTip.copy(tip);
        w._clashFrame = this.frame;
        return w._clashVel.length();
    }

    /**
     * My held blades against blades in other players' hands (and knights' /
     * sailors' swords): they don't pass through each other — mine stops on
     * theirs (the hand too), metal rings. Checked along the way both blades
     * went since the last frame, so a fast swing can't jump through.
     * A much stronger blow beats the other blade aside and goes on.
     */
    _bladeClash(dt, now) {
        const foreign = this._foreign || (this._foreign = []);
        foreign.length = 0;
        for (const w of this.weapons) if (this._isForeignHeld(w)) foreign.push(w);
        this._npcBlades(foreign);
        const pairs = this._pairs || (this._pairs = new Map());
        if (!foreign.length) { pairs.clear(); return; }
        for (const o of foreign) { o._clashSpeed = this._tipSpeed(o, dt); this._segNow(o); }
        for (const side of ['left', 'right']) {
            const w = this.hands[side].held;
            if (!w || !w.drive || w.stuckIn) continue;
            const mySpeed = this._tipSpeed(w, dt);
            const myPow = bladePower(mySpeed, w.mass);
            const sw = this._segNow(w);
            for (const o of foreign) {
                if (o.position.distanceToSquared(w.position) > 16) continue;
                const key = w.id + '|' + o.id;
                let pr = pairs.get(key);
                if (!pr) { pr = { n: null, touching: false, passUntil: 0, clangAt: -1e9, frame: 0 }; pairs.set(key, pr); }
                if (pr.frame !== this.frame - 1) { pr.n = null; pr.touching = false; }
                pr.frame = this.frame;
                const so = o._seg;
                const c = sweptBladeContact(sw.hasPrev ? sw.pa : null, sw.pb, sw.a, sw.b, so.hasPrev ? so.pa : null, so.pb, so.a, so.b, now < pr.passUntil ? null : pr.n);
                if (!c.touch) {
                    pr.touching = false;
                    pr.n = c.n && c.d < 0.6 ? c.n : null;
                    continue;
                }
                const oPow = bladePower(o._clashSpeed, o.mass);
                const start = !pr.touching;
                pr.touching = true;
                if (start) {
                    const rel = _e.copy(w._clashVel).sub(o._clashVel).length();
                    if (rel > 0.8 && now - pr.clangAt > 120) { pr.clangAt = now; this._clang(c.point, rel); }
                    if (!o.npc && overpowers(myPow, mySpeed, oPow)) pr.passUntil = now + 300;
                }
                if (o.npc) { this.parryAt = now; this.parryBy = o.npc; } // (a knight's blow met my blade)
                if (now < pr.passUntil) { pr.n = null; continue; } // beat the other blade aside
                // stopped on the other blade
                pr.n = c.n;
                _e.fromArray(c.n);
                const depth = Math.min(c.depth, 0.5);
                w.position.addScaledVector(_e, depth);
                const vn = w.velocity.dot(_e);
                if (vn < 0) w.velocity.addScaledVector(_e, -vn);
                w.angularVelocity.multiplyScalar(0.6);
                // a much stronger blow knocks my blade away
                if (start && overpowers(oPow, o._clashSpeed, myPow)) w.velocity.addScaledVector(o._clashVel, 0.6);
                w.contactHard = Math.max(w.contactHard, depth + 0.02);
                w.mesh.updateMatrixWorld(true);
                w.clashes = (w.clashes || 0) + 1;
                this._segStore(w);
            }
            w.getTipPosition(w._clashTip);
        }
        if (this.frame % 120 === 0) for (const [k, pr] of pairs) if (pr.frame < this.frame - 60) pairs.delete(k);
    }

    /** This frame's blade ends (as arrays) and last frame's, if it was seen then. */
    _segNow(w) {
        const s = w._seg || (w._seg = { a: [0, 0, 0], b: [0, 0, 0], pa: [0, 0, 0], pb: [0, 0, 0], frame: -9, hasPrev: false });
        if (s.frame === this.frame) return s;
        s.hasPrev = s.frame === this.frame - 1;
        for (let i = 0; i < 3; i++) { s.pa[i] = s.a[i]; s.pb[i] = s.b[i]; }
        s.frame = this.frame;
        return this._segStore(w);
    }

    /** (after the blade was put back) where it is now. */
    _segStore(w) {
        const s = w._seg;
        w.getBladeSegment(_a, _b);
        _a.toArray(s.a); _b.toArray(s.b);
        return s;
    }

    /** Swords in the hands of knights / sailors near me: they block my blade too. */
    _npcBlades(out) {
        const g = this.game;
        const me = g.character?.group.position;
        if (!me) return;
        for (const list of [g.castleLife?.targets?.(), g.ships?.crew?.targets?.()]) {
            for (const v of list || []) {
                const m = v.model;
                if (!m?.tool || (m.toolKind !== 'sword' && m.toolKind !== 'bigsword') || v.dead) continue;
                if (Math.abs(v.x - me.x) > 6 || Math.abs(v.z - me.z) > 6) continue;
                const px = v._bladeProxy || (v._bladeProxy = npcBlade(v));
                px.getBladeSegment(_a, _b);
                px.position.addVectors(_a, _b).multiplyScalar(0.5);
                out.push(px);
            }
        }
    }

    /** Did my blade meet a knight's sword just now (near x, z)? Then his blow is parried. */
    parried(x, z, ms = 700) {
        const v = this.parryBy;
        if (!v || this.game.now() - (this.parryAt || -1e9) > ms) return false;
        return Math.hypot(v.x - x, v.z - z) < 3;
    }

    _clang(point, relSpeed) {
        const g = this.game;
        this.clangCount = (this.clangCount || 0) + 1;
        g.sound?.playClang?.(Math.min(1, relSpeed / 12));
        if (!g.fx) return;
        _f.fromArray(point);
        const n = 6 + Math.min(14, Math.round(relSpeed));
        for (let i = 0; i < n; i++) {
            g.fx.spark(_f, Math.random() < 0.6 ? 0xfff2a8 : 0xffffff, 0.06, _e.set((Math.random() - 0.5) * 6, Math.random() * 4, (Math.random() - 0.5) * 6), 0.35);
        }
    }

    _updateHand(side, dt, now, ch, allowGrab) {
        const hs = this.hands[side];
        // a cut-off hand holds nothing and grabs nothing
        if (ch.handLost?.(side)) { if (hs.held) this.release(side); return; }
        const hand = ch.getActiveHands()[side];
        const visible = hand && hand.group.visible;
        const curl = visible ? ch.getGripCurl(side) : (hs.held ? 1 : 0);
        // While the camera has lost this hand we never drop the weapon (safeguard):
        // the model then only shows the last pose / slowly relaxes.
        const tracked = ch.isHandTracked ? ch.isHandTracked(side) : false;
        const seen = !hand || !hand.lastTrackingTime || Date.now() - hand.lastTrackingTime < 400; // (for closing on a handle)
        if (curl < OPEN_CURL && seen) { hs.lastOpen = now; hs.lastOpenFrame = this.frame; }

        if (hs.held) {
            const w = hs.held;
            // Weapon got taken by the network (another player / host reset)
            if (w.holder == null || w.holder.side !== side) { this._forget(side, hand); return; }
            // Summoned into an open hand («Акцио», a slot): kept until the hand has closed on it once
            if (hs.waitClose) { hs.waitClose = false; hs.drop.reset(false); hs.trk.reset(false); }
            if (w.stuckIn) { this._holdStuck(side, hs, w, dt, ch, curl, tracked); return; }
            // (the hand's memory — ThrowModel.HandTrack, as for any thing: the throw or the opening, its moment read back)
            const ps = this.game.poseSmoother, tt = ps?.eff > 0 ? ps.eff : now;
            if (ch.armState && ps) {
                const arm0 = ch.armState(side, hs.arm);
                const fresh = ps.to !== hs.lastTo; hs.lastTo = ps.to;
                const seenNow = !!hand && hand.group.visible && (hand._lost === undefined ? tracked : !hand._lost);
                hs.trk.trace = this.game.poseService?.wristTrace?.[side] || null;
                hs.trk.push({ t: tt, hand: arm0.hand, world: ch.getHandWorldPosition(side, _e), yaw: ch.group.rotation.y, curl: ch.getGripCurl(side), seen: seenNow, fresh, camMs: ps.interval || 50 });
            }
            if (holdsFast(ch)) { hs.thr.reset(); hs.drop.since = 0; hs.trk.decide({ t: tt, blocked: true }); } // (swimming: the strokes never throw or drop it)
            else if (ch.armState) {
                const arm = ch.armState(side, hs.arm);
                const gt = hs.clock = (hs.clock || 0) + dt * 1000; // (the game's clock: a stalled frame must not cut a swing in two)
                // a real throw of any kind (overhand, sidearm, underhand…) or a calm opening of the held-out hand
                const d = ps ? hs.trk.decide({ t: tt, arm, weight: w.mass || 1 }) : null;
                if (d?.act) { this._letGoTracked(side, w, d, ch); return; }
                // (no camera pose stream at all — a bare test rig: the old gate, the outstretched hand opened)
                if (!ps && hs.drop.update({ now: gt, curl, tracked, ...arm })) { this.release(side); return; }
                // the outstretched hand clearly opened: it falls out of it
                // the pawnshop / the shady buyer: the off hand held out over his counter and opened lays it there (BuyerDeal.js)
                if (side === this.game.off) {
                    const st = ch.getHandWorldPosition(side, _b) && this.game.castleLife?.talk?.buyerCounterAt(_b);
                    if (!st) hs.buyDrop.reset();
                    else if (hs.buyDrop.update({ now: gt, curl, tracked, reach: arm.reach, forward: arm.forward, speed: arm.speed })) {
                        this.release(side);
                        clampToCounter(st, w.position);
                        const at = w.position.clone();
                        w.position.y = st.counter.top + 0.3;
                        w.velocity.set(0, 0, 0);
                        this.game.castleLife.talk.laid(st, { wid: w.id, item: { kind: 'weapon', type: w.type, magic: !!w.magic, bonus: w.bonus || 0 }, pos: at });
                        return;
                    }
                }

            }
            this._driveHeld(side, dt, ch);
            return;
        }

        if (!allowGrab || !visible) return;
        if (this.game.items?.held[side]) return; // the hand holds another thing
        if (this.game.books?.reading?.handBusy(side)) return; // (it holds the book's cover)
        if (this.game.boards?.handBusy(side)) return; // (it holds a surfboard's rail)
        // "Recently open" in time OR in frames (slow computers render few frames per second)
        const closing = curl > CLOSE_CURL && (now - hs.lastOpen < CLOSE_WINDOW_MS || this.frame - hs.lastOpenFrame <= 12);
        if (!closing) return;

        this._palmFrame(ch, side);
        let best = null, bestD = GRAB_RADIUS + 0.15, bestT = 0.5;
        const owners = this.game.sync ? this.game.sync.weaponOwners : null;
        const me = this.game.localId;
        for (const w of this.weapons) {
            if (w.holder && !(w.stuckIn && w.holder.stuck)) continue; // (a blade stuck in a zombie can be pulled out)
            // In multiplayer a weapon in someone else's hand can't be taken.
            if (owners && owners.has(w.id) && owners.get(w.id) !== me) continue;
            if (w.position.distanceToSquared(_G) > 16) continue;
            w.getHandleSegment(_a, _b);
            _c.subVectors(_b, _a);
            const len2 = _c.lengthSq();
            let t = len2 > 0 ? _d.subVectors(_G, _a).dot(_c) / len2 : 0;
            t = clamp(t, 0, 1);
            _d.copy(_a).addScaledVector(_c, t);
            const dist = _d.distanceTo(_G);
            // (a floating one holds still for the hand and lets the closing fingers find it a bit further)
            if (dist < bestD && (dist < GRAB_RADIUS || w.hover)) { bestD = dist; best = w; bestT = t; }
        }
        if (best) this.grab(best, side, bestT);
    }

    /** Is one of the player's hands within reach of this floating weapon (its handle)? */
    _handNearHover(w, ch) {
        w.getHandleSegment(_a, _b);
        _c.addVectors(_a, _b).multiplyScalar(0.5);
        for (const side of ['left', 'right']) if (ch.getGripObject(side).getWorldPosition(_d).distanceToSquared(_c) < 1.44) return true;
        return false;
    }

    /**
     * The hands don't go through a weapon floating over a pedestal / a chest: a palm that would
     * go into its handle or blade stops against it (the hand is shown pushed back), so the handle
     * ends up in the fingers and they can close on it.
     */
    _handsStopAtHovering(ch) {
        const hands = ch.getActiveHands();
        for (const side of ['left', 'right']) {
            const hand = hands[side];
            if (!hand || !hand.group.visible || !hand.group.parent || this.hands[side].held || !hand.palm) continue;
            hand.palm.getWorldPosition(_e);
            for (const w of this.weapons) {
                if (!w.hover || w.holder || w.position.distanceToSquared(_e) > 16) continue;
                const sp = w.spec;
                w.modelToWorld(0, sp.handle[0], 0, _a);
                w.modelToWorld(0, sp.length, 0, _b);
                _c.subVectors(_b, _a);
                const t = clamp(_d.subVectors(_e, _a).dot(_c) / Math.max(1e-6, _c.lengthSq()), 0, 1);
                _d.copy(_a).addScaledVector(_c, t);
                const r = (t * _c.length() < (sp.handle[1] - sp.handle[0]) * w.S ? sp.handleRadius * w.S : 0.09) + 0.07; // (the palm's half thickness)
                _f.subVectors(_e, _d);
                const d = _f.length();
                if (d >= r) continue;
                if (d < 1e-4) _f.set(0, 0, 1); else _f.divideScalar(d);
                _f.multiplyScalar(r - d);
                hand.group.parent.getWorldQuaternion(_q).invert();
                hand.group.position.add(_f.applyQuaternion(_q));
                hand.group.updateMatrixWorld(true);
                hand.palm.getWorldPosition(_e);
            }
        }
    }

    /** Orthonormal palm frame (X across the palm, Y towards the fingers, Z back of hand). Writes _P,_X,_Y,_Z,_G,_qPalm. */
    _palmFrame(ch, side) {
        const grip = ch.getGripObject(side);
        // Fresh world matrix through the whole parent chain (the body may have
        // moved/turned after the arms were posed this frame).
        grip.updateWorldMatrix(true, false);
        const e = grip.matrixWorld.elements;
        _P.set(e[12], e[13], e[14]);
        if (grip.name === 'palm') {
            _Y.set(e[4], e[5], e[6]).normalize();
            _Z.set(e[8], e[9], e[10]).normalize();
            _X.crossVectors(_Y, _Z).normalize();
            _Z.crossVectors(_X, _Y).normalize();
            // Handle sits in the closed fingers: towards the finger base, on the palm side.
            _G.copy(_P).addScaledVector(_Y, 0.13).addScaledVector(_Z, -0.135);
        } else {
            // Wrist anchor (hands hidden): forearm points along local +Z.
            _Y.set(e[8], e[9], e[10]).normalize();
            _X.set(e[0], e[1], e[2]).normalize();
            _Z.crossVectors(_X, _Y).normalize();
            _X.crossVectors(_Y, _Z).normalize();
            _G.copy(_P).addScaledVector(_Y, 0.25);
        }
        _m.makeBasis(_X, _Y, _Z);
        _qPalm.setFromRotationMatrix(_m);
    }

    /**
     * The palm of a hand (for things held like the sword): P palm, X across the palm,
     * Y towards the fingers, Z the back of the hand, G the grip point in the closed
     * fingers, q the palm's rotation, thumb: which way along X the thumb is (±1).
     * `ch`: whose hand (another player's hero too — their things are drawn as they hold them).
     */
    palmFrame(side, out = {}, ch = this.game.character) {
        this._palmFrame(ch, side);
        out.P = (out.P || new THREE.Vector3()).copy(_P);
        out.X = (out.X || new THREE.Vector3()).copy(_X);
        out.Y = (out.Y || new THREE.Vector3()).copy(_Y);
        out.Z = (out.Z || new THREE.Vector3()).copy(_Z);
        out.G = (out.G || new THREE.Vector3()).copy(_G);
        out.q = (out.q || new THREE.Quaternion()).copy(_qPalm);
        const thumb = ch.getActiveHands()[side]?.fingerMeshes?.thumb?.[0]?.pivot;
        if (thumb) { thumb.getWorldPosition(_c); out.thumb = Math.sign(_c.sub(_P).dot(_X)) || 1; } else out.thumb = side === 'left' ? -1 : 1;
        return out;
    }

    grab(w, side, t = 0.5) {
        const ch = this.game.character;
        const hs = this.hands[side];
        if (hs.held) return false;
        if (w.stuckIn) this._unstick(w, false);
        this._palmFrame(ch, side);

        // Where along the handle: keep the grabbed point but never on the guard/pommel.
        const spec = w.spec;
        const tt = clamp(t, 0.22, 0.78);
        const handleY = spec.handle[0] + (spec.handle[1] - spec.handle[0]) * tt;

        // Current orientation of the weapon in the palm frame
        const qRel0 = _qPalm.clone().invert().multiply(w.quaternion);
        const wY = _a.set(0, 1, 0).applyQuaternion(w.quaternion);
        const wX = _b.set(1, 0, 0).applyQuaternion(w.quaternion);
        // The handle lies a little diagonally in the closed hand (a real sword grip: from the
        // index finger's base knuckle to the heel of the hand). Pointing the blade forward for a
        // thrust is the wrist's work: bent to the little finger's side, the fist carries the
        // blade towards where the arm points (SimplifiedHand.wristBend) — every pose in between.
        // Out of the thumb side or the little finger's: as it was grabbed (default: thumb).
        let thumbS = side === 'left' ? -1 : 1;
        const thumb = ch.getActiveHands()[side]?.fingerMeshes?.thumb?.[0]?.pivot;
        if (thumb) { thumb.getWorldPosition(_c); thumbS = Math.sign(_c.sub(_P).dot(_X)) || thumbS; }
        const diag = new THREE.Vector3().copy(_X).multiplyScalar(thumbS * Math.cos(GRIP_DIAGONAL)).addScaledVector(_Y, Math.sin(GRIP_DIAGONAL));
        const s = wY.dot(diag) < -0.3 ? -1 : 1;
        // Canonical grip: blade axis = s*diag, edge towards the knuckles (e*Y, square to the blade)
        const axY = diag.multiplyScalar(s).normalize();
        // (an axe has one edge: it always faces where the fist strikes — forward, in line with the knuckles)
        const e = w.type === 'axe' ? 1 : Math.sign(wX.dot(_Y)) || 1;
        const axX = _Y.clone().multiplyScalar(e).addScaledVector(axY, -e * _Y.dot(axY)).normalize();
        const axZ = new THREE.Vector3().crossVectors(axX, axY);
        const qWorldC = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(axX, axY, axZ));
        const qRelC = _qPalm.clone().invert().multiply(qWorldC);

        // Offsets (COM relative to the grip point) in palm space
        const handleLocal = new THREE.Vector3(0, (handleY - spec.com[1]) * w.S, 0);
        const pRelC = handleLocal.clone().applyQuaternion(qWorldC).negate().add(_G).sub(_P).applyQuaternion(_qPalm.clone().invert());
        const pRel0 = w.position.clone().sub(_P).applyQuaternion(_qPalm.clone().invert());

        hs.held = w;
        hs.rel0 = { p: pRel0, q: qRel0 };
        hs.relC = { p: pRelC, q: qRelC };
        hs.settle = 0;
        hs.hasPrev = false;
        hs.drop.reset(true);
        hs.thr.reset();
        hs.trk.reset(true);
        w.hover = null;
        w.clearRemote();
        w.attach({ playerId: this.game.localId || 'local', side });
        const hand = ch.getActiveHands()[side];
        if (hand && hand.setGrip) hand.setGrip(0.62);
        if (hand) hand.bladeGrip = true; // (its wrist's bend is read for the blade)
        if (this.onGrab) this.onGrab(w, side);
        return true;
    }

    _driveHeld(side, dt, ch) {
        const hs = this.hands[side];
        const w = hs.held;
        this._palmFrame(ch, side);
        hs.settle = Math.min(1, hs.settle + dt / SETTLE_TIME);
        const k = hs.settle * hs.settle * (3 - 2 * hs.settle);
        _a.copy(hs.rel0.p).lerp(hs.relC.p, k);
        _q.copy(hs.rel0.q).slerp(hs.relC.q, k);
        w.drive.position.copy(_a).applyQuaternion(_qPalm).add(_P);
        w.drive.quaternion.copy(_qPalm).multiply(_q);
        // First frames: snap the body to the settling target so it doesn't swing from far away
        if (hs.settle < 0.35) {
            w.position.lerp(w.drive.position, 0.5);
            w.quaternion.slerp(w.drive.quaternion, 0.5);
        }
    }

    _pushHandBack(side, w, ch) {
        // Push the visible hand by how far the blade was stopped
        // (a blade stuck in a body: the hand stays right on its handle).
        const hand = ch.getActiveHands()[side];
        if (!hand || !hand.group.visible || !hand.group.parent) return;
        _a.subVectors(w.position, w.drive.position);
        if (_a.lengthSq() < 0.0004) return;
        _a.clampLength(0, w.stuckIn ? SLIP_OFF : 0.45);
        hand.group.parent.getWorldQuaternion(_q).invert();
        _a.applyQuaternion(_q);
        hand.group.position.addScaledVector(_a, w.stuckIn ? 1 : 0.8);
    }

    /**
     * The hand still holds a blade stuck in a body: the blade stays where it went in
     * (it moves with the body), the hand stays on its handle. Drawing the hand back
     * along the blade pulls it out (then it is in the hand as before); opening the
     * hand lets go of it — it stays in the body.
     */
    _holdStuck(side, hs, w, dt, ch, curl, tracked) {
        this._driveHeld(side, dt, ch); // (where the hand would take it)
        hs.openT = curl < OPEN_CURL && tracked ? (hs.openT || 0) + dt : 0;
        if (hs.openT > 0.25) { this._letGoStuck(side); return; }
        _c.subVectors(w.drive.position, w.position);
        const [base, tip] = w.getBladeSegment(_a, _b);
        _d.subVectors(tip, base).normalize(); // (into the body)
        const back = -_c.dot(_d) - (w.stuckIn.gap || 0);
        if (back > PULL_OUT) {
            this._unstick(w, false);
            w.velocity.set(0, 0, 0); w.angularVelocity.set(0, 0, 0);
            w.cutPassUntil = now(this) + 400; // (it slides out the way it went in)
            this.game.sound?.playHit?.();
            return;
        }
        if (_c.length() > SLIP_OFF + (w.stuckIn.gap || 0)) this._letGoStuck(side);
    }

    /** The hand lets go of a blade stuck in a body: it stays there. */
    _letGoStuck(side) {
        const w = this.hands[side].held;
        this._forget(side, this.game.character?.getActiveHands()[side]);
        if (!w) return;
        w.drive = null;
        w.holder = { stuck: true, side: null };
    }

    /** Palm and finger meshes of the player's visible hands (cached per hand model). */
    _handMeshes(ch, only = null) {
        const out = only ? (this._handMeshOne || (this._handMeshOne = {}))[only] || (this._handMeshOne[only] = []) : this._handMeshList || (this._handMeshList = []);
        out.length = 0;
        const hands = ch.getActiveHands();
        for (const side of only ? [only] : ['left', 'right']) {
            const hand = hands[side];
            if (!hand || !hand.group.visible) continue;
            if (!hand._solidMeshes) {
                hand._solidMeshes = [];
                hand.group.traverse((o) => { if (o.isMesh) hand._solidMeshes.push(o); });
            }
            hand.group.updateMatrixWorld(true);
            for (const m of hand._solidMeshes) out.push(m);
        }
        return out;
    }

    /** Is a free weapon close enough to a hand to touch it? */
    _nearHands(w, ch) {
        for (const side of ['left', 'right']) {
            if (ch.getGripObject(side).getWorldPosition(_b).distanceToSquared(w.position) < 9) return true;
        }
        return false;
    }

    release(side) {
        const hs = this.hands[side];
        const w = hs.held;
        if (!w) return;
        if (w.stuckIn) { this._letGoStuck(side); return; } // (stays in the body)
        const hand = this.game.character?.getActiveHands()[side];
        this._forget(side, hand);
        w.release();
        w.releasedAt = this.game.now();
        w.releasedSide = side;
        if (this.onRelease) this.onRelease(w, side);
    }

    /**
     * A held weapon leaves the hand as the hand's memory says (d: ThrowModel decision): the hand's velocity at the
     * moment the fingers let go (× the flick and its weight, ≤ 10° towards where the eyes look, an arm's limit) plus the
     * body's own motion; its own spin (the wrist turning it — the rigid body keeps it) and the flick's end-over-end turn;
     * from where it was then, on along its flight for the decision's time (never into a wall).
     */
    _letGoTracked(side, w, d, ch) {
        const g = this.game;
        const look = _a.set(0, 0, -1).applyQuaternion(ch.getHeadQuaternion ? ch.getHeadQuaternion(new THREE.Quaternion()) : ch.group.quaternion);
        const lv = launchVelocity(d, w.mass || 1, d.act === 'throw' ? look : null, this._lv || (this._lv = { x: 0, y: 0, z: 0 }));
        const handNow = ch.getHandWorldPosition(side, _b);
        const from = _c.copy(w.position);
        this.release(side);
        w.velocity.set(lv.x, lv.y, lv.z);
        const sh = g.ships?.me?.ship;
        if (sh) { const pv = g.ships.pointVel(sh, w.position.x, w.position.z, {}); w.velocity.x -= pv.x; w.velocity.z -= pv.z; }
        if (d.act === 'throw') {
            const fl = spinFor('hammer', w.velocity, null, this._sp || (this._sp = { x: 0, y: 0, z: 0 }));
            w.angularVelocity.x += fl.x * 0.5; w.angularVelocity.z += fl.z * 0.5; w.angularVelocity.clampLength(0, 30);
            // where it was when the fingers let go, moved on along its flight (stopped before anything solid)
            const p = launchPoint(_d.copy(from).sub(handNow).add(_e.set(d.pos.x, d.pos.y, d.pos.z)), w.velocity, d.lag, 14, this._lp || (this._lp = { x: 0, y: 0, z: 0 }));
            const col = g.collision, n = Math.max(1, Math.ceil(from.distanceTo(_e.set(p.x, p.y, p.z)) / 0.2));
            if (from.distanceTo(_e) < 3 && col?.pointBlocked) {
                for (let i = 1; i <= n; i++) { _d.lerpVectors(from, _e, i / n); if (col.pointBlocked(_d.x, _d.y, _d.z)) break; w.position.copy(_d); }
            }
            const sp = w.velocity.length();
            if (sp > 4) g.sound?.playThrow?.(sp, 'long', w.position);
        }
        handLog(`${d.act === 'throw' ? 'бросок' : 'отпускание'} оружия (${side === 'right' ? 'правая' : 'левая'}${side === g.off ? ', неосновная' : ', ведущая'}): ${w.type || 'оружие'} ${w.mass || 1} кг — ${d.why}; вылет ${w.velocity.length().toFixed(1)} м/с, вращение ${w.angularVelocity.length().toFixed(1)} рад/с`);
    }

    _forget(side, hand) {
        const hs = this.hands[side];
        hs.held = null;
        hs.waitClose = false;
        hs.rel0 = hs.relC = null;
        if (hand && hand.setGrip) hand.setGrip(null);
        if (hand) hand.bladeGrip = false;
    }

    releaseAll() {
        this.release('left');
        this.release('right');
    }

    heldWeapons() {
        const out = [];
        if (this.hands.left.held) out.push(this.hands.left);
        if (this.hands.right.held) out.push(this.hands.right);
        return out;
    }

    hasWeapon() {
        return !!(this.hands.left.held || this.hands.right.held);
    }

    // ----------------------------------------------------------------- combat
    /**
     * Blade vs zombie hits for the local player's held weapons — and the one
     * floating by «Вингардиум Левиоса» (it is swung with the wrist).
     * @param {Zombie[]} zombies
     */
    checkHits(zombies, dt) {
        const lev = this._levSlot || (this._levSlot = { held: null, hasPrev: false, basePrev: new THREE.Vector3(), tipPrev: new THREE.Vector3() });
        const floating = this.game.levitation?.heldWeapon() || null;
        if (floating !== lev.held) { lev.held = floating; lev.hasPrev = false; }
        for (const hs of [this.hands.left, this.hands.right, lev]) {
            const w = hs.held;
            if (!w) continue;
            if (w.stuckIn) { hs.hasPrev = false; continue; } // (in a body: it strikes nothing more)
            const [base, tip] = w.getBladeSegment(_a, _b);
            // the edge this frame and the last (Dismember: a real cut where the edge went through)
            const swing = this.game.dismember?.slot(hs, w, dt, this.frame) || null;
            // How fast the HAND carries the point (the blade can't go faster than the hand drives
            // it: a blade held back on a bone and then slipping on must not count as a blow)
            const handSpeed = hs === lev || !w.drive ? Infinity : this._handTipSpeed(hs, w, dt);
            if (!hs.hasPrev) {
                hs.basePrev.copy(base); hs.tipPrev.copy(tip); hs.hasPrev = true;
                continue;
            }
            // Real swing speed = how far the tip actually travelled this frame
            // (the spring towards the hand settles within a frame, so its
            // instantaneous velocity under-reports fast swings).
            const tipVel = _c.subVectors(tip, hs.tipPrev).divideScalar(Math.max(dt, 1 / 240));
            const bodyVel = w.pointVelocity(tip, _d);
            if (bodyVel.lengthSq() > tipVel.lengthSq()) tipVel.copy(bodyVel);
            if (tipVel.length() > handSpeed * 1.25 + 1) tipVel.setLength(handSpeed * 1.25 + 1);
            const speed = tipVel.length();
            if (speed >= MIN_SWING_SPEED) {
                // Swept test: interpolate the blade between last and this frame so a
                // fast swing (or a slow computer) can't skip through a body.
                const moved = Math.max(hs.tipPrev.distanceTo(tip), hs.basePrev.distanceTo(base));
                const steps = Math.min(8, Math.max(1, Math.ceil(moved / 0.4)));
                for (const z of zombies) {
                    if (z.isDead) continue;
                    const zp = z.group.position;
                    // (a big body — the giant spider — gives its own capsule)
                    const cap = z.bodyCapsule ? z.bodyCapsule(this._cap || (this._cap = { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 })) : null;
                    const reach = cap ? 8 + cap.a.distanceTo(cap.b) + cap.r : 8;
                    if (Math.abs(zp.x - tip.x) > reach || Math.abs(zp.z - tip.z) > reach) continue;
                    // the edge through an arm / a leg / the neck: cut off right there (any creature)
                    let cut = swing && this.game.dismember.tryCut(z, swing);
                    if (cut?.kind === 'cut' && handSpeed < swing.E.cutSpeed * 0.8) cut = { ...cut, kind: 'touch', sever: null }; // (the hand was too slow for it)
                    if (cut?.kind === 'cut') {
                        if (!(z.severCooldown > now(this))) { z.severCooldown = now(this) + 300; this.game.dismember.commit(z, cut); }
                        w.velocity.multiplyScalar(0.7);
                        w.cutPassUntil = now(this) + 250; // (the edge goes on through what it cut off)
                    } else if (cut?.kind === 'armour' && now(this) - (w.armourClangAt || 0) >= 300) {
                        w.armourClangAt = now(this);
                        this._clang(cut.point, speed); // steel stops the blade
                        w.velocity.multiplyScalar(0.2); w.angularVelocity.multiplyScalar(0.3);
                    }
                    if (z.damageCooldown > 0) continue;
                    if (now(this) - (w.lastHitTime || 0) < 120) continue;
                    let hit = cut?.kind === 'cut' || cut?.kind === 'armour' || cut?.kind === 'touch'; // (the edge reached a bone)
                    // What the blade really touches: a body made for the blade (Dismember) is its trunk and
                    // skull (an arm, a leg, the neck: reached at the bone, above) — not a fat cylinder round
                    // it, which took the blow (knocked it away, bent it) before the edge got to a leg or the neck.
                    const solids = !hit && this.game.dismember?.which?.(z) ? this._solidsOf(z, this._hitSolids || (this._hitSolids = [])).filter((S) => !S.bone) : null;
                    const zb = cap ? [cap.a.x, cap.a.y, cap.a.z] : [zp.x, zp.y - 0.6, zp.z], zt = cap ? [cap.b.x, cap.b.y, cap.b.z] : [zp.x, zp.y + 2.9, zp.z];
                    const r = (cap ? cap.r : 0.8) + 0.12;
                    for (let k = 1; k <= steps && !hit; k++) {
                        const t = k / steps;
                        const bx = hs.basePrev.x + (base.x - hs.basePrev.x) * t, by = hs.basePrev.y + (base.y - hs.basePrev.y) * t, bz = hs.basePrev.z + (base.z - hs.basePrev.z) * t;
                        const tx = hs.tipPrev.x + (tip.x - hs.tipPrev.x) * t, ty = hs.tipPrev.y + (tip.y - hs.tipPrev.y) * t, tz = hs.tipPrev.z + (tip.z - hs.tipPrev.z) * t;
                        if (solids) { for (const S of solids) if (segmentSegmentDistSq([bx, by, bz], [tx, ty, tz], S.a, S.b) <= (S.r + 0.04) ** 2) { hit = true; break; } }
                        else hit = segmentSegmentDistSq([bx, by, bz], [tx, ty, tz], zb, zt) <= r * r;
                    }
                    if (!hit) continue;
                    // Where the blade went through: the blade point closest to the body's axis
                    let bestD = Infinity, hy = 1.2;
                    for (let k = 0; k <= 8; k++) {
                        _e.copy(base).lerp(tip, k / 8);
                        const dd = (_e.x - zp.x) ** 2 + (_e.z - zp.z) ** 2;
                        if (dd < bestD) { bestD = dd; hy = _e.y - zp.y; _f.copy(_e); }
                    }
                    const ry = z.group.rotation.y;
                    const lx = (_f.x - zp.x) * Math.cos(ry) - (_f.z - zp.z) * Math.sin(ry);
                    const lz = (_f.x - zp.x) * Math.sin(ry) + (_f.z - zp.z) * Math.cos(ry);
                    const side = lx >= 0 ? 1 : -1;
                    // A thrust (the blade moving along itself, point first) sticks it into the body
                    _e.subVectors(tip, base).normalize();
                    const along = tipVel.dot(_e);
                    const stab = !cut && z.group && !z.isBird && !z.isPhoenix && !z.isOwl && !z.isSpencer && along > STAB_SPEED && along > 0.6 * speed && hs !== this._levSlot && hy > -0.6 && hy < 2.6;
                    const factor = clamp(speed / 9, 0.7, 1.6);
                    const damage = Math.max(1, Math.round(w.spec.damage * factor * enchantMul(w))); // (w.ench: enchanted on the pentagram)
                    const dir = tipVel.clone().setY(0);
                    if (dir.lengthSq() < 1e-4) dir.subVectors(zp, this.game.character.group.position).setY(0);
                    dir.normalize();
                    w.lastHitTime = now(this);
                    if (stab) {
                        // Run through: double damage, no cut, and the blade stays in the body
                        // (still in the hand: drawn back it comes out, the hand opened it stays in)
                        if (this.onHit) this.onHit(z, damage * 2, dir, true, w, null);
                        if (!z.isDead) this._stab(w, z, hs, base, tip);
                        break;
                    }
                    // The blade loses energy in the hit
                    w.velocity.multiplyScalar(0.4);
                    w.angularVelocity.multiplyScalar(0.4);
                    if (this.onHit) this.onHit(z, damage, dir, true, w, { y: hy, side, speed, lx, lz });
                }
            }
            hs.basePrev.copy(base);
            hs.tipPrev.copy(tip);
            if (hs !== lev && w.drive && !w.stuckIn) this._bodyStop(w, zombies);
        }
    }

    /** The speed of the point where the hand takes it (its drive pose), m/s; the faster of this frame and the last. */
    _handTipSpeed(hs, w, dt) {
        const sp = w.spec;
        _e.set(-sp.com[0] * w.S, (sp.length - sp.com[1]) * w.S, -sp.com[2] * w.S).applyQuaternion(w.drive.quaternion).add(w.drive.position);
        const fresh = hs.driveFrame === this.frame - 1 && hs.driveTip;
        const v = fresh ? _e.distanceTo(hs.driveTip) / Math.max(dt, 1 / 240) : 0;
        (hs.driveTip || (hs.driveTip = new THREE.Vector3())).copy(_e);
        hs.driveFrame = this.frame;
        const out = Math.max(v, fresh ? hs.driveV || 0 : 0);
        hs.driveV = v;
        return fresh ? out : Infinity;
    }

    /** A target's body as a capsule (world): a person's axis from the legs to the head; null — no solid body to stop a blade. */
    _bodyOf(z, out) {
        if (z.bodyCapsule) return z.bodyCapsule(out);
        if (z.isAnimal || z.isBoss || z.isLivingTree || z.isBird || !z.group) return null;
        const g = z.group, sy = g.scale.y, p = g.position;
        out.a.set(p.x, p.y - 1.5 * sy, p.z);
        out.b.set(p.x, p.y + 2.2 * sy, p.z);
        out.r = BODY_R * g.scale.x;
        return out;
    }

    /**
     * What of a body stops a blade (world segments + radius): the trunk and the skull of
     * a person (they are not cut through), and every limb's bone line — the edge sinks
     * into an arm, a leg or the neck down to the bone and stops there unless the blow is
     * strong enough to cut it off (Dismember: then it goes on through).
     */
    _solidsOf(z, out) {
        out.length = 0;
        const slot = () => out[out.length] || (out[out.length] = { a: [0, 0, 0], b: [0, 0, 0], r: 0, bone: false });
        const who = this.game.dismember?.which?.(z);
        const body = who?.body;
        if (!body) {
            if (!z.bodyCapsule) return out;
            const cap = z.bodyCapsule(this._bodyCap || (this._bodyCap = { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 }));
            const s = slot(); cap.a.toArray(s.a); cap.b.toArray(s.b); s.r = cap.r; s.bone = false;
            return out;
        }
        const st = body.root.limbs || {};
        // the trunk, the skull: each box as a capsule along its longest side
        for (const B of body.blockers) {
            if ((B.limb && st[B.limb] != null) || !B.obj.visible) continue;
            B.obj.updateWorldMatrix(true, false);
            const h = B.half, k = h[0] >= h[1] && h[0] >= h[2] ? 0 : h[1] >= h[2] ? 1 : 2;
            const r = Math.min(...h.filter((_, i) => i !== k)), L = Math.max(0, h[k] - r);
            _e.fromArray(B.c); _f.fromArray(B.c);
            _e.setComponent(k, B.c[k] - L); _f.setComponent(k, B.c[k] + L);
            _e.applyMatrix4(B.obj.matrixWorld); _f.applyMatrix4(B.obj.matrixWorld);
            const sc = B.obj.matrixWorld.getMaxScaleOnAxis();
            const s = slot(); _e.toArray(s.a); _f.toArray(s.b); s.r = r * sc; s.bone = false;
        }
        // the limbs' bones (the neck too)
        for (const L of boneLines(body, st)) {
            const s = slot();
            for (let k = 0; k < 3; k++) { s.a[k] = L.a[k]; s.b[k] = L.b[k]; }
            s.r = BONE_R; s.bone = true;
        }
        return out;
    }

    /**
     * A held blade doesn't go through a body: it stops on the trunk / the skull, and on
     * a limb's bone (the hand stops too), checked along the way the blade went since the
     * last frame. Only a cut lets the edge on through; a thrust goes in (_stab).
     */
    _bodyStop(w, targets) {
        const t = now(this);
        if (t < (w.cutPassUntil || 0)) return;
        const sw = this._segNow(w);
        const solids = this._solids || (this._solids = []);
        const st = w._bodyN || (w._bodyN = new Map());
        for (const z of targets) {
            if (z.isDead) continue;
            const zp = z.group?.position;
            if (!zp || zp.distanceToSquared(w.position) > 36) continue;
            this._solidsOf(z, solids);
            if (!solids.length) continue;
            let pr = st.get(z);
            if (!pr) { pr = { ns: [], frame: 0 }; st.set(z, pr); }
            if (pr.frame !== this.frame - 1) pr.ns.length = 0;
            pr.frame = this.frame;
            for (let i = 0; i < solids.length; i++) {
                const S = solids[i];
                const c = sweptBladeContact(sw.hasPrev ? sw.pa : null, sw.pb, sw.a, sw.b, S.a, S.b, S.a, S.b, pr.ns[i] || null, S.r);
                if (!c.touch) { pr.ns[i] = c.n && c.d < S.r + 0.6 ? c.n : null; continue; }
                pr.ns[i] = c.n;
                if (S.bone && c.depth <= S.r) continue; // (in the flesh, not past the bone yet: it goes on in)
                _e.fromArray(c.n);
                const depth = Math.min(c.depth, 1.0);
                w.position.addScaledVector(_e, depth);
                const vn = w.velocity.dot(_e);
                if (vn < 0) w.velocity.addScaledVector(_e, -vn);
                w.angularVelocity.multiplyScalar(0.5);
                w.contactHard = Math.max(w.contactHard || 0, depth + 0.02);
                w.mesh.updateMatrixWorld(true);
                w.bodyStops = (w.bodyStops || 0) + 1;
                this._segStore(w);
            }
        }
        if (this.frame % 120 === 0) for (const [k, pr] of st) if (pr.frame < this.frame - 60) st.delete(k);
    }

    /** A thrust went in: the point goes into the body and the blade stays there, still in the hand. */
    _stab(w, z, hs, base, tip) {
        const g = this.game;
        let victim = z;
        if (z.isPlayer) {
            const id = z.id;
            victim = { group: z.group, get isDead() { const r = g.remotes?.get(id); return !r || !!r.dead; }, removable: false, playerId: id };
        }
        // the point goes on in, at most up to the middle of the body
        let s = 0;
        const cap = this._bodyOf(z, this._bodyCap || (this._bodyCap = { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0 }));
        if (cap) {
            _e.subVectors(tip, base).normalize();
            _f.copy(tip).addScaledVector(_e, 1);
            const st = [0, 0];
            segmentSegmentDistSq(tip.toArray(), _f.toArray(), cap.a.toArray(), cap.b.toArray(), st);
            s = Math.min(STAB_DEPTH, st[0]);
            w.position.addScaledVector(_e, s);
            w.mesh.updateMatrixWorld(true);
        }
        this._stick(w, victim, hs, true);
        w.stuckIn.gap = s;
        g.hud?.setVoice?.('🗡️ Клинок вошёл в тело — потяните руку назад, чтобы вынуть, или разожмите пальцы', true);
        if (victim.playerId) g.sync?.impale?.(victim.playerId, w.id, [...w.stuckIn.pos.toArray(), ...w.stuckIn.quat.toArray()]);
    }

    // ------------------------------------------------------- stuck in a zombie
    /** The sword goes into the zombie and stays there (the hand lets go). */
    _stick(w, z, hs, keepInHand = false) {
        const side = hs === this.hands.left ? 'left' : hs === this.hands.right ? 'right' : null;
        if (!keepInHand || !side) {
            if (side) this._forget(side, this.game.character?.getActiveHands()[side]);
            w.drive = null;
            w.holder = { stuck: true, side: null };
        }
        z.group.updateMatrixWorld(true);
        _m.copy(z.group.matrixWorld).invert().multiply(w.mesh.matrixWorld);
        const pos = new THREE.Vector3(), quat = new THREE.Quaternion(), scl = new THREE.Vector3();
        _m.decompose(pos, quat, scl);
        w.stuckIn = { z, pos, quat };
        w.velocity.set(0, 0, 0);
        w.angularVelocity.set(0, 0, 0);
        w.sleeping = true;
        (this.stuck || (this.stuck = new Set())).add(w);
    }

    _unstick(w, fall) {
        if (!w.stuckIn) return;
        // out of a player: they bleed slower now (everybody is told)
        const pid = w.stuckIn.z?.playerId;
        if (pid) { this.game.sync?.unimpale?.(w.id); this.game.bleeding?.noteUnimpale(w.id); }
        w.stuckIn = null;
        this.stuck?.delete(w);
        if (w.holder?.side && w.drive) { w.sleeping = false; return; } // (still in the hand: it follows the hand again)
        w.holder = null;
        if (fall) {
            w.wake();
            w.velocity.set((Math.random() - 0.5) * 2, 1.5, (Math.random() - 0.5) * 2);
            if (this.onRelease) this.onRelease(w, null);
        }
    }

    /** Stuck swords move with their zombie; fall out when it dies. */
    _updateStuck() {
        if (!this.stuck || !this.stuck.size) return;
        for (const w of [...this.stuck]) {
            const z = w.stuckIn.z;
            if (z.isDead || z.removable || !z.group.parent) { this._unstick(w, true); continue; }
            z.group.updateMatrixWorld(true);
            _m.compose(w.stuckIn.pos, w.stuckIn.quat, _e.set(1, 1, 1)).premultiply(z.group.matrixWorld);
            _m.decompose(w.position, w.quaternion, _e);
            w.mesh.updateMatrixWorld(true);
        }
    }

    /**
     * A blade of someone else's stuck in a player (me or another): it sits where it
     * went in, on that body as I see it (the network is late, the body is not).
     */
    _anchorImpaled() {
        const an = this.game.bleeding?.anchors;
        if (!an?.size) return;
        for (const [wid, a] of an) {
            const w = this.byId.get(wid);
            if (!w || w.stuckIn) continue; // (mine: _updateStuck)
            const grp = a.pid === this.game.localId ? this.game.character?.group : this.game.remotes?.get(a.pid)?.character?.group;
            if (!grp) continue;
            grp.updateMatrixWorld(true);
            _m.compose(a.p, a.q, _e.set(1, 1, 1)).premultiply(grp.matrixWorld);
            _m.decompose(w.position, w.quaternion, _e);
            if (w.remoteTarget) { w.remoteTarget.p.copy(w.position); w.remoteTarget.q.copy(w.quaternion); }
            w.mesh.updateMatrixWorld(true);
        }
    }

    /** Weapons stuck in zombies (multiplayer: their position goes out with my pose). */
    stuckWeapons() {
        return this.stuck ? [...this.stuck] : [];
    }

    clear() {
        this.stuck?.clear();
        for (const w of this.weapons) w.dispose();
        this.weapons.length = 0;
        this.byId.clear();
        for (const side of ['left', 'right']) {
            this.hands[side] = this._handState();
        }
    }
}

const now = (sys) => sys.game.now();

const _s1 = new THREE.Vector3();
/** A knight's / sailor's sword as a blade (it lies along its tool's +Y). */
function npcBlade(v) {
    return {
        id: 'npc' + v.id, npc: v, mass: 1.5, position: new THREE.Vector3(),
        getBladeSegment(a, b) {
            const t = v.model.tool;
            t.updateWorldMatrix(true, false);
            t.localToWorld(a.set(0, 0.28, 0));
            t.localToWorld(b.set(0, v.model.toolKind === 'bigsword' ? 2.55 : 1.69, 0));
            return [a, b];
        },
        getTipPosition(out) { return this.getBladeSegment(_s1, out)[1]; },
    };
}
