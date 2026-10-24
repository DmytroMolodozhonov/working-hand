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
 * multi-material ones, own shaders, cut-out shadows (leaves with a custom depth material).
 */
import * as THREE from 'three';

export const FAR_SHAPE = { CACHE_MAX: 96 };
/** How many shapes were made (its count only grows: a measure for creativebench — a part flickering would show here). */
export const farShapeStats = { builds: 0, merged: 0 };

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
    if (!m) { m = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true, side }); m.name = 'farshape-plain'; m.userData.shared = true; _plain.set(side, m); }
    return m;
}
/** Before a draw: the twin takes what the game changed on its material (opacity, colours) this frame. */
function syncTwin() {
    const tw = this.material, src = tw.userData.src;
    if (!src?.isMaterial) return; // (a red flash's copy — HurtFlash: its own colour, and clone() left only a plain object here)
    if (tw.opacity !== src.opacity) tw.opacity = src.opacity;
    if (tw.color && src.color && !tw.color.equals(src.color)) tw.color.copy(src.color);
    if (tw.emissive && src.emissive && !tw.emissive.equals(src.emissive)) tw.emissive.copy(src.emissive);
    if (tw.emissiveIntensity !== src.emissiveIntensity) tw.emissiveIntensity = src.emissiveIntensity;
}
/** A part's own material (a red flash of HurtFlash on it is not a new look: the shape flashes by itself). */
const baseMat = (p) => p.userData._hurtLit?.orig || p.material;
/** A part's camera layers (the ones it had before the shape took it — FarShape 'layers'). */
const layerOf = (p) => p.userData.farMask ?? p.layers.mask;

/** The material's twin that the video card moves by the bones (r128: `skinning` is the material's own switch). */
export function skinnedMaterial(mat) {
    let m = _skinMats.get(mat);
    if (!m) {
        m = mat.clone();
        m.skinning = true;
        if (mat.onBeforeCompile) m.onBeforeCompile = mat.onBeforeCompile; // (the sky's tint etc.: the same shader)
        if (mat.customProgramCacheKey) m.customProgramCacheKey = mat.customProgramCacheKey;
        m.name = (mat.name || '') + '+skin';
        m.userData.src = mat;
        m.userData.shared = true; // (one twin for every model: not disposed with a model — ItemTypes.disposeModel)
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
    farShapeStats.merged++;
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
    /** hide: 'visible' (the parts' flags — they stay hit by rays) or 'layers' (their camera layers emptied: the game's own
     *  `visible` stays the truth, read every check — the hero's hands, shown and hidden by the game every frame) */
    constructor(root, { cache = true, hide = 'visible' } = {}) {
        this.root = root;
        this.cache = cache;
        this.byLayers = hide === 'layers';
        this.on = false;
        this.parts = []; // the meshes hidden for the shape (= the skeleton's bones, in order)
        this.meshes = []; // the skinned meshes (one per material)
        this.skeleton = null;
        this._sig = null;
    }

    /** The parts that go into the shape: drawn now (shown up to the root), plain meshes. */
    _shown(out) {
        out.length = 0;
        const R = this.root;
        R.traverse((o) => {
            if (!o.isMesh || o.userData.farOne || o.userData.noFar || o.isInstancedMesh || o.isSkinnedMesh) return;
            if (this.byLayers) {
                for (let q = o; q && q !== R; q = q.parent) if (!q.visible) return;
                if (o.userData.farMask != null && o.layers.mask !== 0) { o.userData.farMask = o.layers.mask; o.layers.mask = 0; } // (the game set its layer anew: taken)
                if (layerOf(o) === 0) return;
            }
            else for (let q = o; q && q !== R; q = q.parent) if (!q.visible && !(q === o && this.on && this.parts.includes(o))) return;
            const G = o.geometry, M = o.material;
            if (!G?.attributes?.position || !G.attributes.normal || Array.isArray(M) || !M || M.morphTargets || M.skinning || M.isShaderMaterial || o.customDepthMaterial || o.customDistanceMaterial || G.morphAttributes?.position) return; // (own shaders, cut-out shadows: drawn as themselves)
            out.push(o);
        });
        return out;
    }

    set(on) {
        if (on === this.on) return;
        this.on = on;
        if (!on) {
            for (const p of this.parts) this._show(p);
            for (const m of this.meshes) m.visible = false;
            return;
        }
        this.check(true);
    }

    /** Which parts are shown (and in which material) as the game has them now: the shape made again only if that changed. */
    check(force = false) {
        if (!this.on) return;
        const list = this._shown(this._list || (this._list = []));
        // (what the shape is made of, as one number — no strings: the hero's hands are checked every frame)
        let sig = list.length;
        for (const p of list) {
            sig = (Math.imul(sig, 31) + p.geometry.id) | 0;
            sig = (Math.imul(sig, 31) + baseMat(p).id) | 0;
            sig = (Math.imul(sig, 31) + layerOf(p) * 2 + (p.userData._cs ?? p.castShadow ? 1 : 0)) | 0;
            sig = (Math.imul(sig, 31) + p.id) | 0;
        }
        if (!force && sig === this._sig) return;
        // (a part whose joint the game hid: out of the shape, its own flag given back — the joint keeps it hidden)
        for (const p of this.parts) if (!list.includes(p)) this._show(p); // (noFar: the game took it out — an apple picked: it stays hidden)
        this.parts.length = 0;
        for (const p of list) { this.parts.push(p); this._hide(p); }
        if (sig !== this._sig || !this.meshes.length) { this._sig = sig; this._build(list); }
        for (const m of this.meshes) m.visible = true;
    }

    /** A part taken into the shape: not drawn by itself (farHid: a copy of the model — a body — shows it again). */
    _hide(p) {
        if (this.byLayers) { if (p.userData.farMask == null) { p.userData.farMask = p.layers.mask; p.layers.mask = 0; } }
        else { p.visible = false; p.userData.farHid = true; }
    }

    _show(p) {
        if (this.byLayers) { if (p.userData.farMask != null) { p.layers.mask = p.userData.farMask; delete p.userData.farMask; } return; }
        if (!p.userData.noFar) p.visible = true;
        delete p.userData.farHid;
    }

    _build(list) {
        farShapeStats.builds++;
        this._drop();
        if (!list.length) return;
        this.skeleton = new THREE.Skeleton(list.slice(), list.map(() => new THREE.Matrix4()));
        // (a bucket: one material (or the plain-coloured family), one set of camera layers, one shadow — as its parts had them)
        const by = new Map();
        for (const p of list) {
            const bm = baseMat(p), mat = plainLit(bm) ? plainMat(bm.side) : bm, cs = !!(p.userData._cs ?? p.castShadow), lm = layerOf(p);
            const k = mat.id + '|' + lm + '|' + (cs ? 1 : 0);
            let a = by.get(k);
            if (!a) by.set(k, (a = { mat, lm, cs, parts: [] }));
            a.parts.push(p);
        }
        // (whatever the pose: the model's own size round its centre, in its own units)
        const r = (this.root.userData.farRadius || 4) / Math.max(1e-3, this.root.scale.x);
        const anyRecv = list.some((p) => p.receiveShadow), shadowsOn = this.root.userData._shadowOn !== false;
        for (const b of by.values()) {
            const mat = b.mat;
            // (its parts' places in the skeleton and their shapes: the same for every model of the kind — one geometry for all)
            const idxs = b.parts.map((p) => list.indexOf(p));
            const bake = mat.name === 'farshape-plain';
            const geo = mergedGeometry(b.parts, idxs, this.cache ? idxs.join(',') + '|' + b.parts.map((p) => p.geometry.id + (bake ? '.' + baseMat(p).id : '')).join(',') : null, bake);
            const mesh = new THREE.SkinnedMesh(geo, skinnedMaterial(mat));
            // (a material that changes as the game goes — a sparkle's pulse, a glow: its twin follows it before each draw)
            if (!bake) mesh.onBeforeRender = syncTwin;
            mesh.bind(this.skeleton, _ident);
            mesh.castShadow = b.cs && shadowsOn;
            mesh.userData._cs = b.cs; // (Shadows.setNearShadow switches it near/far as its parts)
            mesh.receiveShadow = anyRecv;
            mesh.layers.mask = b.lm;
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
        this._sig = null;
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
