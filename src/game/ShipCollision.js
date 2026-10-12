/**
 * ShipCollision.js — a ship as a moving piece of the world (pure, Node-testable).
 *
 * The world's collision (src/world/Collision.js) is static and axis-aligned; a
 * ship moves and turns. So a ship is a "mover": CollisionWorld asks every mover
 * for the floor under a point (decks, stairs), to push bodies out of it (the
 * bulwark rails, masts, bulkheads, the wheel, guns, chests…), whether a point is
 * inside it (blasts, cannonballs, line of sight) and for contacts of blades.
 * Everything is done in ship-local coordinates (see ShipLayout.js).
 */

import { floorAt, floorObjAt, insideHull, hullHalfWidth, keelY } from './ShipLayout.js';

/** World ⇄ ship-local. roll > 0: the starboard side up; pitch > 0: the bow up. */
export class ShipPose {
    constructor() { this.set(0, 0, 0, 0); }

    set(x, y, z, yaw, roll = 0, pitch = 0) {
        this.x = x; this.y = y; this.z = z; this.yaw = yaw; this.roll = roll; this.pitch = pitch;
        this._c = Math.cos(yaw); this._s = Math.sin(yaw);
        this._sr = Math.sin(roll); this._sp = Math.sin(pitch);
        return this;
    }

    copy(p) { return this.set(p.x, p.y, p.z, p.yaw, p.roll, p.pitch); }

    toWorld(lx, ly, lz, out) {
        out.x = this.x + lx * this._c + lz * this._s;
        out.z = this.z - lx * this._s + lz * this._c;
        out.y = this.y + ly + lx * this._sr - lz * this._sp;
        return out;
    }

    toLocal(wx, wy, wz, out) {
        const dx = wx - this.x, dz = wz - this.z;
        out.x = dx * this._c - dz * this._s;
        out.z = dx * this._s + dz * this._c;
        out.y = wy - this.y - out.x * this._sr + out.z * this._sp;
        return out;
    }

    /** A world direction into the ship frame (yaw only). */
    dirToLocal(dx, dz, out) {
        out.x = dx * this._c - dz * this._s;
        out.z = dx * this._s + dz * this._c;
        return out;
    }

    /** A ship-local direction into the world (yaw only). */
    dirToWorld(lx, lz, out) {
        out.x = lx * this._c + lz * this._s;
        out.z = -lx * this._s + lz * this._c;
        return out;
    }
}

const _l = { x: 0, y: 0, z: 0 };
const _w = { x: 0, y: 0, z: 0 };

/** Push a circle out of an axis-aligned rectangle (ship-local xz). */
function pushOut(p, r, x0, x1, z0, z1) {
    const cx = p.x < x0 ? x0 : p.x > x1 ? x1 : p.x;
    const cz = p.z < z0 ? z0 : p.z > z1 ? z1 : p.z;
    const dx = p.x - cx, dz = p.z - cz;
    const d2 = dx * dx + dz * dz;
    if (d2 >= r * r) return false;
    if (d2 > 1e-10) {
        const d = Math.sqrt(d2);
        p.x += (dx / d) * (r - d);
        p.z += (dz / d) * (r - d);
        return true;
    }
    const left = p.x - x0, right = x1 - p.x, back = p.z - z0, front = z1 - p.z;
    const m = Math.min(left, right, back, front);
    if (m === left) p.x = x0 - r; else if (m === right) p.x = x1 + r; else if (m === back) p.z = z0 - r; else p.z = z1 + r;
    return true;
}

export class ShipCollider {
    constructor(layout) {
        this.L = layout;
        this.pose = new ShipPose();
        this.aabb = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
        this.flooded = false;
        this.enabled = true;
        this.gangwayOpen = false;
        this._side = new WeakMap(); // body position object → 'in' | 'out' (no tunnelling through the rail)
        // the bow and stern ends at deck level where a body still fits
        this._ends = new Map();
    }

    setPose(p) {
        this.pose.copy(p);
        const L = this.L, h = L.L / 2 + 2, b = L.B / 2 + 2;
        const c = Math.abs(this.pose._c), s = Math.abs(this.pose._s);
        const ex = b * c + h * s, ez = b * s + h * c;
        this.aabb.minX = p.x - ex; this.aabb.maxX = p.x + ex;
        this.aabb.minZ = p.z - ez; this.aabb.maxZ = p.z + ez;
    }

    hasXZ(x, z, pad = 0) {
        const a = this.aabb;
        return this.enabled && x >= a.minX - pad && x <= a.maxX + pad && z >= a.minZ - pad && z <= a.maxZ + pad;
    }

    /** The highest deck/stair under (x, z) that a body reaching up to reachY can stand on (world y), or null. */
    floorAt(x, z, reachY) {
        const l = this.pose.toLocal(x, reachY, z, _l);
        const f = floorAt(this.L, l.x, l.z, l.y);
        if (f === null) return null;
        return this.pose.toWorld(l.x, f, l.z, _w).y;
    }

    insideHull(x, z) {
        const l = this.pose.toLocal(x, 0, z, _l);
        return insideHull(this.L, l.x, l.z);
    }

    /** How far inboard a body of radius r may go at lz on a deck at height y (the rail's inner face). */
    _railX(lz, y, r) {
        return hullHalfWidth(this.L, lz, Math.max(0.2, y)) - 0.4 - r;
    }

    _endZ(r) {
        let e = this._ends.get(r);
        if (!e) {
            const L = this.L;
            let a = -L.L / 2, b = L.L / 2;
            while (a < b && this._railX(a, L.deck, r) < 0.3) a += 0.1;
            while (b > a && this._railX(b, L.deck, r) < 0.3) b -= 0.1;
            e = [a, b];
            this._ends.set(r, e);
        }
        return e;
    }

    _inOpening(lz, ly) {
        const L = this.L;
        // the gangway's gap in the rail is open only while the gangplank lies there (else a rope across it)
        if (!this.gangwayOpen || Math.abs(ly - L.deck) > 0.8) return false;
        for (const o of L.openings) if (lz > o.z0 && lz < o.z1) return true;
        return false;
    }

    /**
     * Push a standing body (a vertical cylinder) out of the ship: inside, it stays inside the
     * bulwarks (except through a gangway, or with the feet above the rail); outside (a swimmer,
     * somebody on the pier), it stays out of the hull. Then masts, bulkheads, the wheel, guns…
     * Mutates pos (world). Returns true if it moved the body.
     */
    pushCylinder(pos, r, feetY, h) {
        if (!this.enabled) return false;
        const L = this.L, P = this.pose;
        const l = P.toLocal(pos.x, feetY, pos.z, _l);
        const ox = l.x, oz = l.z;
        const half = hullHalfWidth(L, l.z, Math.max(0.2, Math.min(l.y, L.deck)));
        const railTop = L.railTopAt(l.z);
        let side = this._side.get(pos);
        if (!side) {
            side = (Math.abs(l.x) < half && l.z > -L.L / 2 && l.z < L.L / 2 && l.y > keelY(L, l.z) - 0.5 && l.y < railTop) ? 'in' : 'out';
        }
        if (side === 'in') {
            if (l.y < railTop - 0.05 && l.y > keelY(L, l.z) - 1 && !this._inOpening(l.z, l.y)) {
                const fl = floorObjAt(L, l.x, l.z, l.y + 1.1);
                const wx = this._railX(l.z, fl ? fl.y : l.y, r);
                if (l.x > wx) l.x = wx; else if (l.x < -wx) l.x = -wx;
                const [e0, e1] = this._endZ(r);
                if (l.z < e0) l.z = e0; else if (l.z > e1) l.z = e1;
                // the ends of the lower deck, the stern under the quarterdeck / poop, the bow under the forecastle
                if (fl && Math.abs(l.y - fl.y) < 1.2) {
                    if (fl.id === 'lower') l.z = Math.max(fl.z0 + r, Math.min(fl.z1 - r, l.z));
                    else if (fl.id === 'quarter' || fl.id === 'poop') l.z = Math.min(fl.z1 - r, l.z);
                    else if (fl.id === 'fore') l.z = Math.max(fl.z0 + r, l.z);
                }
            }
            // out through the gangway (or over the rail from above)
            if (Math.abs(l.x) > hullHalfWidth(L, l.z, L.deck) + 0.05 || l.z < -L.L / 2 || l.z > L.L / 2) side = 'out';
        } else {
            const keel = keelY(L, l.z);
            if (l.y < railTop - 0.05 && l.y + h > keel && !this._inOpening(l.z, l.y)) {
                // keep out of the shell (+r), round its outline
                const hwb = hullHalfWidth(L, l.z, Math.max(keel + 0.01, Math.min(l.y + Math.min(h, 3), L.deck)));
                const hwm = Math.max(hwb, hullHalfWidth(L, l.z, Math.max(0, Math.min(l.y, L.deck))));
                if (Math.abs(l.x) < hwm + r && l.z > -L.L / 2 - r && l.z < L.L / 2 + r) {
                    const toSide = hwm + r - Math.abs(l.x);
                    const toBow = l.z + L.L / 2 + r, toStern = L.L / 2 + r - l.z;
                    if (toSide <= toBow && toSide <= toStern) l.x = (l.x >= 0 ? 1 : -1) * (hwm + r);
                    else if (toBow < toStern) l.z = -L.L / 2 - r; else l.z = L.L / 2 + r;
                }
            }
            // in through the gangway, or landing on a deck from above (a jump, Leviosa let go)
            if (Math.abs(l.x) < hullHalfWidth(L, l.z, L.deck) - 0.6 && l.y > L.deck - 1.2 && floorAt(L, l.x, l.z, l.y + 1.1) !== null) side = 'in';
        }
        this._side.set(pos, side);
        // masts, bulkheads, the wheel, guns, chests, the stairs' undersides (a step of 0.6 is climbed)
        const S = L.solids;
        const top = l.y + h;
        for (let pass = 0; pass < 2; pass++) {
            let moved = false;
            for (let i = 0; i < S.length; i++) {
                const b = S[i];
                if (b.y1 <= l.y + 0.6 || b.y0 >= top) continue;
                if (pushOut(l, r, b.x0, b.x1, b.z0, b.z1)) moved = true;
            }
            if (!moved) break;
        }
        if (l.x === ox && l.z === oz) return false;
        P.toWorld(l.x, l.y, l.z, _w);
        pos.x = _w.x; pos.z = _w.z;
        return true;
    }

    /** Forget which side of the rail a body was on (teleports, respawn). */
    forget(pos) { this._side.delete(pos); }

    /** Is a world point inside the ship's solid parts (the shell, the closed hold, decks, masts…)? */
    pointBlocked(x, y, z) {
        if (!this.enabled) return false;
        const L = this.L;
        const l = this.pose.toLocal(x, y, z, _l);
        if (l.z < -L.L / 2 - 0.5 || l.z > L.L / 2 + 0.5) return false;
        const keel = keelY(L, l.z);
        if (l.y < keel) return false;
        const top = L.railTopAt(l.z);
        if (l.y > top + 0.05) {
            for (const b of L.solids) if (b.kind !== 'helmspace' && l.x >= b.x0 && l.x <= b.x1 && l.y >= b.y0 && l.y <= b.y1 && l.z >= b.z0 && l.z <= b.z1) return true;
            return false;
        }
        const half = hullHalfWidth(L, l.z, Math.max(keel + 0.01, Math.min(l.y, L.deck)));
        const ax = Math.abs(l.x);
        if (ax > half) return false;
        if (ax > half - 0.4 && !(this._inOpening(l.z, l.y) && l.y > L.deck)) return true; // the shell / bulwark
        // decks as slabs; below the lowest deck: the closed hold
        const lowest = L.floors.reduce((m, f) => Math.min(m, f.y), Infinity);
        if (l.y < lowest - 0.4 && !this.flooded) return true;
        for (const f of L.floors) if (l.y <= f.y && l.y >= f.y - 0.4 && floorAt(L, l.x, l.z, f.y) === f.y) return true;
        for (const b of L.solids) if (b.kind !== 'helmspace' && l.x >= b.x0 && l.x <= b.x1 && l.y >= b.y0 && l.y <= b.y1 && l.z >= b.z0 && l.z <= b.z1) return true;
        return false;
    }

    /** Is a world point in the dry inside of a floating hull (no swimming, no drowning there)? */
    dryAt(x, y, z) {
        if (!this.enabled || this.flooded) return false;
        const L = this.L;
        const l = this.pose.toLocal(x, y, z, _l);
        if (Math.abs(l.x) > hullHalfWidth(L, l.z, L.deck) - 0.3) return false;
        return l.y > keelY(L, l.z) + 0.3 && l.y < L.railTopAt(l.z);
    }

    /**
     * A blade / fist sphere against decks and solids: penetration depth and the world normal
     * (or 0). Used by Weapon.contactAgainstWorld.
     */
    sphereDepth(p, r, n) {
        if (!this.enabled) return 0;
        const L = this.L, P = this.pose;
        const l = P.toLocal(p.x, p.y, p.z, _l);
        if (l.z < -L.L / 2 - r || l.z > L.L / 2 + r) return 0;
        let best = 0, nx = 0, ny = 0, nz = 0;
        // decks (slabs): from above
        const f = floorAt(L, l.x, l.z, l.y + r);
        if (f !== null) {
            const d = f + r - l.y;
            if (d > best && d < r * 2 + 0.2) { best = d; nx = 0; ny = 1; nz = 0; }
        }
        for (const b of L.solids) {
            if (b.kind === 'helmspace') continue; // (room for the body only: hands and blades pass)
            if (l.x < b.x0 - r || l.x > b.x1 + r || l.y < b.y0 - r || l.y > b.y1 + r || l.z < b.z0 - r || l.z > b.z1 + r) continue;
            const cx = Math.max(b.x0, Math.min(b.x1, l.x)), cy = Math.max(b.y0, Math.min(b.y1, l.y)), cz = Math.max(b.z0, Math.min(b.z1, l.z));
            const dx = l.x - cx, dy = l.y - cy, dz = l.z - cz;
            const dd = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dd >= r) continue;
            let d, ax, ay, az;
            if (dd > 1e-6) { d = r - dd; ax = dx / dd; ay = dy / dd; az = dz / dd; }
            else {
                const o = [[l.x - b.x0, -1, 0, 0], [b.x1 - l.x, 1, 0, 0], [l.y - b.y0, 0, -1, 0], [b.y1 - l.y, 0, 1, 0], [l.z - b.z0, 0, 0, -1], [b.z1 - l.z, 0, 0, 1]].sort((p2, q) => p2[0] - q[0])[0];
                d = o[0] + r; ax = o[1]; ay = o[2]; az = o[3];
            }
            if (d > best) { best = d; nx = ax; ny = ay; nz = az; }
        }
        // the bulwark from inside
        const top = L.railTopAt(l.z);
        if (l.y < top && l.y > L.deck - 0.5) {
            const half = hullHalfWidth(L, l.z, L.deck) - 0.4;
            const out = Math.abs(l.x) + r - half;
            if (out > 0 && Math.abs(l.x) < half + 0.4 && out > best && !this._inOpening(l.z, l.y)) { best = out; nx = l.x > 0 ? -1 : 1; ny = 0; nz = 0; }
        }
        if (best <= 0) return 0;
        if (n) { P.dirToWorld(nx, nz, _w); n.x = _w.x; n.y = ny; n.z = _w.z; }
        return best;
    }
}

/**
 * The gangplank from the pier to the gangway: a walkable ramp between two world points,
 * 2.4 m wide. Nothing is pushed by it.
 */
export class PlankCollider {
    constructor() {
        this.a = { x: 0, y: 0, z: 0 };
        this.b = { x: 0, y: 0, z: 0 };
        this.half = 1.2;
        this.enabled = true;
    }

    set(a, b) {
        this.a.x = a.x; this.a.y = a.y; this.a.z = a.z;
        this.b.x = b.x; this.b.y = b.y; this.b.z = b.z;
    }

    get length() { return Math.hypot(this.b.x - this.a.x, this.b.y - this.a.y, this.b.z - this.a.z); }

    _t(x, z) {
        const dx = this.b.x - this.a.x, dz = this.b.z - this.a.z;
        const L2 = dx * dx + dz * dz;
        if (L2 < 1e-6) return null;
        const t = ((x - this.a.x) * dx + (z - this.a.z) * dz) / L2;
        if (t < -0.02 || t > 1.02) return null;
        const px = this.a.x + dx * t, pz = this.a.z + dz * t;
        if (Math.hypot(x - px, z - pz) > this.half) return null;
        return Math.max(0, Math.min(1, t));
    }

    hasXZ(x, z) {
        if (!this.enabled) return false;
        return x >= Math.min(this.a.x, this.b.x) - 1.5 && x <= Math.max(this.a.x, this.b.x) + 1.5 && z >= Math.min(this.a.z, this.b.z) - 1.5 && z <= Math.max(this.a.z, this.b.z) + 1.5;
    }

    floorAt(x, z, reachY) {
        const t = this._t(x, z);
        if (t === null) return null;
        const y = this.a.y + (this.b.y - this.a.y) * t + 0.15;
        return y <= reachY + 1e-6 ? y : null;
    }

    pushCylinder() { return false; }
    pointBlocked() { return false; }
    sphereDepth(p, r, n) {
        const t = this._t(p.x, p.z);
        if (t === null) return 0;
        const y = this.a.y + (this.b.y - this.a.y) * t + 0.15;
        const d = y + r - p.y;
        if (d <= 0 || d > r * 2) return 0;
        if (n) { n.x = 0; n.y = 1; n.z = 0; }
        return d;
    }
}
