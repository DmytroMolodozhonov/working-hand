/**
 * AppleTrees.js — the look of the apple trees (Animals.js places them, keeps their apples, lets them be picked).
 *
 * Grown like the world's real trees (TreeBuild.js, kinds 5 and 6): a short crooked trunk forking low, spreading limbs,
 * a round crown of leaves — and real apples hanging under the branches' ends, within a raised hand's reach.
 *  - the ordinary apple tree: green leaves, red apples with a yellow blush;
 *  - the golden apple tree (the author: «оно должно быть светящимся — показывать, что это реально магическое дерево»):
 *    golden bark and golden leaves that shine with their own light, glowing golden apples, a soft golden halo round the
 *    crown (a sprite: no light source of its own — the number of lights stays the same), all slowly pulsing; brighter
 *    at night, seen from far through the dark (the halo is not hidden by the fog). Sparkles rise from its apples
 *    (Animals.update: the shared particle pool).
 * Everything shared: the shapes, the materials, the apple; one halo texture.
 */
import * as THREE from 'three';
import { buildTree } from '../world/TreeBuild.js';
import { sharedTreeMaterials, treeGeometry, GOLD_GLOW, VIOLET_GLOW, TREE_WIND } from '../world/TreeMaterials.js';

/** The shapes (TreeBuild variants) of the apple trees with apples enough all round. */
const GOOD = new Map();
function goodVariants(kind) {
    let list = GOOD.get(kind);
    if (!list) {
        list = [];
        for (let v = 0; v < 12; v++) if (buildTree(kind, v).info.apples.length >= 12) list.push(v);
        if (!list.length) list.push(0);
        GOOD.set(kind, list);
    }
    return list;
}

/** The pulse of the golden tree and the Baksadi (Animals.update sets it every frame — one for all of them). */
export const GOLDEN = { halo: null, apple: null, t: 0, vHalo: null, pear: null };

let _apple = null, _redMat = null, _goldMat = null, _haloTex = null, _pear = null, _pearMat = null, _violetHaloTex = null;

/**
 * A pear of the Baksadi: a real pear's outline (a full round belly, a waist, a narrower neck bending a little to one side, a
 * dimple at the bottom, a short woody stalk with a tiny leaf), about half a metre long — one shape for every pear. Vertex colours:
 * pale gold-green, a violet-pink blush on one side, the neck lighter, the stalk brown.
 */
export function pearGeometry() {
    if (_pear) return _pear;
    // the outline, from the bottom up: [radius, height]
    const prof = [[0.002, -0.215], [0.07, -0.205], [0.125, -0.17], [0.158, -0.11], [0.165, -0.05], [0.145, 0.02], [0.108, 0.085], [0.082, 0.14], [0.07, 0.19], [0.06, 0.235], [0.04, 0.27], [0.012, 0.285], [0.002, 0.29]];
    const pts = prof.map(([r, y]) => new THREE.Vector2(r, y));
    const body = new THREE.LatheGeometry(pts, 14);
    const pos = body.attributes.position, col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        // the neck bends: the upper part is moved aside
        const bend = Math.max(0, y - 0.0) * 0.16;
        pos.setX(i, x + bend * (y > 0 ? 1 : 0));
        const k = 0.5 + 0.5 * Math.sin(Math.atan2(z, x) + 0.6), up = Math.min(1, Math.max(0, (y + 0.1) / 0.35));
        // gold-green, lighter towards the neck; the blush on the sunny side: violet-pink
        const blush = k * k * (1 - up * 0.8);
        col[i * 3] = 0.88 + 0.12 * blush - 0.1 * up; col[i * 3 + 1] = 0.92 - 0.38 * blush - 0.06 * up; col[i * 3 + 2] = 0.55 + 0.4 * blush;
        if (y > 0.255) { col[i * 3] = 0.36; col[i * 3 + 1] = 0.24; col[i * 3 + 2] = 0.18; } // (the stalk)
    }
    body.setAttribute('color', new THREE.BufferAttribute(col, 3));
    body.computeVertexNormals();
    body.userData.keep = true;
    return (_pear = body);
}

function violetHaloTexture() {
    if (_violetHaloTex) return _violetHaloTex;
    if (typeof document === 'undefined') return (_violetHaloTex = new THREE.DataTexture(new Uint8Array([190, 140, 255, 80]), 1, 1, THREE.RGBAFormat)); // (no canvas: a test in node)
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(214,170,255,0.5)');
    g.addColorStop(0.35, 'rgba(170,110,240,0.26)');
    g.addColorStop(0.7, 'rgba(130,70,210,0.08)');
    g.addColorStop(1, 'rgba(110,50,200,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    return (_violetHaloTex = new THREE.CanvasTexture(c));
}
/** An apple: round, a little wider than tall, a dimple on top, a short stalk (one shape for every apple). */
function appleGeometry() {
    if (_apple) return _apple;
    const pts = [];
    for (let i = 0; i <= 10; i++) {
        const t = i / 10, a = -Math.PI / 2 + t * Math.PI;
        const r = Math.cos(a) * (1 - 0.12 * Math.max(0, Math.sin(a))) * 0.17;
        let y = Math.sin(a) * 0.15;
        if (t > 0.85) y -= (t - 0.85) * 0.25; // (the dimple round the stalk)
        pts.push(new THREE.Vector2(Math.max(0.002, r), y));
    }
    const body = new THREE.LatheGeometry(pts, 12);
    // a blush: one side yellower (vertex colours), the stalk dark
    const pos = body.attributes.position, col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
        const k = 0.5 + 0.5 * Math.sin(Math.atan2(pos.getZ(i), pos.getX(i)) + 0.7);
        col[i * 3] = 1; col[i * 3 + 1] = 0.75 + 0.25 * k * k; col[i * 3 + 2] = 0.8 + 0.2 * k;
    }
    body.setAttribute('color', new THREE.BufferAttribute(col, 3));
    body.userData.keep = true;
    _apple = body;
    return body;
}

function haloTexture() {
    if (_haloTex) return _haloTex;
    if (typeof document === 'undefined') return (_haloTex = new THREE.DataTexture(new Uint8Array([255, 210, 120, 80]), 1, 1, THREE.RGBAFormat)); // (no canvas: a test in node)
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,230,140,0.55)');
    g.addColorStop(0.35, 'rgba(255,200,80,0.3)');
    g.addColorStop(0.7, 'rgba(255,170,40,0.09)');
    g.addColorStop(1, 'rgba(255,160,30,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    _haloTex = new THREE.CanvasTexture(c);
    return _haloTex;
}

function materials() {
    if (!_redMat) {
        _redMat = new THREE.MeshStandardMaterial({ color: 0xc8202a, roughness: 0.42, metalness: 0.05, vertexColors: true });
        _goldMat = new THREE.MeshStandardMaterial({ color: 0xffd040, roughness: 0.28, metalness: 0.65, emissive: 0xffaa1e, emissiveIntensity: 0.6, vertexColors: true });
        GOLDEN.apple = _goldMat;
        GOLDEN.halo = new THREE.SpriteMaterial({ map: haloTexture(), color: 0xffd060, transparent: true, opacity: 0.4, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
        _pearMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.38, metalness: 0.1, emissive: 0x8a4cd8, emissiveIntensity: 0.35, vertexColors: true });
        GOLDEN.pear = _pearMat;
        GOLDEN.vHalo = new THREE.SpriteMaterial({ map: violetHaloTexture(), color: 0xc9a0ff, transparent: true, opacity: 0.3, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    }
    return { red: _redMat, gold: _goldMat, pear: _pearMat };
}

/**
 * An apple tree's model: the golden one, or an ordinary one with red apples (red = true). `pick` chooses its shape
 * (0…1: a hash of its place). userData.apples: the apple meshes (Animals hides a picked one till it grows again).
 */
export function appleTreeModel(red = false, pick = 0) {
    const kind = red ? 5 : 6;
    const list = goodVariants(kind);
    const v = list[Math.floor(Math.max(0, Math.min(0.999, pick)) * list.length)];
    const shape = treeGeometry(kind, v, false);
    const M = sharedTreeMaterials(), A = materials();
    const g = new THREE.Group();
    const wood = new THREE.Mesh(shape.wood, M.bark);
    const leaf = new THREE.Mesh(shape.leaf, red ? M.leaves : M.gold);
    leaf.customDepthMaterial = M.depth;
    for (const m of [wood, leaf]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
    const apples = [];
    for (const [x, y, z] of shape.info.apples) {
        const a = new THREE.Mesh(appleGeometry(), red ? A.red : A.gold);
        a.position.set(x, y, z);
        a.rotation.set((x * 7.3) % 0.4, (z * 3.1) % 6.28, (y * 5.7) % 0.4);
        a.castShadow = true;
        g.add(a);
        apples.push(a);
    }
    if (!red) {
        // the halo round the crown (and a smaller, brighter one at its heart)
        const c = shape.info.crown, cy = (c.lowest + shape.info.H) / 2;
        for (const [s, k] of [[2.3, 1], [1.2, 1]]) {
            const h = new THREE.Sprite(GOLDEN.halo);
            h.position.set(0, cy, 0);
            h.scale.setScalar(Math.max(c.rx, (shape.info.H - c.lowest) / 2) * s * k);
            h.renderOrder = 2;
            h.raycast = () => {};
            g.add(h);
        }
    }
    g.userData.apples = apples;
    g.userData.golden = !red;
    g.userData.trunkR = shape.info.trunk.r;
    return g;
}

/**
 * A Baksadi: the huge violet magic tree (TreeBuild kind 7) with pears hanging low on its drooping limbs, a faint violet halo
 * round the crown. Same shape as the apple trees' model: userData.apples are the pear meshes (Animals hides a picked one).
 */
export function baksadiTreeModel(pick = 0) {
    const list = goodVariants(7);
    const v = list[Math.floor(Math.max(0, Math.min(0.999, pick)) * list.length)];
    const shape = treeGeometry(7, v, false);
    const M = sharedTreeMaterials(), A = materials();
    const g = new THREE.Group();
    const wood = new THREE.Mesh(shape.wood, M.bark);
    const leaf = new THREE.Mesh(shape.leaf, M.violet);
    leaf.customDepthMaterial = M.depth;
    for (const m of [wood, leaf]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
    const pears = [];
    for (const [x, y, z] of shape.info.apples) {
        const a = new THREE.Mesh(pearGeometry(), A.pear);
        a.position.set(x, y + 0.2, z);
        a.rotation.set(((x * 7.3) % 0.3) - 0.15, (z * 3.1) % 6.28, ((y * 5.7) % 0.3) - 0.15);
        a.castShadow = true;
        g.add(a);
        pears.push(a);
    }
    const c = shape.info.crown, cy = (c.lowest + shape.info.H) / 2;
    for (const k of [2.0, 1.1]) {
        const h = new THREE.Sprite(GOLDEN.vHalo);
        h.position.set(0, cy, 0);
        h.scale.setScalar(Math.max(c.rx, (shape.info.H - c.lowest) / 2) * k);
        h.renderOrder = 2;
        h.raycast = () => {};
        g.add(h);
    }
    g.userData.apples = pears;
    g.userData.baksadi = true;
    g.userData.crown = { rx: c.rx, cy, top: shape.info.H };
    g.userData.trunkR = shape.info.trunk.r;
    return g;
}

/**
 * The golden trees' pulse (once a frame for all of them): soft by day, strong at night (night 0…1 — World._night).
 */
export function pulseGolden(dt, night = 0) {
    TREE_WIND.time.value += Math.min(0.1, dt); // (the wind in every tree's leaves — the world's and the apple trees)
    if (!GOLDEN.halo) return;
    GOLDEN.t += dt;
    const q = 0.5 + 0.5 * Math.sin(GOLDEN.t * 0.9 + 1.7); // (the Baksadi breathes slower than the golden tree)
    VIOLET_GLOW.value = 0.1 + 0.08 * q + 0.3 * night;
    GOLDEN.pear.emissiveIntensity = 0.28 + 0.25 * q + 0.55 * night;
    GOLDEN.vHalo.opacity = 0.12 + 0.08 * q + 0.4 * night;
    const p = 0.5 + 0.5 * Math.sin(GOLDEN.t * 1.3);
    GOLD_GLOW.value = 0.32 + 0.18 * p + 0.35 * night;
    GOLDEN.apple.emissiveIntensity = 0.5 + 0.35 * p + 0.6 * night;
    GOLDEN.halo.opacity = 0.22 + 0.12 * p + 0.55 * night;
}
