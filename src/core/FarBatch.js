/**
 * FarBatch — many one-shapes (FarShape) of one look drawn as ONE draw.
 *
 * A FarShape already draws a person / an animal / a body as one skinned mesh per material (its parts are the bones,
 * moved by the video card). But a castle of 60 people was still 60 × 2–3 draws — and the shadow pass the same again;
 * after a battle 60 bodies and their swords on top (the author's journal: 400–1000 draws, «графика» 15–28 ms: on ANGLE /
 * Direct3D each draw costs the processor). Here the shapes that have not changed for a moment (STABLE s) are put
 * together: up to SLOTS shapes of the same material, camera layers and shadow, near each other, in one skinned mesh
 * whose skeleton is all their parts. Each bone's matrix is its part's world matrix, copied before the draw (no
 * multiplication — the parts are posed by the game as before); a shape not shown (its model hidden, out of the scene,
 * taken apart) gets zero matrices — its triangles vanish, nothing is rebuilt. The moment a shape changes (a part shown
 * or hidden, a red flash — HurtFlash, its shadow switched near/far — Shadows.setNearShadow, its material, its layers)
 * it leaves: its own mesh is drawn again at once, and the batch is made again later, a few a frame (BUDGET_MS).
 * The look is exactly the shape's own: the same geometry, the same material (its twin), the same shader — compiled
 * on the loading screen with the shape's (Game.prewarm). Only with float textures for the bones (every computer the
 * game runs on; else the skeleton's size would change the shader).
 *
 *   updateFarBatches(scene, renderer)   // once a frame, before the picture (Game)
 */
import * as THREE from 'three';

export const FAR_BATCH = {
    SLOTS: 16, // shapes (their meshes) in one batch at most
    VERTS: 40000, // vertices in one batch at most (a person ~1500, a body ~1500, a cow ~2500)
    STABLE: 1.2, // s a shape must stay as it is before it is put in a batch (a red flash, a change — it waits)
    BUDGET_MS: 1.2, // ms a frame for making batches again
    JOINS: 24, // shapes taken in a frame at most
    NEAR: 40, // m: a shape goes into a batch whose middle is nearer than this (else a new batch — culling stays useful)
    MARGIN: 5, // m round each shape (its own size) for the batch's sphere (culling)
    DROP_AFTER: 5, // s out of the scene before a forgotten shape is let go
};
export const farBatchStats = { rebuilds: 0, batches: 0, slots: 0, joins: 0, leaves: 0 };

const _shapes = new Set(); // every FarShape that may be batched
const _pools = new Map(); // key → [Batch]
let _scene = null;
let _ok = null; // float vertex textures (decided at the first update)
let _clock = 0;
const _dummyBone = new THREE.Object3D();
const _ident = new THREE.Matrix4();

/** A FarShape that may be batched (FarShape calls it). */
export function farBatchAdd(shape) { _shapes.add(shape); }
/** Its shape was made again (FarShape._build): out of its batches now, in again when it has stayed so a moment. */
export function farBatchBuilt(shape) { _leave(shape); shape._ver = (shape._ver || 0) + 1; shape._builtAt = _clock; }
/** It goes away (FarShape.dispose): its slots die, it is forgotten. */
export function farBatchRemove(shape) { _leave(shape); _shapes.delete(shape); }
/** Everything let go (a new game: the old scene's shapes). */
export function resetFarBatches() {
    for (const list of _pools.values()) for (const b of list) b.dispose();
    _pools.clear();
    for (const s of _shapes) { s._slots = null; for (const m of s.meshes) { if (m.userData.batched) { m.userData.batched = false; m.visible = s.on; } } }
    _shapes.clear();
    _scene = null;
}
/** Off: window.__ZNS_NO_FAR_BATCH__ = true before the start (to compare). */
const disabled = () => typeof window !== 'undefined' && !!window.__ZNS_NO_FAR_BATCH__;

/** The shape's model is in the scene and shown all the way up. */
function rootShown(root) {
    let o = root;
    for (; o; o = o.parent) { if (!o.visible) return false; if (!o.parent) break; }
    return !!o?.isScene;
}

const attrSig = (g) => (g.attributes.color ? 'c' : '') + (g.attributes.uv ? 'u' : '') + (g.index && g.index.array instanceof Uint32Array ? 'L' : '');
const keyOf = (m) => `${m.material.id}|${m.layers.mask}|${m.castShadow ? 1 : 0}|${m.receiveShadow ? 1 : 0}|${m.renderOrder}|${attrSig(m.geometry)}`;

class Batch {
    constructor(key, proto) {
        this.key = key;
        this.mat = proto.material;
        this.cs = proto.castShadow;
        this.rs = proto.receiveShadow;
        this.lm = proto.layers.mask;
        this.ro = proto.renderOrder;
        this.sync = proto.onBeforeRender; // (FarShape's syncTwin: the material's live colour / opacity)
        this.slots = []; // in the mesh now (live; some may have died since)
        this.pending = []; // waiting to be put in
        this.dead = 0;
        this.verts = 0; // of the live + pending ones
        this.mesh = null;
        this.cx = 0; this.cz = 0; this.placed = false;
    }

    count() { return this.slots.length - this.dead + this.pending.length; }

    /** The mesh made again from the live and the waiting slots (the dead ones dropped). */
    rebuild(scene) {
        farBatchStats.rebuilds++;
        const list = [];
        for (const s of this.slots) if (!s.dead) list.push(s);
        for (const s of this.pending) if (!s.dead) list.push(s);
        this.pending.length = 0;
        this.dead = 0;
        if (this.mesh) { scene.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.skeleton.dispose(); this.mesh = null; }
        this.slots = list;
        if (!list.length) return;
        let nv = 0, ni = 0, nb = 0;
        for (const s of list) { const g = s.geo; nv += g.attributes.position.count; ni += g.index.count; s.base = nb; nb += s.bones.length; }
        const g0 = list[0].geo;
        const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3);
        const col = g0.attributes.color ? new Float32Array(nv * 3) : null, uv = g0.attributes.uv ? new Float32Array(nv * 2) : null;
        const si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4);
        const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
        let vo = 0, io = 0;
        for (const s of list) {
            const A = s.geo.attributes, n = A.position.count;
            pos.set(A.position.array.subarray(0, n * 3), vo * 3);
            nor.set(A.normal.array.subarray(0, n * 3), vo * 3);
            if (col) col.set(A.color.array.subarray(0, n * 3), vo * 3);
            if (uv) uv.set(A.uv.array.subarray(0, n * 2), vo * 2);
            sw.set(A.skinWeight.array.subarray(0, n * 4), vo * 4);
            const S = A.skinIndex.array;
            for (let i = 0, e = n * 4; i < e; i++) si[vo * 4 + i] = S[i] + s.base;
            const I = s.geo.index.array;
            for (let i = 0, e = s.geo.index.count; i < e; i++) idx[io + i] = I[i] + vo;
            vo += n; io += s.geo.index.count;
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        if (uv) geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
        geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
        geo.setIndex(new THREE.BufferAttribute(idx, 1));
        geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);
        const bones = new Array(nb).fill(_dummyBone), inv = [];
        for (let i = 0; i < nb; i++) inv.push(_ident);
        const sk = new THREE.Skeleton(bones, inv);
        const batch = this;
        sk.update = function () { batch.pose(this); }; // (the parts' own world matrices: copied, not computed)
        const mesh = new THREE.SkinnedMesh(geo, this.mat);
        mesh.bind(sk, _ident);
        mesh.matrixAutoUpdate = false;
        mesh.castShadow = this.cs;
        mesh.receiveShadow = this.rs;
        mesh.layers.mask = this.lm;
        mesh.renderOrder = this.ro;
        if (this.sync) mesh.onBeforeRender = this.sync;
        mesh.raycast = () => {}; // (the parts are what is hit)
        mesh.userData.farOne = true; mesh.userData.farBatch = true;
        mesh.name = 'farbatch';
        this.mesh = mesh;
        this.verts = nv;
        for (const s of list) { s.live = true; s.mesh.userData.batched = true; s.mesh.visible = false; }
        scene.add(mesh);
        this.bound();
    }

    /** The bones: each shown slot's parts as the game posed them; a slot not shown — zeros (its triangles vanish). */
    pose(sk) {
        const out = sk.boneMatrices;
        for (const s of this.slots) {
            const o = s.base * 16, B = s.bones;
            if (s.dead || !s.shape.on || !s.shown) { out.fill(0, o, o + B.length * 16); continue; }
            for (let i = 0; i < B.length; i++) out.set(B[i].matrixWorld.elements, o + i * 16);
        }
        if (sk.boneTexture) sk.boneTexture.needsUpdate = true;
    }

    /** The batch's sphere: round its shown shapes (for the camera's and the sun's culling). */
    bound() {
        const m = this.mesh;
        if (!m) return;
        let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity, r = 0, any = false;
        for (const s of this.slots) {
            if (s.dead || !s.shown) continue;
            const e = s.shape.root.matrixWorld.elements, x = e[12], y = e[13], z = e[14];
            if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; if (z < z0) z0 = z; if (z > z1) z1 = z;
            if (s.r > r) r = s.r;
            any = true;
        }
        m.visible = any;
        if (!any) return;
        const S = m.geometry.boundingSphere;
        S.center.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
        S.radius = Math.hypot(x1 - x0, y1 - y0, z1 - z0) / 2 + r + FAR_BATCH.MARGIN;
        this.cx = S.center.x; this.cz = S.center.z; this.placed = true;
    }

    dispose() {
        if (this.mesh) { this.mesh.parent?.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.skeleton.dispose(); this.mesh = null; }
        for (const s of this.slots) if (s.mesh.userData.batched) { s.mesh.userData.batched = false; s.mesh.visible = s.shape.on; }
        this.slots.length = 0; this.pending.length = 0;
    }
}

/** The shape's slots die: its own meshes are drawn again at once. */
function _leave(shape) {
    if (!shape._slots) return;
    farBatchStats.leaves++;
    for (const s of shape._slots) {
        if (s.dead) continue;
        s.dead = true;
        if (s.live) { s.batch.dead++; s.mesh.userData.batched = false; s.mesh.visible = shape.on && s.mesh.parent === shape.root; }
        else { const p = s.batch.pending, i = p.indexOf(s); if (i >= 0) p.splice(i, 1); }
        s.batch.verts -= s.geo.attributes.position.count;
    }
    shape._slots = null;
    shape._leftAt = _clock;
}

/** Still as it was put in: the same build, on, the same material / shadow / layers on each of its meshes. */
function _same(shape) {
    if (!shape.on || shape._slotsVer !== shape._ver) return false;
    for (const s of shape._slots) {
        const m = s.mesh, b = s.batch;
        if (m.material !== b.mat || m.castShadow !== b.cs || m.layers.mask !== b.lm || m.receiveShadow !== b.rs || m.parent !== shape.root) return false;
    }
    return true;
}

function _join(shape) {
    const ms = shape.meshes.filter((m) => !m.material?.transparent); // (see-through ones are sorted one by one: drawn as themselves)
    if (!ms.length) return false;
    for (const m of ms) if (!m.material?.isMaterial || m.material.userData?.src === undefined && m.material.name !== 'farshape-plain') return false; // (a red copy on it: later)
    const e = shape.root.matrixWorld.elements, x = e[12], z = e[14];
    const slots = [];
    for (const m of ms) {
        const k = keyOf(m), nv = m.geometry.attributes.position.count;
        let list = _pools.get(k);
        if (!list) _pools.set(k, (list = []));
        let best = null, bd = FAR_BATCH.NEAR;
        for (const b of list) {
            if (b.count() >= FAR_BATCH.SLOTS || b.verts + nv > FAR_BATCH.VERTS) continue;
            const d = b.placed ? Math.hypot(b.cx - x, b.cz - z) : 0;
            if (d < bd) { bd = d; best = b; }
        }
        if (!best) { best = new Batch(k, m); best.cx = x; best.cz = z; best.placed = true; list.push(best); }
        const s = { shape, mesh: m, geo: m.geometry, bones: shape.skeleton.bones, base: 0, batch: best, live: false, dead: false, shown: true, r: shape.root.userData.farRadius || 4 };
        best.pending.push(s);
        best.verts += nv;
        slots.push(s);
    }
    shape._slots = slots;
    shape._slotsVer = shape._ver;
    farBatchStats.joins++;
    return true;
}

/**
 * Once a frame, before the picture: shapes changed leave their batches, shapes still for a moment join one, the batches
 * waiting are made again (a few a frame), each batch's sphere follows its shapes.
 */
export function updateFarBatches(scene, renderer, dt = 1 / 60) {
    if (_ok === null) _ok = !!renderer?.capabilities?.floatVertexTextures;
    if (!_ok || disabled() || !scene) return;
    if (_scene !== scene) { if (_scene) resetFarBatches(); _scene = scene; }
    _clock += dt;
    let joins = 0;
    for (const sh of _shapes) {
        const shown = sh.on && rootShown(sh.root);
        if (sh._slots) {
            if (!_same(sh)) _leave(sh);
            else for (const s of sh._slots) s.shown = shown;
        }
        if (!shown && sh.on && !sh.root.parent) {
            // (taken out of the scene and never disposed: forgotten after a while — no batch keeps it)
            if ((sh._outT = (sh._outT || 0) + dt) > FAR_BATCH.DROP_AFTER) { _leave(sh); _shapes.delete(sh); sh._batchable = false; }
            continue;
        }
        sh._outT = 0;
        if (!sh._slots && shown && joins < FAR_BATCH.JOINS && _clock - Math.max(sh._builtAt ?? -1e9, sh._leftAt ?? -1e9) > FAR_BATCH.STABLE) { if (_join(sh)) joins++; }
    }
    // the batches: made again where shapes wait or many died (a few a frame), their spheres followed
    const t0 = performance.now();
    let n = 0, ns = 0;
    for (const [k, list] of _pools) {
        for (let i = list.length - 1; i >= 0; i--) {
            const b = list[i];
            const want = b.pending.length > 0 || (b.dead > 0 && (b.dead * 3 >= b.slots.length || b.count() === 0));
            if (want && performance.now() - t0 < FAR_BATCH.BUDGET_MS) b.rebuild(scene);
            if (!b.slots.length && !b.pending.length) { b.dispose(); list.splice(i, 1); continue; }
            b.bound();
            n++; ns += b.slots.length - b.dead;
        }
        if (!list.length) _pools.delete(k);
    }
    farBatchStats.batches = n; farBatchStats.slots = ns;
}
