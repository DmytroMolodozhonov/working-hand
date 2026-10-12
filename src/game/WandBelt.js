/**
 * WandBelt.js — the wand's own place on the body: tucked into the waistband in front,
 * a little to the left (its handle up, for the right hand to take across), seen on the
 * hero (look down and it is there).
 *
 *   - Put it away: the hand holding the wand is brought to the waistband in front, its
 *     tip down (tucking it in), and keeps it there a moment. Judged from the camera's
 *     real skeleton (the real wrist at the real waist, the elbow bent): lowering the arm,
 *     a hand hanging or resting a little to the left, a hand on the hip never do it.
 *   - Take it: look down at it, bring the empty right hand to its handle and close the
 *     fingers on it (the left hand when the right is busy).
 *
 * The wand (as data) stays in its inventory slot, so saving, dying and the slots work
 * as before; on the body it is the first wand of the slots.
 */

import * as THREE from 'three';
import { makeItemModel, disposeModel } from './ItemTypes.js';

/** The wand's handle on the hero (its own space: +X its right, −Z ahead; the waist at y≈0). */
export const BELT_TOP = new THREE.Vector3(-0.12, 0.22, -0.52);
/** Where its tip goes (into the trousers, against the left thigh). */
export const BELT_TIP = new THREE.Vector3(-0.3, -0.85, -0.24);
const TUCK_S = 0.2; // s the wand is held tucked in (the author: it should be simple)
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion();
const _inv = new THREE.Matrix4();

/** Just in front of the belly (the body's front is at z −0.4; a hand ~0.15 thick). */
export const BELLY_Z = -0.58;

/**
 * How much a hand (hero's space) is low in front of the belly: 1 well inside, fading to 0
 * at the edges (no jump as it comes or goes). Out at the sides (a hanging arm, a hip) 0.
 */
export function bellyWeight(local) {
    if (local.z > -0.3) return 0;
    const fade = (v, lo, hi, m) => Math.max(0, Math.min(1, (v - lo) / m, (hi - v) / m));
    return fade(local.x, -0.62, 0.5, 0.15) * fade(local.y, -0.75, 0.65, 0.2);
}

export class WandBelt {
    constructor(game) {
        this.game = game;
        this.model = null;
        this.item = null;
        this._tuck = { left: 0, right: 0 };
        this._open = { left: false, right: false }; // (the fingers opened at the handle before closing on it)
        this._at = 0;
        this._left = { left: true, right: true };
        this._from = { left: { t: 0, dy: 0, u: 0 }, right: { t: 0, dy: 0, u: 0 } }; // (where the real hand was just before it came to the belt)
        this._pushed = { left: false, right: false };
        this._in = { left: false, right: false };
        this.log = []; // (what it did: tests / the hand recording)
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
        ch.group.updateMatrixWorld(true);
        _inv.copy(ch.group.matrixWorld).invert();
        this._reachBelly();
        const now = performance.now();
        if (now - this._at < 900) return; // (just done: not at once back)
        for (const side of ['right', 'left']) {
            // at the belt as the CAMERA sees the real hand (the wrist at the real waistband, the
            // elbow bent: PoseInterpreter.beltPose) — not where the hero's arm happens to be
            const rb = g.currentPose.belt?.[side];
            // (in once, it stays in until it leaves a wider zone: the camera's jitter at the edge
            // must not throw it in and out)
            this._in[side] = !!rb?.at || (this._in[side] && !!rb?.near);
            const near = this._in[side];
            // a deliberate tuck: the hand was BROUGHT there — it came into the place from ≥ 0.15
            // of the torso away, within the last 3 s — a hand resting there or drifting in over
            // the edge never tucks it in
            const from = this._from[side];
            if (rb && !near) { from.dy = rb.dy; from.u = rb.u; from.t = now; }
            if (!rb?.near) this._pushed[side] = false;
            else if (!this._pushed[side] && near && from.t && now - from.t < 3000 && Math.hypot(from.dy - rb.dy, from.u - rb.u) > 0.15) this._pushed[side] = true;
            // (after taking it or tucking it in, the hand must leave the belt first: a wand just
            // taken, still at the waistband pointing down, went straight back)
            if (!near) this._left[side] = true;
            if (!this._left[side]) continue;
            const h = items.held[side];
            if (h && h.item.kind === 'wand') {
                // tucking it in: at the waistband, the tip down
                const down = h.model ? _d.set(0, 1, 0).applyQuaternion(h.model.getWorldQuaternion(_q)).y < -0.2 : false; // (pointing down at all)
                this._tuck[side] = near && down && this._pushed[side] ? this._tuck[side] + dt : 0;
                if (this._tuck[side] > TUCK_S) { this._tuck[side] = 0; this._putAway(side); return; }
                continue;
            }
            this._tuck[side] = 0;
            // taking it: looking down at it, the empty hand at the handle, the fingers closing on it
            const curl = ch.getGripCurl ? ch.getGripCurl(side) : 0;
            // (the hand came to it open and closes on it — however long that takes)
            if (!near) { this._open[side] = false; continue; }
            if (curl < 0.4) this._open[side] = true;
            const free = !h && !g.weapons?.hands?.[side]?.held;
            const rightFirst = side === 'left' && !items.held.right && !g.weapons?.hands?.right?.held; // (the right hand takes it when it can)
            if (free && !rightFirst && this.beltWand() && this.lookingDown() && curl > 0.45 && this._open[side]) {
                this._take(side);
                return;
            }
        }
    }

    /**
     * A real hand brought to one's own belly is AT the belly: the camera can't see how far
     * in front of the body it is, and the hero's arm guessed it far ahead (it could never
     * reach the wand on the belt). An empty hand or one holding the wand, low in front of
     * the belly, is shown close to it (just in front of the body, never through it) —
     * how the hero looks this frame (Character.reachHand: tracking keeps the real arm).
     */
    _reachBelly() {
        const g = this.game, ch = g.character;
        if (!ch.reachHand) return;
        for (const side of ['right', 'left']) {
            const h = g.items.held[side];
            if ((h && h.item.kind !== 'wand') || g.weapons?.hands?.[side]?.held) continue;
            if (!g.currentPose?.belt?.[side]?.near) continue; // (the real hand is by the waist)
            const local = ch.getHandWorldPosition(side, _v).applyMatrix4(_inv);
            const w = bellyWeight(local);
            if (!(w > 0) || local.z >= BELLY_Z) continue;
            ch.reachHand(side, _w.set(local.x, local.y, BELLY_Z).applyMatrix4(ch.group.matrixWorld), w);
            ch.group.updateMatrixWorld(true);
        }
    }

    /** The head turned down towards the belt. */
    lookingDown() {
        const ch = this.game.character;
        if (!ch.getHeadQuaternion) return false;
        const f = _w.set(0, 0, -1).applyQuaternion(ch.getHeadQuaternion(_q));
        return f.y < -0.1; // (a slight look down is enough)
    }

    _putAway(side) {
        const g = this.game, inv = g.inventory;
        const it = g.items.releaseHand(side);
        if (!it) return;
        if (inv.inHand?.item === it) inv.inHand = null;
        const free = inv.slots.findIndex((x) => !x);
        // the belt wand first in the slots (the one on the body)
        this._left[side] = false;
        this.log.push('away:' + side);
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
        if (i < 0 || !inv._fromSlot(i, side)) { this.log.push('take-failed:' + side); return; }
        this.log.push('take:' + side);
        this._open[side] = false;
        this._left[side] = false;
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
