/**
 * Rigging.js — ropes in real hands: the mooring lines and the rope ladders.
 *
 * Mooring lines: a moored ship is tied to the pier's bollards (a loop of rope
 * over the bollard's top). Close the fingers on the loop and lift the hand —
 * the loop comes off and the rope falls, hanging from the ship. A blade swung
 * fast through a rope cuts it. With no line tied the ship is free to drift.
 *
 * Rope ladders hang down both sides at the gangways. Close the fingers on a rung:
 * you hang on it. Pull the holding hand down and the body goes up (the hand stays
 * on the rung); reach up with the other hand and close it on a higher rung —
 * hand over hand, out of the water and over the rail onto the deck. Raise the
 * hands to go down; open both hands to let go.
 *
 * Multiplayer: the host owns the lines ('smoor' asks it; the change comes back as
 * 'shipev' line); a climber is just a player whose place everybody sees.
 */

import * as THREE from 'three';
import { HELM } from './HelmMath.js';
import { hullHalfWidth } from './ShipLayout.js';
import { PLAYER_GROUND_OFFSET } from '../entities/Character.js';
import { WATER_LEVEL_Y } from '../world/Terrain.js';

const EYE_R = 0.55; // m: fingers closing this near the loop take it
const LIFT = 0.6; // m: the hand lifted this much takes the loop off
const RUNG_R = 0.6; // m: fingers closing this near a rung hold it (easy to catch, going down too)
const CLIMB_RATE = 1.5; // m/s at most
const CUT_SPEED = 3.2; // m/s: a blade this fast through a rope cuts it
const _v = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _o = { x: 0, y: 0, z: 0 };
const _l = { x: 0, y: 0, z: 0 };

/** Closest distance between segments p1-q1 and p2-q2 (squared). */
export function segSegDist2(p1, q1, p2, q2) {
    const d1x = q1.x - p1.x, d1y = q1.y - p1.y, d1z = q1.z - p1.z;
    const d2x = q2.x - p2.x, d2y = q2.y - p2.y, d2z = q2.z - p2.z;
    const rx = p1.x - p2.x, ry = p1.y - p2.y, rz = p1.z - p2.z;
    const a = d1x * d1x + d1y * d1y + d1z * d1z, e = d2x * d2x + d2y * d2y + d2z * d2z;
    const f = d2x * rx + d2y * ry + d2z * rz;
    let s, t;
    if (a < 1e-9 && e < 1e-9) { s = t = 0; } else if (a < 1e-9) { s = 0; t = Math.max(0, Math.min(1, f / e)); } else {
        const c = d1x * rx + d1y * ry + d1z * rz;
        if (e < 1e-9) { t = 0; s = Math.max(0, Math.min(1, -c / a)); } else {
            const b = d1x * d2x + d1y * d2y + d1z * d2z, den = a * e - b * b;
            s = den > 1e-9 ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0;
            t = (b * s + f) / e;
            if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); } else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); }
        }
    }
    const x = rx + d1x * s - d2x * t, y = ry + d1y * s - d2y * t, z = rz + d1z * s - d2z * t;
    return x * x + y * y + z * z;
}

/** The rope ladder's rungs (ship-local): the rail's cap on top to climb over. */
export function ladderRungs(L, ld) {
    const out = [];
    for (let y = ld.bottom + 0.4; y <= ld.top + 0.01; y += ld.rung) out.push(y);
    out.push(ld.top + L.rail); // (the bulwark's top: the last hold before stepping aboard)
    return out;
}

export class Rigging {
    constructor(game, ships) {
        this.game = game;
        this.ships = ships;
        this.input = null; // (tests) side → {G, curl}
        this._open = { left: 0, right: 0 };
        this._relT = { left: 0, right: 0 };
        this._pf = { left: {}, right: {} };
        this.eye = { left: null, right: null }; // {ship, i, y0, t}
        this.climb = null; // {ship, ld, holds: {side: {ly}}, ly (feet, local), x, z}
        this._lastTip = new Map();
        this.ropes = new Map(); // ship id → LineSegments
    }

    get climbing() { return !!this.climb; }

    _hand(side) {
        if (this.input) return this.input(side);
        const g = this.game;
        const f = g.weapons.palmFrame(side, this._pf[side]);
        return { G: f.G, curl: g.character.getGripCurl(side) };
    }

    _free(side) {
        const g = this.game;
        return !g.items?.held[side] && !g.weapons?.hands[side]?.held && !g.books?.reading?.handBusy?.(side) && !this.ships.helm.held[side];
    }

    /** The loop of a line over its bollard (world). */
    eyeAt(ln, out) { return out.set(ln.bollard.x, ln.bollard.y + 2, ln.bollard.z); }

    update(dt) {
        const g = this.game;
        this._ropes();
        if (!g.currentPose && !this.input) { this.letGo(); return; }
        if (g.isDeadLocal || g.combat?.dead || g.flight?.active) { this.letGo(); return; }
        const now = performance.now();
        for (const side of ['left', 'right']) {
            const h = this._hand(side);
            if (!h?.G) continue;
            const closed = h.curl >= HELM.CLOSE_CURL;
            if (h.curl < HELM.OPEN_CURL) this._open[side] = now;
            if (h.curl < HELM.RELEASE_CURL) this._relT[side] += dt * 1000; else this._relT[side] = 0;
            const opening = this._relT[side] > HELM.RELEASE_MS;
            // a loop held: lifted off the bollard?
            const e = this.eye[side];
            if (e) {
                if (opening || now - e.t > 4000) { this.eye[side] = null; continue; }
                if (h.G.y - e.y0 > LIFT) { this.eye[side] = null; this._by = g.localId; this.liftLine(e.ship, e.i); this._by = null; }
                continue;
            }
            // a rung held
            const hold = this.climb?.holds[side];
            if (hold) { if (h.curl < 0.2 && this._relT[side] > 400) this._release(side); continue; }
            if (!closed || now - this._open[side] > HELM.CLOSE_WINDOW_MS || !this._free(side)) continue;
            // closing on a loop or a rung
            if (this._grabEye(side, h.G, now)) { this._open[side] = 0; continue; }
            if (this._grabRung(side, h.G)) this._open[side] = 0;
        }
        this._cutByBlade(dt);
    }

    _grabEye(side, G, now) {
        for (const s of this.ships.awake) {
            s.lines.forEach((ln, i) => {
                if (this.eye[side] || ln.state !== 'tied') return;
                if (this.eyeAt(ln, _v).distanceTo(G) > EYE_R) return;
                this.eye[side] = { ship: s, i, y0: G.y, t: now };
            });
            if (this.eye[side]) {
                if (!this._toldEye) { this._toldEye = true; this.game.hud.setVoice('🪢 Петля каната в руке — поднимите руку, чтобы снять её с кнехта', true); }
                return true;
            }
        }
        return false;
    }

    /** (any computer) A line's loop is off its bollard. */
    liftLine(s, i, how = 'lift') {
        const g = this.game;
        if (!this.ships.auth) { g.sync?.net.send({ t: 'smoor', id: s.id, i, how }); return; }
        const ln = s.lines[i];
        if (!ln || ln.state !== 'tied') return;
        ln.state = how === 'cut' ? 'cut' : 'free';
        s.changed = true;
        this.ships._event(s, { k: 'line', i, s: ln.state });
        g.hud.setVoice(how === 'cut' ? '🪢 Канат перерезан!' : (s.lines.every((l) => l.state !== 'tied') ? '⚓ Корабль отвязан — его больше ничто не держит' : '🪢 Петля снята с кнехта'), true);
        const by = this._by;
        if (by && !this.ships.loyalTo(s, by)) this.ships.crew.provoke(s, by, '🏴 Матросы видят, что вы отвязываете их корабль! К бою!');
    }

    /** (host) A guest's hand on a line ('smoor'). */
    applyRemote(m) {
        const s = this.ships.list.get(m.id);
        if (!s || !s.lines[m.i] || !this.ships._near(s, m.from, 60)) return;
        this._by = m.from;
        this.liftLine(s, m.i, m.how === 'cut' ? 'cut' : 'lift');
        this._by = null;
    }

    /** A blade swung fast through a rope cuts it. */
    _cutByBlade(dt) {
        const g = this.game;
        for (const hs of g.weapons?.heldWeapons?.() || []) {
            const w = hs.held;
            if (!w || (w.type !== 'sword' && w.type !== 'axe')) { continue; }
            const tip = w.getTipPosition(_a);
            const last = this._lastTip.get(w);
            this._lastTip.set(w, tip.clone());
            if (!last || !(dt > 0)) continue;
            const speed = tip.distanceTo(last) / dt;
            if (speed < CUT_SPEED) continue;
            w.getBladeSegment(_a, _b);
            for (const s of this.ships.awake) {
                s.lines.forEach((ln, i) => {
                    if (ln.state !== 'tied') return;
                    s.pose.toWorld(ln.bitt.x, ln.bitt.y + 0.8, ln.bitt.z, _o);
                    const P = { x: _o.x, y: _o.y, z: _o.z }, Q = this.eyeAt(ln, _v);
                    // the blade's sweep (from where its tip was) against the rope
                    if (segSegDist2(_a, _b, P, Q) < 0.2 * 0.2 || segSegDist2(last, _b, P, Q) < 0.2 * 0.2) {
                        this._by = g.localId;
                        this.liftLine(s, i, 'cut');
                        this._by = null;
                    }
                });
            }
        }
    }

    // ------------------------------------------------------------ ladders
    _grabRung(side, G) {
        for (const s of this.ships.awake) {
            if (!s.collider.hasXZ(G.x, G.z, 3) || s.flooded) continue;
            s.pose.toLocal(G.x, G.y, G.z, _l);
            for (const ld of s.layout.ladders) {
                const lx = ld.side * (hullHalfWidth(s.layout, ld.z, s.layout.deck) + 0.35);
                if (Math.abs(_l.x - lx) > RUNG_R + 0.3 || Math.abs(_l.z - ld.z) > 0.9) continue;
                let best = null;
                for (const y of ladderRungs(s.layout, ld)) if (Math.abs(_l.y - y) < RUNG_R && (best === null || Math.abs(_l.y - y) < Math.abs(_l.y - best))) best = y;
                if (best === null) continue;
                this._hang(s, ld, side, best);
                return true;
            }
        }
        return false;
    }

    _hang(s, ld, side, ly) {
        const g = this.game, ch = g.character;
        if (!this.climb || this.climb.ship !== s) {
            const p = ch.group.position;
            s.pose.toLocal(p.x, p.y - PLAYER_GROUND_OFFSET, p.z, _l);
            this.climb = { ship: s, ld, holds: {}, ly: _l.y };
            if (!this._told) { this._told = true; g.hud.setVoice('🪜 Вы держитесь за перекладину. Тяните руку вниз — тело поднимается; другой рукой хватайтесь выше', true); }
        }
        this.climb.holds[side] = { ly };
        const hand = ch.getActiveHands?.()[side];
        if (hand?.setGrip) hand.setGrip(0.75);
    }

    _release(side) {
        const c = this.climb;
        if (!c) return;
        delete c.holds[side];
        const hand = this.game.character.getActiveHands?.()[side];
        if (hand?.setGrip) hand.setGrip(null);
        if (!Object.keys(c.holds).length) this.climb = null; // (both hands open: you fall)
    }

    letGo() {
        for (const side of ['left', 'right']) { if (this.climb?.holds[side]) this._release(side); this.eye[side] = null; }
        this.climb = null;
    }

    /**
     * After the player has moved this frame: on a ladder the body hangs where the hands hold —
     * the holding hand pulled down lifts it, raised lowers it. At the top: over the rail onto the deck.
     */
    updateBody(dt) {
        const c = this.climb;
        if (!c) return;
        const g = this.game, ch = g.character, s = c.ship, L = s.layout;
        if (!s.awake || s.flooded) { this.letGo(); return; }
        let err = 0, n = 0;
        for (const side of Object.keys(c.holds)) {
            const h = this._hand(side);
            if (!h?.G) continue;
            s.pose.toLocal(h.G.x, h.G.y, h.G.z, _l);
            err += _l.y - c.holds[side].ly;
            n++;
        }
        if (n) {
            err /= n;
            const step = Math.max(-CLIMB_RATE * dt, Math.min(CLIMB_RATE * dt, -err));
            c.ly = Math.max(-4, Math.min(L.deck + 0.5, c.ly + step));
        }
        // over the rail: the feet are up at the deck — step aboard
        if (c.ly > L.deck - 0.6) {
            const ld = c.ld;
            s.pose.toWorld(ld.side * (hullHalfWidth(L, ld.z, L.deck) - 1.6), L.deck + PLAYER_GROUND_OFFSET, ld.z, _o);
            ch.group.position.set(_o.x, _o.y, _o.z);
            s.collider.forget(ch.group.position);
            ch.verticalVelocity = 0;
            this.letGo();
            g.hud.setVoice('🪜 Вы на палубе', true);
            return;
        }
        // hanging on the ladder, close to the hull
        const x = c.ld.side * (hullHalfWidth(L, c.ld.z, Math.max(0, Math.min(L.deck, c.ly + 1))) + 0.95);
        s.pose.toWorld(x, c.ly + PLAYER_GROUND_OFFSET, c.ld.z, _o);
        ch.group.position.set(_o.x, _o.y, _o.z);
        ch.verticalVelocity = 0;
        ch.swimY = null;
        s.collider._side.set(ch.group.position, 'out'); // (outside the bulwark: never pulled in through the hull)
        // the drawn hands on their rungs
        if (this.input) return;
        const hands = ch.getActiveHands?.();
        for (const side of Object.keys(c.holds)) {
            const hand = hands?.[side];
            if (!hand?.group?.visible || !hand.group.parent) continue;
            const lx = c.ld.side * (hullHalfWidth(L, c.ld.z, L.deck) + 0.35);
            s.pose.toWorld(lx, c.holds[side].ly, c.ld.z + (side === 'left' ? -0.35 : 0.35), _o);
            ch.reachHand(side, _v.set(_o.x, _o.y, _o.z), 1, 0.35); // (the arm reaches the rung: the hand stays on the arm)
        }
    }

    /** Where the climber's feet are (ship-local y), for tests. */
    get feetLy() { return this.climb ? this.climb.ly : null; }

    // ------------------------------------------------------------ the ropes drawn
    _ropes() {
        const g = this.game;
        for (const [id, m] of this.ropes) {
            const s = this.ships.list.get(id);
            if (!s || !s.awake) { g.scene.remove(m); m.geometry.dispose(); this.ropes.delete(id); }
        }
        for (const s of this.ships.awake) {
            if (!s.lines.length) continue;
            let m = this.ropes.get(s.id);
            if (!m) {
                m = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0x5b4630 }));
                m.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(s.lines.length * 8 * 6), 3));
                m.frustumCulled = false;
                g.scene.add(m);
                this.ropes.set(s.id, m);
            }
            const arr = m.geometry.attributes.position.array;
            let k = 0;
            for (const ln of s.lines) {
                s.pose.toWorld(ln.bitt.x, ln.bitt.y + 0.8, ln.bitt.z, _o);
                const ax = _o.x, ay = _o.y, az = _o.z;
                let bx, by, bz, sag;
                if (ln.state === 'tied') { this.eyeAt(ln, _v); bx = _v.x; by = _v.y; bz = _v.z; sag = 0.6 + Math.max(0, 1.5 - (ln.strain || 0) * 20); }
                else {
                    // hanging down the ship's side into the water
                    s.pose.toWorld(ln.bitt.x + (ln.bollard.x > s.st.x ? 1 : -1) * 0.5, WATER_LEVEL_Y - 0.5, ln.bitt.z, _o);
                    bx = _o.x; by = _o.y; bz = _o.z; sag = 0.3;
                }
                for (let i = 0; i < 8; i++) {
                    for (const t of [i / 8, (i + 1) / 8]) {
                        arr[k++] = ax + (bx - ax) * t;
                        arr[k++] = ay + (by - ay) * t - sag * 4 * t * (1 - t);
                        arr[k++] = az + (bz - az) * t;
                    }
                }
            }
            m.geometry.attributes.position.needsUpdate = true;
        }
    }

    dispose() {
        for (const m of this.ropes.values()) { this.game.scene.remove(m); m.geometry.dispose(); }
        this.ropes.clear();
    }
}
