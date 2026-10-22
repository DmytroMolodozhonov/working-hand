/**
 * WandSwap.js — swapping wands between the hands (the author: «в одной руке одна палочка, в другой — другая;
 * свёл руки так, чтобы палочки касались, и подождал около 3 секунд — палочки поменялись местами»).
 *
 * A wand (or a staff) in EACH hand, the wands themselves touching (any part of one against the other,
 * not the hands) and kept so for SWAP_TIME seconds: a glow and sparks grow at the touch, then the wands
 * change hands (the one in the working hand casts now). Parted early (longer than a blink of the camera
 * losing a hand) — it starts over. Never by accident: both hands must hold wands, and only a touch counts.
 * Everybody sees it: the held things are sent to the others as ever (sync.itemHold).
 */

import * as THREE from 'three';

export const SWAP_TIME = 3;
/** The wands count as touching this close (m, between their axes: a wand is thin). */
export const TOUCH_DIST = 0.07;
/** A touch lost for this long (s) starts over (a hand seen badly for a frame does not). */
export const SWAP_GRACE = 0.25;

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3(), _hit = new THREE.Vector3();

/** Shortest distance between segments a0–a1 and b0–b1 (the middle of the closest pair into `mid`). Pure. */
export function segmentGap(a0, a1, b0, b1, mid = null) {
    let best = Infinity;
    for (let i = 0; i <= 6; i++) {
        _c.lerpVectors(a0, a1, i / 6);
        // the closest point of the other segment to this sample
        _d.subVectors(b1, b0);
        const L2 = _d.lengthSq() || 1e-9;
        const t = Math.max(0, Math.min(1, _a.subVectors(_c, b0).dot(_d) / L2));
        _b.copy(b0).addScaledVector(_d, t);
        const d = _c.distanceTo(_b);
        if (d < best) { best = d; if (mid) mid.addVectors(_c, _b).multiplyScalar(0.5); }
    }
    return best;
}

/** The timer: `touching` this frame → progress 0…1; true when it is done. Pure. */
export class SwapTimer {
    constructor() { this.t = 0; this.lost = 0; }
    reset() { this.t = 0; this.lost = 0; }
    update(dt, touching) {
        if (touching) { this.t += dt; this.lost = 0; } else { this.lost += dt; if (this.lost > SWAP_GRACE) this.t = 0; }
        if (this.t >= SWAP_TIME) { this.reset(); return true; }
        return false;
    }
    get progress() { return Math.min(1, this.t / SWAP_TIME); }
}

export class WandSwap {
    constructor(items) {
        this.items = items;
        this.timer = new SwapTimer();
        this._p = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
    }

    /** The wand's two ends in the world (base, tip), or false. */
    _ends(h, a, b) {
        const m = h.model;
        m.updateMatrixWorld(true);
        a.set(0, 0, 0).applyMatrix4(m.matrixWorld);
        b.set(0, m.userData?.tipY || 0.65, 0).applyMatrix4(m.matrixWorld);
    }

    update(dt) {
        const it = this.items, g = it.game;
        const L = it.held.left, R = it.held.right;
        if (!L || !R || L.item.kind !== 'wand' || R.item.kind !== 'wand' || g.spellBusy?.()) { this.timer.reset(); return; }
        const [a0, a1, b0, b1] = this._p;
        this._ends(L, a0, a1);
        this._ends(R, b0, b1);
        const touching = segmentGap(a0, a1, b0, b1, _hit) < TOUCH_DIST;
        const done = this.timer.update(dt, touching);
        const p = this.timer.progress;
        if (touching && p > 0) {
            // a glow growing at the touch (sparks more and more, the light is the spark's own: no new light in the scene)
            if (Math.random() < dt * (4 + 30 * p)) g.fx?.spark?.(_hit, p > 0.66 ? 0xffffff : 0xffe9a8, 0.04 + 0.08 * p, _a.set((Math.random() - 0.5) * 1.5, Math.random() * 1.5, (Math.random() - 0.5) * 1.5), 0.4);
        }
        if (done) this.swap(_hit);
    }

    /** The wands change hands. */
    swap(at) {
        const it = this.items, g = it.game, ch = g.character;
        const L = it.held.left, R = it.held.right;
        if (!L || !R) return false;
        for (const side of ['left', 'right']) {
            const h = it.held[side];
            if (h.gripped) { const hand = ch.getActiveHands?.()[side]; if (hand?.setGrip) hand.setGrip(null); }
            h.gripped = false; h.thumb = undefined; h.q = null; h.since = performance.now();
            if (ch.aim) ch.aim[side] = null;
            it._drop?.[side]?.reset?.(false);
            it._thr?.[side]?.reset?.();
        }
        it.held.left = R;
        it.held.right = L;
        g.sync?.itemHold?.('left', R.item);
        g.sync?.itemHold?.('right', L.item);
        if (at) for (let i = 0; i < 24; i++) g.fx?.spark?.(at, i % 2 ? 0xfff2a8 : 0xffffff, 0.09, _b.set((Math.random() - 0.5) * 3, Math.random() * 3, (Math.random() - 0.5) * 3), 0.5);
        g.sound?.playClang?.(0.25);
        g.hud?.toast?.('🪄 Палочки поменялись местами', 1400);
        return true;
    }
}
