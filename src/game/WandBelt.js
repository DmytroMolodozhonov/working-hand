/**
 * WandBelt.js — the wand's own place on the body: tucked into the waistband in front,
 * a little to the left (its handle up, for the right hand to take across), seen on the
 * hero (look down and it is there).
 *
 *   - Put it away: the hand holding the wand brings it to the waistband in front, its
 *     tip down (tucking it in), and keeps it there a moment. Lowering the arm, a hand
 *     hanging at the side, a hand on the hip never do it (the hand must be IN FRONT of
 *     the body, at the waist, the wand pointing down).
 *   - Take it: look down at it, bring the empty right hand to its handle and close the
 *     fingers on it (the left hand when the right is busy).
 *
 * The wand (as data) stays in its inventory slot, so saving, dying and the slots work
 * as before; on the body it is the first wand of the slots.
 */

import * as THREE from 'three';
import { makeItemModel, disposeModel } from './ItemTypes.js';

/** The wand's handle on the hero (its own space: +X its right, −Z ahead; the waist at y≈0). */
export const BELT_TOP = new THREE.Vector3(-0.2, 0.42, -0.5);
/** Where its tip goes (into the trousers, against the left thigh). */
export const BELT_TIP = new THREE.Vector3(-0.36, -0.75, -0.22);
const TUCK_S = 0.35; // s the wand is held tucked in
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion();
const _inv = new THREE.Matrix4();

/**
 * Is the hand (hero's space) at the waistband in front? In front of the belly, near the
 * middle (the camera's guess of depth is poor, so across the body is what tells: an arm
 * hanging at the side is ~0.95 out, a hand on the hip / in a trouser pocket ~0.65 out,
 * a hand at the belt in front ~0.2–0.45). Returns how far from the wand's place, or Infinity.
 */
export function atBelt(local) {
    if (local.z > -0.3) return Infinity; // (beside or behind the body)
    if (local.x < -0.55 || local.x > 0.4) return Infinity; // (at the side: a hanging arm, a hip)
    if (local.y > 0.55 || local.y < -0.65) return Infinity; // (the waist, not the chest or the knees)
    return Math.hypot(local.x - BELT_TOP.x, local.y - 0.1);
}

export class WandBelt {
    constructor(game) {
        this.game = game;
        this.model = null;
        this.item = null;
        this._tuck = { left: 0, right: 0 };
        this._open = { left: 1, right: 1 }; // (the fingers opened near the handle before closing on it)
        this._at = 0;
    }

    /** The wand on the belt (the first wand of the slots), or null. */
    beltWand() {
        const inv = this.game.inventory;
        return inv?.slots.find((s) => s && s.kind === 'wand') || null;
    }

    update(dt) {
        const g = this.game, ch = g.character, items = g.items, inv = g.inventory;
        if (!ch || !items || !inv) return;
        this._show();
        if (!g.currentPose || g.combat?.immobile || g.combat?.dead || ch.flying) return;
        const now = performance.now();
        if (now - this._at < 900) return; // (just done: not at once back)
        ch.group.updateMatrixWorld(true);
        _inv.copy(ch.group.matrixWorld).invert();
        for (const side of ['right', 'left']) {
            const local = ch.getHandWorldPosition(side, _v).applyMatrix4(_inv);
            const near = atBelt(local) < Infinity;
            const h = items.held[side];
            if (h && h.item.kind === 'wand') {
                // tucking it in: at the waistband, the tip down
                const down = h.model ? _d.set(0, 1, 0).applyQuaternion(h.model.getWorldQuaternion(_q)).y < -0.55 : false;
                this._tuck[side] = near && down ? this._tuck[side] + dt : 0;
                if (this._tuck[side] > TUCK_S) { this._tuck[side] = 0; this._putAway(side); return; }
                continue;
            }
            this._tuck[side] = 0;
            // taking it: looking down at it, the empty hand at the handle, the fingers closing on it
            const curl = ch.getGripCurl ? ch.getGripCurl(side) : 0;
            if (!near) { this._open[side] = 0; continue; }
            if (curl < 0.4) this._open[side] = now;
            const free = !h && !g.weapons?.hands?.[side]?.held;
            const rightFirst = side === 'left' && !items.held.right && !g.weapons?.hands?.right?.held; // (the right hand takes it when it can)
            if (free && !rightFirst && this.beltWand() && this.lookingDown() && curl > 0.55 && now - this._open[side] < 1500) {
                this._take(side);
                return;
            }
        }
    }

    /** The head turned down towards the belt. */
    lookingDown() {
        const ch = this.game.character;
        if (!ch.getHeadQuaternion) return false;
        const f = _w.set(0, 0, -1).applyQuaternion(ch.getHeadQuaternion(_q));
        return f.y < -0.3;
    }

    _putAway(side) {
        const g = this.game, inv = g.inventory;
        const it = g.items.releaseHand(side);
        if (!it) return;
        if (inv.inHand?.item === it) inv.inHand = null;
        const free = inv.slots.findIndex((x) => !x);
        // the belt wand first in the slots (the one on the body)
        if (free >= 0) {
            inv.slots[free] = it;
            const first = inv.slots.findIndex((s) => s && s.kind === 'wand');
            if (first !== free) [inv.slots[first], inv.slots[free]] = [inv.slots[free], inv.slots[first]];
            inv._render?.();
        } else if (!inv.storeItem(it)) { g.items.takeIntoHand(it, side); return; }
        this._at = performance.now();
        inv._fx?.('🪄 Палочка за поясом', side);
    }

    _take(side) {
        const g = this.game, inv = g.inventory;
        const i = inv.slots.findIndex((s) => s && s.kind === 'wand');
        if (i < 0 || !inv._fromSlot(i, side)) return;
        this._at = performance.now();
        inv._render?.();
        inv._fx?.('🪄 Палочка в руке', side);
    }

    /** The belt wand seen on the hero. */
    _show() {
        const ch = this.game.character;
        const it = this.beltWand();
        if (it !== this.item) {
            if (this.model) { this.model.parent?.remove(this.model); disposeModel(this.model); this.model = null; }
            this.item = it;
            if (it) {
                const m = makeItemModel(it);
                // its back (the handle) up at the waistband, the tip down into the trousers
                const box = new THREE.Box3().setFromObject(m);
                const along = _d.subVectors(BELT_TIP, BELT_TOP);
                m.quaternion.setFromUnitVectors(_w.set(0, 1, 0), along.normalize());
                m.position.copy(BELT_TOP).addScaledVector(along, -box.min.y);
                m.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
                m.name = 'wand-belt';
                ch.group.add(m);
                this.model = m;
            }
        }
        if (this.model) this.model.visible = !!ch.group.visible;
    }
}
