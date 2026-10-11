/**
 * Items.js — things in the world and in the hands (wands, scrolls, shields,
 * backpacks, bows, Thor's hammer, food…).
 *
 *  - Lying / hovering things: touch one with an empty hand — it is in the hand.
 *  - In the hand it stays: it leaves the hand only when the OUTSTRETCHED hand
 *    clearly opens (it falls), or in a real throw — never by accident (a hand
 *    lost by the camera, a half-open hand at the side, running, a quick move).
 *    Strike the right pocket — it goes into a slot.
 *  - Throw: a wind-up (the hand up by the head / behind the shoulder), a fast
 *    swing, the fingers let go — it flies with the hand's speed, spinning with
 *    the wrist; heavy things leave the hand slower, light flat ones feel the air
 *    (a book flutters down, a shield barely goes). It bounces off walls.
 *  - Hand to hand: bring it to another player's empty hand — it is theirs.
 *  - Food: bring it to the mouth and hold — eaten (+HP).
 *  - Backpack: hold it and put both hands behind the back — worn, +slots.
 *  - Scroll: hold it and burn it (Inferno) — its power is yours, for good.
 *
 * Multiplayer: the host owns the lying things (spawn, pick-up); everybody
 * sees what the others hold.
 */

import * as THREE from 'three';
import { ITEM_INFO, makeItemModel, disposeModel, rollLoot, rollHouseLoot, rollPortLoot, SPELL_RU, SCROLL_SPELL_COLOR } from './ItemTypes.js';
import { PEN_POINTS } from '../entities/SimplifiedHand.js';
import { DropGate, ThrowDetector, poseBehind } from './HandRelease.js';
import { StickTracker, stickDirection } from '../input/RealStick.js';

const PICK_RADIUS = 0.9;
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _inv = new THREE.Matrix4();

const AIMED = new Set(['bow', 'wand', 'hammer', 'shield']);
/** Held in the fist like the sword: handle (model y, before scaling) at the fingers, the axis across the palm. */
const GRIPPED = {
    wand: { axis: 'y', handle: 0.12, curl: 0.38, pose: 'pen' }, // like a pen: see _penGrip
    hammer: { axis: 'y', handle: 0.12 },
    bow: { axis: 'y', handle: 0 },
    scroll: { axis: 'x', handle: 0, curl: 0.5 },
    shield: { axis: 'y', handle: 0, face: 'back' },
    book: { axis: 'book', handle: 0, curl: 0.55 }, // by the spine: the covers between the thumb and the fingers
};
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _e = new THREE.Vector3(), _f = new THREE.Vector3();
const _fwd = new THREE.Vector3();
const _m4 = new THREE.Matrix4();
const _UPY = new THREE.Vector3(0, 1, 0);
const _hq = new THREE.Quaternion();
/** The arm's own mass in a throw (kg-ish): a thing as heavy leaves the hand at ~70% of the hand's speed. */
const ARM_MASS = 1.2;
/** The thing leaves the hand faster than the camera sees the hand move (the wrist's flick at the end of the swing). */
const THROW_GAIN = 1.5;
/** How much the air holds each thing back (quadratic drag per m/s): its shape over its weight. */
export const AERO = { book: 0.25, scroll: 0.12, wool: 0.12, backpack: 0.05, shield: 0.04, pie: 0.03, bow: 0.025, bread: 0.02, wand: 0.02, cheese: 0.015, meat: 0.015, steak: 0.015, arrows: 0.01, coins: 0.008, apple: 0.008, logs: 0.006, hammer: 0.004 };

export class ItemSystem {
    constructor(game) {
        this.game = game;
        this.loose = new Map(); // uid -> {item, model, vel, spin, hover, until, noPick}
        this.held = { right: null, left: null }; // {item, model}
        this.worn = { backpack: null }; // {item, model}
        this._netT = 0;
        this._eatT = 0;
        this._wearT = 0;
        // when a held thing leaves the hand (HandRelease.js): only the outstretched hand opened, or a real throw
        this._drop = { right: new DropGate(), left: new DropGate() };
        this._thr = { right: new ThrowDetector(), left: new ThrowDetector() };
        this._arm = { right: {}, left: {} };
        this._giveT = 0;
        this.remoteHeld = new Map(); // playerId -> {right, left, backpack}: models on other players
    }

    get auth() { return this.game.authority; }

    // ----------------------------------------------------------- the world
    /** A thing appears lying / hovering (authority; the others are told). */
    spawnLoose(item, pos, { vel = null, hover = false, broadcast = true, quat = null, spin = null } = {}) {
        if (this.loose.has(item.uid)) return this.loose.get(item.uid);
        const model = makeItemModel(item);
        model.position.copy(pos);
        if (quat) model.quaternion.copy(quat); // (thrown: as it was in the hand)
        this.game.scene.add(model);
        const L = { item, model, vel: vel ? vel.clone() : new THREE.Vector3(), spin: new THREE.Vector3(), hover: hover ? pos.clone() : null, t: Math.random() * 6, noPick: performance.now() + (vel ? 700 : 0), rest: false };
        // spin: an angular velocity (world axis × rad/s) — a throw keeps the wrist's snap; a spill tumbles
        if (spin) L.spin.copy(spin);
        else if (vel) L.spin.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
        this.loose.set(item.uid, L);
        if (broadcast && this.game.sync) this.game.sync.itemNew?.(item, pos, vel, hover, quat, spin);
        return L;
    }

    removeLoose(uid) {
        const L = this.loose.get(uid);
        if (!L) return null;
        this.loose.delete(uid);
        this.game.scene.remove(L.model);
        disposeModel(L.model);
        return L.item;
    }

    /** A chest opens: its things float up above it. */
    lootChest(pos, rng = Math.random, house = null, kind = null) {
        const items = house ? rollHouseLoot(rng, house.rich) : kind === 'port' ? rollPortLoot(rng) : rollLoot(rng);
        items.forEach((it, i) => {
            const p = pos.clone().add(_v.set((i - (items.length - 1) / 2) * 0.8, 2.2, 0));
            if (it.kind === 'weapon') {
                const w = this.game.weapons.spawnHovering(it.type, p, it.uid);
                w.magic = !!it.magic; w.bonus = it.magic ? it.bonus : 0;
                w.applyMagicLook?.();
                if (this.game.sync) this.game.sync.weaponAppeared?.(w);
            } else this.spawnLoose(it, p, { hover: true });
        });
        return items;
    }

    // ------------------------------------------------------------ the hands
    /** A thing (from a slot / the ground / another player) into a hand. */
    takeIntoHand(item, side = 'right', { closed = false } = {}) {
        if (this.held[side]) return false;
        // (into an open hand — «Акцио», a slot: kept until the fingers have closed on it once)
        this._drop[side].reset(closed);
        this._thr[side].reset();
        if (!item.uid) item.uid = 'it' + Math.random().toString(36).slice(2, 10); // (old saves: a book had none)
        const model = makeItemModel(item);
        this.game.scene.add(model);
        this.held[side] = { item, model, since: performance.now() };
        if (this.game.sync) this.game.sync.itemHold?.(side, item);
        return true;
    }

    /** Out of a hand (into a slot, eaten, thrown…): returns the item. */
    releaseHand(side) {
        const h = this.held[side];
        if (!h) return null;
        this.held[side] = null;
        if (h.gripped) { const hand = this.game.character.getActiveHands?.()[side]; if (hand && hand.setGrip) hand.setGrip(null); }
        if (this.game.character.aim) this.game.character.aim[side] = null; // (spells follow the arm again)
        this.game.scene.remove(h.model);
        disposeModel(h.model);
        if (this.game.sync) this.game.sync.itemHold?.(side, null);
        return h.item;
    }

    /**
     * A thing goes over from one hand to the other without leaving the hands
     * (the book: the hand that held it lets go of its cover, the other still holds it).
     */
    moveHeld(from, to) {
        const h = this.held[from];
        if (!h || this.held[to]) return false;
        this.held[from] = null;
        if (h.gripped) { const hand = this.game.character.getActiveHands?.()[from]; if (hand && hand.setGrip) hand.setGrip(null); }
        h.gripped = false;
        h.thumb = undefined;
        h.q = null;
        h.since = performance.now();
        this.held[to] = h;
        if (this.game.sync) { this.game.sync.itemHold?.(from, null); this.game.sync.itemHold?.(to, h.item); }
        return true;
    }

    /**
     * A thing in the fist, like the sword: its handle lies across the palm in the
     * closed fingers (out past the thumb), and it turns with the wrist. The hand's
     * fingers close round it.
     */
    _gripHold(side, h, dt) {
        const g = this.game;
        const f = g.weapons.palmFrame(side, this._pf || (this._pf = {}));
        const spec = GRIPPED[h.item.kind];
        const s = h.thumb ?? (h.thumb = f.thumb); // (the side the thumb was on when taken)
        // the item's axis out of the thumb side; its "front" towards the knuckles
        const ax = _a.copy(f.X).multiplyScalar(s);
        let x, y, z;
        const pen = h.item.kind === 'wand' ? this._penGrip(side) : null;
        if (h.item.kind === 'wand') {
            // held like a pen: its back lies in the web between the thumb and the index finger,
            // its front is pinched by their tips — it points where the fingers point, and the
            // spells of this hand fly exactly along it, out of its tip
            const ch = g.character;
            y = pen ? _a.copy(pen.dir) : ch.getForearmDirection(side, _a).multiplyScalar(0.6).addScaledVector(f.Y, 0.4).normalize();
            // a real stick in the real hand (a pen, a brush): the wand goes the way it goes
            const real = this._stickDir(side, y);
            if (real) y.copy(real);
            const hand = ch.getActiveHands()[side];
            // (the fingers hold it as the stick lies: pointing … writing)
            if (hand) hand.stickTilt = real ? Math.atan2(-y.dot(f.Z), y.dot(f.Y)) : null;
            x = _b.copy(f.X).addScaledVector(y, -f.X.dot(y));
            if (x.lengthSq() < 1e-4) x.set(1, 0, 0);
            x.normalize();
            z = _c.crossVectors(x, y);
        } else if (spec.axis === 'book') {
            // the spine across the palm (like a handle), the book standing out of the palm
            y = ax; z = _c.copy(f.Z).negate(); x = _b.crossVectors(y, z);
        } else if (spec.axis === 'y') { y = ax; x = _b.copy(f.Y); z = _c.crossVectors(x, y); } // hammer, bow (limbs), shield (upright)
        else { x = ax; y = _b.copy(f.Y).negate(); z = _c.crossVectors(x, y); } // scroll: rolled along X
        if (spec.face === 'back') { z = _c.copy(f.Z); x = _b.crossVectors(y, z); } // shield: the face where the back of the hand looks
        _m4.makeBasis(x, y, z);
        _q.setFromRotationMatrix(_m4);
        // (exactly as the hand turns: the hand is already steadied — easing it again made the thing trail the hand)
        if (!h.q) h.q = _q.clone(); else h.q.copy(_q);
        h.model.quaternion.copy(h.q);
        if (h.item.kind === 'wand') {
            const a = g.character.aim[side] || (g.character.aim[side] = { dir: new THREE.Vector3(), at: 0 });
            a.dir.set(0, 1, 0).applyQuaternion(h.q).normalize();
            a.at = performance.now();
        }
        // the handle point in the fingers (a pen: in the web of the thumb)
        const sc = h.model.scale.x;
        h.model.position.copy(pen ? pen.web : f.G).sub(_d.set(0, spec.handle * sc, 0).applyQuaternion(h.q));
        if (spec.face === 'back') h.model.position.addScaledVector(f.Z, 0.25);
        if (!h.gripped) {
            h.gripped = true;
            const hand = g.character.getActiveHands()[side];
            if (hand && hand.setGrip) hand.setGrip(spec.curl ?? 0.62, spec.pose);
        }
    }

    /**
     * The real sticks seen in the real hands (RealStick.js): believed after a few camera
     * pictures, kept over a short miss. A hand holding one is a closed hand (the hero's
     * fingers hold, the thing does not drop) — ch.realStick.
     */
    _updateSticks() {
        const g = this.game, ch = g.character, pose = g.currentPose;
        const st = this._sticks || (this._sticks = { left: new StickTracker(), right: new StickTracker(), to: null });
        const fresh = g.poseSmoother?.to !== st.to;
        st.to = g.poseSmoother?.to;
        const now = performance.now();
        ch.realStick = ch.realStick || { left: null, right: null };
        // (the browser looks for one only round a hand holding a wand)
        if (g.poseService) g.poseService.wantSticks = { left: this.held.left?.item.kind === 'wand', right: this.held.right?.item.kind === 'wand' };
        for (const side of ['left', 'right']) {
            ch.realStick[side] = pose ? st[side].update(pose[side + 'HandStick'] || null, now, fresh) : null;
        }
    }

    /** The world direction of the real stick in this hand (or null); `finger`: the pen grip's direction (world). */
    _stickDir(side, finger) {
        const s = this.game.character.realStick?.[side];
        if (!s) return null;
        const body = this.game.character.group;
        const qb = body.getWorldQuaternion(this._qb || (this._qb = new THREE.Quaternion()));
        const fh = (this._fh || (this._fh = new THREE.Vector3())).copy(finger).applyQuaternion((this._qi || (this._qi = new THREE.Quaternion())).copy(qb).invert());
        return stickDirection(s, fh, this._sd || (this._sd = new THREE.Vector3())).applyQuaternion(qb);
    }

    /**
     * A pen grip from the hand as drawn: the web between the thumb and the index
     * finger (where a pen's back rests) and the pinch of their tips (where it is
     * held) — the wand goes from the one through the other. null: no fingers drawn.
     */
    _penGrip(side) {
        const hand = this.game.character.getActiveHands()[side];
        const fm = hand?.fingerMeshes;
        if (!fm?.thumb || !fm?.index || !hand.palm || !hand.gripOverride?.pose || !hand.group.visible) return null;
        const pg = this._pg || (this._pg = { web: new THREE.Vector3(), pinch: new THREE.Vector3(), dir: new THREE.Vector3(), a: new THREE.Vector3(), b: new THREE.Vector3() });
        hand.group.updateMatrixWorld(true);
        hand.palm.localToWorld(pg.web.fromArray(PEN_POINTS.web));
        if (hand.penIndexPoint) hand.penIndexPoint(pg.a); else fm.index[2].pivot.localToWorld(pg.a.fromArray(PEN_POINTS.index));
        fm.thumb[2].pivot.localToWorld(pg.b.fromArray(PEN_POINTS.thumb));
        pg.pinch.addVectors(pg.a, pg.b).multiplyScalar(0.5);
        pg.dir.subVectors(pg.pinch, pg.web);
        if (pg.dir.lengthSq() < 1e-4) return null;
        pg.dir.normalize();
        return pg;
    }

    /** Where a held bow / wand / hammer / shield points (world quaternion into `out`). */
    _aimQuat(side, kind, h, out) {
        const ch = this.game.character;
        const anchor = side === 'left' ? ch.leftArmAnchor : ch.rightArmAnchor;
        const shoulder = anchor.getWorldPosition(_a);
        const hand = ch.getGripObject(side).getWorldPosition(_b);
        const arm = _c.subVectors(hand, shoulder);
        if (arm.lengthSq() < 1e-4) arm.set(0, -1, 0);
        arm.normalize();
        const yaw = ch.group.rotation.y;
        _fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw));
        if (kind === 'bow') {
            // X: where the arrow flies (the arm; a hanging arm carries it pointing ahead);
            // when an arrow is drawn — from the drawing hand through the bow
            const x = h.aim ? _d.copy(h.aim) : _d.copy(arm).lerp(_fwd, Math.max(0, Math.min(1, (-arm.y - 0.25) / 0.45)));
            x.normalize();
            const y = _e.set(0, 1, 0).addScaledVector(x, -x.y);
            if (y.lengthSq() < 1e-3) y.copy(_fwd); else y.normalize();
            const z = _f.crossVectors(x, y);
            _m4.makeBasis(x, y, z);
            return out.setFromRotationMatrix(_m4);
        }
        if (kind === 'shield') {
            // the face looks ahead, a little to the shield arm's side, upright
            const sx = side === 'left' ? -1 : 1;
            const z = _d.copy(_fwd).addScaledVector(_e.set(-_fwd.z, 0, _fwd.x), sx * 0.25).normalize();
            const y = _e.set(0, 1, 0);
            const x = _f.crossVectors(y, z);
            _m4.makeBasis(x, y, z);
            return out.setFromRotationMatrix(_m4);
        }
        // wand / hammer: the tip along the arm and the pointing hand
        const dir = ch.getHandDirection(side, _d);
        const tip = _e.copy(arm).multiplyScalar(0.55).addScaledVector(dir, 0.45).normalize();
        return out.setFromUnitVectors(_UPY, tip);
    }

    heldOf(kind) {
        for (const side of ['right', 'left']) if (this.held[side]?.item.kind === kind) return { side, ...this.held[side] };
        return null;
    }

    /** The wand in a hand (if any). */
    get wand() {
        return this.heldOf('wand')?.item || null;
    }

    /**
     * The thing leaves the hand with velocity `vel` (world), turned as it was in the hand,
     * spinning with `spin` (the wrist's snap; none: it tumbles a little).
     */
    _throw(side, vel, { spin = null } = {}) {
        const h = this.held[side];
        if (!h) return;
        const item = h.item;
        const pos = h.model.position.clone();
        const quat = h.model.quaternion.clone();
        this.releaseHand(side);
        const v = vel.clone();
        const w = spin ? spin.clone() : null;
        if (this.auth) {
            const L = this.spawnLoose(item, pos, { vel: v, quat, spin: w });
            L.thrower = this.game.localId;
        } else this.game.sync?.itemThrow?.(item, pos, v, quat, w);
        this.game.hud.setVoice?.(`✋ ${ITEM_INFO[item.kind]?.name || 'Предмет'} ${v.length() > 3 ? 'брошен' : 'выпал из руки'}`, true);
    }

    /**
     * The velocity a thrown thing leaves the hand with. The hand's speed (against the body) at
     * the fastest moment of the swing; a heavy thing gets less of it (momentum: the arm and the
     * thing swing together); plus the body's own speed (a throw on the run goes further). The
     * direction: the camera can't see how far the arm goes forward, so it is where the thrower
     * looks (raised a little: one throws a bit above the eyes), turned towards the swing's own
     * sideways direction that the camera does see.
     */
    _throwVelocity(side, thr, out = new THREE.Vector3(), weight = null) {
        const ch = this.game.character;
        const m = weight ?? ITEM_INFO[this.held[side]?.item.kind]?.weight ?? 1;
        const look = _a.set(0, 0, -1).applyQuaternion(ch.getHeadQuaternion ? ch.getHeadQuaternion(_hq) : ch.group.quaternion);
        const flat = _b.set(look.x, 0, look.z);
        if (flat.lengthSq() < 1e-6) flat.set(-Math.sin(ch.group.rotation.y), 0, -Math.cos(ch.group.rotation.y));
        flat.normalize();
        const swing = _c.fromArray(thr.vRel).applyQuaternion(ch.group.quaternion).setY(0);
        if (swing.lengthSq() > 1e-6 && swing.dot(flat) > 0) flat.addScaledVector(swing.normalize(), 0.3).normalize();
        const pitch = Math.max(-0.6, Math.min(1.0, Math.asin(Math.max(-1, Math.min(1, look.y))) + 0.25));
        out.copy(flat).multiplyScalar(Math.cos(pitch)).setY(Math.sin(pitch));
        const body = _d.fromArray(thr.vWorld).sub(_e.fromArray(thr.vRel).applyQuaternion(ch.group.quaternion));
        return out.multiplyScalar(thr.speed * THROW_GAIN * Math.sqrt(ARM_MASS / (ARM_MASS + m))).add(body).clampLength(0, 22);
    }

    /** The other, empty hand closes on this thing (taking the bow / the book across): not a drop. */
    _otherHandTakes(side, h) {
        const ch = this.game.character, other = side === 'right' ? 'left' : 'right';
        if (this.held[other] || this.game.weapons?.hands[other]?.held) return false;
        return (ch.getGripCurl?.(other) ?? 0) > 0.6 && ch.getHandWorldPosition(other, _f).distanceTo(h.model.position) < 1.0;
    }

    // ------------------------------------------------------------- frame
    update(dt) {
        const g = this.game;
        const ch = g.character;
        // loose things: fall, bounce, settle; hovering ones bob
        for (const L of this.loose.values()) this._physics(L, dt);
        this._updateSticks();
        // held things follow the hand
        for (const side of ['right', 'left']) {
            const h = this.held[side];
            if (!h) continue;
            const grip = ch.getGripObject(side);
            grip.getWorldPosition(h.model.position);
            const kind = h.item.kind;
            if (GRIPPED[kind] && g.weapons?.palmFrame && !h.aim) {
                // held in the fist like the sword: the handle across the palm, turning with the wrist
                this._gripHold(side, h, dt);
            } else if (AIMED.has(kind)) {
                // a bow, a wand, a hammer, a shield: set by the arm (shoulder → hand,
                // steady) rather than by the shaky palm, and smoothed
                this._aimQuat(side, kind, h, _q);
                if (!h.q) h.q = _q.clone(); else h.q.slerp(_q, Math.min(1, dt * 16));
                h.model.quaternion.copy(h.q);
                if (kind === 'shield') h.model.position.addScaledVector(_fwd, 0.35);
            } else {
                grip.getWorldQuaternion(_q);
                h.model.quaternion.copy(_q);
            }
        }
        if (this.worn.backpack) this._placeBackpack(this.worn.backpack.model, ch);
        if (!g.currentPose || g.combat.dead) { this._netSend(dt); return; }
        const now = performance.now();
        // pick up: an empty hand touching a thing
        for (const side of ['right', 'left']) {
            if (this.held[side] || g.weapons.hands[side].held || g.books?.reading?.handBusy(side)) continue;
            const hand = ch.getHandWorldPosition(side, _v);
            for (const L of this.loose.values()) {
                if (now < L.noPick || L.asked) continue;
                if (L.model.position.distanceTo(hand) > PICK_RADIUS) continue;
                if (this.auth) this.pickUp(L.item.uid, g.localId, side);
                else { L.asked = true; g.sync?.itemTake?.(L.item.uid, side); setTimeout(() => { L.asked = false; }, 1500); }
                break;
            }
        }
        // letting go: only a real throw (wind-up, swing, the fingers open) or the outstretched hand opened
        // (timed by the game's clock: a stalled frame must not cut a swing in two)
        const gt = this._clock = (this._clock || 0) + dt * 1000;
        for (const side of ['right', 'left']) {
            const h = this.held[side];
            if (!h) continue;
            const kind = h.item.kind;
            // (never a bow with an arrow on the string, a book / scroll being read, or the other hand taking it)
            if ((kind === 'bow' && g.gear?.nock) || (kind === 'book' && g.books?.readingSide) || (kind === 'scroll' && g.scrolls?.readingSide) || this._otherHandTakes(side, h) || !ch.armState) {
                this._thr[side].reset(); this._drop[side].since = 0; continue;
            }
            const arm = ch.armState(side, this._arm[side]);
            const curl = ch.getGripCurl ? ch.getGripCurl(side) : 1, tracked = ch.isHandTracked ? ch.isHandTracked(side) : false;
            const thr = this._thr[side].update({ now: gt, hand: arm.hand, shoulder: arm.shoulder, vRel: arm.vRel, vWorld: arm.vWorld.toArray(), curl, tracked, behind: poseBehind(g.currentPose, side), weight: ITEM_INFO[kind]?.weight ?? 1 });
            if (thr) { this._throw(side, this._throwVelocity(side, thr, new THREE.Vector3()), { spin: ch.palmSpin?.[side] }); continue; }
            if (this._drop[side].update({ now: gt, curl, tracked, ...arm })) this._throw(side, _v.copy(ch.handVelocity[side]).clampLength(0, 2));
        }
        this._eat(dt, ch);
        this._wear(dt, ch);
        this._give(dt, ch);
        this._netSend(dt);
    }

    _physics(L, dt) {
        const m = L.model;
        L.t += dt;
        if (L.hover) {
            m.position.set(L.hover.x, L.hover.y + Math.sin(L.t * 2) * 0.12, L.hover.z);
            m.rotation.y += dt * 1.2;
            if (Math.random() < dt * 3) this.game.fx.spark(m.position, 0xffe9a8, 0.06, _v.set(0, 0.6, 0), 0.7);
            return;
        }
        if (L.rest || L.accio || L.lev) return; // («Акцио» / «Левиоса» carries it)
        if (L.remote) { m.position.lerp(L.remote, Math.min(1, dt * 8)); return; }
        L.vel.y -= 14 * dt;
        // the air: quadratic drag by shape and weight (a book flutters, a hammer flies on)
        L.vel.multiplyScalar(1 / (1 + (AERO[L.item.kind] ?? 0.02) * L.vel.length() * dt));
        // spinning: a real angular velocity about its axis (the wrist's snap), slowly dying
        const wv = L.spin.length();
        if (wv > 1e-3) { m.quaternion.premultiply(_q.setFromAxisAngle(_v.copy(L.spin).divideScalar(wv), wv * dt)); L.spin.multiplyScalar(Math.max(0, 1 - 0.2 * dt)); }
        // moving in small steps: a wall / a tree / a chest stops it (it bounces off), never goes through
        const col = this.game.collision;
        const steps = Math.max(1, Math.ceil(L.vel.length() * dt / 0.25)), hs = dt / steps;
        for (let s = 0; s < steps; s++) {
            _v.copy(m.position).addScaledVector(L.vel, hs);
            const gy = col.groundAt ? col.groundAt(_v.x, _v.z, _v.y + 0.5) : col.groundY(_v.x, _v.z);
            if (_v.y > gy + 0.15 && col.pointBlocked?.(_v.x, _v.y, _v.z)) {
                let hit = false;
                for (const ax of ['x', 'z', 'y']) {
                    _v2.copy(m.position); _v2[ax] += L.vel[ax] * hs;
                    if (col.pointBlocked(_v2.x, _v2.y, _v2.z)) { L.vel[ax] *= -0.3; hit = true; }
                }
                if (!hit) L.vel.multiplyScalar(-0.3);
                L.vel.multiplyScalar(0.7); L.spin.multiplyScalar(0.5);
                break;
            }
            m.position.copy(_v);
        }
        const ground = col.groundAt ? col.groundAt(m.position.x, m.position.z, m.position.y + 0.5) : col.groundY(m.position.x, m.position.z);
        if (m.position.y < ground + 0.12) {
            m.position.y = ground + 0.12;
            if (L.vel.y < -3) { L.vel.y *= -0.25; L.vel.x *= 0.5; L.vel.z *= 0.5; L.spin.multiplyScalar(0.4); }
            else {
                L.vel.set(0, 0, 0); L.spin.set(0, 0, 0); L.rest = true;
                // (lies down: a shield / a bow flat, a book on its side, the rest upright, keeping its turn about up)
                const yaw = new THREE.Euler().setFromQuaternion(m.quaternion, 'YXZ').y;
                m.rotation.set(L.item.kind === 'shield' || L.item.kind === 'bow' ? -Math.PI / 2 : 0, yaw, L.item.kind === 'book' ? Math.PI / 2 : 0, 'YXZ');
            }
        }
        if (L.thrower && this.auth && L.vel.lengthSq() > 36) this._thrownHit(L);
    }

    /**
     * (host) A fast thrown thing hits a creature (a zombie, an animal, a villager…) once: it hurts
     * by its energy (½·m·v²) and pushes the creature along its flight; the thing drops off it.
     */
    _thrownHit(L) {
        const g = this.game, p = L.model.position;
        const targets = [];
        for (const z of g.zombies || []) if (!z.isDead) targets.push(z);
        for (const an of g.animals?.targets?.() || []) targets.push(an);
        for (const z of targets) {
            const zp = z.group?.position;
            if (!zp) continue;
            const dy = p.y - zp.y;
            if (dy < -0.8 || dy > 2.6 || Math.hypot(p.x - zp.x, p.z - zp.z) > 0.9) continue;
            const m = ITEM_INFO[L.item.kind]?.weight ?? 1, v = L.vel.length();
            const dmg = Math.round(0.5 * m * v * v / 25);
            const dir = L.vel.clone().setY(0).normalize();
            if (dmg > 0) {
                if (g.animals?.targets?.().includes(z)) g.animals.hit?.(z, dmg, L.vel.clone(), L.thrower);
                else g.damageZombie?.(z, dmg, false, dir, L.thrower);
            }
            L.vel.multiplyScalar(-0.2); L.thrower = null; // (bounced off: one hit)
            return;
        }
    }

    /** (host) Somebody's hand reached a thing first. */
    pickUp(uid, toId, side) {
        const L = this.loose.get(uid);
        if (!L) return;
        const item = this.removeLoose(uid);
        if (this.game.sync) this.game.sync.itemGone?.(uid, toId, side);
        if (toId === this.game.localId) this._gotItem(item, side);
    }

    _gotItem(item, side) {
        // a bundle of logs goes back into the wood stack (Beds.js)
        if (this.game.beds?.gotItem(item)) return;
        // blocks (dropped at a body, Death.js) go back into the resource stacks
        if (item.kind === 'blocks') {
            const left = this.game.inventory.addResource(item.block, item.count || 0);
            this.game.hud.setVoice?.(`🧱 +${(item.count || 0) - left} блоков`, true);
            if (left > 0) { item.count = left; this._noRoom(item); }
            return;
        }
        // money goes into the purse (a slot, up to 500 coins)
        if (item.kind === 'coins') {
            const g = this.game;
            const n = item.count || 0;
            if (g.inventory.storeItem(item)) { g.hud.setVoice?.(`💰 +${n} монет (всего ${g.inventory.coins()})`, true); return; }
        }
        // a good from a market stall: the merchant names the price
        if (item.shop) this.game.castleLife?.talk?.tookGood(item);
        // arrows go straight into a bow's quiver (in a hand or in a slot), up to 25
        if (item.kind === 'arrows') {
            const g = this.game;
            const bow = this.heldOf('bow')?.item || g.inventory.slots.find((s) => s && s.kind === 'bow');
            if (bow && (bow.arrows || 0) < 25) {
                const n = Math.min(25 - (bow.arrows || 0), item.count || 1);
                bow.arrows = (bow.arrows || 0) + n;
                item.count -= n;
                g.inventory._render?.();
                g.hud.setVoice?.(`🏹 +${n} стрел (в колчане ${bow.arrows})`, true);
                if (item.count <= 0) return;
            }
        }
        // «Gather» (Death.js): straight into a slot, not into a hand
        if (side === 'slot') {
            if (!this.game.inventory.storeItem(item)) this._noRoom(item);
            return;
        }
        // (a bow stays in the hand that closed on it: the other hand takes it across by itself — Gear)
        if (!this.takeIntoHand(item, side, { closed: true }) && !this.takeIntoHand(item, side === 'right' ? 'left' : 'right')) {
            this.game.inventory.storeItem?.(item);
            return;
        }
        this.game.hud.setVoice?.(`✋ ${ITEM_INFO[item.kind]?.name || 'Предмет'} в руке${item.kind === 'wand' ? ' — скажите «Раскрой свои секреты»' : ''}`, true);
    }

    // --------------------------------------------------------- eat / wear
    /** No room in the slots: the thing falls at my feet again. */
    _noRoom(item) {
        const g = this.game;
        const p = g.character.group.position.clone().add(_v.set(0, 1, 0));
        if (this.auth || !g.sync) this.spawnLoose(item, p, { vel: _v2.set(0, 1, 0) });
        else g.sync.itemThrow?.(item, p, _v2.set(0, 1, 0));
        g.hud.toast?.('🎒 Все ячейки заняты');
    }

    _eat(dt, ch) {
        const g = this.game;
        let food = null;
        for (const side of ['right', 'left']) { const h = this.held[side]; if (h && (h.item.kind === 'apple' || h.item.kind === 'meat' || h.item.kind === 'steak' || ITEM_INFO[h.item.kind]?.heal)) food = { side, h }; }
        if (!food) { this._eatT = 0; return; }
        const mouth = ch.head.getWorldPosition(_v).add(_v2.set(0, -0.25, 0));
        // the food at the mouth: the model's hand there, or the camera sees the hand cover the mouth
        // (the arm's depth is the camera's guess: the picture is surer)
        const atMouth = food.h.model.position.distanceTo(mouth) < 0.75 || !!g.currentPose?.mouthHand?.[food.side];
        if (atMouth) this._eatT += dt; else this._eatT = 0;
        if (this._eatT < 0.6) return;
        this._eatT = 0;
        if (food.h.item.shop) { g.hud.setVoice?.('💰 Сначала заплатите торговцу (скажите «да»)', true); return; }
        const heal = { apple: 10, meat: 2, steak: 4 }[food.h.item.kind] ?? ITEM_INFO[food.h.item.kind]?.heal ?? 1;
        g.playerHP = Math.min(g.maxHP, g.playerHP + heal);
        g.hud.update(g.playerHP, g.maxHP, g.killCount, g.punchCount);
        g.hud.setVoice?.(`😋 +${heal} HP`, true);
        for (let i = 0; i < 10; i++) g.fx.spark(mouth, food.h.item.kind === 'apple' ? 0xffd700 : 0xd9534f, 0.07, _v2.set((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2), 0.5);
        food.h.item.count = (food.h.item.count || 1) - 1;
        if (food.h.item.count <= 0) this.releaseHand(food.side);
    }

    _wear(dt, ch) {
        const bp = this.heldOf('backpack');
        if (!bp) { this._wearT = 0; return; }
        ch.group.updateMatrixWorld(true);
        _inv.copy(ch.group.matrixWorld).invert();
        const l = ch.getHandWorldPosition('left', _v).applyMatrix4(_inv);
        const r = ch.getHandWorldPosition('right', _v2).applyMatrix4(_inv);
        // both hands behind the back (the body looks along −Z)
        if (l.z > 0.25 && r.z > 0.25) this._wearT += dt; else this._wearT = 0;
        if (this._wearT < 0.4) return;
        this._wearT = 0;
        const item = this.releaseHand(bp.side);
        this.wear(item);
    }

    wear(item) {
        const g = this.game;
        if (this.worn.backpack) { const old = this.worn.backpack; this.game.scene.remove(old.model); disposeModel(old.model); g.inventory.storeItem?.(old.item); }
        const model = makeItemModel(item);
        g.scene.add(model);
        this.worn.backpack = { item, model };
        g.inventory.setExtraSlots(item.slots || 3);
        g.hud.setVoice?.(`🎒 Рюкзак надет: +${item.slots} ячейки`, true);
        if (g.sync) g.sync.itemHold?.('back', item);
    }

    _placeBackpack(model, ch) {
        ch.torso.getWorldPosition(model.position);
        ch.group.getWorldQuaternion(model.quaternion);
        model.position.add(_v.set(0, 0.1, 0.62).applyQuaternion(model.quaternion));
    }

    /** Inferno (or fire) reached a scroll in my hand: it burns and its power is mine. */
    burnHeldScroll() {
        const s = this.heldOf('scroll');
        if (!s) return false;
        const item = this.releaseHand(s.side);
        this.applyScroll(item);
        return true;
    }

    applyScroll(item) {
        const g = this.game;
        g.bonus = g.bonus || { hp: 0, fatigue: 0 };
        if (item.stat === 'flight') {
            g.bonus.flight = true;
            g.hud.setVoice?.('📜🔥 Свиток полёта сгорел: теперь вы умеете летать! Поднимите обе руки и скажите «Флайн»', true);
            const c = g.character.group.position;
            for (let i = 0; i < 60; i++) {
                const a = (i / 60) * Math.PI * 6;
                g.fx.spark(_v.set(c.x + Math.cos(a) * 1.2, c.y - 1.5 + i * 0.07, c.z + Math.sin(a) * 1.2), 0x9fd8ff, 0.12, _v2.set(-Math.sin(a) * 2, 2.5, Math.cos(a) * 2), 1.2);
            }
            return;
        }
        if (item.stat === 'spell') {
            g.bonus.spells = { ...(g.bonus.spells || {}), [item.spell]: true };
            const ru = SPELL_RU[item.spell] || item.spell;
            g.hud.setVoice?.(`📜🔥 Свиток сгорел: теперь вы знаете заклинание «${ru}»!`, true);
            const c = g.character.group.position;
            const col = SCROLL_SPELL_COLOR[item.spell] || 0xffe9a8;
            for (let i = 0; i < 60; i++) {
                const a = (i / 60) * Math.PI * 6;
                g.fx.spark(_v.set(c.x + Math.cos(a) * 1.2, c.y - 1.5 + i * 0.07, c.z + Math.sin(a) * 1.2), col, 0.12, _v2.set(-Math.sin(a) * 2, 2.5, Math.cos(a) * 2), 1.2);
            }
            return;
        }
        if (item.stat === 'hp') {
            g.bonus.hp += item.amount;
            g.maxHP += item.amount;
            g.playerHP += item.amount;
            // (the free world counts its own health: the scroll heals there too)
            if (g.combat?.enabled) { g.combat.addMaxHp(item.amount); g.maxHP = g.combat.maxHp; g.playerHP = g.combat.hp; }
        } else {
            g.bonus.fatigue += item.amount;
            g.combat.addMaxFatigue?.(item.amount);
        }
        if (!g.combat?.enabled) g.hud.update(g.playerHP, g.maxHP, g.killCount, g.punchCount);
        g.hud.setVoice?.(item.stat === 'hp' ? `📜🔥 Свиток сгорел: здоровье +${item.amount} навсегда` : `📜🔥 Свиток сгорел: сила +${item.amount} навсегда`, true);
        // the magic of the scroll swirls around the hero
        const c = g.character.group.position;
        for (let i = 0; i < 60; i++) {
            const a = (i / 60) * Math.PI * 6;
            g.fx.spark(_v.set(c.x + Math.cos(a) * 1.2, c.y - 1.5 + i * 0.07, c.z + Math.sin(a) * 1.2), item.stat === 'hp' ? 0xff6b6b : 0x9fd8ff, 0.12, _v2.set(-Math.sin(a) * 2, 1.5, Math.cos(a) * 2), 1.2);
        }
    }

    // ------------------------------------------------------- hand to hand
    _give(dt, ch) {
        const g = this.game;
        if (!g.sync || !g.remotes.size) return;
        for (const side of ['right', 'left']) {
            const h = this.held[side];
            if (!h) continue;
            let near = null;
            for (const [id, r] of g.remotes) {
                if (r.dead) continue;
                for (const rs of ['right', 'left']) {
                    if (this.remoteHeld.get(id)?.[rs]) continue; // their hand is busy
                    const rh = r.character.getHandWorldPosition(rs, _v2);
                    if (rh.distanceTo(h.model.position) < 0.45) near = { id, rs };
                }
            }
            if (near) this._giveT += dt; else this._giveT = 0;
            if (this._giveT > 0.6 && near) {
                this._giveT = 0;
                const item = this.releaseHand(side);
                g.sync.itemGive?.(near.id, item, near.rs);
                g.hud.setVoice?.(`🤝 Передано: ${ITEM_INFO[item.kind]?.name || 'предмет'}`, true);
                return;
            }
        }
    }

    // ------------------------------------------------------------ network
    _netSend(dt) {
        if (!this.auth || !this.game.sync) return;
        this._netT -= dt;
        if (this._netT > 0) return;
        this._netT = 0.25;
        const moving = [];
        const r = (v) => Math.round(v * 100) / 100;
        for (const L of this.loose.values()) if (!L.hover && !L.sentRest) { moving.push([L.item.uid, r(L.model.position.x), r(L.model.position.y), r(L.model.position.z)]); if (L.rest) L.sentRest = true; }
        if (moving.length) this.game.sync.itemPositions?.(moving);
    }

    /** (guests) Positions of the host's lying things. */
    applyPositions(list) {
        for (const [uid, x, y, z] of list || []) {
            const L = this.loose.get(uid);
            if (!L) continue;
            L.remote = (L.remote || new THREE.Vector3()).set(x, y, z);
            L.rest = false;
        }
    }

    /** Somebody else's hands: show what they hold (and their backpack). */
    setRemoteHeld(id, side, item) {
        const g = this.game;
        const r = g.remotes.get(id);
        if (!r) return;
        const cur = this.remoteHeld.get(id) || {};
        if (cur[side]) { g.books?.reading?.releaseRemote(cur[side].model); g.scene.remove(cur[side].model); disposeModel(cur[side].model); cur[side] = null; }
        if (item) { const model = makeItemModel(item); g.scene.add(model); cur[side] = { item, model }; }
        this.remoteHeld.set(id, cur);
    }

    updateRemote() {
        for (const [id, cur] of this.remoteHeld) {
            const r = this.game.remotes.get(id);
            if (!r) { for (const k of Object.keys(cur)) if (cur[k]) { this.game.scene.remove(cur[k].model); disposeModel(cur[k].model); } this.remoteHeld.delete(id); continue; }
            const ch = r.character;
            for (const side of ['right', 'left']) {
                const h = cur[side];
                if (!h) continue;
                // a book open in their hands: as they hold it, at the page they read
                if (h.item.kind === 'book' && this.game.books?.reading?.placeRemote(ch, h.model, h.item, r.target?.bk || null)) continue;
                const grip = ch.getGripObject(side);
                grip.getWorldPosition(h.model.position);
                grip.getWorldQuaternion(h.model.quaternion);
                if (h.item.kind === 'wand' || h.item.kind === 'hammer') h.model.quaternion.multiply(_q.setFromAxisAngle(_v.set(1, 0, 0), Math.PI / 2));
            }
            if (cur.back) this._placeBackpack(cur.back.model, ch);
        }
    }

    /** One model of each kind, for compiling the shaders while loading. */
    sampleModels() {
        return [{ kind: 'wand', model: 4, color: 0x8844ff }, { kind: 'scroll' }, { kind: 'shield', type: 2, magic: true }, { kind: 'backpack', color: 0x7a4a24 }, { kind: 'bow', type: 0, magic: true }, { kind: 'hammer' }, { kind: 'apple' }, { kind: 'meat' }, { kind: 'coins' }, { kind: 'bread' }, { kind: 'cheese' }, { kind: 'pie' }].map((it) => makeItemModel(it));
    }

    /** Everything this player carries (for the save). */
    snapshot() {
        return {
            held: ['right', 'left'].map((s) => this.held[s]?.item || null),
            backpack: this.worn.backpack?.item || null,
        };
    }

    restore(s) {
        if (!s) return;
        if (s.backpack) this.wear(s.backpack);
        if (s.held) s.held.forEach((it, i) => { if (it) this.takeIntoHand(it, i ? 'left' : 'right'); });
    }

    dispose() {
        for (const uid of [...this.loose.keys()]) this.removeLoose(uid);
        for (const side of ['right', 'left']) this.releaseHand(side);
        if (this.worn.backpack) { this.game.scene.remove(this.worn.backpack.model); disposeModel(this.worn.backpack.model); }
        for (const cur of this.remoteHeld.values()) for (const k of Object.keys(cur)) if (cur[k]) { this.game.scene.remove(cur[k].model); disposeModel(cur[k].model); }
    }
}
