/**
 * HandBlocks.js — hands never go into the world's blocks: a counter, a wall, a table, the ground.
 *
 * Every frame, after the arms are posed from the camera, each hand's palm and fingertips are
 * looked at along the arm, from the shoulder out: where that line first enters a block, the
 * hand stops — the arm bends and the hand lies on the counter, against the wall (Character.
 * reachHand, so the hand never leaves the arm). It is how the hand is SEEN and what it can
 * REACH this frame (the grip point, what the fingers close on): a thing behind a counter or a
 * wall can't be taken through it. The hand's speed (a throw, a punch) stays the player's own.
 *
 * Soft things a hand goes into are not blocks for it: leaves, wheat, flowers, vegetable beds,
 * water. Static furniture boxes (tables, beds) stop it too, and a shut chest (the hand lies on its
 * lid, the fingers find its front edge — Alohomora._chestHands; an open one is reached into); doors
 * and cauldrons have their own hand work (a handle, a rim) and are not touched here.
 * The same for other players' heroes, as this computer draws them.
 */

import * as THREE from 'three';
import { BLOCK } from '../world/Terrain.js';

/** Blocks a hand goes into (soft, or not a block at all). */
const SOFT = new Set([BLOCK.AIR, BLOCK.WATER, BLOCK.LEAVES, BLOCK.BIRCH_LEAVES, BLOCK.SPRUCE_LEAVES, BLOCK.CHERRY_LEAVES, BLOCK.DARK_LEAVES, BLOCK.WHEAT, BLOCK.FLOWERS, BLOCK.VEG]);
/** Does this block stop a hand? */
export const handBlocked = (type) => type != null && !SOFT.has(type);
/** Furniture boxes (Collision.js) a hand rests on. */
const FURNITURE = new Set(['table', 'bed']);

export const HAND_GAP = 0.03; // m: the skin's side of the surface (never in it)
const STEP = 0.08; // m: the look along the arm (a block is 1 m: never missed)

/**
 * Where the line from `a` to `b` first enters something solid (`solid(x, y, z)`), into `out`;
 * null when it is free all the way. Found to ~1 cm (halving the last step).
 */
export function firstSolid(a, b, solid, out) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return null;
    const n = Math.max(1, Math.ceil(len / STEP));
    let t0 = 0;
    for (let i = 1; i <= n; i++) {
        const t = i / n;
        if (!solid(a.x + dx * t, a.y + dy * t, a.z + dz * t)) { t0 = t; continue; }
        let lo = t0, hi = t;
        for (let k = 0; k < 6; k++) {
            const m = (lo + hi) / 2;
            if (solid(a.x + dx * m, a.y + dy * m, a.z + dz * m)) hi = m; else lo = m;
        }
        return out.set(a.x + dx * lo, a.y + dy * lo, a.z + dz * lo);
    }
    return null;
}

/**
 * How far the hand must come back so none of its points is in (or behind) a solid thing seen
 * from the shoulder `S`: the move (world, towards the shoulder) into `out`, or null when free.
 * A shoulder inside a block (lying on the ground, squeezed in a tunnel) — nothing to say.
 */
export function handPushBack(S, points, solid, out, gap = HAND_GAP) {
    if (solid(S.x, S.y, S.z)) return null;
    let best = 0;
    for (const P of points) {
        const e = firstSolid(S, P, solid, _e);
        if (!e) continue;
        const d = P.distanceTo(S) - e.distanceTo(S) + gap;
        if (d > best) { best = d; out.subVectors(S, P).setLength(d); }
    }
    return best > 0 ? out : null;
}

const _e = new THREE.Vector3();
const _S = new THREE.Vector3();
const _W = new THREE.Vector3();
const _push = new THREE.Vector3();

export class HandBlocks {
    constructor(game) {
        this.game = game;
        this.pushed = { left: 0, right: 0 }; // m the hand was held back this frame (tests, other systems)
        this._pts = Array.from({ length: 8 }, () => new THREE.Vector3());
        this.solid = (x, y, z) => this._solid(x, y, z);
    }

    /** Is a world point in something a hand can't go into? */
    _solid(x, y, z) {
        const g = this.game;
        const data = g.world?.terrain?.data;
        if (data?.get && handBlocked(data.get(Math.round(x), Math.floor(y + 1.5), Math.round(z)))) return true;
        const col = g.collision;
        const W = col?.walls;
        if (W && y < W.height && W.set.has(Math.round(x / W.cellSize) + ',' + Math.round(z / W.cellSize))) return true;
        if (col?.queryBoxes && !g.beds?.lying) {
            const bs = col.queryBoxes(x, x, z, z);
            for (let i = 0; i < bs.length; i++) {
                const b = bs[i];
                if ((FURNITURE.has(b.kind) || (b.kind === 'chest' && !b.chest?.isOpen)) && y >= b.minY && y <= b.maxY && x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) return true;
            }
        }
        return false;
    }

    /** The palm, the fingertips and the wrist of a drawn hand (world). */
    _points(ch, side) {
        const out = this._pts;
        ch.getHandWorldPosition(side, out[0]);
        let n = 1;
        const hand = ch.getActiveHands?.()[side];
        if (hand?.group?.visible) {
            if (hand.palm) { hand.palm.getWorldPosition(out[n]); n++; }
            for (const name of ['thumb', 'index', 'middle', 'ring', 'pinky']) {
                const seg = hand.fingerMeshes?.[name]?.[2];
                if (seg?.pivot) { seg.pivot.localToWorld(out[n].set(0, 0.12, 0)); n++; }
            }
        }
        if (n === 1) { out[1].copy(out[0]).addScaledVector(ch.getForearmDirection(side, _e), 0.35); n = 2; } // (no hand drawn: its length past the wrist)
        // what the hand holds (a pouch hanging from the fist, bread in the fingers): its lowest point
        // never goes into the counter either — the hand stops so that the thing lies on it
        const low = ch === this.game.character ? this.game.items?.held?.[side]?.low : null;
        if (low) { out[n] = out[n] || new THREE.Vector3(); out[n].copy(out[0]).add(low); n++; }
        return out.slice(0, n);
    }

    /** Hold one body's hands out of the blocks (after its arms are posed this frame). */
    keepOut(ch) {
        if (!ch?.leftArmAnchor || !ch.reachHand) return;
        for (const side of ['left', 'right']) {
            if (ch.limbs && ch.limbs[side + 'Arm'] != null) continue; // (a cut-off arm: its stump)
            (side === 'left' ? ch.leftArmAnchor : ch.rightArmAnchor).getWorldPosition(_S);
            let total = 0;
            for (let pass = 0; pass < 2; pass++) { // (the arm bent once more, if a fingertip is still in)
                const push = handPushBack(_S, this._points(ch, side), this.solid, _push);
                if (!push) break;
                total += push.length();
                ch.reachHand(side, ch.getHandWorldPosition(side, _W).add(push), 1, 0);
            }
            if (ch === this.game.character) this.pushed[side] = total;
        }
    }

    update() {
        const g = this.game;
        if (!g.character || g.flight?.active) return; // (flying: the hands are the wings' — nothing in reach)
        this.keepOut(g.character);
    }

    /** The other players' heroes, as drawn here (after they are posed this frame). */
    updateRemotes() {
        for (const r of this.game.remotes?.values?.() || []) if (!r.dead && r.character?.group?.visible) this.keepOut(r.character);
    }
}
