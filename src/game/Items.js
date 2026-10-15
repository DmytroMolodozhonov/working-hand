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
import { rollWizardHouseLoot } from './WizardShop.js';
import { ITEM_INFO, makeItemModel, disposeModel, rollKeyItem, rollDragonLoot, rollIceQueenLoot, rollLoot, rollHouseLoot, rollPortLoot, SPELL_RU, SCROLL_SPELL_COLOR, SPELL_RIBBON, newUid, foodHeal } from './ItemTypes.js';
import { recipeById } from './Potions.js';
import { shieldsNow, bounceOffShields } from './ShieldBounce.js';
import { PEN_POINTS, Steady, lengthProfile } from '../entities/SimplifiedHand.js';
import { DropGate, ThrowDetector, poseBehind, holdsFast } from './HandRelease.js';
import { makePurseModel } from './CoinBelt.js';
import { StickTracker, stickDirection } from '../input/RealStick.js';

/**
 * A thing just let go of (put on a counter, dropped) is not taken back by the same moment's
 * fingers: only by a new grip after the hand has moved this far off it (m), or after this long (ms).
 */
export const REGRAB = { AWAY: 0.3, MS: 2500 };
/** Is a thing just let go of free to be taken again? (`d` m from the nearest hand now; `entry` its record.) */
export function regrabFree(entry, d, now) {
    if (!entry) return true;
    if (d > REGRAB.AWAY) entry.away = true;
    return entry.away || now - entry.at > REGRAB.MS;
}
const SHOP_GRIP = 0.5; // fingers this closed (tracked curl) to take a good from a market counter
/** The fingers close on a thing this near (from the grip point in the fingers to its surface / handle). */
const PICK_REACH = 0.35;
/** Long things are taken by their handle (wand, hammer, bow): the rest by their body. */
const BY_HANDLE = new Set(['wand', 'hammer', 'bow', 'iceRod']);
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _inv = new THREE.Matrix4();

/** The rooms of a keep whose chest is the king's own (Castles.js ROOM_NAMES). */
const ROYAL_ROOMS = new Set(['king', 'treasury', 'throne', 'vault']);
const AIMED = new Set(['bow', 'wand', 'hammer', 'shield', 'iceRod']);
/** Held in the fist like the sword: handle (model y, before scaling) at the fingers, the axis across the palm. */
/**
 * pose: how the fingers lie round it (SimplifiedHand GRIP_POSES); at: [y, z] where its handle /
 * body is in the palm's frame (y towards the fingers, z the back of the hand; the palm's face at
 * z −0.07) — where that grip's fingers close (GRIP_SHAPES).
 *   axis 'body': the thing's own middle there, turned with the palm (turn: its long y across the palm);
 *   axis 'hang': hanging from the fist by its top (a pouch by its neck, a bag by its loop).
 */
const GRIPPED = {
    wand: { axis: 'y', handle: 0.12, curl: 0.38, pose: 'pen' }, // like a pen (V4 hands): see _penGrip
    hammer: { axis: 'y', handle: 0.12, pose: 'power', at: [0.13, -0.148] },
    iceRod: { axis: 'y', handle: 0.5, pose: 'power', at: [0.13, -0.148] }, // (a staff: the fist round its shaft a third of the way up, the crystal above)
    bow: { axis: 'y', handle: 0, pose: 'thick', at: [0.13, -0.155] },
    scroll: { axis: 'x', handle: 0, curl: 0.5, pose: 'roll', at: [0.15, -0.194] },
    shield: { axis: 'y', handle: 0, face: 'back', pose: 'thin', at: [0.13, -0.115] },
    apple: { axis: 'body', pose: 'ball', at: [0.2, -0.272], out: true }, // (cupped, its stem out of the hand)
    redApple: { axis: 'body', pose: 'ball', at: [0.2, -0.272], out: true },
    flask: { axis: 'body', pose: 'ball', at: [0.2, -0.272], out: true }, // (its belly in the cupped fingers, the neck up)
    potion: { axis: 'body', pose: 'ball', at: [0.2, -0.272], out: true },
    web: { axis: 'body', pose: 'ball', at: [0.2, -0.272] }, // (a skein in the cupped hand)
    glass: { axis: 'body', pose: 'block', at: [0.17, -0.214] },
    phoenixFeather: { axis: 'y', handle: 0.02, pose: 'thin', at: [0.13, -0.115] }, // (by its quill, the vane up out of the fist)
    wool: { axis: 'body', pose: 'wool', at: [0.22, -0.374] },
    dragonEgg: { axis: 'body', pose: 'wool', at: [0.22, -0.42] }, // (big: the fingers spread round it; the other hand may hold it too)
    bread: { axis: 'body', pose: 'block', at: [0.17, -0.214] },
    cheese: { axis: 'body', pose: 'block', at: [0.17, -0.214] },
    pie: { axis: 'body', pose: 'block', at: [0.17, -0.2] },
    meat: { axis: 'body', pose: 'block', at: [0.17, -0.23], turn: true },
    steak: { axis: 'body', pose: 'block', at: [0.17, -0.23], turn: true },
    bronzeHorn: { axis: 'body', pose: 'thick', at: [0.13, -0.155], turn: true },
    minotaurHorn: { axis: 'body', pose: 'ball', at: [0.2, -0.272] },
    arrows: { axis: 'body', pose: 'thin', at: [0.13, -0.115], turn: true },
    coins: { axis: 'hang', pose: 'neck', at: [0.13, -0.17], top: 0.086, off: 0.12 }, // (the fist round the neck, under the cord: PouchModel — the frill out above it)
    backpack: { axis: 'hang', pose: 'hook', at: [0.34, -0.145], top: 0.032 }, // (by its loop)
    armor: { axis: 'hang', pose: 'hook', at: [0.34, -0.145], top: 0.08 }, // (by the leather loop on its top: ArmorLook)
    robe: { axis: 'hang', pose: 'hook', at: [0.34, -0.145], top: 0.08 }, // (by its collar's loop)
    book: { axis: 'book', handle: 0, curl: 0.55 }, // by the spine: the covers between the thumb and the fingers
};
/** The wand with V3 hands (stable): in the fist, as it was before the pen grip. */
const WAND_V3 = { axis: 'y', handle: 0.1 };
/** V4 hands holding the wand like a pen (with a real stick seen by the camera): off — V3's wand is used. */
const PEN_WAND = false;
/** V5: how far the wand's own end is behind its point in the palm (SimplifiedHand WAND_LINE.at): its butt at the heel of the hand. */
const V5_WAND_BACK = 0.35;
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
export const AERO = { iceRod: 0.006, book: 0.25, scroll: 0.12, wool: 0.12, backpack: 0.05, shield: 0.04, pie: 0.03, bow: 0.025, bread: 0.02, wand: 0.02, cheese: 0.015, meat: 0.015, steak: 0.015, arrows: 0.01, coins: 0.008, apple: 0.008, redApple: 0.008, logs: 0.006, hammer: 0.004, flask: 0.012, potion: 0.01, web: 0.1, glass: 0.03, dragonEgg: 0.004, phoenixFeather: 0.6, armor: 0.003, robe: 0.08 }; // (a feather drifts down slowly)

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
        this.justLet = new Map(); // uid -> {at, away}: let go of by my hand a moment ago (REGRAB)
    }

    get auth() { return this.game.authority; }

    // ----------------------------------------------------------- the world
    /** A thing appears lying / hovering (authority; the others are told). */
    spawnLoose(item, pos, { vel = null, hover = false, broadcast = true, quat = null, spin = null, rise = false } = {}) {
        if (this.loose.has(item.uid)) return this.loose.get(item.uid);
        const model = makeItemModel(item);
        model.position.copy(pos);
        if (quat) model.quaternion.copy(quat); // (thrown: as it was in the hand)
        this.game.scene.add(model);
        const L = { item, model, vel: vel ? vel.clone() : new THREE.Vector3(), spin: new THREE.Vector3(), hover: hover ? pos.clone() : null, t: Math.random() * 6, noPick: performance.now() + (vel ? 700 : 0), rest: false };
        // spin: an angular velocity (world axis × rad/s) — a throw keeps the wrist's snap; a spill tumbles
        if (spin) L.spin.copy(spin);
        else if (vel) L.spin.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
        if (rise && hover) L.rise = 0; // (comes up out of a chest)
        L.shape = this._shapeOf(model);
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

    /**
     * A chest opens: its things rise out of it and float in a row along the chest, a little
     * towards its front, just under a standing hero's shoulder — where a hand reaches them.
     * extra: more things for the row (the coin pouch); key: the chance of its one precious thing.
     */
    lootChest(pos, rng = Math.random, house = null, kind = null, { chest = null, extra = [], key = undefined } = {}) {
        // (a wizards' house: scrolls, sometimes a spell book — src/game/WizardShop.js)
        // (the king's own chest in the keep — his chambers, the treasury: mostly the fine things — ArmorTypes / rollLoot)
        const royal = !!chest?.castle && ROYAL_ROOMS.has(chest.room);
        const boss = chest?.room;
        const bossItems = boss === 'dragon' ? rollDragonLoot(rng)
            : boss === 'iceQueen' ? rollIceQueenLoot(rng, String(chest.id).endsWith('0')) // (her own robe in the first chest)
            : boss === 'study' && chest.castle ? rollWizardHouseLoot(rng, true).concat(rollKeyItem(rng), rollKeyItem(rng)) : null; // (the Master's study: rare scrolls, a strong wand, a robe, potions)
        const items = (bossItems || (house ? (house.def?.kind === 'tower' ? rollWizardHouseLoot(rng, house.rich) : rollHouseLoot(rng, house.rich)) : kind === 'port' ? rollPortLoot(rng) : rollLoot(rng, { key: royal ? 1 : key, royal }))).concat(extra);
        const q = chest?.mesh ? chest.mesh.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
        const across = new THREE.Vector3(1, 0, 0).applyQuaternion(q).setY(0).normalize();
        const front = new THREE.Vector3(0, 0, 1).applyQuaternion(q).setY(0).normalize();
        const gap = Math.min(0.9, 3.2 / Math.max(1, items.length));
        items.forEach((it, i) => {
            const p = pos.clone().addScaledVector(across, (i - (items.length - 1) / 2) * gap).addScaledVector(front, 0.3);
            p.y += 1.1;
            if (it.kind === 'weapon') {
                const w = this.game.weapons.spawnHovering(it.type, p.clone().setY(p.y + 0.2), it.uid, { byHandle: true }); // (its handle at the hand)
                w.magic = !!it.magic; w.bonus = it.magic ? it.bonus : 0;
                w.applyMagicLook?.();
                if (this.game.sync) this.game.sync.weaponAppeared?.(w);
            } else {
                // (a house's things belong to the house: taking one while its people see it is a theft)
                if (house?.def?.id != null) it.home = { c: house.def.id, h: house.i };
                else if (chest?.castle?.id != null && chest.locked) it.home = { c: chest.castle.id, h: -1 }; // (a castle's chest, forced open)
                this.spawnLoose(it, p, { hover: true, rise: true });
            }
        });
        return items;
    }

    /** Where a thing is to be held (its model's own space): a handle segment, or a ball round its body. */
    _shapeOf(model) {
        const pos = model.position.clone(), quat = model.quaternion.clone();
        model.position.set(0, 0, 0); model.quaternion.identity();
        model.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(model);
        model.position.copy(pos); model.quaternion.copy(quat);
        model.updateMatrixWorld(true);
        if (box.isEmpty()) return { c: new THREE.Vector3(), r: 0.2, rh: 0.05, y0: 0, y1: 0 };
        // (c, y0, y1 in the model's own units — localToWorld scales them; r, rh in metres)
        const k = 1 / (model.scale.x || 1);
        const c = box.getCenter(new THREE.Vector3()), h = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
        return { c: c.multiplyScalar(k), r: Math.max(h.x, h.y, h.z) * 0.75, rh: Math.max(0.03, Math.min(h.x, h.z) * 0.6), y0: box.min.y * k, y1: box.max.y * k };
    }

    /** How far the grip point G (in the fingers) is from the thing: its handle for long things, else its body. */
    _reachTo(L, G) {
        const S = L.shape, m = L.model;
        if (!S) return m.position.distanceTo(G);
        if (BY_HANDLE.has(L.item.kind)) {
            const a = m.localToWorld(_a.set(S.c.x, S.y0, S.c.z)), b = m.localToWorld(_b.set(S.c.x, S.y1, S.c.z));
            const ab = _c.subVectors(b, a), t = Math.max(0, Math.min(1, _d.subVectors(G, a).dot(ab) / Math.max(1e-6, ab.lengthSq())));
            return Math.max(0, a.addScaledVector(ab, t).distanceTo(G) - S.rh);
        }
        return Math.max(0, m.localToWorld(_a.copy(S.c)).distanceTo(G) - S.r);
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
        this.held[side] = { item, model, since: performance.now(), shape: this._shapeOf(model) };
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
        if (this.game.character.aim) this.game.character.aim[from] = null; // (that hand has no wand now)
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
        // (the book: held by its edge, the fingers on its covers — BookReading)
        if (h.item.kind === 'book' && g.books?.reading?.holdClosed(side, h, dt)) return;
        // V5: the wand across the palm, the fingers closed round it from outside, the thumb along it
        if (h.item.kind === 'wand' && g.character.handVersion === 'v5' && this._v5Wand(side, h, dt)) return;
        const f = g.weapons.palmFrame(side, this._pf || (this._pf = {}));
        // The wand, V3 and V4 hands alike: in the fist, the arm's continuation (the author:
        // «V3's wand is very steady and good» — the pen grip of V4 was not; it is kept in
        // the code, off: PEN_WAND)
        const v4 = g.character.fullHand();
        const penWand = v4 && PEN_WAND;
        const spec = h.item.kind === 'wand' && !penWand ? WAND_V3 : GRIPPED[h.item.kind];
        const s = h.thumb ?? (h.thumb = f.thumb); // (the side the thumb was on when taken)
        // the item's axis out of the thumb side; its "front" towards the knuckles
        const ax = _a.copy(f.X).multiplyScalar(s);
        let x, y, z;
        const pen = h.item.kind === 'wand' && penWand ? this._penGrip(side) : null;
        if (spec.axis === 'body' || spec.axis === 'hang') { this._bodyHold(side, h, spec, f); return; }
        if (h.item.kind === 'wand') {
            // held like a pen: its back lies in the web between the thumb and the index finger,
            // its front is pinched by their tips — it points where the fingers point, and the
            // spells of this hand fly exactly along it, out of its tip
            const ch = g.character;
            // (the arm's continuation, bent by the wrist: V4's hand follows the real wrist in
            // every direction, so its turn leads the wand more — up, down, aside — V3: a little)
            const wrist = v4 ? 0.85 : 0.4; // (V4: the palm is steadied, so it can lead the wand almost alone)
            y = pen ? _a.copy(pen.dir) : ch.getForearmDirection(side, _a).multiplyScalar(1 - wrist).addScaledVector(f.Y, wrist).normalize();
            // a real stick in the real hand (a pen, a brush): the wand goes the way it goes
            const hand = ch.getActiveHands()[side];
            const real = penWand ? this._stickDir(side, y) : null;
            if (real) y.copy(real);
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
        // (exactly as the hand turns: the hand is already steadied — easing it again made the thing
        // trail the hand). A wand's tip is far from the hand and shows every tremble: it is
        // steadied by its own speed — a still wand stays still, a quick turn passes at once
        if (!h.q) h.q = _q.clone();
        else if (v4 && h.item.kind === 'wand') {
            // V4: steadied by its own speed (a still wand doesn't tremble, a turn passes at once)
            const st = (this._wandSteady || (this._wandSteady = {}))[side] || (this._wandSteady[side] = new Steady({ minCutoff: 1.2, beta: 5 }));
            h.q.slerp(_q, st.alpha(h.q.angleTo(_q) / Math.max(1e-3, dt), dt));
        } else if (!v4 || (h.item.kind === 'wand' && !penWand)) h.q.slerp(_q, Math.min(1, dt * 28)); // (V3, and the wand: as it was)
        else if (h.item.kind === 'wand') h.q.slerp(_q, Math.min(1, dt * 14 + h.q.angleTo(_q) * 4));
        else h.q.copy(_q);
        h.model.quaternion.copy(h.q);
        if (h.item.kind === 'wand') {
            const a = g.character.aim[side] || (g.character.aim[side] = { dir: new THREE.Vector3(), at: 0 });
            a.dir.set(0, 1, 0).applyQuaternion(h.q).normalize();
            a.at = performance.now();
            // (how the wand is bent against the forearm: kept while the fingers are not seen)
            (a.rel || (a.rel = new THREE.Quaternion())).setFromUnitVectors(g.character.getForearmDirection(side, _d), a.dir);
        }
        // the handle point in the fingers (a pen: in the web of the thumb)
        const sc = h.model.scale.x;
        const at = spec.at ? _e.copy(f.P).addScaledVector(f.Y, spec.at[0]).addScaledVector(f.Z, spec.at[1]) : f.G;
        h.model.position.copy(pen ? pen.web : at).sub(_d.set(0, spec.handle * sc, 0).applyQuaternion(h.q));
        if (spec.face === 'back') h.model.position.addScaledVector(f.Z, 0.25);
        if (!h.gripped) {
            h.gripped = true;
            const hand = g.character.getActiveHands()[side];
            if (hand && hand.setGrip) hand.setGrip(spec.curl ?? 0.62, spec.pose);
        }
    }

    /**
     * The V5 wand (the author's own grip): it lies across the palm aslant — its end at the heel on
     * the little finger's side, out between the thumb and the index finger (SimplifiedHand
     * WAND_LINE); the fingers close round it from outside and the thumb lies along it, each only
     * until it touches the wand as thick as it really is (gripWand) — never through it. Fixed in the
     * palm's own frame: it points where the hand points and is as steady as the palm. False: no hand
     * drawn (the old way then).
     */
    _v5Wand(side, h, dt) {
        const ch = this.game.character, hand = ch.getActiveHands()[side];
        if (!hand?.gripWand || !hand.group.visible) return false;
        if (!h.profile) h.profile = lengthProfile(h.model);
        if (!h.gripped || h.wandHand !== hand) {
            h.wandFit = hand.gripWand(h.profile, V5_WAND_BACK);
            h.wandHand = hand;
            h.gripped = true;
        }
        const a = hand.wandAxis(h.wandFit.r, _a, _b), d = _b;
        const x = _c.set(1, 0, 0).applyQuaternion(hand.palm.getWorldQuaternion(_hq));
        x.addScaledVector(d, -x.dot(d));
        if (x.lengthSq() < 1e-6) x.set(1, 0, 0);
        x.normalize();
        _m4.makeBasis(x, d, _e.crossVectors(x, d));
        _q.setFromRotationMatrix(_m4);
        // steadied by its own speed (a still wand doesn't tremble, a quick turn passes at once)
        if (!h.q) h.q = _q.clone();
        else {
            const st = (this._wandSteady || (this._wandSteady = {}))[side] || (this._wandSteady[side] = new Steady({ minCutoff: 1.2, beta: 5 }));
            h.q.slerp(_q, st.alpha(h.q.angleTo(_q) / Math.max(1e-3, dt), dt));
        }
        h.model.quaternion.copy(h.q);
        // its own end V5_WAND_BACK behind the point in the palm, along the (steadied) wand
        h.model.position.copy(a).sub(_d.set(0, V5_WAND_BACK, 0).applyQuaternion(h.q));
        const aim = ch.aim[side] || (ch.aim[side] = { dir: new THREE.Vector3(), at: 0 });
        aim.dir.set(0, 1, 0).applyQuaternion(h.q).normalize();
        aim.at = performance.now();
        (aim.rel || (aim.rel = new THREE.Quaternion())).setFromUnitVectors(ch.getForearmDirection(side, _d), aim.dir);
        if (hand) hand.stickTilt = null;
        return true;
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
        const v4 = ch.fullHand(); // (a real stick in the hand: V4 hands only)
        if (g.poseService) g.poseService.wantSticks = v4 ? { left: this.held.left?.item.kind === 'wand', right: this.held.right?.item.kind === 'wand' } : null;
        for (const side of ['left', 'right']) {
            ch.realStick[side] = pose && v4 ? st[side].update(pose[side + 'HandStick'] || null, now, fresh) : null;
            // (said once when it appears: the player knows the camera sees it)
            if (PEN_WAND && ch.realStick[side] && !st[side].told && this.held[side]?.item.kind === 'wand') { st[side].told = true; g.hud?.setVoice?.('🪄 Камера видит палочку в руке — волшебная палочка повторяет её', true); }
            if (!ch.realStick[side]) st[side].told = false;
        }
    }

    /** The world direction of the real stick in this hand (or null); `finger`: the pen grip's direction (world). */
    _stickDir(side, finger) {
        const s = this.game.character.realStick?.[side];
        if (!s) return null;
        const body = this.game.character.group;
        const qb = body.getWorldQuaternion(this._qb || (this._qb = new THREE.Quaternion()));
        const fh = (this._fh || (this._fh = new THREE.Vector3())).copy(finger).applyQuaternion((this._qi || (this._qi = new THREE.Quaternion())).copy(qb).invert());
        const d = stickDirection(s, fh, this._sd || (this._sd = new THREE.Vector3())).applyQuaternion(qb);
        // (a line the camera took for a stick but going off where the hand can't hold it: not it)
        return d.angleTo(finger) < 0.87 ? d : null;
    }

    /**
     * A thing held by its body (an apple cupped, bread in the fingers) or hanging from the fist
     * (a coin pouch by its neck, a bag by its loop): never floating, never inside the palm.
     */
    _bodyHold(side, h, spec, f) {
        const g = this.game, sc = h.model.scale.x, S = h.shape;
        const at = _e.copy(f.P).addScaledVector(f.Y, spec.at[0]).addScaledVector(f.Z, spec.at[1]);
        if (spec.axis === 'hang') {
            // it hangs: upright, turned with the body, its top in the fist
            g.character.group.getWorldQuaternion(_q);
            h.model.quaternion.copy(_q);
            h.model.position.copy(at).addScaledVector(_UPY, -((S?.y1 ?? 0.3) * sc - spec.top));
            // (the body hangs in front of the palm, not through it)
            const out = _b.copy(f.Z).negate().setY(0);
            const len = out.length();
            if (spec.off && len > 1e-2) h.model.position.addScaledVector(out.divideScalar(len), spec.off * Math.min(1, len * 4));
        } else {
            // turned with the palm (a long thing across it), its own middle where the fingers close
            if (spec.out) _m4.makeBasis(f.X, _a.copy(f.Z).negate(), f.Y); // (its top out of the palm)
            else _m4.makeBasis(spec.turn ? f.Y : f.X, spec.turn ? _a.copy(f.X).negate() : f.Y, f.Z);
            _q.setFromRotationMatrix(_m4);
            h.model.quaternion.copy(_q);
            // (a ball by its own centre — its stem doesn't count; the rest by the middle of its shape)
            h.model.position.copy(at);
            if (!spec.out && S) h.model.position.sub(_d.copy(S.c).multiplyScalar(sc).applyQuaternion(_q));
        }
        h.q = h.model.quaternion.clone();
        if (!h.gripped) {
            h.gripped = true;
            const hand = g.character.getActiveHands()[side];
            if (hand && hand.setGrip) hand.setGrip(spec.curl ?? 0.62, spec.pose);
        }
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
        this._outOfSolid(pos);
        this.justLet.set(item.uid, { at: performance.now(), away: false });
        const v = vel.clone();
        const w = spin ? spin.clone() : null;
        if (this.auth) {
            const L = this.spawnLoose(item, pos, { vel: v, quat, spin: w });
            L.thrower = this.game.localId;
        } else this.game.sync?.itemThrow?.(item, pos, v, quat, w);
        this.game.hud.setVoice?.(`✋ ${ITEM_INFO[item.kind]?.name || 'Предмет'} ${v.length() > 3 ? 'брошен' : 'выпал из руки'}`, true);
    }

    /**
     * A thing let go of inside a counter, a table, a step (the hand or a hanging pouch reached into
     * it): it comes out on top of it — it lies on the counter, never falls through it to the floor.
     */
    _outOfSolid(pos) {
        const col = this.game.collision, hb = this.game.handBlocks;
        if (!col) return pos;
        const inside = (y) => (hb ? hb.solid(pos.x, y, pos.z) : false) || (col.pointBlocked ? col.pointBlocked(pos.x, y, pos.z) : false);
        if (!inside(pos.y)) return pos;
        // the top of what it is in (up to a block above: a hand never puts a thing deeper)
        for (let up = 0.05; up <= 1.2; up += 0.05) {
            if (!inside(pos.y + up)) { pos.y += up + 0.12; return pos; }
        }
        return pos;
    }

    /** May my hands take this thing again (REGRAB)? Forgets it once they may. */
    _regrabOk(L, now) {
        const e = this.justLet.get(L.item.uid);
        if (!e) return true;
        let d = Infinity;
        for (const side of ['right', 'left']) {
            const G = this.game.weapons?.palmFrame?.(side, this._pfr || (this._pfr = {}))?.G;
            if (G) d = Math.min(d, this._reachTo(L, G));
        }
        if (!regrabFree(e, d, now)) return false;
        this.justLet.delete(L.item.uid);
        return true;
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
        // aboard a ship: the speed over her deck (she carries the thing in flight — Ships.attach)
        const sh = this.game.ships?.me?.ship;
        if (sh) { const pv = this.game.ships.pointVel(sh, ch.group.position.x, ch.group.position.z, _e); body.x -= pv.x; body.z -= pv.z; }
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
        const me = ch.group.position;
        for (const L of this.loose.values()) {
            // (far ones — a long game leaves many about the world — not drawn, and a still one not stepped:
            // a hovering one's bobbing and sparks are for the eyes only)
            const mp = L.model.position;
            const far = Math.abs(mp.x - me.x) + Math.abs(mp.z - me.z) > 140;
            L.model.visible = !far;
            if (far && (L.hover || L.rest)) continue;
            this._physics(L, dt);
        }
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
            // (its lowest point from the hand: HandBlocks keeps it out of a counter with the hand — a pouch
            // hanging from the fist lies on the counter, never goes into it)
            const S = h.shape;
            if (S && ch.getHandWorldPosition) {
                const low = GRIPPED[kind]?.axis === 'hang' ? h.model.localToWorld(_a.set(S.c.x, S.y0, S.c.z)) : h.model.localToWorld(_a.copy(S.c)).setY(_a.y - S.rh);
                (h.low || (h.low = new THREE.Vector3())).copy(low).sub(ch.getHandWorldPosition(side, _b));
            }
        }
        if (this.justLet.size) { const t = performance.now(); for (const [uid, e] of this.justLet) if (t - e.at > REGRAB.MS) this.justLet.delete(uid); }
        if (this.worn.backpack) this._placeBackpack(this.worn.backpack.model, ch);
        if (!g.currentPose || g.combat.dead) { this._netSend(dt); return; }
        const now = performance.now();
        // pick up: an empty hand at a thing whose fingers CLOSE on it (a fist bumping into it takes nothing)
        for (const side of ['right', 'left']) {
            if (this.held[side] || g.weapons.hands[side].held || g.books?.reading?.handBusy(side) || g.boards?.handBusy(side)) continue;
            const ws = g.weapons.hands[side], G = g.weapons.palmFrame(side, this._pfs || (this._pfs = {})).G;
            let best = null, bestD = 0.8;
            for (const L of this.loose.values()) {
                if (now < L.noPick || L.asked) continue;
                if (this.justLet.size && !this._regrabOk(L, now)) continue; // (just put down: not back into the same fingers)
                if (L.model.position.distanceToSquared(G) > 9) continue;
                // a good on a market counter: not before it is paid for (coins on the counter, its name said — CastleTalk);
                // then only taken by really closing the fingers on it (a brush of the hand takes nothing)
                if (L.item.shop && !L.item.shop.paid) { this._shopHint(L, G); continue; }
                if (L.item.shop && !((ch.isHandTracked ? ch.isHandTracked(side) : false) && (ch.getGripCurl ? ch.getGripCurl(side) : 0) > SHOP_GRIP)) continue;
                const d = this._reachTo(L, G);
                if (d < bestD) { bestD = d; best = L; }
            }
            if (!best) continue;
            best.offered = now; // (a floating thing holds still for the reaching hand)
            const closing = ch.getGripCurl(side) > 0.55 && (g.now() - ws.lastOpen < 900 || g.weapons.frame - ws.lastOpenFrame <= 12);
            if (bestD > PICK_REACH || !closing) continue;
            const L = best;
            if (this.auth) this.pickUp(L.item.uid, g.localId, side);
            else { L.asked = true; g.sync?.itemTake?.(L.item.uid, side); setTimeout(() => { L.asked = false; }, 1500); }
        }
        // letting go: only a real throw (wind-up, swing, the fingers open) or the outstretched hand opened
        // (timed by the game's clock: a stalled frame must not cut a swing in two)
        const gt = this._clock = (this._clock || 0) + dt * 1000;
        for (const side of ['right', 'left']) {
            const h = this.held[side];
            if (!h) continue;
            const kind = h.item.kind;
            // (never while swimming — the strokes are no throw; never a bow with an arrow on the string, a book / scroll being read, or the other hand taking it)
            // (nor a wand while a spell is going — swinging it to cast never throws it)
            if (holdsFast(ch) || (kind === 'wand' && g.spellBusy?.()) || (kind === 'bow' && g.gear?.nock) || (kind === 'book' && g.books?.readingSide) || (kind === 'scroll' && g.scrolls?.readingSide) || this._otherHandTakes(side, h) || !ch.armState) {
                this._thr[side].reset(); this._drop[side].since = 0; continue;
            }
            const arm = ch.armState(side, this._arm[side]);
            const curl = ch.getGripCurl ? ch.getGripCurl(side) : 1, tracked = ch.isHandTracked ? ch.isHandTracked(side) : false;
            const thr = this._thr[side].update({ now: gt, hand: arm.hand, shoulder: arm.shoulder, vRel: arm.vRel, vWorld: arm.vWorld.toArray(), curl, tracked, behind: poseBehind(g.currentPose, side), weight: ITEM_INFO[kind]?.weight ?? 1, blurOk: true, strict: kind === 'wand' });
            if (thr) { this._throw(side, this._throwVelocity(side, thr, new THREE.Vector3()), { spin: ch.palmSpin?.[side] }); continue; }
            // (a wand is held in a pinch like a pen: the camera often sees that hand half open — it falls
            // out only of an outstretched hand really opened wide, and kept open longer: DROP.WAND_*)
            if (this._drop[side].update({ now: gt, curl, tracked, ...arm, strict: kind === 'wand' })) this._throw(side, _v.copy(ch.handVelocity[side]).clampLength(0, 2));
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
            // a hand reaching for it: it holds still (no bobbing, no turning) to be taken
            const still = performance.now() - (L.offered || -1e9) < 300;
            if (still) L.t -= dt;
            // (out of a chest: it comes up out of it over a second)
            let sink = 0;
            if (L.rise != null && L.rise < 1) { L.rise = Math.min(1, L.rise + dt); sink = 1.2 * Math.pow(1 - L.rise, 3); }
            m.position.set(L.hover.x, L.hover.y + Math.sin(L.t * 2) * 0.12 - sink, L.hover.z);
            if (!still) m.rotation.y += dt * 1.2;
            if (Math.random() < dt * 3) this.game.fx.spark(m.position, 0xffe9a8, 0.06, _v.set(0, 0.6, 0), 0.7);
            return;
        }
        if (L.rest || L.accio || L.lev) return; // («Акцио» / «Левиоса» carries it)
        if (L.remote) { m.position.lerp(L.remote, Math.min(1, dt * 8)); return; }
        // (in space — above everything, Space.js: no weight, no air — it floats on as it was let go)
        const space = m.position.y > 30000;
        if (!space) {
            L.vel.y -= 14 * dt;
            // the air: quadratic drag by shape and weight (a book flutters, a hammer flies on)
            L.vel.multiplyScalar(1 / (1 + (AERO[L.item.kind] ?? 0.02) * L.vel.length() * dt));
        }
        // spinning: a real angular velocity about its axis (the wrist's snap), slowly dying
        const wv = L.spin.length();
        if (wv > 1e-3) { m.quaternion.premultiply(_q.setFromAxisAngle(_v.copy(L.spin).divideScalar(wv), wv * dt)); L.spin.multiplyScalar(Math.max(0, 1 - 0.2 * dt)); }
        // moving in small steps: a wall / a tree / a chest stops it (it bounces off), never goes through
        const col = this.game.collision;
        const cauls = this.game.cauldrons?.list.size ? this.game.cauldrons : null;
        const steps = Math.max(1, Math.ceil(L.vel.length() * dt / 0.25)), hs = dt / steps;
        // flying fast (thrown): a «Protection» / a dome in its way mirrors it (ShieldBounce.js)
        let shields = null;
        if (L.vel.lengthSq() > 16) {
            const now = performance.now();
            if (now - (this._shieldsAt || -1e9) > 15) { this._shields = shieldsNow(this.game); this._shieldsAt = now; }
            shields = this._shields.length ? this._shields : null;
        }
        for (let s = 0; s < steps; s++) {
            _v.copy(m.position).addScaledVector(L.vel, hs);
            if (shields && bounceOffShields(shields, m.position, _v, L.vel, L.thrower)) {
                for (let k = 0; k < 6; k++) this.game.fx.spark(_v, 0x9fd8ff, 0.09, _v2.set((Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4), 0.3);
                L.spin.multiplyScalar(0.6);
                m.position.copy(_v);
                break;
            }
            // into a cauldron's opening: it falls in (the iron walls round it are not in its way);
            // at the water it dissolves, or it lies on the bottom (Cauldrons.js)
            if (cauls) {
                const r = cauls.intoOpening(L, _v);
                if (r === 'stop') return;
                if (r === 'in') { m.position.copy(_v); continue; }
            }
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
        if (L.item.shop && !L.item.shop.paid && toId && toId[0] !== '#') return; // (a good not paid for stays on the counter)
        const item = this.removeLoose(uid);
        // (a thing of a house chest: taken by this player — the theft is theirs, if anybody of the house sees it)
        if (item.home) { const home = item.home; delete item.home; if (toId && toId[0] !== '#') this.game.castleLife?.tookFromHome?.(home, toId); }
        if (this.game.sync) this.game.sync.itemGone?.(uid, toId, side);
        if (toId === this.game.localId) this._gotItem(item, side);
    }

    /** The hand at an unpaid good: how to buy it (now and then). */
    _shopHint(L, G) {
        const now = performance.now();
        if (now - (this._shopHintT || -1e9) < 6000 || L.model.position.distanceToSquared(G) > 0.5) return;
        this._shopHintT = now;
        this.game.hud.setVoice?.(`💰 ${L.item.shop.price} монет. Сначала заплатите: положите мешочек с монетами на прилавок и назовите товар`, true);
    }

    _gotItem(item, side) {
        delete item.home; // (it is mine now)
        // a bundle of logs goes back into the wood stack (Beds.js)
        if (this.game.beds?.gotItem(item)) return;
        // blocks (dropped at a body, Death.js) go back into the resource stacks
        if (item.kind === 'blocks') {
            const left = this.game.inventory.addResource(item.block, item.count || 0);
            this.game.hud.setVoice?.(`🧱 +${(item.count || 0) - left} блоков`, true);
            if (left > 0) { item.count = left; this._noRoom(item); }
            return;
        }
        // a pouch of money: into the hand (to be tied on the belt's right side: CoinBelt); «Gather»
        // or both hands busy — straight onto the belt (what does not fit — into a slot)
        if (item.kind === 'coins' && !item.shop) { // (a magic pouch for sale on a counter: a good, not money)
            const g = this.game, purse = g.inventory.purse;
            const n = item.count || 0;
            const busy = (s) => !!(this.held[s] || g.weapons?.hands?.[s]?.held);
            if (purse && (side === 'slot' || (busy('right') && busy('left')))) {
                if (item.magic && purse.tieMagic(item)) { g.hud.setVoice?.(`✨ Магический мешочек на поясе (всего ${g.inventory.coins()} монет)`, true); return; }
                item.count = purse.add(n);
                if ((item.count <= 0 && !item.magic) || g.inventory.storeItem(item)) { g.hud.setVoice?.(`💰 +${n} монет (всего ${g.inventory.coins()})`, true); return; } // (a second magic pouch, emptied: into a slot)
            } else if (this.takeIntoHand(item, side) || this.takeIntoHand(item, side === 'right' ? 'left' : 'right')) {
                g.hud.setVoice?.(`💰 Мешочек: ${n} монет — приложите руку с ним к поясу справа, чтобы привязать`, true);
                return;
            }
        }
        // a good from a market stall: the merchant names the price
        if (item.shop) this.game.castleLife?.talk?.tookGood(item);
        // arrows go straight into a bow's quiver (in a hand or in a slot), up to 25
        if (item.kind === 'arrows' && !item.shop) { // (unpaid arrows stay in the hand until paid)
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
        // («Акцио» brings it into an open hand: kept until the fingers close on it; a hand that closed on it re-arms at once)
        if (!this.takeIntoHand(item, side) && !this.takeIntoHand(item, side === 'right' ? 'left' : 'right')) {
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
        for (const side of ['right', 'left']) { const h = this.held[side]; if (h && (h.item.kind === 'apple' || h.item.kind === 'meat' || h.item.kind === 'steak' || h.item.kind === 'potion' || ITEM_INFO[h.item.kind]?.heal)) food = { side, h }; }
        if (!food) { this._eatT = 0; return; }
        const mouth = ch.head.getWorldPosition(_v).add(_v2.set(0, -0.25, 0));
        // the food at the mouth: the model's hand there, or the camera sees the hand cover the mouth
        // (the arm's depth is the camera's guess: the picture is surer)
        const atMouth = food.h.model.position.distanceTo(mouth) < 0.75 || !!g.currentPose?.mouthHand?.[food.side];
        if (atMouth) this._eatT += dt; else this._eatT = 0;
        if (this._eatT < 0.6) return;
        this._eatT = 0;
        if (food.h.item.shop) { g.hud.setVoice?.('💰 Сначала заплатите торговцу (скажите «да»)', true); return; }
        if (food.h.item.kind === 'potion') { this._drink(food.side, food.h, mouth); return; }
        const heal = foodHeal(food.h.item);
        // (Survival: the real health is the combat bar; elsewhere the old counter) — never above the maximum
        const pvp = g.combat?.enabled && !g.combat.dead;
        const full = pvp ? g.combat.hp >= (g.combat.maxHp || 20) : g.playerHP >= g.maxHP;
        if (full) { g.hud.setVoice?.('😌 Вы сыты — здоровье и так полное', true); return; }
        let got;
        if (pvp) { got = g.combat.heal(heal); g.hud.update(g.combat.hp, g.combat.maxHp || 20, g.killCount, g.punchCount); }
        else { const was = g.playerHP; g.playerHP = Math.min(g.maxHP, g.playerHP + heal); got = g.playerHP - was; g.hud.update(g.playerHP, g.maxHP, g.killCount, g.punchCount); }
        g.hud.setVoice?.(`😋 +${Math.round(got)} HP`, true);
        for (let i = 0; i < 10; i++) g.fx.spark(mouth, food.h.item.kind === 'apple' ? 0xffd700 : 0xd9534f, 0.07, _v2.set((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2), 0.5);
        food.h.item.count = (food.h.item.count || 1) - 1;
        if (food.h.item.count <= 0) this.releaseHand(food.side);
    }

    /** A potion at the mouth: drunk — its recipe's effect; the empty flask stays in the hand. */
    _drink(side, h, mouth) {
        const g = this.game;
        const r = recipeById(h.item.rec);
        if (r && !r.effect) { g.hud.setVoice?.(`🧪 ${r.name}: что оно делает, автор скоро расскажет — пока его не выпить`, true); return; }
        const fx = r?.effect || {};
        const said = [];
        if (fx.hp) {
            g.playerHP = Math.min(g.maxHP, g.playerHP + fx.hp);
            if (g.combat?.enabled && !g.combat.dead) {
                const max = g.combat.maxHp || 20;
                g.combat.hp = Math.min(max, (g.combat.hp ?? 0) + fx.hp);
                g.hud.update(g.combat.hp, max, g.killCount, g.punchCount);
            } else g.hud.update(g.playerHP, g.maxHP, g.killCount, g.punchCount);
            said.push(`+${fx.hp} HP`);
        }
        if (fx.mana && g.combat) { g.combat.fatigue = Math.min(g.combat.maxFatigue ?? 100, (g.combat.fatigue ?? 0) + fx.mana); said.push(`+${fx.mana} маны`); }
        g.hud.setVoice?.(`🧪 ${r ? r.name : 'Зелье'} выпито${said.length ? ': ' + said.join(', ') : ''}`, true);
        const col = h.item.color ?? 0x9fd8ff;
        for (let i = 0; i < 14; i++) g.fx?.spark(mouth, col, 0.07, _v2.set((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2), 0.6);
        g.sound?.playSplash?.();
        // (the flask is empty again, still in the same hand)
        this.releaseHand(side);
        this.takeIntoHand({ kind: 'flask', uid: newUid(), count: 1 }, side, { closed: true });
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
            const col = SPELL_RIBBON[item.spell] || 0xffe9a8;
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
        g.hud.setVoice?.(item.stat === 'hp' ? `📜🔥 Свиток сгорел: здоровье +${item.amount}` : `📜🔥 Свиток сгорел: сила +${item.amount}`, true);
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
            L.hover = null; // (the host moves it: it no longer floats — e.g. its chest burnt down)
        }
    }

    /** Somebody else's hands: show what they hold (and their backpack, the coin pouches on their belt). */
    setRemoteHeld(id, side, item) {
        const g = this.game;
        const r = g.remotes.get(id);
        if (!r) return;
        const cur = this.remoteHeld.get(id) || {};
        if (cur[side]) { g.books?.reading?.releaseRemote(cur[side].model); cur[side].model.parent?.remove(cur[side].model); disposeModel(cur[side].model); cur[side] = null; }
        if (item && side === 'purse') { const model = makePurseModel(item.count || 0, !!item.left, !!item.magic); r.character.group.add(model); cur[side] = { item, model }; } // (hangs on their body; the magic pouch — one)
        else if (item) { const model = makeItemModel(item); g.scene.add(model); cur[side] = { item, model }; }
        this.remoteHeld.set(id, cur);
    }

    updateRemote() {
        for (const [id, cur] of this.remoteHeld) {
            const r = this.game.remotes.get(id);
            if (!r) { for (const k of Object.keys(cur)) if (cur[k]) { cur[k].model.parent?.remove(cur[k].model); disposeModel(cur[k].model); } this.remoteHeld.delete(id); continue; }
            const ch = r.character;
            for (const side of ['right', 'left']) {
                const h = cur[side];
                if (!h) continue;
                // a book open in their hands: as they hold it, at the page they read
                if (h.item.kind === 'book' && this.game.books?.reading?.placeRemote(ch, h.model, h.item, r.target?.bk || null)) continue;
                if (h.item.kind === 'wand' || h.item.kind === 'hammer' || h.item.kind === 'iceRod') { this._remoteGrip(ch, side, h); continue; }
                const grip = ch.getGripObject(side);
                grip.getWorldPosition(h.model.position);
                grip.getWorldQuaternion(h.model.quaternion);
            }
            if (cur.back) this._placeBackpack(cur.back.model, ch);
        }
    }

    /**
     * A wand / a hammer in another player's hand, set exactly as their own computer sets it
     * (_gripHold): the wand the arm's continuation bent by the wrist, the hammer's handle across
     * the closed fingers — not the palm's turn plus a fixed quarter turn (that pointed the wand
     * out of the back of the hand: sideways on everybody else's screen).
     */
    _remoteGrip(ch, side, h) {
        const f = this.game.weapons.palmFrame(side, this._rpf || (this._rpf = {}), ch);
        const wand = h.item.kind === 'wand';
        const spec = wand ? WAND_V3 : GRIPPED[h.item.kind];
        let x, y, z;
        if (wand) {
            const wrist = ch.fullHand() ? 0.7 : 0.4;
            y = ch.getForearmDirection(side, _a).multiplyScalar(1 - wrist).addScaledVector(f.Y, wrist).normalize();
            x = _b.copy(f.X).addScaledVector(y, -f.X.dot(y));
            if (x.lengthSq() < 1e-4) x.set(1, 0, 0);
            x.normalize();
            z = _c.crossVectors(x, y);
        } else { y = _a.copy(f.X).multiplyScalar(h.thumb ?? (h.thumb = f.thumb)); x = _b.copy(f.Y); z = _c.crossVectors(x, y); }
        _m4.makeBasis(x, y, z);
        h.model.quaternion.setFromRotationMatrix(_m4);
        const at = spec.at ? _e.copy(f.P).addScaledVector(f.Y, spec.at[0]).addScaledVector(f.Z, spec.at[1]) : f.G;
        h.model.position.copy(at).sub(_d.set(0, spec.handle * h.model.scale.x, 0).applyQuaternion(h.model.quaternion));
    }

    /** One model of each kind, for compiling the shaders while loading. */
    sampleModels() {
        return [{ kind: 'armor', piece: 'helmet', magic: true }, { kind: 'armor', piece: 'chest' }, { kind: 'robe', magic: true }, { kind: 'wand', model: 4, color: 0x8844ff }, { kind: 'scroll' }, { kind: 'shield', type: 2, magic: true }, { kind: 'backpack', color: 0x7a4a24 }, { kind: 'bow', type: 0, magic: true }, { kind: 'hammer' }, { kind: 'iceRod' }, { kind: 'apple' }, { kind: 'meat' }, { kind: 'coins' }, { kind: 'coins', magic: true }, { kind: 'bread' }, { kind: 'cheese' }, { kind: 'pie' }].map((it) => makeItemModel(it));
    }

    /** Everything this player carries (for the save). */
    snapshot() {
        return {
            held: ['right', 'left'].map((s) => this.held[s]?.item || null),
            backpack: this.worn.backpack?.item || null,
            armor: this.game.armor?.snapshot() || null, // (the armour and the robe worn: Armor.js)
        };
    }

    restore(s) {
        if (!s) return;
        if (s.backpack) this.wear(s.backpack);
        if (s.armor) this.game.armor?.restore(s.armor);
        if (s.held) s.held.forEach((it, i) => { if (it) this.takeIntoHand(it, i ? 'left' : 'right'); });
    }

    dispose() {
        for (const uid of [...this.loose.keys()]) this.removeLoose(uid);
        for (const side of ['right', 'left']) this.releaseHand(side);
        if (this.worn.backpack) { this.game.scene.remove(this.worn.backpack.model); disposeModel(this.worn.backpack.model); }
        for (const cur of this.remoteHeld.values()) for (const k of Object.keys(cur)) if (cur[k]) { this.game.scene.remove(cur[k].model); disposeModel(cur[k].model); }
    }
}
