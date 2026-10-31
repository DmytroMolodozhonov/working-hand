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
 * water. Mana crystals in a cave (ManaCrystals.solidAt) stop it. Static furniture boxes (tables, beds) stop it too, and a shut chest (the hand lies on its
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

/**
 * Where a point P inside something is put on its surface, seen from O (outside): the first solid point E on O → P; the face
 * entered there (its normal, by the block's cell crossed); P slid along that face to it (the hand lies on the wall WHERE the
 * player put it, not dragged back towards the shoulder) — if that place is free and seen from O; else E itself. The move
 * P → there into `out` (null: P is free from O).
 */
export function slideOut(O, P, solid, out, gap = HAND_GAP, pref = null) {
    const e = firstSolid(O, P, solid, _e);
    slideOut.n.set(0, 0, 0);
    if (!e) return null;
    // (the face the hand lay on last frame first, if it still takes the hand out the same short way: on a stepped slope a
    // fingertip near a step's edge must not swap between the step's top and its front frame by frame)
    if (pref && pref.lengthSq() > 0.5 && outAlong(P, pref, solid, _sl, gap) && !firstSolid(O, _sl, solid, _e2)) {
        slideOut.n.copy(pref);
        return out.subVectors(_sl, P);
    }
    const dx = P.x - O.x, dy = P.y - O.y, dz = P.z - O.z, len = Math.hypot(dx, dy, dz) || 1;
    const ux = dx / len, uy = dy / len, uz = dz / len;
    // the face crossed: the cell (as the world's blocks: x, z rounded, y + 1.5 floored) that changes just past E
    const fx = e.x + ux * 0.03, fy = e.y + uy * 0.03, fz = e.z + uz * 0.03;
    let nx = 0, ny = 0, nz = 0;
    const cx = Math.round(fx) - Math.round(e.x), cy = Math.floor(fy + 1.5) - Math.floor(e.y + 1.5), cz = Math.round(fz) - Math.round(e.z);
    const ax = cx ? Math.abs(ux) : -1, ay = cy ? Math.abs(uy) : -1, az = cz ? Math.abs(uz) : -1;
    if (ax >= ay && ax >= az && ax > 0) nx = -Math.sign(ux); else if (ay >= az && ay > 0) ny = -Math.sign(uy); else if (az > 0) nz = -Math.sign(uz);
    if (nx || ny || nz) {
        const d = (e.x - P.x) * nx + (e.y - P.y) * ny + (e.z - P.z) * nz + gap; // (how far P is under the face)
        const sx = P.x + nx * d, sy = P.y + ny * d, sz = P.z + nz * d;
        _sl.set(sx, sy, sz);
        if (d > 0 && !solid(sx, sy, sz) && !firstSolid(O, _sl, solid, _e2)) { slideOut.n.set(nx, ny, nz); return out.set(nx * d, ny * d, nz * d); }
    }
    // (a corner, a slope, not a block: back along the line to where it went in)
    return out.set(e.x - ux * gap - P.x, e.y - uy * gap - P.y, e.z - uz * gap - P.z);
}

slideOut.n = new THREE.Vector3(); // the face's normal the last slideOut slid along (0: it went back along the line)

/** P moved along n out of the solid (to its first free point + gap, ≤ 0.6 m) into out; false — not out within that. */
function outAlong(P, n, solid, out, gap) {
    let lo = 0, hi = -1;
    for (let k = 1; k <= 8; k++) { const t = k * 0.075; if (!solid(P.x + n.x * t, P.y + n.y * t, P.z + n.z * t)) { hi = t; break; } lo = t; }
    if (hi < 0) return false;
    for (let i = 0; i < 5; i++) { const m = (lo + hi) / 2; if (solid(P.x + n.x * m, P.y + n.y * m, P.z + n.z * m)) lo = m; else hi = m; }
    out.set(P.x + n.x * (hi + gap), P.y + n.y * (hi + gap), P.z + n.z * (hi + gap));
    return !solid(out.x, out.y, out.z);
}

const _e = new THREE.Vector3(), _e2 = new THREE.Vector3(), _sl = new THREE.Vector3();
const _S = new THREE.Vector3();
const _O = new THREE.Vector3();
const _C = new THREE.Vector3();
const _W = new THREE.Vector3();
const _E0 = new THREE.Vector3();
const _pole = new THREE.Vector3();
const _push = new THREE.Vector3();
const _p1 = new THREE.Vector3();
const _D = new THREE.Vector3();
const _T = new THREE.Vector3();
const _ax = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _base = new THREE.Vector3();

/** How a hand at a wall is held (HandBlocks.keepOut). */
export const HOLD = {
    PASSES: 3, // the arm bent again while a fingertip is still in (the hand turns with the forearm)
    SNAP: 0.02, // m: the needed hold changing by less than this follows at once (the hand stays ON the surface, no lag, no shake)
    BACK_T: 0.05, // s: a hold that is no longer needed (the hand taken out of the wall) lets go this smoothly (~0.15 s)
    BEND_T: 0.08, // s
    BEND_DEF: 0.3, // m: the usual way's weight against the player's elbow off the line (a bent arm: 0.3…0.9 off it)
    SWIVEL: [0.35, -0.35, 0.7, -0.7, 1.1, -1.1, 1.6, -1.6, 2.2, -2.2, 3.0], // rad: the elbow turned about the shoulder–hand line, nearest first
};

const hold = () => ({ K: new THREE.Vector3(), pole: new THREE.Vector3(), sw: 0, fail: 0, n: new THREE.Vector3(), nPrev: new THREE.Vector3() });

export class HandBlocks {
    constructor(game) {
        this.game = game;
        this.pushed = { left: 0, right: 0 }; // m the hand was held back this frame (tests, other systems)
        this._mem = new WeakMap(); // per body: each hand's hold (the last frames: no trembling at a wall), its elbow's swivel
        this._at = { left: 0, right: 0 };
        this._pts = Array.from({ length: 8 }, () => new THREE.Vector3());
        this.solid = (x, y, z) => this._solid(x, y, z);
    }

    /** Is a world point in something a hand can't go into? */
    _solid(x, y, z) {
        const g = this.game;
        const data = g.world?.terrain?.data;
        if (data?.get) {
            const ix = Math.round(x), L = Math.floor(y + 1.5), iz = Math.round(z);
            // (a slab, a ramp — BlockShapes.js: the hand lies on its slope, the empty part of the cell is air)
            if (handBlocked(data.get(ix, L, iz)) && (!data.occupied || !data.shapeAt(ix, L, iz) || data.occupied(x, y, z))) return true;
        }
        if (g.crystals?.solidAt(x, y, z)) return true; // (a mana crystal growing out of the rock: the hand lies on it)
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
        this._n = n;
        return out;
    }

    /** The biggest move that takes every point of the hand out (slid along the surface), from O; null — all free. */
    _need(O, ch, side, out, M) {
        const pts = this._points(ch, side), n = this._n;
        let best = 0;
        for (let i = 0; i < n; i++) {
            const m = slideOut(O, pts[i], this.solid, _p1, HAND_GAP, M?.nPrev);
            if (!m) continue;
            const l = m.lengthSq();
            if (l > best) { best = l; out.copy(m); if (M) M.n.copy(slideOut.n); }
        }
        return best > 0 ? out : null;
    }

    /**
     * Hold one body's hands out of the blocks (after its arms are posed this frame). No feedback: each frame the hold is found
     * from the arm as posed now (the camera's), then smoothed on its own — the old way bent the arm by the last frames'
     * remembered push and measured again from there, so a hand at a wall or a slope went in and out frame by frame
     * («истерика»), the elbow jumped to a default bend at every touch, and a shoulder already in the wall (standing
     * sideways at it: the shoulder is 0.7 from the body's middle, the body's edge 0.48) let the whole arm through.
     */
    keepOut(ch, dtIn = null) {
        if (!ch?.leftArmAnchor || !ch.reachHand) return;
        let mem = this._mem.get(ch);
        if (!mem) this._mem.set(ch, mem = { left: hold(), right: hold() });
        const now = performance.now();
        for (const side of ['left', 'right']) {
            if (ch.limbs && ch.limbs[side + 'Arm'] != null) continue; // (a cut-off arm: its stump)
            const M = mem[side];
            const dt = dtIn ?? Math.min(0.1, Math.max(0, (now - (this._at[side] || now)) / 1000));
            if (ch === this.game.character) this._at[side] = now;
            const arm = side === 'left' ? ch.leftArmAnchor : ch.rightArmAnchor, elbow = side === 'left' ? ch.leftElbowAnchor : ch.rightElbowAnchor;
            arm.getWorldPosition(_S);
            // where the hand is looked at from: the shoulder — or, when the shoulder itself is in the wall, the point where the
            // line from the chest to it enters the wall (a hand never goes on through)
            if (!this._origin(arm, _S, _O)) { M.K.set(0, 0, 0); if (ch === this.game.character) this.pushed[side] = 0; continue; }
            // the arm as posed now: its hand, its elbow's bend (kept while the hand is held)
            ch.getHandWorldPosition(side, _W);
            elbow.getWorldPosition(_E0);
            this._bendWay(ch, side, _S, _E0, _W, _pole);
            // (and smoothed: its way turns over ~0.1 s, never flips in a frame)
            if (M.pole.lengthSq() > 1e-8 && dt > 0) { M.pole.lerp(_pole.normalize(), 1 - Math.exp(-dt / HOLD.BEND_T)); _pole.copy(M.pole); }
            M.pole.copy(_pole.normalize());
            // the hold this frame needs (from the arm as posed — never from the last frame's bend)
            _D.set(0, 0, 0);
            let bent = false;
            M.n.set(0, 0, 0);
            for (let pass = 0; pass < HOLD.PASSES; pass++) {
                const m = this._need(_O, ch, side, _push, M);
                if (!m) break;
                _D.add(m);
                ch.reachHand(side, _T.copy(_W).add(_D), 1, 0, _pole);
                bent = true;
            }
            // smoothed on its own: more, or as good as the same — at once (never into the wall; the hand stays ON the surface
            // while the player presses: the camera's noise into the wall is cut there), less — let go smoothly, never into it
            const K = M.K;
            if (_D.lengthSq() >= K.lengthSq() - 1e-8 || K.distanceTo(_D) < HOLD.SNAP) K.copy(_D);
            else {
                K.lerp(_D, 1 - Math.exp(-Math.max(0, dt) / HOLD.BACK_T));
                if (K.lengthSq() < 1e-8) K.set(0, 0, 0);
                ch.reachHand(side, _T.copy(_W).add(K), 1, 0, _pole);
                bent = true;
                const m = this._need(_O, ch, side, _push, M);
                if (m) { K.add(m); ch.reachHand(side, _T.copy(_W).add(K), 1, 0, _pole); }
            }
            M.nPrev.copy(M.n);
            // the elbow (and the arm's middle) out of the wall too: turned about the shoulder–hand line, the nearest way free
            this._elbowOut(ch, side, arm, elbow, M, bent ? _T.copy(_W).add(K) : _T.copy(_W));
            if (ch === this.game.character) this.pushed[side] = K.length();
        }
    }

    /**
     * The way the elbow bends when the hand is held: the player's own elbow off the shoulder–hand line — and, for an arm
     * nearly straight (that off is only the camera's noise, a random way every frame: the held arm's elbow jumped about), a
     * human's usual way (down, out, a little back) weighs in, so the bend stays put.
     */
    _bendWay(ch, side, S, E, H, out) {
        _ax.subVectors(H, S);
        const l = _ax.length();
        out.subVectors(E, S);
        if (l < 1e-6) return out;
        _ax.multiplyScalar(1 / l);
        out.addScaledVector(_ax, -out.dot(_ax)); // (off the line)
        ch.group.getWorldQuaternion(_q);
        _C.set(side === 'left' ? -0.3 : 0.3, -1, 0.35).applyQuaternion(_q);
        _C.addScaledVector(_ax, -_C.dot(_ax));
        const lc = _C.length();
        if (lc > 1e-6) out.addScaledVector(_C, HOLD.BEND_DEF / lc);
        return out;
    }

    /** O: the shoulder S, or (S in a wall) the chest's line to it where it enters the wall; false — even the chest is in. */
    _origin(arm, S, O) {
        if (!this.solid(S.x, S.y, S.z)) { O.copy(S); return true; }
        // (the chest: the body's middle at the shoulder's height — the arm's anchor's parent, x 0)
        arm.parent.localToWorld(_C.set(0, arm.position.y, arm.position.z));
        if (this.solid(_C.x, _C.y, _C.z)) return false;
        const e = firstSolid(_C, S, this.solid, _e);
        if (!e) { O.copy(S); return true; }
        O.copy(e).addScaledVector(_p1.subVectors(_C, S).normalize(), HAND_GAP);
        return true;
    }

    /** The elbow, the upper arm's and the forearm's middles in a wall: the elbow turned about the shoulder–hand line. */
    _elbowOut(ch, side, arm, elbow, M, H) {
        const S = arm.getWorldPosition(_S);
        if (!this._armIn(S, elbow)) { M.sw *= 0.8; M.fail = 0; return; }
        // (no way round last time — the whole arm in the rock, the shoulder in a wall: looked for again only now and then)
        if (M.fail > 0 && (M.fail++ % 8) !== 0) return;
        // (nearest the last frame's turn first: no jumping between two ways round)
        const tries = HOLD.SWIVEL;
        _ax.subVectors(H, S);
        if (_ax.lengthSq() < 1e-6) return;
        _ax.normalize();
        elbow.getWorldPosition(_E0);
        const base = _base.subVectors(_E0, S);
        let done = false;
        for (let i = -1; i < tries.length && !done; i++) {
            const a = i < 0 ? M.sw : M.sw + tries[i];
            if (i < 0 && !M.sw) continue;
            _q.setFromAxisAngle(_ax, a);
            _pole.copy(base).applyQuaternion(_q);
            ch.reachHand(side, H, 1, 0, _pole);
            if (!this._armIn(arm.getWorldPosition(_S), elbow)) { M.sw = a; done = true; }
        }
        if (!done) { _pole.copy(base); ch.reachHand(side, H, 1, 0, _pole); M.fail = Math.max(1, M.fail); } // (no way: as it was)
        else M.fail = 0;
    }

    _armIn(S, elbow) {
        const E = elbow.getWorldPosition(_C);
        if (this.solid(E.x, E.y, E.z)) return true;
        if (this.solid((S.x + E.x) / 2, (S.y + E.y) / 2, (S.z + E.z) / 2)) return true;
        const F = _e2.set(0, 0, 0.45).applyMatrix4(elbow.matrixWorld); // (the forearm's middle: 0.9 / 2)
        return this.solid(F.x, F.y, F.z);
    }

    update(dt = null) {
        const g = this.game;
        if (!g.character || g.flight?.active) return; // (flying: the hands are the wings' — nothing in reach)
        this.keepOut(g.character, dt);
    }

    /** The other players' heroes, as drawn here (after they are posed this frame). */
    updateRemotes(dt = null) {
        for (const r of this.game.remotes?.values?.() || []) if (!r.dead && r.character?.group?.visible) this.keepOut(r.character, dt);
    }
}
