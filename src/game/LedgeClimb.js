/**
 * LedgeClimb.js — out of a pit, up a ledge, with the hands (as in life).
 *
 * A step up to one block is walked onto by itself (Collision.resolveCylinder + Game._feetY).
 * A ledge higher than that (up to LEDGE_MAX — a small pit's wall, a terrace) is climbed by hand:
 * put both palms on its edge (the hands over the top of the solid rock, at its height); then pull
 * them down towards you — the hands stay on the edge, so it is the body that goes up, by as much
 * as the hands are pulled (the same as hand over hand on a ship's rope ladder, Rigging.js). With
 * the palms pressed down to the hips on the edge, a knee goes up onto it and the body over it onto
 * the top. Take one hand off: the other alone
 * can't hold the body, it slides down; both off — you drop back down.
 *
 * Honest limits: the hands must really reach the edge (they are where the camera sees them:
 * arms up, the palms are ~4.5 m over the feet — a ledge of up to four blocks), the edge must be
 * solid rock with room above it to stand, and the head never goes into a roof. A ruined edge
 * (a crack, a crater — Earthquake, Bombardo…) is often uneven: each palm lies on its own column,
 * up to a block apart. In deep water the water holds the body: the palms on the bank, the same pull.
 *
 * Multiplayer: a climber is just a player whose place (and arms) everybody sees.
 */

import * as THREE from 'three';
import { PLAYER_GROUND_OFFSET, HEAD_ROOM } from '../entities/Character.js';

export const LEDGE_MIN = 1.05; // m above the feet: lower is a step, walked onto (Collision stepHeight)
export const LEDGE_MAX = 4.6; // m above the feet: higher can't be reached by the hands (arms up: the palms ~4.5 over the feet)
const ON_EDGE = 0.35; // m: a palm this near the edge's height (above or a little below) lies on it
const OVER = [0, 0.3, 0.55]; // m: a palm this far short of the edge (the fingers over it) still holds it
const REACH = 2.6; // m: from the body's middle to the hand on the edge, at most (the arm stretched out)
const LET_GO = 0.75; // m: the hand moved this far from where it held is off the edge
const RATE = 1.6; // m/s at most: how fast the arms pull the body up
const SLIDE = 1.2; // m/s: one hand alone can't hold — the body slides down
const HIPS = 2.0; // m above the feet (the hips): the palms pressed down to here — the knee goes up onto the edge
const UNEVEN = 1.05; // m: the two palms on edges this far apart in height (a broken edge) still hold together
const WATER_LIFT = 1.0; // m: afloat, the water carries the body this much higher towards the bank
const OVER_TIME = 0.5; // s: from the hands on the edge onto the top
const SQUAT = 0.08; // torso lengths: the person's hips this far under its standing height (JumpReader.rise) — a squat
const PRESS = 0.12; // m: the palms pushed down this far from where they took the edge — a real press (not hands resting)
const HINT_EVERY = 25000; // ms

export class LedgeClimb {
    constructor(game) {
        this.game = game;
        this.input = null; // (tests) side → {G}
        this._pf = { left: {}, right: {} };
        this.climb = null; // {T, L, ix, iz, base (feet at the start), lift, holds: {side: {x, y, z}}, over}
        this._hintAt = -Infinity;
    }

    /** Is the body hanging on the hands (gravity and walking are theirs now)? */
    get active() {
        const c = this.climb;
        return !!c && (!!c.over || c.lift > 0.01 || (!!c.holds.left && !!c.holds.right));
    }

    _hand(side) {
        if (this.input) return this.input(side);
        const f = this.game.weapons.palmFrame(side, this._pf[side]);
        return { G: f.G };
    }

    _free(side) {
        const g = this.game;
        return !g.items?.held[side] && !g.weapons?.hands[side]?.held && !g.books?.reading?.handBusy?.(side) && !g.ships?.helm.held[side];
    }

    /** Can I climb at all now? (on my feet, on the ground — not flying, swimming, riding…) */
    _can() {
        const g = this.game, ch = g.character;
        if (!g.currentPose && !this.input) return false;
        if (g.isDeadLocal || g.combat?.dead || g.combat?.immobile) return false;
        if (g.flight?.busy || g.flight?.active || g.animals?.riding || g.dragonRide?.busy || g.beds?.lying || g.levitation?.lifted) return false; // (afloat — yes: onto the bank)
        if (g.boards?.mounted || g.ships?.rigging?.climbing || g.spiders?.held || g.knock?.down) return false;
        return true;
    }

    /**
     * The edge a palm at G lies on: a column of solid rock whose top is a ledge for feet at `feet`
     * (higher than a step, not too high), with room above it to stand. Null: no edge there.
     */
    edgeAt(G, feet, body, max = LEDGE_MAX) {
        const T0 = this.game.collision?.terrain;
        if (!T0?.floorBelow) return null;
        const dx = G.x - body.x, dz = G.z - body.z, d = Math.hypot(dx, dz);
        if (d > REACH || d < 0.2) return null;
        const ux = dx / d, uz = dz / d;
        // the column under the palm, or the one just ahead of it (the fingers over the edge)
        for (const k of OVER) {
            const ix = Math.round(G.x + ux * k), iz = Math.round(G.z + uz * k);
            if (ix === Math.round(body.x) && iz === Math.round(body.z)) continue; // (my own floor)
            const L = T0.floorBelow(ix, iz, Math.floor(G.y + ON_EDGE + 1.5));
            const T = L - 0.5; // (the top of layer L)
            const h = T - feet;
            if (h <= LEDGE_MIN || h > max) continue;
            if (G.y < T - ON_EDGE || G.y > T + ON_EDGE) continue;
            if (T0.solidIn && T0.solidIn(ix, iz, L + 1, L + 4)) continue; // (no room on top: a roof, a wall)
            return { T, L, ix, iz };
        }
        return null;
    }

    update(dt) {
        const g = this.game, ch = g.character;
        if (!this._can()) { this.letGo(); return; }
        const p = ch.group.position;
        const c = this.climb;
        if (c?.over) { this._over(dt); return; }
        const feet = c ? c.base + c.lift : p.y - PLAYER_GROUND_OFFSET + (ch.lowK || 0);
        const max = LEDGE_MAX + (ch.swimY != null ? WATER_LIFT : 0);
        // the palms: on the edge, held there, or off it
        for (const side of ['left', 'right']) {
            const h = this._hand(side);
            const hold = this.climb?.holds[side];
            if (!h?.G || !this._free(side)) { if (hold) delete this.climb.holds[side]; continue; }
            if (hold) {
                // (pulled down is the pull; moved away along the top, or lifted off — it lets go)
                // (pulling down towards oneself brings the hand in towards the body too: that is the pull)
                const away = Math.hypot(h.G.x - hold.x, h.G.z - hold.z);
                const off = h.G.y > hold.y0 + LET_GO || (away > LET_GO && h.G.y > hold.y - 0.2) || away > REACH;
                if (off) delete this.climb.holds[side];
                continue;
            }
            const e = this.edgeAt(h.G, feet, p, max);
            if (!e) continue;
            const o = this.climb?.holds[side === 'left' ? 'right' : 'left'];
            if (o && Math.abs(e.T - (o.y - 0.06)) > UNEVEN) continue; // (the other hand is on another edge, far up or down)
            if (!this.climb) {
                this.climb = { T: e.T, L: e.L, ix: e.ix, iz: e.iz, base: feet, lift: 0, holds: {}, over: null };
                this._hint('🧗 Рука на краю. Положите обе ладони на край и тяните руки вниз, к себе — вы подтянетесь и выберетесь наверх');
            }
            // (y: where the palm is drawn, on the top; y0: where the hand was when it took the edge — the pull is measured from there)
            this.climb.holds[side] = { x: h.G.x, y: e.T + 0.06, y0: h.G.y, z: h.G.z, T: e.T, L: e.L, ix: e.ix, iz: e.iz };
            this._edge(this.climb);
        }
        const cl = this.climb;
        if (!cl) return;
        this._edge(cl);
        // (standing, one palm resting on the edge: the climb starts from where I stand now)
        if (cl.lift <= 0.01 && !(cl.holds.left && cl.holds.right)) cl.base = p.y - PLAYER_GROUND_OFFSET + (ch.lowK || 0);
        const both = cl.holds.left && cl.holds.right;
        const one = !both && (cl.holds.left || cl.holds.right);
        let err = 0;
        // the person squats (for a jump) or is up in a jump: the hands go down / up with the whole body,
        // not pressed on the edge — before the body hangs on them it is no pull (where they hold is learned anew)
        const J = g.currentPose?.jump;
        if (cl.lift <= 0.01 && J && (J.air || (J.rise ?? 0) < -SQUAT)) {
            for (const side of ['left', 'right']) { const hd = cl.holds[side]; if (hd) hd.y0 = this._hand(side).G.y; }
            cl.press = 0;
            this._drawHands();
            return;
        }
        if (both) {
            // the hands stay on the edge: pulled down by err, the body goes up by it
            for (const side of ['left', 'right']) err += this._hand(side).G.y - cl.holds[side].y0;
            err /= 2;
            cl.lift += Math.max(-RATE * dt, Math.min(RATE * dt, -err));
            // (a low ledge: the palms really pressed down on it — hands just resting there, or hanging by the
            // body at the edge's height, climb nothing: no accidental climbing)
            cl.press = err < -PRESS ? (cl.press || 0) + dt : 0;
        } else if (one) {
            cl.lift -= SLIDE * dt; // (one hand can't hold the body up)
            if (cl.lift < 0.3 && !cl._toldOne) { cl._toldOne = true; this._hint('🧗 Одной рукой не подтянуться — положите на край и вторую', true); }
        } else {
            // both hands off: dropped back down (gravity takes it from here — Character.update)
            this.climb = null;
            return;
        }
        // never under the floor I started on; the head never into a roof over me
        const roof = g.collision?.ceilingAt ? g.collision.ceilingAt(p.x, p.z, cl.base + 1.1) - HEAD_ROOM : Infinity;
        cl.lift = Math.max(0, Math.min(cl.lift, cl.T - cl.base + 0.1, roof - cl.base));
        if (!this.active) { this._drawHands(); return; } // (standing again, the one hand still on the edge: walking is the legs')
        p.y = cl.base + cl.lift + PLAYER_GROUND_OFFSET;
        ch.verticalVelocity = 0;
        ch.airTop = null;
        if (cl.lift > 0.01) ch.setCrouching(false);
        // the palms pressed down to the hips on the edge (a low ledge: just leant on): over it, onto the top
        if (both && cl.base + cl.lift >= cl.T - HIPS && (cl.lift > PRESS || cl.press > 0.2)) this._startOver();
        this._drawHands();
    }

    /** The edge the body goes over: the higher of the palms' (a broken edge — up onto that one too). */
    _edge(c) {
        let e = null;
        for (const side of ['left', 'right']) { const h = c.holds[side]; if (h && (!e || h.T > e.T)) e = h; }
        if (e) { c.T = e.T; c.L = e.L; c.ix = e.ix; c.iz = e.iz; }
    }

    _startOver() {
        const g = this.game, ch = g.character, p = ch.group.position, c = this.climb;
        // onto the top: from the body towards the hands, the body's middle well onto the rock
        const ax = (c.holds.left.x + c.holds.right.x) / 2, az = (c.holds.left.z + c.holds.right.z) / 2;
        let dx = ax - p.x, dz = az - p.z;
        const d = Math.hypot(dx, dz) || 1;
        dx /= d; dz /= d;
        const T0 = g.collision.terrain;
        // a column to stand on: its floor at the edge's height or up to a block lower (a broken edge), room above
        const top = (x, z) => {
            const ix = Math.round(x), iz = Math.round(z);
            const L = T0.floorBelow(ix, iz, c.L + 1);
            return L >= c.L - 1 && !(T0.solidIn && T0.solidIn(ix, iz, L + 1, L + 4)) ? L : null;
        };
        // (the edge's near side, then the body's middle a body's half-width onto the top)
        let tx = c.ix, tz = c.iz, TL = c.L;
        for (let k = 0.1; k <= d + 0.6; k += 0.1) {
            const x = p.x + dx * k, z = p.z + dz * k;
            const L = top(x, z);
            if (L == null) continue;
            const L2 = top(x + dx * 0.6, z + dz * 0.6);
            if (L2 != null && Math.abs(L2 - L) <= 1) { tx = x + dx * 0.6; tz = z + dz * 0.6; TL = L2; } else { tx = x; tz = z; TL = L; }
            break;
        }
        c.over = { t: 0, x0: p.x, z0: p.z, y0: p.y, x1: tx, z1: tz, y1: TL - 0.5 + PLAYER_GROUND_OFFSET, T: TL - 0.5 };
    }

    _over(dt) {
        const g = this.game, ch = g.character, p = ch.group.position, o = this.climb.over;
        o.t = Math.min(1, o.t + dt / OVER_TIME);
        const k = o.t * o.t * (3 - 2 * o.t);
        // up first, then forward onto the top (the knees over the edge, not through it)
        const ky = Math.min(1, k * 1.6);
        p.set(o.x0 + (o.x1 - o.x0) * k, o.y0 + (o.y1 - o.y0) * ky, o.z0 + (o.z1 - o.z0) * k);
        ch.verticalVelocity = 0;
        this._drawHands();
        if (o.t >= 1) {
            ch.groundY = o.T;
            ch.onGround = true;
            ch.airTop = null;
            this.climb = null;
            g.hud?.setVoice?.('🧗 Вы выбрались наверх', true);
        }
    }

    /** The drawn palms on the edge (the arm bends to them). */
    _drawHands() {
        if (this.input) return;
        const ch = this.game.character, c = this.climb;
        for (const side of ['left', 'right']) {
            const h = c?.holds[side];
            if (h) ch.reachHand(side, _pt(h), 1, 0.2);
        }
    }

    _hint(text, always = false) {
        const now = performance.now();
        if (!always && now - this._hintAt < HINT_EVERY) return;
        this._hintAt = now;
        this.game.hud?.setVoice?.(text, true);
    }

    letGo() { this.climb = null; }
}

const _p = new THREE.Vector3();
const _pt = (h) => _p.set(h.x, h.y, h.z);
