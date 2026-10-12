/**
 * Helm.js — the ship's wheel in real hands.
 *
 * Put a hand on the wheel (the rim or a spoke's handle) and close the fingers:
 * the hand holds it. Move the holding hand round the circle and the wheel turns
 * with it (one hand or both); the rudder answers (only a moving ship turns).
 * Open the fingers — the hand lets go; pull it far away — it slips off. The drawn
 * hand sits on the rim where it holds; a free hand never goes through the wheel.
 *
 * Grabbing the wheel of a ship whose crew is alive and not yours starts a fight;
 * a ship without a crew is yours when you take its wheel.
 *
 * Multiplayer: whoever holds the wheel steers; a guest's wheel goes to the host
 * ('shelm'), the host moves the ship.
 */

import * as THREE from 'three';
import { HELM, polar, unwrap, rimDist, steer } from './HelmMath.js';

const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _l = { x: 0, y: 0, z: 0 };
const _o = { x: 0, y: 0, z: 0 };

export class Helm {
    constructor(game, ships) {
        this.game = game;
        this.ships = ships;
        this.held = { left: null, right: null }; // {ship, a0, w0, a}
        this.input = null; // (tests) side → {G: world point, curl}: instead of the tracked hands
        this._open = { left: 0, right: 0 }; // when the hand was last open
        this._relT = { left: 0, right: 0 };
        this._pf = { left: {}, right: {} };
        // the tracked hands' grip points, taken each frame before a holding hand is drawn on the rim:
        // the wheel follows the real hand, never the drawn one (that one follows the wheel — a loop
        // that spun the wheel round by itself)
        this._real = { left: { G: new THREE.Vector3(), at: -1 }, right: { G: new THREE.Vector3(), at: -1 } };
        this._netT = 0;
        this.climbing = false;
        this.remote = new Map(); // (host) ship id → {by, w, at}
    }

    /** Do I hold this ship's wheel? */
    holding(s) {
        return (this.held.left && this.held.left.ship === s) || (this.held.right && this.held.right.ship === s);
    }

    _hand(side) {
        if (this.input) return this.input(side);
        const g = this.game, ch = g.character;
        const r = this._real[side];
        const G = g.frameCount - r.at <= 2 ? r.G : g.weapons.palmFrame(side, this._pf[side]).G;
        return { G, curl: ch.getGripCurl(side), hand: ch.getActiveHands()[side] };
    }

    _free(side) {
        const g = this.game;
        return !g.items?.held[side] && !g.weapons?.hands[side]?.held && !g.books?.reading?.handBusy?.(side) && !this.ships.cannons?.busy?.(side);
    }

    /** The helm-local point (x starboard, y up, z towards the helmsman) of a world point. */
    _helmLocal(s, p, out) {
        s.pose.toLocal(p.x, p.y, p.z, out);
        const h = s.layout.helm;
        out.x -= h.x; out.y -= h.y; out.z -= h.z;
        return out;
    }

    /** The nearest awake ship whose wheel is within reach of a world point. */
    _wheelNear(p) {
        for (const s of this.ships.awake) {
            if (!s.collider.hasXZ(p.x, p.z, 4)) continue;
            this._helmLocal(s, p, _l);
            if (Math.hypot(_l.x, _l.y, _l.z) < s.layout.helm.handleR + 1.2) return s;
        }
        return null;
    }

    update(dt) {
        const g = this.game;
        // (host) a guest's hands on a wheel
        if (this.ships.auth) {
            const now = performance.now();
            for (const [id, r] of this.remote) {
                const s = this.ships.list.get(id);
                if (!s || now - r.at > 1500) { if (s && s.helmBy === r.by) s.helmBy = null; this.remote.delete(id); continue; }
                if (s.helmBy === r.by) {
                    const rate = HELM.MAX_RATE / (1 + Math.abs(s.st.u) / 4);
                    s.wheel = s.wheel + Math.max(-rate * dt, Math.min(rate * dt, r.w - s.wheel));
                }
            }
        }
        if (!g.currentPose && !this.input) { this.releaseAll(); return; }
        if (g.isDeadLocal || g.combat?.dead || g.flight?.active || g.levitation?.lifted) { this.releaseAll(); return; }
        const now = performance.now();
        const holds = [];
        let ship = null;
        for (const side of ['left', 'right']) {
            const h = this._hand(side);
            if (!h || !h.G) continue;
            const held = this.held[side];
            if (h.curl < HELM.OPEN_CURL) this._open[side] = now;
            if (held) {
                const s = held.ship;
                this._helmLocal(s, h.G, _l);
                const d = rimDist(_l.x, _l.y, _l.z, s.layout.helm.rimR, s.layout.helm.handleR);
                // let go: the fingers open (for a moment), the hand pulled away, the ship gone under
                if (h.curl < HELM.RELEASE_CURL) this._relT[side] += dt * 1000; else this._relT[side] = 0;
                if (this._relT[side] > HELM.RELEASE_MS || d > HELM.SLIP || s.flooded || !s.awake) { this.release(side); continue; }
                held.a = unwrap(held.a, polar(_l.x, _l.y));
                holds.push(held);
                ship = s;
                continue;
            }
            // take hold: a free hand at the wheel closes its fingers (having been open a moment ago)
            if (!this._free(side) || h.curl < HELM.CLOSE_CURL || now - this._open[side] > HELM.CLOSE_WINDOW_MS) continue;
            const s = this._wheelNear(h.G);
            if (!s || s.flooded) continue;
            if (s.helmBy && s.helmBy !== g.localId) continue; // somebody else steers
            this._helmLocal(s, h.G, _l);
            if (rimDist(_l.x, _l.y, _l.z, s.layout.helm.rimR, s.layout.helm.handleR) > HELM.GRAB_R) continue;
            this.grab(s, side, polar(_l.x, _l.y));
        }
        if (ship && holds.length) {
            const w = steer(ship.wheel, holds, dt, ship.st.u);
            ship.wheel = w;
            if (!this.ships.auth) {
                this._netT += dt;
                if (this._netT > 0.1) { this._netT = 0; g.sync?.net.send({ t: 'shelm', id: ship.id, w: Math.round(w * 100) / 100, on: 1 }); }
            }
        }
    }

    grab(s, side, a) {
        const g = this.game;
        this.held[side] = { ship: s, a0: a, w0: s.wheel, a };
        s.helmBy = g.localId;
        const hand = g.character.getActiveHands?.()[side];
        if (hand?.setGrip) hand.setGrip(0.7);
        g.sound?.playClang?.(0.25);
        if (this.ships.auth) this.ships.crew.tookWheel(s, g.localId);
        else g.sync?.net.send({ t: 'shelm', id: s.id, w: Math.round(s.wheel * 100) / 100, on: 1, grab: 1 });
        if (!this._told) { this._told = true; g.hud.setVoice('☸️ Вы держите штурвал. Ведите руку по кругу — штурвал поворачивается. Корабль слушается руля, только когда идёт', true); }
    }

    release(side) {
        const held = this.held[side];
        if (!held) return;
        this.held[side] = null;
        const g = this.game;
        const hand = g.character.getActiveHands?.()[side];
        if (hand?.setGrip) hand.setGrip(null);
        const s = held.ship;
        if (!this.holding(s)) {
            if (s.helmBy === g.localId) s.helmBy = null;
            if (!this.ships.auth) g.sync?.net.send({ t: 'shelm', id: s.id, w: Math.round(s.wheel * 100) / 100, on: 0 });
        }
    }

    releaseAll() {
        this.release('left');
        this.release('right');
    }

    /** (host) A guest steers: {id, w, on, grab}. */
    applyRemote(m) {
        const s = this.ships.list.get(m.id);
        if (!s) return;
        const by = m.from;
        if (!m.on) { if (s.helmBy === by) s.helmBy = null; this.remote.delete(s.id); return; }
        if (s.helmBy && s.helmBy !== by && !(s.helmBy === this.game.localId && !this.holding(s))) return;
        if (!this.ships._near(s, by, 40)) return;
        s.helmBy = by;
        const w = Math.max(-HELM.LOCK, Math.min(HELM.LOCK, +m.w || 0));
        this.remote.set(s.id, { by, w, at: performance.now() });
        if (m.grab) this.ships.crew.tookWheel(s, by);
    }

    /**
     * Drawn hands (after the arms are posed this frame): a holding hand sits on the rim where it holds,
     * a free hand is pushed out of the wheel (never through it).
     */
    updateHands() {
        const g = this.game, ch = g.character;
        if (this.input) return;
        const hands = ch.getActiveHands?.();
        if (!hands) return;
        // the real hands first (the arms posed from the camera this frame, nothing drawn on them yet)
        for (const side of ['left', 'right']) {
            if (!hands[side]?.group?.visible) continue;
            this._real[side].G.copy(g.weapons.palmFrame(side, this._pf[side]).G);
            this._real[side].at = g.frameCount;
        }
        for (const side of ['left', 'right']) {
            const hand = hands[side];
            if (!hand?.group?.visible || !hand.group.parent) continue;
            const held = this.held[side];
            if (held) {
                // the arm reaches the spoke where the hand holds it (the hand never leaves the arm);
                // a spoke gone out of the arm's reach is let go
                const s = held.ship, H = s.layout.helm;
                const ang = s.wheel + (held.a0 - held.w0);
                s.pose.toWorld(H.x + Math.sin(ang) * H.rimR, H.y + Math.cos(ang) * H.rimR, H.z + 0.05, _o);
                _w.set(_o.x, _o.y, _o.z);
                (side === 'left' ? ch.leftArmAnchor : ch.rightArmAnchor).getWorldPosition(_v);
                if (_v.distanceTo(_w) > ch.BONE_LENGTH_UPPER + ch.BONE_LENGTH_LOWER + 0.55) { this.release(side); continue; }
                ch.reachHand(side, _w, 1, 0.35);
                continue;
            }
            const s = this._wheelNear(ch.getHandWorldPosition(side, _w));
            if (!s) continue;
            const pen = this._penetration(s, hand, _v);
            if (pen <= 0) continue;
            // a free hand against the wheel: the arm stops at it (the hand pushed back with the arm)
            ch.getHandWorldPosition(side, _w).add(_v.clampLength(0, 0.6));
            ch.reachHand(side, _w, 1, 0);
        }
    }

    /** How deep a hand's palm / fingertips are in the wheel (rim, spokes, hub); `push` = the way out (world). */
    _penetration(s, hand, push) {
        const H = s.layout.helm;
        const pts = this._handPoints(hand);
        let best = 0;
        for (const p of pts) {
            this._helmLocal(s, p, _l);
            const r = Math.hypot(_l.x, _l.y);
            if (Math.abs(_l.z) > 0.16 || r > H.handleR + 0.12) continue;
            // on the rim, a spoke or the hub?
            const onRim = Math.abs(r - H.rimR) < 0.14;
            let onSpoke = r < 0.3;
            if (!onSpoke) {
                for (let k = 0; k < H.spokes; k++) {
                    const a = (k / H.spokes) * Math.PI * 2 + s.wheel * -1;
                    const sx = Math.sin(a), sy = Math.cos(a);
                    const along = _l.x * sx + _l.y * sy;
                    if (along > 0 && Math.abs(_l.x * sy - _l.y * sx) < 0.12) { onSpoke = true; break; }
                }
            }
            if (!onRim && !onSpoke) continue;
            const d = 0.16 - Math.abs(_l.z);
            if (d > best) {
                best = d;
                // out along the wheel's axis, to the side the hand is on
                s.pose.dirToWorld(0, _l.z >= 0 ? 1 : -1, _o);
                push.set(_o.x * (d + 0.01), 0, _o.z * (d + 0.01));
            }
        }
        return best;
    }

    _handPoints(hand) {
        const out = this._pts || (this._pts = Array.from({ length: 6 }, () => new THREE.Vector3()));
        hand.palm?.getWorldPosition?.(out[0]);
        let i = 1;
        for (const name of ['thumb', 'index', 'middle', 'ring', 'pinky']) {
            const seg = hand.fingerMeshes?.[name]?.[2];
            if (seg) seg.pivot.localToWorld(out[i].set(0, 0.12, 0));
            else out[i].copy(out[0]);
            i++;
        }
        return out;
    }

    // ------------------------------------------------------------- tests
    /** How far a hand's grip point is from the wheel's rim band. */
    reach(side) {
        const h = this._hand(side);
        if (!h?.G) return Infinity;
        const s = this._wheelNear(h.G);
        if (!s) return Infinity;
        this._helmLocal(s, h.G, _l);
        return rimDist(_l.x, _l.y, _l.z, s.layout.helm.rimR, s.layout.helm.handleR);
    }

    /** Signed distance of a hand's grip point from the wheel's plane (+: towards the helmsman). */
    planeDist(side) {
        const h = this._hand(side);
        if (!h?.G) return Infinity;
        const s = this._wheelNear(h.G);
        if (!s) return Infinity;
        this._helmLocal(s, h.G, _l);
        return _l.z;
    }

    penetration(side) {
        const hand = this.game.character.getActiveHands?.()[side];
        if (!hand) return 0;
        const s = this._wheelNear(this.game.character.getHandWorldPosition(side, _w));
        return s ? this._penetration(s, hand, _v) : 0;
    }
}
