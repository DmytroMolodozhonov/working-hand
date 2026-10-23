/**
 * FarShape — a model of many moving parts (an animal: legs in joints, head, ears, tail… ~22 parts, 22 draws) drawn as
 * ONE shape per material, its parts moved by the VIDEO CARD (the author's rule «всё сложное — на видеокарту»): the
 * merged shape is a skinned mesh whose every vertex belongs to one part, and each part's own object is that vertex's
 * «bone» — the card puts it where the part is this frame. So the shape is posed every frame (whatever the distance) and
 * nothing is recomputed on the processor; the parts themselves stay (hidden, still hit, still animated as before).
 * The merged geometry is the same for every model of a kind (its parts' shared shapes): made once and kept (CACHE_MAX).
 * A herd round Creative's start cost ~260 draws near and ~150 far; with this ~4 an animal.
 *
 *   const one = new FarShape(model);
 *   one.set(true);   // drawn as one shape (the parts hidden)
 *   one.check();     // now and then: a part shown / hidden / repainted by the game → the shape follows
 *   one.set(false);  // the parts as they were
 * Left out (drawn as themselves): parts with `userData.farOne` / `userData.noFar`, instanced, morphing (a pig's wings),
 * multi-material ones.
 */
import * as THREE from 'three';

export const FAR_SHAPE = { CACHE_MAX: 96 };

const _geoCache = new Map(); // parts' geometry ids → merged geometry (shared by every model of that kind; never disposed)
const _skinMats = new WeakMap(); // material → its skinned twin (the same look, moved by the card)
const _ident = new THREE.Matrix4();
/**
 * Plain lit colour (a Lambert material: no picture, no glow, opaque): such parts of a model share ONE bucket — the material's
 * colour baked into the vertices' (an animal's hide, horns, hooves, eyes of different colours: one draw instead of 5–8).
 */
const plainLit = (m) => m.isMeshLambertMaterial && !m.map && !m.transparent && !m.alphaTest && !(m.emissive && (m.emissive.r || m.emissive.g || m.emissive.b)) && m.onBeforeCompile === THREE.Material.prototype.onBeforeCompile;
const _plain = new Map(); // side → the shared white vertex-coloured Lambert the baked buckets draw with
function plainMat(side) {
    let m = _plain.get(side);
    if (!m) { m = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side }); m.name = 'farshape-plain'; _plain.set(side, m); }
    return m;
}
/** A part's own material (a red flash of HurtFlash on it is not a new look: the shape flashes by itself). */
const baseMat = (p) => p.userData._hurtLit?.orig || p.material;

/** The material's twin that the video card moves by the bones (r128: `skinning` is the material's own switch). */
export function skinnedMaterial(mat) {
    let m = _skinMats.get(mat);
    if (!m) {
        m = mat.clone();
        m.skinning = true;
        if (mat.onBeforeCompile) m.onBeforeCompile = mat.onBeforeCompile; // (the sky's tint etc.: the same shader)
        if (mat.customProgramCacheKey) m.customProgramCacheKey = mat.customProgramCacheKey;
        m.name = (mat.name || '') + '+skin';
        _skinMats.set(mat, m);
    }
    return m;
}

function mergedGeometry(parts, idxs, key, bake = false) {
    let geo = key != null ? _geoCache.get(key) : null;
    if (geo) return geo;
    let nv = 0, ni = 0;
    for (const m of parts) { nv += m.geometry.attributes.position.count; ni += m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count; }
    const mat = baseMat(parts[0]);
    const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3);
    const col = bake || mat.vertexColors ? new Float32Array(nv * 3) : null;
    const uv = mat.map && parts.every((m) => m.geometry.attributes.uv) ? new Float32Array(nv * 2) : null;
    const si = new Uint16Array(nv * 4), sw = new Float32Array(nv * 4);
    const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let vo = 0, io = 0;
    parts.forEach((m, k) => {
        const G = m.geometry, n = G.attributes.position.count, P = G.attributes.position, N = G.attributes.normal;
        for (let i = 0; i < n; i++) {
            const o = (vo + i) * 3;
            pos[o] = P.getX(i); pos[o + 1] = P.getY(i); pos[o + 2] = P.getZ(i);
            nor[o] = N.getX(i); nor[o + 1] = N.getY(i); nor[o + 2] = N.getZ(i);
            si[(vo + i) * 4] = idxs[k]; sw[(vo + i) * 4] = 1;
        }
        if (col) {
            // (baked: the part's material colour times its own vertex colours — exactly what its material drew)
            const pm = baseMat(m), c = pm.vertexColors ? G.attributes.color : null, t = bake ? pm.color : null;
            const r = t ? t.r : 1, gg = t ? t.g : 1, bb = t ? t.b : 1;
            for (let i = 0; i < n; i++) { const o = (vo + i) * 3; col[o] = (c ? c.getX(i) : 1) * r; col[o + 1] = (c ? c.getY(i) : 1) * gg; col[o + 2] = (c ? c.getZ(i) : 1) * bb; }
        }
        if (uv) { const U = G.attributes.uv; for (let i = 0; i < n; i++) { uv[(vo + i) * 2] = U.getX(i); uv[(vo + i) * 2 + 1] = U.getY(i); } }
        if (G.index) for (let i = 0; i < G.index.count; i++) idx[io++] = G.index.getX(i) + vo; else for (let i = 0; i < n; i++) idx[io++] = vo + i;
        vo += n;
    });
    geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (uv) geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    geo.setIndex(new THREE.BufferAttribute(idx, 1));
    geo.userData.shared = true; // (kept: every model of the kind draws it)
    if (key != null && _geoCache.size < FAR_SHAPE.CACHE_MAX) _geoCache.set(key, geo);
    else geo.userData.own = true; // (an odd kind past the cache's size: its model's own, disposed with it)
    return geo;
}

export class FarShape {
    /** @param {THREE.Object3D} root the model (its group: the shape is its child) */
    /** @param {{cache?: boolean}} [o] cache: false — the model's parts are its own (a person's proportions): its shape is its own too */
    constructor(root, { cache = true } = {}) {
        this.root = root;
        this.cache = cache;
        this.on = false;
        this.parts = []; // the meshes hidden for the shape (= the skeleton's bones, in order)
        this.meshes = []; // the skinned meshes (one per material)
        this.skeleton = null;
        this._sig = '';
    }

    /** The parts that go into the shape: drawn now (shown up to the root), plain meshes. */
    _shown(out) {
        out.length = 0;
        const R = this.root;
        R.traverse((o) => {
            if (!o.isMesh || o.userData.farOne || o.userData.noFar || o.isInstancedMesh || o.isSkinnedMesh) return;
            for (let q = o; q && q !== R; q = q.parent) if (!q.visible && !(q === o && this.on && this.parts.includes(o))) return;
            const G = o.geometry, M = o.material;
            if (!G?.attributes?.position || !G.attributes.normal || Array.isArray(M) || !M || M.morphTargets || M.skinning || G.morphAttributes?.position) return;
            out.push(o);
        });
        return out;
    }

    set(on) {
        if (on === this.on) return;
        this.on = on;
        if (!on) {
            for (const p of this.parts) { p.visible = true; delete p.userData.farHid; }
            for (const m of this.meshes) m.visible = false;
            return;
        }
        this._sig = this._sig || '';
        this.check(true);
    }

    /** Which parts are shown (and in which material) as the game has them now: the shape made again only if that changed. */
    check(force = false) {
        if (!this.on) return;
        const list = this._shown(this._list || (this._list = []));
        let sig = '';
        for (const p of list) sig += p.geometry.id + ':' + baseMat(p).id + ',';
        if (!force && sig === this._sig) return;
        // (a part whose joint the game hid: out of the shape, its own flag given back — the joint keeps it hidden)
        for (const p of this.parts) if (!list.includes(p)) { p.visible = true; delete p.userData.farHid; }
        this.parts.length = 0;
        for (const p of list) { this.parts.push(p); p.visible = false; p.userData.farHid = true; } // (farHid: a copy of the model — a body — shows it again)
        if (sig !== this._sig || !this.meshes.length) { this._sig = sig; this._build(list); }
        for (const m of this.meshes) m.visible = true;
    }

    _build(list) {
        this._drop();
        if (!list.length) return;
        this.skeleton = new THREE.Skeleton(list.slice(), list.map(() => new THREE.Matrix4()));
        const by = new Map();
        list.forEach((p) => { const bm = baseMat(p), key = plainLit(bm) ? plainMat(bm.side) : bm; let a = by.get(key); if (!a) by.set(key, (a = { parts: [] })); a.parts.push(p); });
        // (whatever the pose: the model's own size round its centre, in its own units)
        const r = (this.root.userData.farRadius || 4) / Math.max(1e-3, this.root.scale.x);
        // (shadows: as its parts would cast — Shadows.setNearShadow keeps that in `_cs` and switches it near/far)
        const casts = list.some((p) => (p.userData._cs ?? p.castShadow)), anyShadow = casts && this.root.userData._shadowOn !== false, anyRecv = list.some((p) => p.receiveShadow);
        for (const [mat, b] of by) {
            // (its parts' places in the skeleton and their shapes: the same for every model of the kind — one geometry for all)
            const idxs = b.parts.map((p) => list.indexOf(p));
            const bake = mat.name === 'farshape-plain';
            const geo = mergedGeometry(b.parts, idxs, this.cache ? idxs.join(',') + '|' + b.parts.map((p) => p.geometry.id + (bake ? '.' + baseMat(p).id : '')).join(',') : null, bake);
            const mesh = new THREE.SkinnedMesh(geo, skinnedMaterial(mat));
            mesh.bind(this.skeleton, _ident);
            mesh.castShadow = anyShadow;
            mesh.userData._cs = casts;
            mesh.receiveShadow = anyRecv;
            mesh.raycast = () => {}; // (the parts are what is hit)
            mesh.userData.farOne = true;
            this._sphere(geo, r);
            this.root.add(mesh);
            this.meshes.push(mesh);
        }
    }

    _sphere(geo, r) {
        // (r128 culls a skinned mesh by its geometry's sphere: the model's own, not the parts' rest shapes)
        if (!geo.userData.sphereR || geo.userData.sphereR < r) { geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, r * 0.35, 0), r); geo.userData.sphereR = r; }
    }

    _drop() {
        for (const m of this.meshes) { this.root.remove(m); if (m.geometry.userData.own) m.geometry.dispose(); }
        this.meshes.length = 0;
        if (this.skeleton) { this.skeleton.dispose?.(); this.skeleton = null; }
    }

    /** The shape taken away for good (the model removed). */
    dispose() {
        this.set(false);
        this._drop();
        this._sig = '';
    }
}

/**
 * Small skinned meshes in these materials' twins (and the shared plain one, both sides) — for Game.prewarm: the shaders
 * the one shapes need are compiled on the loading screen, not when the first herd / far crowd / red flash is seen.
 */
export function skinnedSamples(materials) {
    const geo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    const n = geo.attributes.position.count;
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4), 4));
    const w = new Float32Array(n * 4); for (let i = 0; i < n; i++) w[i * 4] = 1;
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(w, 4));
    const c = new Float32Array(n * 3).fill(1);
    geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
    const out = [];
    for (const m of [...materials, plainMat(THREE.FrontSide), plainMat(THREE.DoubleSide)]) {
        const bone = new THREE.Object3D();
        const sm = new THREE.SkinnedMesh(geo, skinnedMaterial(m));
        sm.add(bone);
        sm.bind(new THREE.Skeleton([bone], [new THREE.Matrix4()]), _ident);
        sm.castShadow = true;
        sm.frustumCulled = false;
        out.push(sm);
    }
    return out;
}
