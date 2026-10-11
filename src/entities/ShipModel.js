/**
 * ShipModel.js — how a 17th-century ship looks (three.js).
 *
 * Built from the ship's layout (src/game/ShipLayout.js), in ship-local metres:
 * the hull lofted from the hull shape (dark bottom, wales, a band in the castle's
 * colour at the gun ports, gold at the stern), the bulwarks with the gangway gaps,
 * the sterncastle and the forecastle, plank decks, bulkheads with doors, stairs,
 * the masts with yards, shrouds and ratlines, sails that unroll from the yards and
 * bulge with the wind, the wheel, the capstan, the guns and their shot racks,
 * the captain's cabin (table, chairs, lantern), hammocks and barrels below,
 * stern windows that glow at night, flags, the gangplank and the rope ladders.
 * The static parts are merged into a few meshes (few draw calls).
 */

import * as THREE from 'three';
import { hullHalfWidth, keelY } from '../game/ShipLayout.js';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _c = new THREE.Color();
const _e = new THREE.Euler();

/** Many coloured primitives merged into one geometry (vertex colours). */
class Batch {
    constructor() { this.pos = []; this.nor = []; this.col = []; }

    add(geo, matrix, color) {
        const g = geo.index ? geo.toNonIndexed() : geo;
        const p = g.attributes.position, n = g.attributes.normal;
        const nm = new THREE.Matrix3().getNormalMatrix(matrix);
        _c.set(color);
        const v = new THREE.Vector3();
        for (let i = 0; i < p.count; i++) {
            v.fromBufferAttribute(p, i).applyMatrix4(matrix);
            this.pos.push(v.x, v.y, v.z);
            v.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
            this.nor.push(v.x, v.y, v.z);
            this.col.push(_c.r, _c.g, _c.b);
        }
        if (g !== geo) g.dispose();
    }

    box(x0, x1, y0, y1, z0, z1, color, rotY = 0) {
        const g = new THREE.BoxGeometry(Math.max(0.01, x1 - x0), Math.max(0.01, y1 - y0), Math.max(0.01, z1 - z0));
        _m.makeRotationY(rotY).setPosition((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
        this.add(g, _m, color);
        g.dispose();
    }

    /** A box of size (sx, sy, sz) at p turned by the Euler angles. */
    boxAt(px, py, pz, sx, sy, sz, color, rx = 0, ry = 0, rz = 0) {
        const g = new THREE.BoxGeometry(sx, sy, sz);
        _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ'));
        _m.compose(_p.set(px, py, pz), _q, _s.set(1, 1, 1));
        this.add(g, _m, color);
        g.dispose();
    }

    cyl(r0, r1, len, px, py, pz, color, rx = 0, ry = 0, rz = 0, seg = 8) {
        const g = new THREE.CylinderGeometry(r1, r0, len, seg);
        _q.setFromEuler(_e.set(rx, ry, rz, 'YXZ'));
        _m.compose(_p.set(px, py, pz), _q, _s.set(1, 1, 1));
        this.add(g, _m, color);
        g.dispose();
    }

    /** Raw triangles (already in local space): flat list of [x,y,z] triples, with a colour per triangle. */
    tri(a, b, c, color) {
        _c.set(color);
        const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
        const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
        let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        const l = Math.hypot(nx, ny, nz) || 1;
        nx /= l; ny /= l; nz /= l;
        for (const p of [a, b, c]) { this.pos.push(p[0], p[1], p[2]); this.nor.push(nx, ny, nz); this.col.push(_c.r, _c.g, _c.b); }
    }

    quad(a, b, c, d, color) { this.tri(a, b, c, color); this.tri(a, c, d, color); }

    build() {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
        g.computeBoundingSphere();
        return g;
    }
}

let SHARED = null;
function shared() {
    if (SHARED) return SHARED;
    // plank deck texture
    const cv = typeof document !== 'undefined' ? document.createElement('canvas') : null;
    let deckTex = null;
    if (cv) {
        cv.width = 64; cv.height = 256;
        const x = cv.getContext('2d');
        x.fillStyle = '#b48a55'; x.fillRect(0, 0, 64, 256);
        for (let i = 0; i < 8; i++) {
            x.fillStyle = i % 2 ? '#a77f4c' : '#bc935d';
            x.fillRect(i * 8, 0, 8, 256);
            x.fillStyle = '#6b4a2a'; x.fillRect(i * 8, 0, 1, 256);
            x.fillRect(i * 8, ((i * 97) % 256), 8, 1);
        }
        deckTex = new THREE.CanvasTexture(cv);
        deckTex.wrapS = deckTex.wrapT = THREE.RepeatWrapping;
    }
    SHARED = {
        solid: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
        deck: new THREE.MeshLambertMaterial({ map: deckTex, color: deckTex ? 0xffffff : 0xb48a55, side: THREE.DoubleSide }),
        sail: new THREE.MeshLambertMaterial({ color: 0xf1e8d2, side: THREE.DoubleSide, vertexColors: true }),
        rope: new THREE.LineBasicMaterial({ color: 0x3a2a1a }),
        glass: new THREE.MeshBasicMaterial({ color: 0x2a2416 }),
        lit: new THREE.MeshBasicMaterial({ color: 0xffc860 }),
        iron: new THREE.MeshLambertMaterial({ color: 0x2b2b2e }),
        ball: new THREE.SphereGeometry(0.32, 10, 8),
    };
    SHARED.solid.userData.shared = true;
    return SHARED;
}

const WOOD = 0x8a5a33, DARK = 0x4a3020, BOTTOM = 0x5a3b2a, WALE = 0x2b1d14, GOLD = 0xd4a63a, IRON = 0x2f2f33, ROPE = 0x5b4630;

/**
 * A sail: a cloth hanging from its yard. It unrolls downwards (a bundle at its lower
 * edge while it is being let down), bulges to the wind's side, flutters when the
 * wind is too weak to fill it, burns from the bottom up.
 */
export class SailMesh {
    constructor(spec, color = 0xf1e8d2) {
        this.spec = spec;
        const lateen = spec.kind === 'lateen';
        this.lateen = lateen;
        this.cols = 10; this.rows = 8;
        const g = new THREE.BufferGeometry();
        const n = (this.cols + 1) * (this.rows + 1);
        this.posArr = new Float32Array(n * 3);
        this.colArr = new Float32Array(n * 3);
        const idx = [];
        for (let j = 0; j < this.rows; j++) {
            for (let i = 0; i < this.cols; i++) {
                const a = j * (this.cols + 1) + i, b = a + 1, c = a + this.cols + 1, d = c + 1;
                idx.push(a, c, b, b, c, d);
            }
        }
        g.setIndex(idx);
        g.setAttribute('position', new THREE.BufferAttribute(this.posArr, 3));
        g.setAttribute('color', new THREE.BufferAttribute(this.colArr, 3));
        this.geometry = g;
        this.mesh = new THREE.Mesh(g, shared().sail);
        this.mesh.castShadow = true;
        this.base = new THREE.Color(color);
        // the rolled-up bundle along the yard
        const len = lateen ? spec.w : spec.w * 0.92;
        this.bundle = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, len, 8), new THREE.MeshLambertMaterial({ color: 0xe0d5bb }));
        this.bundle.rotation.z = Math.PI / 2;
        if (lateen) this.bundle.rotation.set(0, Math.PI / 2, 0);
        this.group = new THREE.Group();
        this.group.add(this.mesh, this.bundle);
        this.maxBulge = 0;
        if (lateen) this.setYard({ x: 0, y: spec.yardY, z: spec.center.z - spec.w / 2 }, { x: 0, y: spec.yardY, z: spec.center.z + spec.w / 2 }, { x: 0, y: spec.yardY - spec.h, z: spec.center.z });
        this.setState(0, 0, 1, 0, 0);
    }

    /** Where a point of the cloth is (u across 0..1, v down 0..1), before bulging. */
    _at(u, v, out) {
        const s = this.spec;
        if (!this.lateen) {
            out.x = (u - 0.5) * s.w * (1 - 0.08 * v);
            out.y = s.yardY - v * s.h;
            out.z = s.center.z;
            return out;
        }
        // lateen: the top edge along the slanting yard, the cloth narrowing to the clew
        const a = this.yardA, b = this.yardB, c = this.clew;
        const tx = a.x + (b.x - a.x) * u, ty = a.y + (b.y - a.y) * u, tz = a.z + (b.z - a.z) * u;
        out.x = tx + (c.x - tx) * v; out.y = ty + (c.y - ty) * v; out.z = tz + (c.z - tz) * v;
        return out;
    }

    setYard(a, b, clew) { this.yardA = a; this.yardB = b; this.clew = clew; }

    /**
     * unfurl 0..1 (how far it is let down), fill 0..1 (how full of wind), side ±1 (which way the
     * wind pushes it, along the sail's normal), burnt 0..1, t (s) for the flutter.
     */
    setState(unfurl, fill, side, burnt, t) {
        const s = this.spec;
        const vis = Math.max(0, unfurl * (1 - burnt));
        this.mesh.visible = vis > 0.02 && burnt < 1;
        const nx = s.normal.x, nz = s.normal.z;
        const p = { x: 0, y: 0, z: 0 };
        let maxB = 0;
        const flutter = fill > 0.02 && fill < 0.2 ? 0.3 : (fill <= 0.02 && vis > 0.3 ? 0.12 : 0);
        for (let j = 0; j <= this.rows; j++) {
            const v = (j / this.rows) * Math.max(0.02, vis);
            const char = burnt > 0 && j >= this.rows - 1 ? 0.25 : 1;
            for (let i = 0; i <= this.cols; i++) {
                const u = i / this.cols;
                this._at(u, v, p);
                const across = 1 - (2 * u - 1) * (2 * u - 1);
                let b = side * fill * 0.18 * s.w * across * Math.sin(Math.PI * Math.min(1, (v / Math.max(0.05, vis)) * 1.15)) * Math.min(1, vis * 1.5);
                if (this.lateen) b = side * fill * 0.16 * s.h * across * Math.sin(Math.PI * Math.min(1, v * 1.1));
                if (flutter) b += flutter * Math.sin(10 * t + 6 * u + j) * u * (this.lateen ? 1 : 1) * Math.min(1, vis);
                const k = (j * (this.cols + 1) + i) * 3;
                this.posArr[k] = p.x + nx * b; this.posArr[k + 1] = p.y; this.posArr[k + 2] = p.z + nz * b;
                if (Math.abs(b) > Math.abs(maxB)) maxB = b;
                const shade = 0.9 + 0.1 * across;
                this.colArr[k] = this.base.r * shade * char; this.colArr[k + 1] = this.base.g * shade * char; this.colArr[k + 2] = this.base.b * shade * char;
            }
        }
        this.maxBulge = maxB;
        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.color.needsUpdate = true;
        this.geometry.computeVertexNormals();
        this.geometry.computeBoundingSphere();
        this.geometry.computeBoundingBox();
        // the bundle: thick when rolled up, at the cloth's lower edge
        const r = burnt >= 1 ? 0 : Math.max(0, (1 - unfurl) * Math.min(1.1, s.h * 0.07) + (unfurl < 0.98 ? 0.12 : 0));
        this.bundle.visible = r > 0.05;
        if (this.bundle.visible) {
            this.bundle.scale.set(r, 1, r);
            if (!this.lateen) this.bundle.position.set(0, s.yardY - vis * s.h - (vis > 0.02 ? 0 : 0.3), s.center.z);
            else {
                const a = this.yardA, b = this.yardB;
                this.bundle.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 - 0.4, (a.z + b.z) / 2);
                this.bundle.rotation.set(Math.atan2(b.y - a.y, b.z - a.z) * -1 + 0, 0, 0);
                this.bundle.rotation.x = Math.PI / 2 - Math.atan2(b.y - a.y, b.z - a.z);
            }
        }
    }

    /** Height of the visible cloth (for tests). */
    clothHeight() {
        this.geometry.computeBoundingBox();
        const bb = this.geometry.boundingBox;
        return this.mesh.visible ? bb.max.y - bb.min.y : 0;
    }

    dispose() {
        this.geometry.dispose();
        this.bundle.geometry.dispose();
        this.bundle.material.dispose();
    }
}

export class ShipModel {
    /**
     * @param {object} layout  ShipLayout
     * @param {object} opts {color: castle colour, name}
     */
    constructor(layout, opts = {}) {
        this.L = layout;
        this.color = opts.color ?? 0x2a5aa0;
        this.group = new THREE.Group();
        this.group.rotation.order = 'YXZ';
        this.near = new THREE.Group(); // rigging, interior, guns: hidden far away
        this.group.add(this.near);
        this.sails = new Map();
        this.cannons = new Map();
        this.racks = new Map();
        this._build();
        this.detail = 2;
    }

    _build() {
        const L = this.L, S = shared();
        const hw = (z, y) => hullHalfWidth(L, z, y);
        const hull = new Batch();
        const near = new Batch();
        const D = L.deck, R = L.rail;
        // ------------------------------------------------------ hull loft
        const NZ = 34, NY = 12;
        const zs = [];
        for (let i = 0; i <= NZ; i++) zs.push(-L.L / 2 + 0.05 + (L.L - 0.1) * (i / NZ));
        const ring = (z) => {
            const pts = [];
            const k = keelY(L, z);
            for (let j = 0; j <= NY; j++) {
                const y = k + (D - k) * (j / NY);
                pts.push([hw(z, y), y]);
            }
            return pts;
        };
        const colorAt = (y) => {
            if (y < 0.3) return BOTTOM;
            if (Math.abs(y - 1.5) < 0.35 || Math.abs(y - (D - 1)) < 0.3) return WALE;
            if (y > D - 2.6 && y < D - 1.3) return this.color;
            return WOOD;
        };
        const rings = zs.map(ring);
        for (let i = 0; i < NZ; i++) {
            const a = rings[i], b = rings[i + 1], za = zs[i], zb = zs[i + 1];
            for (let j = 0; j < NY; j++) {
                const col = colorAt((a[j][1] + a[j + 1][1]) / 2);
                for (const s of [1, -1]) {
                    const p1 = [s * a[j][0], a[j][1], za], p2 = [s * b[j][0], b[j][1], zb], p3 = [s * b[j + 1][0], b[j + 1][1], zb], p4 = [s * a[j + 1][0], a[j + 1][1], za];
                    if (s > 0) hull.quad(p1, p2, p3, p4, col); else hull.quad(p1, p4, p3, p2, col);
                }
            }
        }
        // transom (flat stern) with the gold trim and the windows
        const zt = zs[NZ];
        const tr = rings[NZ];
        for (let j = 0; j < NY; j++) hull.quad([-tr[j][0], tr[j][1], zt], [tr[j][0], tr[j][1], zt], [tr[j + 1][0], tr[j + 1][1], zt], [-tr[j + 1][0], tr[j + 1][1], zt], j > NY - 3 ? GOLD : DARK);
        // ------------------------------------------------- bulwarks (with the gangway gaps)
        const bulwark = (zA, zB, y0, y1, color = WOOD) => {
            const n = Math.max(2, Math.ceil((zB - zA) / 2.5));
            for (let i = 0; i < n; i++) {
                const z0 = zA + (zB - zA) * i / n, z1 = zA + (zB - zA) * (i + 1) / n;
                for (const s of [1, -1]) {
                    const a = [s * hw(z0, y0), y0, z0], b = [s * hw(z1, y0), y0, z1], c = [s * hw(z1, y1), y1, z1], d = [s * hw(z0, y1), y1, z0];
                    if (s > 0) hull.quad(a, b, c, d, color); else hull.quad(a, d, c, b, color);
                    // the cap rail
                    const ia = [s * (hw(z0, y1) - 0.4), y1, z0], ib = [s * (hw(z1, y1) - 0.4), y1, z1];
                    if (s > 0) hull.quad(d, c, ib, ia, DARK); else hull.quad(d, ia, ib, c, DARK);
                }
            }
        };
        const main = L.floors[0];
        const ends = [main.z0 - 1.5, L.L / 2 - 0.05];
        const gaps = L.openings.filter((o) => o.side > 0).map((o) => [o.z0, o.z1]);
        let z = ends[0];
        for (const [g0, g1] of gaps) { bulwark(z, g0, D, D + R); z = g1; }
        bulwark(z, ends[1], D, D + R);
        // the castles' sides
        for (const f of L.floors) {
            if (f.y <= D) continue;
            const zA = Math.max(f.z0, -L.L / 2 + 0.5), zB = Math.min(f.z1, L.L / 2 - 0.05);
            bulwark(zA, zB, D + R, f.y + R, f.id === 'fore' ? WOOD : WOOD);
            // the castle's end wall above the transom
            if (zB >= L.L / 2 - 0.2) {
                const w0 = hw(zB, D + R), w1 = hw(zB, f.y + R);
                hull.quad([-w0, D + R, zB], [w0, D + R, zB], [w1, f.y + R, zB], [-w1, f.y + R, zB], DARK);
            }
        }
        // the stern windows (glowing at night) and gold carving
        const glow = new Batch(); // the stern windows and the lanterns: one mesh that lights up at night
        const top = L.floors.reduce((m, f) => Math.max(m, f.y), D);
        for (const row of [D + 1.6, ...(top > D + 5 ? [L.floors.find((f) => f.id === 'quarter').y + 1.4] : [])]) {
            const w = hw(L.L / 2 - 0.1, row) * 0.75;
            for (let k = -2; k <= 2; k++) glow.box((k * w) / 2.6 - w / 6.4, (k * w) / 2.6 + w / 6.4, row - 0.8, row + 0.8, L.L / 2, L.L / 2 + 0.06, 0xffffff);
        }
        hull.box(-hw(L.L / 2 - 0.2, D) * 0.9, hw(L.L / 2 - 0.2, D) * 0.9, D + R - 0.3, D + R + 0.25, L.L / 2 - 0.3, L.L / 2 + 0.15, GOLD);
        // the beakhead and the bowsprit
        const bz = -L.L / 2;
        hull.boxAt(0, D - 0.6, bz - 2.2, 0.8, 1.2, 5, DARK, 0.25);
        hull.cyl(0.55, 0.3, L.L * 0.32, 0, D + 2.6, bz - L.L * 0.1, WOOD, -Math.PI / 2 + 0.32);
        // gun ports: dark squares on the outside at every gun, lids hinged up
        for (const g of L.cannons) {
            const s = g.side, w = hw(g.z, g.muzzle.y);
            hull.boxAt(s * (w + 0.06), g.muzzle.y, g.z, 0.1, 1.2, 1.4, 0x161008);
            hull.boxAt(s * (w + 0.3), g.muzzle.y + 1.05, g.z, 0.12, 1.25, 1.45, this.color, 0, 0, s * 0.9);
        }
        // fake gun ports on the lower deck (the hull looks armed)
        if (L.floors.some((f) => f.id === 'lower')) {
            for (let zz = -L.L * 0.32; zz < L.L * 0.3; zz += 6) for (const s of [1, -1]) hull.boxAt(s * (hw(zz, 2.4) + 0.06), 2.4, zz, 0.1, 1.0, 1.2, 0x161008);
        }

        // ------------------------------------------------------------- decks
        const deckGeo = new Batch();
        for (const f of L.floors) {
            const n = Math.max(4, Math.ceil((f.z1 - f.z0) / 1.5));
            for (let i = 0; i < n; i++) {
                const z0 = f.z0 + (f.z1 - f.z0) * i / n, z1 = f.z0 + (f.z1 - f.z0) * (i + 1) / n;
                const w0 = Math.max(0.05, f.halfAt(z0) + 0.2), w1 = Math.max(0.05, f.halfAt(z1) + 0.2);
                const hole = f.holes.find((h) => z1 > h.z0 && z0 < h.z1);
                if (hole) {
                    deckGeo.quad([-w0, f.y, z0], [-w1, f.y, z1], [hole.x0, f.y, z1], [hole.x0, f.y, z0], 0xffffff);
                    deckGeo.quad([hole.x1, f.y, z0], [hole.x1, f.y, z1], [w1, f.y, z1], [w0, f.y, z0], 0xffffff);
                } else deckGeo.quad([-w0, f.y, z0], [-w1, f.y, z1], [w1, f.y, z1], [w0, f.y, z0], 0xffffff);
                if (f.y > D) {
                    // the underside / the deck's edge thickness
                    hull.quad([-w0, f.y - 0.4, z0], [w0, f.y - 0.4, z0], [w1, f.y - 0.4, z1], [-w1, f.y - 0.4, z1], DARK);
                }
            }
            if (f.y > D) {
                const zEdge = f.id === 'fore' ? f.z1 : f.z0;
                const w = f.halfAt(zEdge) + 0.2;
                hull.box(-w, w, f.y - 0.4, f.y, zEdge - 0.05, zEdge + 0.05, DARK);
            }
        }
        const dg = deckGeo.build();
        // uv: planks along z
        const pa = dg.attributes.position;
        const uv = new Float32Array(pa.count * 2);
        for (let i = 0; i < pa.count; i++) { uv[i * 2] = pa.getX(i) / 4; uv[i * 2 + 1] = pa.getZ(i) / 16; }
        dg.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        const deck = new THREE.Mesh(dg, S.deck);
        deck.receiveShadow = true;
        this.group.add(deck);
        this.deckMesh = deck;

        // ------------------------------------------- solids: bulkheads, rails, stairs, gear
        for (const b of L.solids) {
            switch (b.kind) {
                case 'bulkhead': near.box(b.x0, b.x1, b.y0, b.y1, b.z0, b.z1, 0x7a4e2c); hull.box(b.x0, b.x1, b.y1 - 0.3, b.y1, b.z0 - 0.05, b.z1 + 0.05, DARK); break;
                case 'breastwork': hull.box(b.x0, b.x1, b.y0, b.y1, b.z0, b.z1, WOOD); hull.box(b.x0, b.x1, b.y1, b.y1 + 0.15, b.z0 - 0.1, b.z1 + 0.1, DARK); break;
                case 'capstan':
                    near.cyl(0.9, 0.9, b.y1 - b.y0, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2, DARK, 0, 0, 0, 10);
                    for (let k = 0; k < 4; k++) near.boxAt((b.x0 + b.x1) / 2, b.y1 - 0.4, (b.z0 + b.z1) / 2, 4.2, 0.18, 0.18, WOOD, 0, (k * Math.PI) / 4);
                    break;
                case 'table':
                    near.box(b.x0, b.x1, b.y1 - 0.15, b.y1, b.z0, b.z1, 0x6a4024);
                    for (const sx of [b.x0 + 0.2, b.x1 - 0.2]) for (const sz of [b.z0 + 0.2, b.z1 - 0.2]) near.box(sx - 0.1, sx + 0.1, b.y0, b.y1, sz - 0.1, sz + 0.1, DARK);
                    // chairs, a map, a lantern
                    for (const s of [-1, 1]) near.box(-0.6, 0.6, b.y0, b.y0 + 1.1, (s > 0 ? b.z1 + 0.6 : b.z0 - 1.6), (s > 0 ? b.z1 + 1.6 : b.z0 - 0.6), 0x5a361c);
                    near.box(-0.9, 0.9, b.y1, b.y1 + 0.02, (b.z0 + b.z1) / 2 - 0.6, (b.z0 + b.z1) / 2 + 0.6, 0xe8dcb5);
                    break;
                case 'barrel':
                    for (let k = 0; k < 2; k++) near.cyl(0.8, 0.8, b.y1 - b.y0, (b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, b.z0 + 0.5 + k * 1.0, 0x7b5230, 0, 0, 0, 10);
                    break;
                case 'stair': break;
                default: break;
            }
        }
        // stairs: steps along the ramps
        for (const r of L.ramps) {
            const rise = Math.abs(r.by - r.ay);
            const n = Math.max(3, Math.round(rise / 0.45));
            for (let k = 0; k < n; k++) {
                const t0 = k / n, t1 = (k + 1) / n;
                const y = r.ay + (r.by - r.ay) * t1;
                const za = r.az + (r.bz - r.az) * t0, zb = r.az + (r.bz - r.az) * t1;
                near.box(r.ax - r.half, r.ax + r.half, y - 0.12, y, Math.min(za, zb), Math.max(za, zb), 0x9c6c3c);
            }
            for (const s of [-1, 1]) {
                const len = Math.hypot(r.bz - r.az, r.by - r.ay);
                near.boxAt(r.ax + s * (r.half + 0.08), (r.ay + r.by) / 2 + 0.4, (r.az + r.bz) / 2, 0.16, 0.5, len, DARK, -Math.atan2(r.by - r.ay, r.bz - r.az) * Math.sign(r.bz - r.az) * Math.sign(r.bz - r.az));
            }
        }
        // the hatch coaming
        if (L.hatch) {
            const h = L.floors[0].holes[0];
            near.box(h.x0 - 0.2, h.x0, D, D + 0.4, h.z0, h.z1, DARK);
            near.box(h.x1, h.x1 + 0.2, D, D + 0.4, h.z0, h.z1, DARK);
        }
        // hammocks below
        for (const n of L.nodes) {
            if (n.tag !== 'hammock') continue;
            near.boxAt(n.x + (n.x > 0 ? 1.5 : -1.5), n.y + 2.6, n.z, 1.2, 0.3, 3.2, 0xcfc3a0, 0, 0, n.x > 0 ? 0.15 : -0.15);
        }

        // ------------------------------------------------------- masts and yards
        this.mastTops = [];
        for (const m of L.masts) {
            const h = m.top - m.base;
            hull.cyl(0.95, 0.45, h, 0, m.base + h / 2, m.z, 0x6b4526, 0, 0, 0, 10);
            // the tops (platforms)
            const ty = L.deck + (m.top - L.deck) * 0.6;
            hull.cyl(2.2, 2.2, 0.35, 0, ty, m.z, DARK, 0, 0, 0, 10);
            this.mastTops.push({ id: m.id, y: m.top, z: m.z });
            for (const y of m.yards) {
                if (y.kind === 'square') hull.cyl(0.32, 0.32, y.w, 0, y.y + 0.2, m.z - 0.9, 0x5a3a20, 0, 0, Math.PI / 2, 6);
            }
        }
        // ------------------------------------------------------------------ sails
        for (const sp of L.sails) {
            const sail = new SailMesh(sp);
            if (sp.kind === 'lateen') {
                const m = L.masts.find((q) => q.id === sp.mast);
                const half = sp.w / 2, ang = 0.7; // ~40° yard
                const a = { x: 0.6, y: sp.yardY - Math.sin(ang) * half, z: m.z - Math.cos(ang) * half };
                const b = { x: 0.6, y: sp.yardY + Math.sin(ang) * half, z: m.z + Math.cos(ang) * half };
                const clew = { x: 0.6, y: m.deck + 3.2, z: m.z + half * 0.85 };
                sail.setYard(a, b, clew);
                hull.cyl(0.28, 0.28, sp.w, 0.6, sp.yardY, m.z, 0x5a3a20, Math.PI / 2 - ang, 0, 0, 6);
            }
            sail.setState(0, 0, 1, 0, 0);
            this.group.add(sail.group);
            this.sails.set(sp.id, sail);
        }
        // ---------------------------------------------------------- rigging
        const lines = [];
        for (const m of L.masts) {
            const topY = m.top - 2;
            for (const s of [1, -1]) {
                for (let k = 0; k < 6; k++) {
                    const z0 = m.z - 2.5 + k;
                    const w = hw(z0, L.deck) - 0.1;
                    const deckY = L.railTopAt(z0) - 0.2;
                    lines.push(0, topY - k * 0.8, m.z, s * w, deckY, z0);
                }
                // ratlines between the shrouds every 1.5 m
                for (let y = L.deck + 3; y < topY - 4; y += 1.5) {
                    const t = (y - (L.railTopAt(m.z) - 0.2)) / (topY - (L.railTopAt(m.z) - 0.2));
                    const w0 = (hw(m.z - 2.5, L.deck) - 0.1) * (1 - t), w5 = (hw(m.z + 2.5, L.deck) - 0.1) * (1 - t);
                    lines.push(s * w0, y, m.z - 2.5 + 2.5 * t, s * w5, y, m.z + 2.5 - 2.5 * t);
                }
            }
        }
        // stays: from each mast top forward
        for (let i = 0; i < L.masts.length; i++) {
            const m = L.masts[i];
            const to = i === 0 ? { y: L.deck + 2, z: -L.L / 2 - L.L * 0.2 } : { y: L.deck + (L.masts[i - 1].top - L.deck) * 0.6, z: L.masts[i - 1].z };
            lines.push(0, m.top - 1, m.z, 0, to.y, to.z);
        }
        // the rope ladders at the gangways
        for (const ld of L.ladders) {
            for (const dz of [-0.6, 0.6]) lines.push(ld.x, ld.top, ld.z + dz, ld.x + Math.sign(ld.x) * 0.2, ld.bottom, ld.z + dz);
            for (let y = ld.bottom + 0.4; y < ld.top; y += ld.rung) lines.push(ld.x + Math.sign(ld.x) * 0.2 * (1 - (y - ld.bottom) / (ld.top - ld.bottom)), y, ld.z - 0.6, ld.x + Math.sign(ld.x) * 0.2 * (1 - (y - ld.bottom) / (ld.top - ld.bottom)), y, ld.z + 0.6);
        }
        const lg = new THREE.BufferGeometry();
        lg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
        this.rigging = new THREE.LineSegments(lg, S.rope);
        this.near.add(this.rigging);

        // ------------------------------------------------------------- the wheel
        const helm = L.helm;
        const wheel = new THREE.Group();
        wheel.position.set(helm.x, helm.y, helm.z);
        const wb = new Batch();
        const torus = new THREE.TorusGeometry(helm.rimR, 0.09, 6, 28);
        wb.add(torus, new THREE.Matrix4(), 0x6b4526);
        torus.dispose();
        for (let k = 0; k < helm.spokes; k++) {
            const a = (k / helm.spokes) * Math.PI * 2;
            const c = Math.cos(a), s = Math.sin(a);
            const g = new THREE.CylinderGeometry(0.06, 0.06, helm.handleR, 5);
            _q.setFromAxisAngle(new THREE.Vector3(0, 0, 1), a);
            _m.compose(_p.set(-s * helm.handleR / 2, c * helm.handleR / 2, 0), _q, _s.set(1, 1, 1));
            wb.add(g, _m, 0x8a5a33);
            g.dispose();
            const k2 = new THREE.SphereGeometry(0.11, 6, 5);
            _m.makeTranslation(-s * helm.handleR, c * helm.handleR, 0);
            wb.add(k2, _m, 0x8a5a33);
            k2.dispose();
        }
        const hub = new THREE.CylinderGeometry(0.25, 0.25, 0.4, 10);
        _m.makeRotationX(Math.PI / 2);
        wb.add(hub, _m, GOLD);
        hub.dispose();
        this.wheel = new THREE.Mesh(wb.build(), S.solid);
        this.wheel.castShadow = true;
        wheel.add(this.wheel);
        this.group.add(wheel);
        this.wheelGroup = wheel;
        near.box(-0.35, 0.35, helm.y - 1.9, helm.y - 0.1, helm.z + 0.25, helm.z + 0.75, DARK); // the post and the drum
        near.cyl(0.35, 0.35, 1.8, 0, helm.y - 1.0, helm.z + 0.5, 0x6b4526, 0, 0, Math.PI / 2, 8);

        // ------------------------------------------------------------- the guns
        // (the carriages are part of the inside; each barrel is one mesh: it jumps back when it fires)
        const bg = new Batch();
        bg.cyl(0.55, 0.36, 3.0, 0, 0, 0, IRON, 0, 0, Math.PI / 2, 12);
        bg.cyl(0.62, 0.62, 0.3, -1.45, 0, 0, IRON, 0, 0, Math.PI / 2, 12);
        bg.cyl(0.45, 0.45, 0.25, 1.4, 0, 0, IRON, 0, 0, Math.PI / 2, 12);
        bg.cyl(0.3, 0.3, 0.05, 1.53, 0, 0, 0x0a0a0a, 0, 0, Math.PI / 2, 10); // the dark mouth
        const barrelGeo = bg.build();
        this._barrelGeo = barrelGeo;
        for (const g of L.cannons) {
            const yaw = g.side < 0 ? Math.PI : 0;
            const c = Math.cos(yaw), sn = Math.sin(yaw);
            const at = (x, z) => [g.x + x * c + z * sn, g.z - x * sn + z * c];
            const [cx, cz] = at(0, 0);
            near.box(cx - 1.2, cx + 1.2, g.y, g.y + 0.75, cz - 0.7, cz + 0.7, 0x5a3a20);
            for (const sx of [-0.9, 0.9]) for (const sz of [-0.75, 0.75]) { const [wx, wz] = at(sx, sz); near.cyl(0.32, 0.32, 0.2, wx, g.y + 0.3, wz, DARK, Math.PI / 2, 0, 0, 8); }
            const grp = new THREE.Group();
            grp.position.set(g.x, g.y, g.z);
            grp.rotation.y = yaw;
            const barrel = new THREE.Group();
            barrel.add(new THREE.Mesh(barrelGeo, S.solid));
            const fuse = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), S.lit);
            fuse.position.set(-1.1, 0.5, 0);
            fuse.visible = false;
            barrel.add(fuse);
            const ball = new THREE.Mesh(S.ball, S.iron);
            ball.position.set(1.25, 0, 0);
            ball.visible = false;
            barrel.add(ball);
            barrel.position.set(0, 1.35, 0);
            grp.add(barrel);
            this.near.add(grp);
            this.cannons.set(g.id, { group: grp, barrel, fuse, ball, recoil: 0 });
        }
        // the shot racks: one instanced mesh of balls for the whole ship
        this.ballSlots = [];
        for (const r of L.racks) {
            near.box(r.x - 0.5, r.x + 0.5, r.y - 0.75, r.y - 0.05, r.z - 0.6, r.z + 0.6, 0x5a3a20);
            const slots = [];
            for (let k = 0; k < r.balls; k++) slots.push([r.x + (k % 2) * 0.4 - 0.2, r.y + 0.2, r.z + Math.floor(k / 2) * 0.4 - 0.4]);
            this.racks.set(r.id, { from: this.ballSlots.length, n: slots.length, shown: slots.length });
            this.ballSlots.push(...slots);
        }
        if (this.ballSlots.length) {
            this.balls = new THREE.InstancedMesh(S.ball, S.iron, this.ballSlots.length);
            this.ballSlots.forEach((p, i) => { _m.makeTranslation(p[0], p[1], p[2]); this.balls.setMatrixAt(i, _m); });
            this.balls.instanceMatrix.needsUpdate = true;
            this.near.add(this.balls);
        }

        // ----------------------------------------------------------- flags
        this.flags = [];
        for (const m of L.masts) {
            const fg = new THREE.PlaneGeometry(4.5, 2.6, 6, 1);
            fg.translate(2.25, 0, 0);
            const flag = new THREE.Mesh(fg, new THREE.MeshLambertMaterial({ color: this.color, side: THREE.DoubleSide }));
            flag.position.set(0, m.top + 1.2, m.z);
            hull.cyl(0.08, 0.08, 2.6, 0, m.top + 1.0, m.z, DARK);
            this.group.add(flag);
            this.flags.push({ mesh: flag, base: fg.attributes.position.array.slice() });
        }
        // stern lanterns
        for (const s of [-1, 1]) {
            const y = top + L.rail + 1.2;
            hull.box(s * 2.4 - 0.05, s * 2.4 + 0.05, top + L.rail, y, L.L / 2 - 0.6, L.L / 2 - 0.5, DARK);
            glow.box(s * 2.4 - 0.4, s * 2.4 + 0.4, y, y + 0.8, L.L / 2 - 0.95, L.L / 2 - 0.15, 0xffffff);
        }
        this.glow = new THREE.Mesh(glow.build(), S.glass);
        this.group.add(this.glow);

        const hullMesh = new THREE.Mesh(hull.build(), S.solid);
        hullMesh.castShadow = true;
        hullMesh.receiveShadow = true;
        this.group.add(hullMesh);
        this.hullMesh = hullMesh;
        if (near.pos.length) {
            const nm = new THREE.Mesh(near.build(), S.solid);
            nm.castShadow = true;
            nm.receiveShadow = true;
            this.near.add(nm);
            this.nearMesh = nm;
        }
        // holes (Bombardo, cannonballs): dark patches added at run time
        this.holes = new THREE.Group();
        this.group.add(this.holes);
    }

    setPose(pose) {
        this.group.position.set(pose.x, pose.y, pose.z);
        this.group.rotation.set(pose.pitch, pose.yaw, pose.roll, 'YXZ');
    }

    /** dist: metres from the camera. Far away the rigging, guns and inside are hidden; very far — all. */
    setDetail(dist) {
        const d = dist > 700 ? 0 : dist > 230 ? 1 : 2;
        if (d === this.detail) return;
        this.detail = d;
        this.group.visible = d > 0;
        this.near.visible = d > 1;
        for (const s of this.sails.values()) s.mesh.castShadow = d > 1;
    }

    setWheel(angle) { this.wheel.rotation.z = -angle; }

    setNight(on) {
        const S = shared();
        if (this._night === on) return;
        this._night = on;
        this.glow.material = on ? S.lit : S.glass;
    }

    /** Flags flutter along the apparent wind (a cue where the wind blows); windLocal: {x, z} in the ship frame. */
    updateFlags(windLocal, t) {
        const sp = Math.hypot(windLocal.x, windLocal.z);
        const ang = sp > 0.3 ? Math.atan2(-windLocal.z, windLocal.x) : -Math.PI / 2;
        for (const f of this.flags) {
            f.mesh.rotation.y = ang;
            const a = f.mesh.geometry.attributes.position;
            for (let i = 0; i < a.count; i++) {
                const x = f.base[i * 3];
                a.array[i * 3 + 2] = Math.sin(t * (3 + sp * 0.4) + x * 1.4) * 0.25 * (x / 4.5) * Math.min(1, 0.3 + sp / 6);
                a.array[i * 3 + 1] = f.base[i * 3 + 1] - (sp < 1 ? (x / 4.5) * 1.2 : 0);
            }
            a.needsUpdate = true;
        }
    }

    /** A hole in the hull (ship-local) with a dark patch and splinters. */
    addHole(lx, ly, lz, r) {
        const side = lx >= 0 ? 1 : -1;
        const w = hullHalfWidth(this.L, lz, Math.max(-this.L.draft + 0.2, ly));
        const m = new THREE.Mesh(new THREE.CircleGeometry(Math.max(0.3, r), 9), shared().glass);
        m.position.set(side * (w + 0.05), ly, lz);
        m.rotation.y = side * Math.PI / 2;
        this.holes.add(m);
        return m;
    }

    /** The cannon's recoil and the fuse glow; loaded: the ball in the barrel. */
    setCannon(id, { recoil = 0, fuse = false, loaded = false } = {}) {
        const c = this.cannons.get(id);
        if (!c) return;
        c.barrel.position.x = -recoil;
        c.fuse.visible = fuse;
        c.ball.visible = loaded;
    }

    setRack(id, n) {
        const r = this.racks.get(id);
        if (!r || r.shown === n) return;
        r.shown = n;
        for (let k = 0; k < r.n; k++) {
            const p = this.ballSlots[r.from + k];
            _m.makeTranslation(p[0], p[1], p[2]);
            if (k >= n) _m.scale(_s.set(0.001, 0.001, 0.001));
            this.balls.setMatrixAt(r.from + k, _m);
        }
        this.balls.instanceMatrix.needsUpdate = true;
    }

    dispose() {
        this.group.traverse((o) => {
            if (o.isMesh || o.isLineSegments) {
                if (o.geometry !== shared().ball && o.geometry !== this._barrelGeo) o.geometry.dispose();
                const m = o.material;
                const S = shared();
                if (m && m !== S.solid && m !== S.deck && m !== S.sail && m !== S.rope && m !== S.glass && m !== S.lit && m !== S.iron) m.dispose();
            }
        });
        for (const s of this.sails.values()) s.dispose?.();
        this._barrelGeo?.dispose();
        this.group.parent?.remove(this.group);
    }
}
