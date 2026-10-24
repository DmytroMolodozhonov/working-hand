/**
 * UnitedWandModel.js — the united wand (UnitedRules.js): thinner and finer than every found wand. Along +Y, the tip at y≈0.66, the same size as the
 * others (a 0.2 handle, a 0.44 shaft). Made of three merged shapes (dark pearly wood, light veins and filigree, glowing gem and halo): the shapes are
 * shared by every united wand (made once); the colour is one of UNITED_PALETTE's twelve and lives in a cached material per colour — nothing grows.
 * Details: a handle turned with fine rings, two collars, three thin veins spiralling the shaft (two one way, one the other — two powers wound into one),
 * four slender leaves of filigree under the tip, a long faceted gem, a halo ring and four small spark-diamonds round it.
 */
import * as THREE from 'three';
import { mergeParts } from '../core/MergeGeometry.js';
import { UNITED_PALETTE } from './UnitedRules.js';

let _geo = null;
const _mats = new Map(); // colour index → {wood, vein, glow, halo}

function lathe(profile, seg = 10) { return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), seg); }

function geos() {
    if (_geo) return _geo;
    const wood = [], vein = [], glow = [];
    // handle: a turned grip, fine rings, a flare at the base
    wood.push({ geo: lathe([[0.0, 0.0], [0.022, 0.0], [0.024, 0.012], [0.017, 0.03], [0.015, 0.1], [0.018, 0.17], [0.022, 0.2], [0.0, 0.2]]) });
    for (const y of [0.05, 0.08, 0.11, 0.14]) vein.push({ geo: new THREE.TorusGeometry(0.0175, 0.0028, 5, 10), pos: [0, y, 0], rot: [Math.PI / 2, 0, 0] });
    // collars of the shaft
    vein.push({ geo: new THREE.TorusGeometry(0.026, 0.0045, 5, 12), pos: [0, 0.205, 0], rot: [Math.PI / 2, 0, 0] });
    vein.push({ geo: new THREE.TorusGeometry(0.021, 0.0035, 5, 12), pos: [0, 0.225, 0], rot: [Math.PI / 2, 0, 0] });
    // the shaft: a long taper
    wood.push({ geo: lathe([[0.0, 0.2], [0.0185, 0.2], [0.0145, 0.3], [0.0105, 0.45], [0.0075, 0.58], [0.006, 0.62], [0.0, 0.62]]) });
    // three veins spiralling it (two right-handed, one left-handed)
    const helix = (phase, dir, turns = 3.2) => {
        const pts = [];
        for (let i = 0; i <= 44; i++) { const u = i / 44, y = 0.23 + u * 0.37, r = 0.0185 - 0.0105 * u + 0.002; const a = phase + dir * u * turns * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * r, y, Math.sin(a) * r)); }
        return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 44, 0.0026, 4, false);
    };
    vein.push({ geo: helix(0, 1) }, { geo: helix(Math.PI * 0.66, 1) }, { geo: helix(Math.PI * 1.33, -1, 2.4) });
    // filigree: four slender curved leaves under the tip
    for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
        const leaf = new THREE.ConeGeometry(0.0075, 0.1, 4); leaf.translate(0, 0.05, 0);
        vein.push({ geo: leaf, pos: [Math.cos(a) * 0.012, 0.56, Math.sin(a) * 0.012], rot: [Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55] });
    }
    // the gem: a long octahedron, with four small diamonds round it
    glow.push({ geo: new THREE.OctahedronGeometry(0.02), pos: [0, 0.655, 0], scale: [0.8, 2.1, 0.8] });
    for (let k = 0; k < 4; k++) { const a = (k / 4) * Math.PI * 2; glow.push({ geo: new THREE.OctahedronGeometry(0.0065), pos: [Math.cos(a) * 0.045, 0.64 + (k % 2) * 0.03, Math.sin(a) * 0.045], scale: [1, 1.6, 1] }); }
    const halo = new THREE.TorusGeometry(0.042, 0.0016, 4, 24); halo.rotateX(Math.PI / 2); halo.translate(0, 0.655, 0);
    _geo = { wood: mergeParts(wood), vein: mergeParts(vein), glow: mergeParts(glow), halo };
    for (const g of Object.values(_geo)) g.userData.shared = g.userData.keep = true;
    return _geo;
}

function mats(ci) {
    let m = _mats.get(ci);
    if (m) return m;
    const col = new THREE.Color(UNITED_PALETTE[ci] ?? UNITED_PALETTE[0]);
    m = {
        wood: new THREE.MeshStandardMaterial({ color: col.clone().multiplyScalar(0.16).lerp(new THREE.Color(0x120a1c), 0.5), roughness: 0.32, metalness: 0.55 }),
        vein: new THREE.MeshBasicMaterial({ color: col.clone().lerp(new THREE.Color(0xffffff), 0.25) }),
        glow: new THREE.MeshBasicMaterial({ color: col.clone().lerp(new THREE.Color(0xffffff), 0.6) }),
        halo: new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }),
    };
    for (const x of Object.values(m)) x.userData.shared = true;
    _mats.set(ci, m);
    return m;
}

/** The model of an united wand `it` ({ucol}). */
export function unitedWandModel(it) {
    const G = geos(), M = mats(((it.ucol | 0) % UNITED_PALETTE.length + UNITED_PALETTE.length) % UNITED_PALETTE.length);
    const g = new THREE.Group();
    g.add(new THREE.Mesh(G.wood, M.wood), new THREE.Mesh(G.vein, M.vein), new THREE.Mesh(G.glow, M.glow), new THREE.Mesh(G.halo, M.halo));
    g.userData.tipY = 0.68;
    return g;
}

/** For Game.prewarm: every colour's materials are built (a wand of any colour never builds a shader in play). */
export function unitedWandSamples() {
    const out = [];
    for (let i = 0; i < UNITED_PALETTE.length; i++) out.push(unitedWandModel({ ucol: i }));
    return out.slice(0, 2); // (the shader is one per material kind: two samples compile all)
}
