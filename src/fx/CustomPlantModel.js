/**
 * CustomPlantModel.js — how a plant of one's own looks («Да пусть создастся дерево / цветок / гриб …» — CustomPlants.js).
 *
 * One shape per kind (made once from its recipe, its colours baked into the vertices — no texture to load): a tree's
 * trunk tapering and twisting up into its branches, the crown as described (round, a cone, an umbrella, weeping, a
 * spiral, a column) of many leaf clumps in shades of its colour, flowers and fruit among the leaves; a bush, a flower
 * (a stem, leaves, a ring of petals round its heart), grass (blades), a vine climbing a stake, a mushroom (a stem, a cap
 * with spots, gills), a cactus (ribbed with arms and spines), reeds (stalks with their heads), a crystal plant (prisms).
 * Every plant of the kind is one instance of it (an InstancedMesh: one draw for the whole kind; a glowing kind's glow — a
 * second, unlit one). Nothing per plant but its matrix.
 */

import * as THREE from 'three';
import { createRng } from '../core/math.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _c = new THREE.Color();

/** A growing buffer of parts (positions, normals, colours, indices). */
class Parts {
    constructor() { this.pos = []; this.nor = []; this.col = []; this.idx = []; }
    /** A base geometry placed by matrix m, coloured c (± shade jitter by vertex height). */
    add(geo, m, c, shade = 0.12, r = Math.random) {
        const P = geo.attributes.position, N = geo.attributes.normal, I = geo.index;
        const base = this.pos.length / 3;
        const nm = new THREE.Matrix3().getNormalMatrix(m);
        _c.setHex(c);
        const k = 1 - shade + shade * 2 * r();
        for (let i = 0; i < P.count; i++) {
            _p.fromBufferAttribute(P, i).applyMatrix4(m);
            this.pos.push(_p.x, _p.y, _p.z);
            _s.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
            this.nor.push(_s.x, _s.y, _s.z);
            const v = k * (0.88 + 0.12 * (P.getY(i) + 0.5));
            this.col.push(Math.min(1, _c.r * v), Math.min(1, _c.g * v), Math.min(1, _c.b * v));
        }
        if (I) for (let i = 0; i < I.count; i++) this.idx.push(base + I.getX(i));
        else for (let i = 0; i < P.count; i++) this.idx.push(base + i);
    }
    geometry() {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
        g.setIndex(this.idx);
        g.computeBoundingSphere();
        return g;
    }
    get empty() { return !this.idx.length; }
}

let B = null;
function base() {
    if (B) return B;
    B = {
        cyl: new THREE.CylinderGeometry(0.75, 1, 1, 7, 1).translate(0, 0.5, 0),
        clump: new THREE.IcosahedronGeometry(1, 1),
        // a leaf: a pointed blade folded along its midrib (its tip at +y)
        leaf: (() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.32, 0.4, 0.08, 0, 0.45, -0.04, 0.32, 0.4, 0.08, 0, 1, 0.05, 0, 0.45, -0.04], 3)); g.setIndex([0, 2, 1, 0, 3, 5, 1, 2, 4, 5, 3, 4]); g.computeVertexNormals(); return g; })(),
        // a needle tuft: a flattened fan of thin spikes
        tuft: new THREE.ConeGeometry(1, 1, 5, 1, true).translate(0, 0.5, 0).scale(1, 1, 0.35),
        skirt: new THREE.ConeGeometry(1, 1, 11, 1, true).translate(0, 0.5, 0),
        ball: new THREE.SphereGeometry(1, 8, 6),
        cone: new THREE.ConeGeometry(1, 1, 8, 1).translate(0, 0.5, 0),
        blade: (() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, 0, 0, 0.5, 0, 0, 0, 1, 0.15, -0.5, 0, 0, 0, 1, 0.15, 0.5, 0, 0], 3)); g.computeVertexNormals(); return g; })(),
        petal: new THREE.SphereGeometry(1, 6, 4, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.25, 1),
        prism: new THREE.CylinderGeometry(0.0, 1, 1, 6, 1).translate(0, 0.5, 0),
        hex: new THREE.CylinderGeometry(1, 1, 1, 6, 1).translate(0, 0.5, 0),
        cap: new THREE.SphereGeometry(1, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    };
    return B;
}

const mat = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => _m.compose(_p.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz)).clone();
const shade = (c, k) => { _c.setHex(c); return _c.multiplyScalar(k).getHex(); };
const LEAF_GREEN = 0x3f8a32, BARK = 0x6a4a2c;
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _Y = new THREE.Vector3(0, 1, 0);
/** A cylinder from point a to point b (radius r at a, ×0.75 at b): a limb, a branch. */
const limb = (P, g, ax, ay, az, bx, by, bz, rad, c, rng) => {
    _a.set(ax, ay, az); _b.set(bx, by, bz); _d.subVectors(_b, _a);
    const L = _d.length(); if (L < 1e-5) return;
    _q.setFromUnitVectors(_Y, _d.multiplyScalar(1 / L));
    P.add(g.cyl, _m.compose(_a, _q, _s.set(rad, L, rad)).clone(), c, 0.08, rng);
};

/**
 * The shapes of a kind: {body: BufferGeometry, glow: BufferGeometry|null, h: height, trunkR}.
 * Height 1 = the recipe's height (the instance scales it by its own growth and variation).
 */
export function plantShape(recipe, seed = 1) {
    const r = createRng((seed >>> 0) + 17);
    const g = base(), body = new Parts(), glow = new Parts();
    const H = 1;
    const leaf = recipe.leafColor ?? (recipe.form === 'cactus' ? 0x4a8a3a : recipe.form === 'crystal' ? 0x9ad8ff : LEAF_GREEN);
    const bark = recipe.trunk?.color ?? (recipe.form === 'mushroom' ? 0xf0e8d8 : BARK);
    const flower = recipe.flowers?.color;
    const fruitC = recipe.fruitColor ?? { apple: 0xd8302a, berry: 0x7a1a8a, nut: 0x8a5a2a, crystal: 0x9ef0ff, bell: 0xf0d040, star: 0xfff0a0 }[recipe.fruit];
    const glowC = recipe.glow;
    const lit = glowC != null ? glow : body; // (what glows goes to the unlit shape)
    const thick = recipe.trunk?.thick ?? 1, twist = recipe.trunk?.twist ?? 0;
    const tw = (y) => twist * Math.sin(y * 7) * 0.06;
    const on = recipe.glowOn || 'all';
    const glowLeaf = glowC != null && (on === 'all' || on === 'leaves'), glowFlower = glowC != null && (on === 'all' || on === 'flowers'), glowFruit = glowC != null && (on === 'all' || on === 'fruit');
    const fruitAt = (x, y, z, s) => {
        if (!recipe.fruit || recipe.fruit === 'none') return;
        const to = glowFruit || recipe.fruit === 'crystal' || recipe.fruit === 'star' ? lit : body, fc = fruitC ?? 0xd8302a;
        if (recipe.fruit === 'crystal') { to.add(g.prism, mat(x, y - s * 2, z, 0, r() * 6, 0, s, s * 2, s), fc, 0.1, r); return; }
        to.add(g.ball, mat(x, y, z, 0, r() * 6, 0, s, s * (recipe.fruit === 'nut' ? 1.3 : 1), s), fc, 0.12, r);
        body.add(g.cyl, mat(x, y + s * 0.8, z, 0, 0, 0, s * 0.12, s * 0.7, s * 0.12), 0x5a3a1a, 0.05, r); // (its stalk)
        if (recipe.fruit === 'apple') body.add(g.leaf, mat(x + s * 0.2, y + s * 1.1, z, 0.3, r() * 6, -0.9, s * 0.9, s * 1.3, s * 0.9), shade(leaf, 1.1), 0.1, r);
    };
    const flowerAt = (x, y, z, s) => {
        if (flower == null) return;
        const to = glowFlower ? lit : body;
        for (let k = 0; k < 6; k++) { const a = k * 1.0472 + r() * 0.2; to.add(g.petal, mat(x + Math.cos(a) * s * 0.62, y, z + Math.sin(a) * s * 0.62, 0, -a, 0.35, s * 0.62, s, s * 0.4), shade(flower, 0.85 + r() * 0.3), 0.15, r); }
        for (let k = 0; k < 5; k++) { const a = k * 1.2566 + 0.6; to.add(g.petal, mat(x + Math.cos(a) * s * 0.3, y + s * 0.08, z + Math.sin(a) * s * 0.3, 0, -a, 0.7, s * 0.38, s * 0.8, s * 0.3), shade(flower, 1.15), 0.1, r); }
        body.add(g.ball, mat(x, y + s * 0.15, z, 0, 0, 0, s * 0.3, s * 0.25, s * 0.3), 0xf0c030, 0.15, r);
    };
    /** A clump of foliage: a darker core under leaves (or needle tufts) fanned all round it. */
    const foliage = (x, y, z, s, glowIt, cards = 14) => {
        const to = glowIt ? lit : body;
        to.add(g.clump, mat(x, y, z, r() * 3, r() * 6, r() * 3, s * 0.62, s * 0.55, s * 0.62), shade(leaf, 0.6 + r() * 0.2), 0.12, r);
        for (let k = 0; k < cards; k++) {
            const u = r() * 2 - 1, a = r() * Math.PI * 2, rr = Math.sqrt(1 - u * u);
            _d.set(Math.cos(a) * rr, Math.abs(u) * 0.8 + 0.2 * u, Math.sin(a) * rr).normalize();
            _p.set(x + _d.x * s * 0.5, y + _d.y * s * 0.45, z + _d.z * s * 0.5);
            // (a leaf lies along the clump's surface, half turned out — not a spike)
            _b.set(r() - 0.5, r() - 0.5, r() - 0.5).cross(_d).normalize();
            _a.copy(_d).multiplyScalar(0.55).add(_b).normalize();
            _q.setFromUnitVectors(_Y, _a);
            _e.set(0, r() * 6, 0); const roll = new THREE.Quaternion().setFromEuler(_e);
            _q.multiply(roll);
            const ls = s * (recipe.leaves === 'needle' ? 0.7 : recipe.leaves === 'fern' || recipe.leaves === 'feather' ? 0.8 : 0.55) * (0.8 + r() * 0.4);
            const geo = recipe.leaves === 'needle' ? g.tuft : g.leaf;
            const w = recipe.leaves === 'needle' ? 0.35 : recipe.leaves === 'heart' ? 1.25 : recipe.leaves === 'fern' || recipe.leaves === 'feather' ? 0.6 : 1.3;
            to.add(geo, _m.compose(_p, _q, _s.set(ls * w, ls, ls * w)).clone(), shade(leaf, 0.75 + r() * 0.5), 0.15, r);
        }
    };
    switch (recipe.form) {
        case 'tree': {
            const trunkH = H * (recipe.crown === 'umbrella' ? 0.62 : recipe.crown === 'weeping' ? 0.5 : recipe.crown === 'cone' || recipe.crown === 'columnar' ? 0.2 : 0.42);
            const tr = 0.045 * thick;
            // the trunk in segments, tapering and twisting; its bark streaked; roots spreading at its foot
            let px = 0, pz = 0;
            for (let i = 0; i < 7; i++) {
                const y0 = (i / 7) * trunkH, y1 = ((i + 1) / 7) * trunkH, nx = tw(y1), nz = tw(y1 + 1);
                limb(body, g, px, y0, pz, nx, y1 + 0.004, nz, tr * (1 - i * 0.07), shade(bark, 0.85 + r() * 0.3), r);
                px = nx; pz = nz;
            }
            for (let k = 0; k < 5; k++) { const a = k * 1.2566 + r() * 0.5, L = tr * (3 + r() * 2); limb(body, g, Math.cos(a) * tr * 0.5, tr * 1.6, Math.sin(a) * tr * 0.5, Math.cos(a) * L, -0.004, Math.sin(a) * L, tr * 0.45, shade(bark, 0.8), r); }
            // the crown: clump centres by its shape, each reached by a branch from the trunk
            const C = [];
            const tierN = 7;
            switch (recipe.crown) {
                case 'cone': { // tiers of drooping boughs from the top down, wider and wider
                    for (let t = 0; t < tierN; t++) {
                        const y = H - (t + 0.6) * (H - trunkH) / tierN, rr = 0.06 + (t / tierN) * 0.3;
                        (glowLeaf && t % 2 === 0 ? lit : body).add(g.skirt, mat(px, y - rr * 0.55, pz, 0, r() * 6, 0, rr, rr * 0.75, rr), shade(leaf, 0.6 + r() * 0.15), 0.12, r);
                        const k = 6 + t * 2;
                        for (let j = 0; j < k; j++) { const a = (j / k) * 6.283 + r() * 0.3; C.push([px + Math.cos(a) * rr * 0.75, y - rr * 0.35, pz + Math.sin(a) * rr * 0.75, 0.05 + rr * 0.2, 'bough']); }
                    }
                    body.add(g.cone, mat(px, H - 0.05, pz, 0, 0, 0, 0.02, 0.08, 0.02), shade(leaf, 0.8), 0.1, r); // (its tip)
                    break;
                }
                case 'umbrella': for (let i = 0; i < 26; i++) { const a = r() * 6.283, rr = 0.08 + Math.sqrt(r()) * 0.38; C.push([Math.cos(a) * rr, trunkH + 0.12 + (0.38 - rr) * 0.25 + r() * 0.05, Math.sin(a) * rr, 0.09 + r() * 0.04]); } break;
                case 'weeping': {
                    for (let i = 0; i < 16; i++) { const u = r(), a = r() * 6.283, e = Math.acos(u); C.push([Math.cos(a) * Math.sin(e) * 0.26, trunkH + 0.12 + Math.cos(e) * 0.18, Math.sin(a) * Math.sin(e) * 0.26, 0.1 + r() * 0.04]); }
                    // the hanging strands: leaves down long thin twigs from the crown's rim nearly to the ground
                    for (let k = 0; k < 26; k++) {
                        const a = (k / 26) * 6.283 + r() * 0.2, rr = 0.24 + r() * 0.1, top = trunkH + 0.12 + r() * 0.08, len = 0.35 + r() * 0.2;
                        let x0 = Math.cos(a) * rr, z0 = Math.sin(a) * rr, y0 = top;
                        for (let j = 0; j < 8; j++) {
                            const x1 = x0 + Math.cos(a) * 0.012, z1 = z0 + Math.sin(a) * 0.012, y1 = y0 - len / 8;
                            limb(body, g, x0, y0, z0, x1, y1, z1, 0.004, shade(bark, 1.1), r);
                            for (let q = 0; q < 3; q++) (glowLeaf && j % 3 === 0 ? lit : body).add(g.leaf, mat(x1 + (r() - 0.5) * 0.035, y1 + q * 0.015, z1 + (r() - 0.5) * 0.035, Math.PI + (r() - 0.5) * 0.9, r() * 6, (r() - 0.5) * 0.9, 0.05, 0.075, 0.05), shade(leaf, 0.75 + r() * 0.5), 0.15, r);
                            if (j === 5 && k % 3 === 0) flowerAt(x1, y1, z1, 0.03);
                            x0 = x1; y0 = y1; z0 = z1;
                        }
                    }
                    break;
                }
                case 'spiral': for (let i = 0; i < 30; i++) { const t = i / 30; C.push([Math.cos(t * 14) * (0.34 - t * 0.27), trunkH + t * (H - trunkH - 0.06), Math.sin(t * 14) * (0.34 - t * 0.27), 0.07 + (1 - t) * 0.05]); } break;
                case 'columnar': for (let i = 0; i < 28; i++) { const a = r() * 6.283, u = r(); C.push([Math.cos(a) * 0.11 * Math.sin(u * 3.1), trunkH + u * (H - trunkH - 0.05), Math.sin(a) * 0.11 * Math.sin(u * 3.1), 0.06 + r() * 0.03]); } break;
                default: for (let i = 0; i < 34; i++) { const u = r() * 2 - 1, a = r() * 6.283, e = Math.acos(u), rr = 0.24 + r() * 0.08; C.push([Math.cos(a) * Math.sin(e) * rr, trunkH + 0.24 + Math.cos(e) * rr * 0.78, Math.sin(a) * Math.sin(e) * rr, 0.085 + r() * 0.045]); }
            }
            // main branches: from the trunk's top to the bigger clumps (forking once on the way)
            if (recipe.crown !== 'cone') {
                for (let i = 0; i < C.length; i += 3) {
                    const [x, y, z] = C[i], my = trunkH * (0.75 + r() * 0.25);
                    const fx = px + (x - px) * 0.55, fy = my + (y - my) * 0.55, fz = pz + (z - pz) * 0.55;
                    limb(body, g, px, my, pz, fx, fy, fz, tr * 0.5, shade(bark, 0.9 + r() * 0.2), r);
                    limb(body, g, fx, fy, fz, x, y, z, tr * 0.28, shade(bark, 0.95), r);
                }
            } else for (const [x, y, z] of C) limb(body, g, px, y + 0.02, pz, x, y, z, tr * 0.18, shade(bark, 0.9), r);
            C.forEach(([x, y, z, s, kind], i) => {
                if (kind === 'bough') {
                    _d.set(x - px, -0.35 * Math.hypot(x - px, z - pz), z - pz).normalize(); _q.setFromUnitVectors(_Y, _d);
                    for (let j = 0; j < 3; j++) { _p.set(x + (r() - 0.5) * s * 0.4, y + (r() - 0.5) * s * 0.2, z + (r() - 0.5) * s * 0.4); (glowLeaf && i % 4 === 0 ? lit : body).add(g.tuft, _m.compose(_p, _q, _s.set(s * 0.45, s * 1.3, s * 0.45)).clone(), shade(leaf, 0.7 + r() * 0.45), 0.15, r); }
                } else foliage(x, y, z, s, glowLeaf && i % 4 === 0);
                if (i % 4 === 1) flowerAt(x * 1.12, y + s * 0.5, z * 1.12, s * 0.42);
                if (i % 5 === 2) fruitAt(x * 1.15, y - s * 0.45, z * 1.15, 0.018 + 0.008 * r());
            });
            return { body: body.geometry(), glow: glow.empty ? null : glow.geometry(), h: H, trunkR: tr };
        }
        case 'bush': {
            for (let k = 0; k < 6; k++) { const a = k * 1.05 + r() * 0.4; limb(body, g, 0, 0, 0, Math.cos(a) * 0.22, 0.35 + r() * 0.2, Math.sin(a) * 0.22, 0.025 * thick, shade(bark, 0.9), r); }
            for (let i = 0; i < 18; i++) {
                const a = r() * 6.28, rr = 0.1 + r() * 0.28, s = 0.16 + r() * 0.1, y = 0.22 + r() * 0.48 * (1 - rr);
                foliage(Math.cos(a) * rr, y, Math.sin(a) * rr, s, glowLeaf && i % 4 === 0, 8);
                if (i % 3 === 0) flowerAt(Math.cos(a) * (rr + s * 0.6), y + s * 0.3, Math.sin(a) * (rr + s * 0.6), 0.06);
                if (i % 2 === 1) { fruitAt(Math.cos(a) * (rr + s * 0.62), y, Math.sin(a) * (rr + s * 0.62), 0.03); if (recipe.fruit === 'berry') fruitAt(Math.cos(a + 0.2) * (rr + s * 0.6), y - 0.04, Math.sin(a + 0.2) * (rr + s * 0.6), 0.026); }
            }
            return { body: body.geometry(), glow: glow.empty ? null : glow.geometry(), h: H, trunkR: 0 };
        }
        case 'flower': case 'grass': case 'reed': {
            const n = recipe.form === 'grass' ? 18 : recipe.form === 'reed' ? 9 : 3;
            for (let i = 0; i < n; i++) {
                const a = r() * 6.28, rr = r() * (recipe.form === 'flower' ? 0.18 : 0.3), h = H * (0.7 + r() * 0.3);
                const x = Math.cos(a) * rr, z = Math.sin(a) * rr, lean = (r() - 0.5) * 0.3;
                if (recipe.form === 'grass') { body.add(g.blade, mat(x, 0, z, lean, r() * 6, 0, 0.06, h, 1), shade(leaf, 0.7 + r() * 0.5), 0.15, r); continue; }
                body.add(g.cyl, mat(x, 0, z, lean, 0, 0, 0.012 * thick, h, 0.012 * thick), shade(leaf, 0.75), 0.1, r);
                if (recipe.form === 'reed') { body.add(g.cyl, mat(x + Math.sin(lean) * h * 0.02, h * 0.85, z, lean, 0, 0, 0.03, h * 0.18, 0.03), 0x6a4020, 0.1, r); continue; }
                for (let k = 0; k < 2; k++) body.add(g.blade, mat(x, h * (0.25 + k * 0.2), z, 0.9, r() * 6, 0, 0.12, h * 0.3, 1), shade(leaf, 0.85), 0.15, r);
                flowerAt(x, h, z, 0.14);
                if (flower == null) (glowC != null ? lit : body).add(g.ball, mat(x, h, z, 0, 0, 0, 0.06, 0.06, 0.06), glowC ?? 0xf0d040, 0.1, r);
            }
            return { body: body.geometry(), glow: glow.empty ? null : glow.geometry(), h: H, trunkR: 0 };
        }
        case 'vine': {
            body.add(g.cyl, mat(0, 0, 0, 0, 0, 0, 0.03, H, 0.03), 0x7a5a3a, 0.1, r); // (the stake it climbs)
            for (let i = 0; i < 40; i++) { const t = i / 40, a = t * 18; body.add(g.cyl, mat(Math.cos(a) * 0.06, t * H, Math.sin(a) * 0.06, 0.8, a, 0, 0.012, 0.06, 0.012), shade(leaf, 0.7), 0.1, r); if (i % 2 === 0) (glowC != null && i % 6 === 0 ? lit : body).add(g.blade, mat(Math.cos(a) * 0.1, t * H, Math.sin(a) * 0.1, 0.4, a, 0, 0.12, 0.12, 1), shade(leaf, 0.8 + r() * 0.4), 0.12, r); if (i % 7 === 3) flowerAt(Math.cos(a) * 0.12, t * H, Math.sin(a) * 0.12, 0.05); if (i % 9 === 4) fruitAt(Math.cos(a) * 0.12, t * H - 0.02, Math.sin(a) * 0.12, 0.03); }
            return { body: body.geometry(), glow: glow.empty ? null : glow.geometry(), h: H, trunkR: 0.03 };
        }
        case 'mushroom': {
            const capC = flower ?? recipe.leafColor ?? glowC ?? 0xc8301a;
            body.add(g.cyl, mat(0, 0, 0, 0, 0, 0, 0.09 * thick, H * 0.65, 0.09 * thick), bark, 0.08, r);
            body.add(g.cyl, mat(0, H * 0.45, 0, 0, 0, 0, 0.13 * thick, H * 0.03, 0.13 * thick), shade(bark, 0.9), 0.05, r); // (its ring)
            (glowC != null ? lit : body).add(g.cap, mat(0, H * 0.62, 0, 0, 0, 0, 0.42, H * 0.38, 0.42), capC, 0.1, r);
            body.add(g.cyl, mat(0, H * 0.61, 0, 0, 0, 0, 0.4, 0.015, 0.4), shade(bark, 0.8), 0.05, r); // (the gills under it)
            for (let k = 0; k < 9; k++) { const a = r() * 6.28, e = 0.3 + r() * 0.9; body.add(g.ball, mat(Math.cos(a) * Math.sin(e) * 0.41, H * 0.62 + Math.cos(e) * H * 0.37, Math.sin(a) * Math.sin(e) * 0.41, 0, 0, 0, 0.05, 0.02, 0.05), 0xf6f2ea, 0.05, r); }
            return { body: body.geometry(), glow: glow.empty ? null : glow.geometry(), h: H, trunkR: 0.09 };
        }
        case 'cactus': {
            const rr = 0.09 * thick;
            body.add(g.hex, mat(0, 0, 0, 0, 0, 0, rr, H * 0.92, rr), leaf, 0.1, r);
            body.add(g.ball, mat(0, H * 0.92, 0, 0, 0, 0, rr, rr * 0.8, rr), leaf, 0.1, r);
            for (const s of [-1, 1]) { const y = H * (0.35 + r() * 0.2); body.add(g.hex, mat(s * rr * 1.6, y, 0, 0, 0, s * Math.PI / 2, rr * 0.7, rr * 1.8, rr * 0.7), leaf, 0.1, r); body.add(g.hex, mat(s * rr * 2.6, y, 0, 0, 0, 0, rr * 0.7, H * 0.25, rr * 0.7), leaf, 0.1, r); }
            for (let k = 0; k < 30; k++) { const a = r() * 6.28, y = r() * H * 0.9; body.add(g.cone, mat(Math.cos(a) * rr, y, Math.sin(a) * rr, Math.sin(a) * 1.5, 0, -Math.cos(a) * 1.5, 0.004, 0.035, 0.004), 0xf0ead0, 0.05, r); }
            flowerAt(0, H * 0.98, 0, 0.08);
            return { body: body.geometry(), glow: glow.empty ? null : glow.geometry(), h: H, trunkR: rr };
        }
        default: { // crystal
            const c = recipe.leafColor ?? glowC ?? 0x9ad8ff;
            for (let k = 0; k < 14; k++) { const a = r() * 6.28, lean = 0.1 + r() * 0.55, s = (k < 6 ? 0.06 : 0.025) + r() * 0.04, h = H * (k < 6 ? 0.45 + r() * 0.55 : 0.12 + r() * 0.3); lit.add(g.prism, mat(Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08, Math.sin(a) * lean, 0, -Math.cos(a) * lean, s, h, s), shade(c, 0.8 + r() * 0.4), 0.1, r); }
            body.add(g.ball, mat(0, 0, 0, 0, 0, 0, 0.18, 0.08, 0.18), 0x6a6a72, 0.1, r);
            return { body: body.geometry(), glow: glow.empty ? null : glow.geometry(), h: H, trunkR: 0.1 };
        }
    }
}

let MATS = null;
/** The shared materials (vertex colours): the body lit, the glow unlit. */
export function plantMaterials() {
    if (MATS) return MATS;
    MATS = {
        body: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
        glow: new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }),
    };
    for (const m of Object.values(MATS)) m.userData.shared = true;
    return MATS;
}
