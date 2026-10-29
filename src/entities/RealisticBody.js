/**
 * RealisticBody.js — the «Реалистичный» hero (a test model, chosen in the settings; the standard one stays the
 * default): a slim real person's body over the game's own hero, drawn by the video card.
 *
 * The game keeps its hero as it is — the arms' anchors, the hands' palms and fingers, the legs' pivots, the head —
 * and every game rule (grips, blows, the wand, the walls) goes on measuring them. This model is only how that hero
 * LOOKS: a skin of ~70 bones put where the game's parts are every frame —
 *   the spine (it leans in a squat and a run, sways with the steps, tilts with the player's own shoulders), the
 *   collarbones (they lift with a raised arm, come forward with a reach), the arms (from the real shoulder to exactly
 *   where the game's hand is, the elbow where the camera saw it — never into the chest; the forearm twisting with the
 *   palm), the palms and all fifteen finger bones (the game's own), the legs (the feet ON the floor: the knees bend
 *   in a squat and a step, the heels lift at the push-off and in a deep squat; in the air the game's leg pivots and
 *   a bend as the moment asks — a jump's tuck, a swim's kick, the surfboard's stance), the head on the neck, and the
 *   face: the jaw, the eyes looking, the lids blinking, the brows, the lips' corners, the cheeks (FaceExpr.js — the
 *   camera's face, or the face of the look blinking by itself).
 * One shape per material (the skin with the clothes on it; the head as its own shape so the first-person eyes can
 * hide it), its bones moved by the video card; a far, unseen copy casts the shadow. The shapes are made once in a
 * worker (real/realbody.worker.js) and shared by every such hero.
 *
 * Not drawn on it (the standard model shows itself again meanwhile): armour and the dark lord's outfit, a cut-off
 * limb, the monster form, the «V2» detailed hands.
 */
import * as THREE from 'three';
import { BONE_COUNT, BONE_NAMES, B, ANAT, FLOOR, FINGER_NAMES, restPose, armRest, legRest } from './real/RealRig.js';
import { realSkinMaterial, realProxyMaterial, realHairMaterial } from './real/RealSkinMaterial.js';
import { wearKey } from './real/RealWear.js';
import { FaceReader, neutralFace, restFace, idleFace, FACE_KEYS } from './FaceExpr.js';

export const REAL = {
    LOD_FAR: 22, // (m: farther — the coarse shape)
    POSE_FAR: 140, // (m: farther — not posed at all)
    FACE_FRESH: 600, // (ms: a camera's face older than this — the face lives by itself)
};

// ------------------------------------------------------------------ the shared shapes (made once, in a worker)
let _lib = null, _worker = null, _wid = 0;
const _wait = new Map(); // request id → resolve
const _wear = new Map(); // look key → {promise, data}
const WEAR_CACHE = 12;
function worker() {
    if (_worker !== null) return _worker;
    _worker = false;
    try { if (typeof Worker !== 'undefined' && typeof window !== 'undefined') _worker = new Worker(new URL('./real/realbody.worker.js', import.meta.url), { type: 'module' }); } catch (e) { _worker = false; }
    if (_worker) {
        _worker.onmessage = (e) => { const r = _wait.get(e.data.id); _wait.delete(e.data.id); r?.(e.data); };
        _worker.onerror = () => { const w = _worker; _worker = false; w.terminate(); for (const [id, r] of [..._wait]) { _wait.delete(id); r(null); } };
    }
    return _worker;
}
/** Ask the worker (or, with none — tests — build here). */
function ask(msg, local) {
    const w = worker();
    if (!w) return local().then((x) => x);
    return new Promise((resolve) => {
        const id = ++_wid;
        _wait.set(id, (d) => (d ? resolve(d) : local().then(resolve)));
        w.postMessage({ ...msg, id });
    });
}
/** The skin's shapes: a promise of {lods: [{body, head}], inverses, rest}. */
export function realLibrary() {
    if (_lib) return _lib.promise;
    _lib = { data: null };
    _lib.promise = ask({ body: true }, () => import('./real/RealBuild.js').then((m) => ({ body: m.buildRealBody() })))
        .then((d) => (_lib.data = toGeometries(d.body)));
    return _lib.promise;
}
export function realLibraryReady() { return _lib?.data || null; }
/** A look's hair, hat and clothes' pieces: a promise of [{hair, headAcc, bodyAcc} per LOD] (geometries or null). */
export function realWear(key) {
    let e = _wear.get(key);
    if (e) { _wear.delete(key); _wear.set(key, e); return e.promise; } // (the most recent last)
    e = { data: null };
    e.promise = ask({ wear: key }, () => import('./real/RealWear.js').then((m) => ({ lods: [m.buildRealWear(key, 0), m.buildRealWear(key, 1)] })))
        .then((d) => (e.data = d.lods.map((l) => ({ hair: l.hair && geoOf(l.hair), headAcc: l.headAcc && geoOf(l.headAcc), bodyAcc: l.bodyAcc && geoOf(l.bodyAcc) }))));
    _wear.set(key, e);
    // (only so many looks kept: the oldest one nobody wears goes)
    if (_wear.size > WEAR_CACHE) for (const [k, v] of _wear) {
        if (_wear.size <= WEAR_CACHE) break;
        if ([...ALL].some((r) => r._wearKey === k) || !v.data) continue;
        for (const l of v.data) for (const g of Object.values(l)) g?.dispose();
        _wear.delete(k);
    }
    return e.promise;
}

function geoOf(m) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(m.pos, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(m.nor, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(m.skinIndex, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(m.skinWeight, 4));
    g.setAttribute('aInfo', new THREE.BufferAttribute(m.info, 4));
    g.setAttribute('aMix', new THREE.BufferAttribute(m.mix, 4));
    g.setAttribute('aLimb', new THREE.BufferAttribute(m.limb, 4));
    g.setIndex(new THREE.BufferAttribute(m.idx, 1));
    // (posed anywhere — a raised arm, lying down: the whole hero's room round its middle)
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.3, 0), 3.4);
    g.userData.shared = true;
    return g;
}
function toGeometries(data) {
    const inv = data.rest.map((r) => new THREE.Matrix4().fromArray(Array.from(r)).invert());
    return { lods: data.lods.map((l) => ({ body: geoOf(l.body), head: geoOf(l.head) })), inverses: inv, rest: data.rest };
}

// ------------------------------------------------------------------ the look → the material
const TOP = [ // [sleeve end (along the arm 0…1), bottom edge (h), neck line (h), thickness, worn over the trousers]
    [0.36, 2.5, 3.6, 0.02, 1], [0.99, 2.45, 3.66, 0.035, 1], [0.36, 2.5, 3.6, 0.02, 1], [0.99, 2.5, 3.6, 0.022, 1], [0.99, 2.38, 3.64, 0.035, 1],
    [0.36, 2.5, 3.6, 0.02, 1], [0.99, 2.5, 3.64, 0.03, 1], [0.6, 1.75, 3.6, 0.025, 1], [0.99, 1.9, 3.64, 0.025, 1], [0.99, 2.55, 3.66, 0.018, 0],
];
const BOT = [ // [leg end (0…1 along the leg), waist (h), thickness, flare]
    [0.98, 2.66, 0.026, 0], [0.36, 2.66, 0.026, 0], [0, 2.66, 0.02, 0], [0.98, 2.68, 0.026, 0], [0.98, 2.66, 0.032, 0],
    [0.98, 2.66, 0.022, 0], [0, 2.66, 0.02, 0], [0.99, 2.7, 0.008, 0], [0.98, 2.66, 0.026, 0], [0.99, 2.66, 0.03, 0.9],
];
const SHOE = [ // [height up the leg (−1: none), thickness, pointed]
    [0.03, 0.035, 0], [0.35, 0.04, 0], [0.0, 0.012, 0], [0.0, 0.03, 0], [0.45, 0.045, 0], [0.0, 0.03, 0.08], [0.0, 0.03, 0], [0.0, 0.04, 0], [0.09, 0.04, 0], [-1, 0, 0],
];
const HIDDEN = { top: new Set([2, 5]), bottom: new Set([8]), shoes: new Set([6]) };
const _c = new THREE.Color();

/** A look's colours and clothes into the material's uniforms. */
export function applyLookUniforms(u, look) {
    const L = look || {};
    const top = HIDDEN.top.has(L.top) ? 0 : (L.top | 0) % 10, bot = HIDDEN.bottom.has(L.bottom) ? 0 : (L.bottom | 0) % 10, sh = HIDDEN.shoes.has(L.shoes) ? 0 : (L.shoes | 0) % 10;
    u.uSkin.value.setHex(L.skin ?? 0xffdbb4);
    _c.setHex(L.skin ?? 0xffdbb4);
    u.uLip.value.copy(_c).lerp(_c.setRGB(0.62, 0.3, 0.3), 0.5);
    u.uIris.value.setHex(L.eyes ?? 0x3b6ea5);
    u.uBrow.value.setHex(L.brows ?? 0x4a3728);
    u.uTopC.value.setHex(L.topColor ?? 0x3498db);
    u.uTopC2.value.setHex(L.topColor ?? 0x3498db).lerp(_c.setRGB(1, 1, 1), 0.55);
    u.uBotC.value.setHex(L.bottomColor ?? 0x2c3e50);
    u.uShoeC.value.setHex(L.shoes === 9 ? (L.skin ?? 0xffdbb4) : (L.shoesColor ?? 0x333333));
    u.uHatC.value.setHex(L.hatColor ?? 0x8e2b2b);
    u.uHatC2.value.setHex(L.hatColor ?? 0x8e2b2b).multiplyScalar(0.55);
    const T = TOP[top], Bt = BOT[bot], S = SHOE[sh];
    u.uTop.value.set(top, T[0], T[1], T[2]); u.uTopX.value.set(T[3], 0, 0, 0);
    u.uBot.value.set(bot, Bt[0], Bt[1], Bt[3]); u.uBotX.value.set(Bt[2], 0, 0, 0);
    u.uShoe.value.set(sh, S[0], S[1], S[2]);
    u.uLook.value.set(T[4], 0, 0, 0);
    const f = L.face | 0;
    u.uFx.value.z = f % 7 === 3 ? 1 : 0; // freckles
    u.uFx.value.w = f % 4 === 1 ? 1 : 0; // a blush
}

/**
 * The armour and the robe the hero wears (ArmorLook's code {h, c, l, r, rc, rt}) on this model: the breastplate and the
 * arms' plates, the greaves with steel shoes (steel: plain / magic with a cold glow / named with gold), a robe over
 * everything to the ankles (its colour; little stars on a magic one; gold bands on a better one; the archmage's and the
 * dark lord's own colours). The helmet, the hood, the pauldrons, the robe's skirt are shapes (RealWear).
 */
export function applyArmorUniforms(u, code) {
    const c = code || {};
    const steelOf = (k) => (k >= 2 ? 0xcfdcff : 0xb8c2cc);
    const top = c.c | 0, legs = c.l | 0, robe = c.r | 0;
    // (all the magic armour on: the magic robe is not drawn — as ArmorLook)
    const robeShown = robe && !(robe >= 2 && c.h >= 2 && top >= 2 && legs >= 2) ? robe : 0;
    u.uArm.value.set(c.h | 0, top, legs, robeShown);
    const best = Math.max(c.h | 0, top, legs);
    u.uSteel.value.setHex(steelOf(best));
    u.uTrim.value.setHex(best === 3 ? 0xd4af37 : best === 2 ? 0x9fc4ff : 0x8a94a0);
    u.uGlow.value.setHex(best >= 2 ? 0x2f5fd0 : 0x000000);
    if (top) { u.uTop.value.set(u.uTop.value.x, 0.98, 2.42, 3.62); u.uTopX.value.x = 0.05; }
    if (legs) { u.uBot.value.y = 0.99; u.uBotX.value.x = 0.042; u.uShoe.value.set(u.uShoe.value.x, 0.12, 0.05, 0); }
    u.uLook.value.y = 0;
    if (robeShown) {
        const col = robe === 5 ? 0x2a2236 : robe === 4 ? 0x15183f : (c.rc || 0x2c3e7a);
        u.uTopC.value.setHex(col);
        u.uTop.value.set(2, 0.99, 2.0, 3.66); u.uTopX.value.x = 0.032;
        u.uLook.value.x = 1;
        u.uLook.value.y = robe >= 4 || (c.rt | 0) >= 1 ? 1 : 0; // (gold bands)
        u.uTrim.value.setHex(robe === 5 ? 0x9a5cff : 0xe8d07a);
        u.uGlow.value.setHex(robe === 5 ? 0x6a1fd0 : robe >= 2 ? 0x3a1a6a : 0x000000);
    }
}

// ------------------------------------------------------------------ small maths (no garbage)
const _Gi = new THREE.Matrix4(), _m = new THREE.Matrix4(), _m2 = new THREE.Matrix4(), _MX = new THREE.Matrix4().makeScale(-1, 1, 1);
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _qh = new THREE.Quaternion(), _qn = new THREE.Quaternion();
const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3();
const _e = new THREE.Euler();
const _one = new THREE.Vector3(1, 1, 1), _sc = new THREE.Vector3();
const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);
/** The limbs' working points (one set: the heroes are posed one after another, a limb at a time). */
const _A = {};
for (const k of ['Sg', 'Eg', 'Wg', 'Sv', 'E', 'u', 'df', 'H', 'td', 'tdir', 'knee', 'A', 'th', 'sh']) _A[k] = new THREE.Vector3();
for (const k of ['F0', 'footQ', 'thigh', 'shin']) _A[k] = new THREE.Quaternion();
const sm = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

/** The angle (rad) from a to b round `axis` (both taken across it). */
function signedAngle(a, b, axis) {
    _v4.copy(a).addScaledVector(axis, -a.dot(axis));
    _v5.copy(b).addScaledVector(axis, -b.dot(axis));
    if (_v4.lengthSq() < 1e-10 || _v5.lengthSq() < 1e-10) return 0;
    return Math.atan2(_v4.cross(_v5).dot(axis), _v4.copy(a).addScaledVector(axis, -a.dot(axis)).dot(_v5));
}
/** Two bones from `s` reaching `t`, the middle joint towards `pole`: writes the joint into `out`. */
function twoBone(s, t, L1, L2, pole, out) {
    const d = _v4.subVectors(t, s), dl = Math.max(1e-6, d.length());
    d.divideScalar(dl);
    const dd = clamp(dl, Math.abs(L1 - L2) + 1e-3, L1 + L2 - 1e-4);
    const n = _v5.copy(pole).addScaledVector(d, -pole.dot(d));
    if (n.lengthSq() < 1e-8) n.set(0, 0, -1).addScaledVector(d, d.z);
    if (n.lengthSq() < 1e-8) n.set(1, 0, 0);
    n.normalize();
    const a = (L1 * L1 - L2 * L2 + dd * dd) / (2 * dd), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    return out.copy(s).addScaledVector(d, a).addScaledVector(n, h);
}
/** A rotation matrix (in `out`) from a quaternion and a place. */
const compose = (out, p, q, s = _one) => out.compose(p, q, s);

const REST = restPose();
const ARM = armRest(), LEG = legRest();
const restPos = (b) => new THREE.Vector3(REST[b][12], REST[b][13], REST[b][14]);
const restQ = (b) => new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().fromArray(Array.from(REST[b])));
const RP = BONE_NAMES.map((_, i) => restPos(i));
const RQ = BONE_NAMES.map((_, i) => restQ(i));
const SIDES = [{ s: 'L', sx: -1, side: 'left' }, { s: 'R', sx: 1, side: 'right' }];
const ARM_DIR = { L: new THREE.Vector3(-ARM.u[0], ARM.u[1], ARM.u[2]), R: new THREE.Vector3(ARM.u[0], ARM.u[1], ARM.u[2]) };
const LEG_DIR = { L: new THREE.Vector3(-ANAT.legDir[0], ANAT.legDir[1], ANAT.legDir[2]), R: new THREE.Vector3(ANAT.legDir[0], ANAT.legDir[1], ANAT.legDir[2]) };

// ------------------------------------------------------------------ the hero's realistic skin
const ALL = new Set();

export class RealisticBody {
    /** @param {import('./Character.js').VoxelCharacter} ch */
    constructor(ch) {
        this.ch = ch;
        this.on = false;
        this.shown = false;
        this.rig = new THREE.Group();
        this.rig.name = 'real-rig';
        this.bones = [];
        for (let i = 0; i < BONE_COUNT; i++) {
            const b = new THREE.Bone();
            b.name = BONE_NAMES[i];
            b.matrixAutoUpdate = false;
            b.matrix.fromArray(Array.from(REST[i]));
            this.rig.add(b);
            this.bones.push(b);
        }
        ch.group.add(this.rig);
        this.material = realSkinMaterial();
        this.u = this.material.userData.u;
        this.hairMat = realHairMaterial();
        this.wear = {}; // hair / headAcc / bodyAcc meshes of the look
        this.meshes = null;
        this.face = neutralFace();
        this._faceIdle = {};
        this._restFace = neutralFace();
        this._tau = { L: 0, R: 0 };
        this.lod = 0;
        this.stats = { posed: 0 };
        ALL.add(this);
    }

    /** Show this model (true) or the standard one (false). */
    setEnabled(on) {
        on = !!on;
        this.on = on;
        const ready = realLibraryReady();
        if (on && ready && !this.meshes) this._build(ready); // (made already: at once)
        else if (on) realLibrary().then((lib) => { if (!this.meshes && !this.disposed) this._build(lib); this._apply(); });
        this._apply();
    }

    _build(lib) {
        const sk = new THREE.Skeleton(this.bones, lib.inverses.map((m) => m.clone()));
        this.skeleton = sk;
        const mk = (geo, mat, name) => {
            const m = new THREE.SkinnedMesh(geo, mat);
            m.name = name;
            m.bind(sk, new THREE.Matrix4());
            m.raycast = () => {}; // (the game's own parts are what is hit)
            m.userData.farOne = true; // (a body's copy leaves it out — Death._copy — and takes the standard parts)
            m.userData.realSkin = true;
            m.castShadow = false;
            m.receiveShadow = false;
            this.ch.group.add(m);
            return m;
        };
        const L0 = lib.lods[0], L1 = lib.lods[1] || L0;
        this.lib = lib;
        this.meshes = {
            body: mk(L0.body, this.material, 'real-body'),
            head: mk(L0.head, this.material, 'real-head'),
            bodyShadow: mk(L1.body, realProxyMaterial(), 'real-body-shadow'),
            headShadow: mk(L1.head, realProxyMaterial(), 'real-head-shadow'),
        };
        this.meshes.bodyShadow.castShadow = this.meshes.headShadow.castShadow = true;
        this.meshes.bodyShadow.userData._cs = this.meshes.headShadow.userData._cs = true;
        this.setLook(this.ch.look);
    }

    /** The look changed (Appearance.applyLook): its colours and clothes, its resting face. */
    setLook(look) {
        applyLookUniforms(this.u, look);
        applyArmorUniforms(this.u, this._armorOf());
        this.hairMat.userData.u.uHair.value.setHex(look?.hairColor ?? 0x4a3728);
        this.hairMat.userData.u.uLash.value.setHex(look?.hairColor ?? 0x4a3728).multiplyScalar(0.45);
        restFace(look?.face | 0, this._restFace);
        if (this.shown) this._hideStandard(true);
        const key = wearKey(look || {}, this._armorOf());
        if (key !== this._wearKey && this.meshes) {
            this._wearKey = key;
            this.wearReady = realWear(key).then((lods) => { if (this._wearKey === key && !this.disposed) this._setWear(lods); });
        }
    }

    /** The look's hair, hat and clothes' pieces on the same bones (the old ones off). */
    _setWear(lods) {
        this._wearLods = lods;
        for (const m of Object.values(this.wear)) m.parent?.remove(m);
        this.wear = {};
        const L = lods[this.lod] || lods[0];
        for (const k of ['hair', 'headAcc', 'bodyAcc']) {
            if (!L[k]) continue;
            const m = new THREE.SkinnedMesh(L[k], k === 'hair' ? this.hairMat : this.material);
            m.name = 'real-' + k;
            m.bind(this.skeleton, new THREE.Matrix4());
            m.raycast = () => {};
            m.userData.farOne = true;
            m.userData.realSkin = true;
            m.castShadow = false; m.receiveShadow = false;
            m.visible = this.shown;
            this.ch.group.add(m);
            this.wear[k] = m;
        }
        this._layers();
    }

    /** What the hero wears (armour, a robe) as ArmorLook has it; the dark lord's outfit as his robe. */
    _armorOf() {
        const ch = this.ch, c = ch.armorCode || null;
        if (!c) return null;
        return { h: c.h | 0, c: c.c | 0, l: c.l | 0, r: c.r | 0, rc: c.rc, rt: c.rt | 0 };
    }

    /** Is the standard model needed now (something this one does not draw)? */
    _needStandard() {
        const ch = this.ch;
        if (!this.meshes) return true;
        if (ch.limbs) for (const k in ch.limbs) if (ch.limbs[k] != null) return true;
        if ((ch.size || 1) !== 1) return true;
        if (ch.handVersion === 'v2') return true;
        return false;
    }

    _apply() {
        // (the armour put on / taken off: its pieces on this model, the standard's own pieces hidden)
        const parts = this.ch._armorParts;
        const sig = (parts ? parts.length : 0) + ':' + JSON.stringify(this.ch.armorCode || null);
        if (sig !== this._armorSig) { this._armorSig = sig; if (this.meshes) this.setLook(this.ch.look); }
        const want = this.on && !this._needStandard();
        if (want === this.shown) { if (want) this._layers(); return; }
        this.shown = want;
        this._hideStandard(want);
        if (this.meshes) for (const m of Object.values(this.meshes)) m.visible = want;
        for (const m of Object.values(this.wear)) m.visible = want;
        if (want) this._layers();
    }

    /** First person: the head (and what is on it) unseen by my own camera; its shadow still there. */
    _layers() {
        if (!this.meshes) return;
        const L = this.ch._fpv ? 1 : 0;
        for (const m of [this.meshes.head, this.wear.hair, this.wear.headAcc]) if (m && m.layers.mask !== (1 << L)) m.layers.set(L);
        const hidden = this.ch._bodyHidden && this.ch._fpv ? 1 : 0;
        for (const m of [this.meshes.body, this.wear.bodyAcc]) if (m && m.layers.mask !== (1 << hidden)) m.layers.set(hidden);
    }

    /** The standard model's own parts hidden (or shown again): its head, torso, arms, legs, the look's extras, the hands' boxes. */
    _hideStandard(hide) {
        const ch = this.ch, list = [ch.head, ch.body];
        for (const a of [ch.leftArmAnchor, ch.rightArmAnchor, ch.leftElbowAnchor, ch.rightElbowAnchor, ch.leftLegPivot, ch.rightLegPivot]) for (const c of a.children) if (c.isMesh) list.push(c);
        for (const p of ch._lookParts || []) list.push(p);
        for (const p of ch._armorParts || []) list.push(p); // (the armour's boxes: drawn by this model itself)
        for (const h of [ch.leftSimplifiedHand, ch.rightSimplifiedHand]) if (h?.handPivot) list.push(h.handPivot);
        if (ch._headShadow) list.push(ch._headShadow);
        for (const o of list) {
            if (!o) continue;
            if (hide) {
                if (!o.userData.realHid) { o.userData.realHid = true; o.userData._realVis = o.visible; o.userData.farHid = true; }
                o.visible = false;
            } else if (o.userData.realHid) {
                o.visible = o.userData._realVis !== false;
                delete o.userData.realHid; delete o.userData._realVis; delete o.userData.farHid;
            }
        }
    }

    // ---------------------------------------------------------------- every frame
    /** All the realistic heroes posed for this picture (Game, before drawing): near ones every frame, far ones less, unseen not at all. */
    static poseAll(camera, dt) {
        for (const r of ALL) r.frame(camera, dt);
    }

    frame(camera, dt = 1 / 60) {
        this._apply();
        if (!this.shown) return;
        const g = this.ch.group;
        if (!g.visible || !g.parent) return;
        let dist = 0;
        if (camera && this.ch.remote) {
            camera.getWorldPosition(_v);
            dist = _v.distanceTo(g.position);
            if (dist > REAL.POSE_FAR) return;
        }
        // (far: the coarse shape — the same bones)
        const lod = this.ch.remote && dist > REAL.LOD_FAR ? 1 : 0;
        if (lod !== this.lod && this.lib) {
            this.lod = lod;
            const L = this.lib.lods[lod] || this.lib.lods[0];
            this.meshes.body.geometry = L.body; this.meshes.head.geometry = L.head;
            const W = this._wearLods?.[lod] || this._wearLods?.[0];
            if (W) for (const k in this.wear) if (W[k]) this.wear[k].geometry = W[k];
        }
        this.pose(dt);
    }

    /** Every bone where the game's hero is now (the group's space). */
    pose(dt = 1 / 60) {
        const ch = this.ch, M = this.bones;
        this.stats.posed++;
        ch.group.updateMatrixWorld(true);
        _Gi.copy(ch.group.matrixWorld).invert();
        const crouch = ch.lowK || 0, runK = ch.isRunning ? (ch.runIntensity || 0) : (ch.stepping > 0 ? 0.6 : 0);
        const walking = (ch.isRunning || ch.stepping > 0) && !ch.flying && !ch.swimming && !ch.knockedDown;
        const cyc = ch.runCycle || 0;
        // ---- the spine: a lean forward in a squat and a run, the steps' sway, the shoulders' own tilt
        const lean = (this.leanSm ??= { p: 0, r: 0 });
        const wantP = 0.3 * crouch + 0.1 * runK * (walking ? 1 : 0) + 0.2 * (ch.stoop || 0);
        const wantR = ch.flying || ch.knockedDown ? 0 : clamp(-(ch.torsoLean || 0) * 0.35, -0.22, 0.22);
        const kk = 1 - Math.exp(-dt / 0.12);
        lean.p += (wantP - lean.p) * kk; lean.r += (wantR - lean.r) * kk;
        const yaw = walking ? Math.sin(cyc) * 0.09 * (0.4 + runK) : 0;
        const bob = walking ? (Math.cos(2 * cyc) * 0.5 - 0.5) * 0.04 * (0.4 + runK) : 0;
        _v.copy(RP[B.hips]); _v.y += bob;
        _e.set(-lean.p * 0.15, -yaw * 0.6, lean.r * 0.15, 'YXZ');
        compose(M[B.hips].matrix, _v, _q.setFromEuler(_e));
        this._chain(B.spine, B.hips, lean, yaw, 0.3);
        this._chain(B.chest, B.spine, lean, yaw, 0.32);
        this._chain(B.upperChest, B.chest, lean, yaw, 0.33);
        // ---- the head on the neck: the game's head's turn (and the face's tilt)
        const face = this._faceNow(dt);
        _qh.copy(ch.head.quaternion);
        if (face.roll) _qh.multiply(_q2.setFromAxisAngle(_z.set(0, 0, 1), -face.roll * 0.3)); // (the player tilts to the left shoulder: the hero to his)
        _m.copy(M[B.upperChest].matrix).decompose(_v2, _q3, _sc);
        _qn.copy(_q3).slerp(_qh, 0.45);
        this._child(B.neck, B.upperChest, _qn);
        this._child(B.head, B.neck, _qh);
        this._face(face);
        // ---- the arms
        for (const S of SIDES) this._arm(S, dt);
        // ---- the legs
        const drop = ch.bodyDrop ? ch.bodyDrop() : 0;
        for (const S of SIDES) this._leg(S, crouch, walking, runK, cyc, drop);
        for (const b of M) b.matrixWorldNeedsUpdate = true;
    }

    /** A spine bone on its parent: the parent's place + its rest offset, turned by its share of the lean. */
    _chain(b, parent, lean, yaw, k) {
        const P = this.bones[parent].matrix;
        _v.copy(RP[b]).sub(RP[parent]).applyMatrix4(_m2.copy(P).setPosition(0, 0, 0)).add(_v2.setFromMatrixPosition(P));
        _q.setFromRotationMatrix(P);
        _e.set(-lean.p * k, yaw * k * 1.3, lean.r * k, 'YXZ');
        _q.multiply(_q2.setFromEuler(_e));
        compose(this.bones[b].matrix, _v, _q);
    }
    /** A bone at its rest offset from the parent, turned `q` (the group's space). */
    _child(b, parent, q) {
        const P = this.bones[parent].matrix;
        _v.copy(RP[b]).sub(RP[parent]).applyMatrix4(_m2.copy(P).setPosition(0, 0, 0)).add(_v2.setFromMatrixPosition(P));
        compose(this.bones[b].matrix, _v, q);
    }

    // ---------------------------------------------------------------- the arms
    _arm(S, dt) {
        const ch = this.ch, M = this.bones, s = S.s, sx = S.sx;
        const anchor = s === 'L' ? ch.leftArmAnchor : ch.rightArmAnchor, elbowA = s === 'L' ? ch.leftElbowAnchor : ch.rightElbowAnchor;
        const hand = s === 'L' ? ch.leftSimplifiedHand : ch.rightSimplifiedHand;
        // the game's shoulder, elbow, wrist (the group's space)
        const Sg = _A.Sg.setFromMatrixPosition(anchor.matrixWorld).applyMatrix4(_Gi);
        const Eg = _A.Eg.setFromMatrixPosition(elbowA.matrixWorld).applyMatrix4(_Gi);
        const Wg = _A.Wg.setFromMatrixPosition(hand.group.matrixWorld).applyMatrix4(_Gi);
        const a = _v3.subVectors(Eg, Sg).normalize();
        // the collarbone: up with a raised arm, forward with a reach
        const lift = clamp((Math.asin(clamp(a.y, -1, 1)) + 0.25) * 0.32, 0, 0.38), prot = clamp(-a.z * 0.22, -0.08, 0.22);
        _m.copy(M[B.upperChest].matrix);
        _q.setFromRotationMatrix(_m);
        _e.set(0, sx * prot, sx * lift, 'YXZ');
        _q.multiply(_q2.setFromEuler(_e));
        this._childQ(B['clav' + s], B.upperChest, _q);
        // the real shoulder on its collarbone
        const Cm = M[B['clav' + s]].matrix;
        const Sv = _A.Sv.copy(RP[B['upperArm' + s]]).sub(RP[B['clav' + s]]).applyQuaternion(_q2.setFromRotationMatrix(Cm)).add(_v2.setFromMatrixPosition(Cm));
        // the elbow: towards where the game's is, never into the chest
        const L1 = ANAT.L1, L2 = ANAT.L2;
        let k = Sv.distanceTo(Wg) / (L1 + L2);
        k = k > 1 ? Math.min(1.25, k * 1.0005) : 1;
        const pole = _v2.subVectors(Eg, Sv);
        const E = _A.E;
        twoBone(Sv, Wg, L1 * k, L2 * k, pole, E);
        const loc = _v3.copy(E).applyMatrix4(_m2.copy(M[B.upperChest].matrix).invert());
        if ((loc.x / 0.42) ** 2 + ((loc.z - 0.0) / 0.3) ** 2 < 1 && loc.y < 0.4 && loc.y > -1.2) {
            pole.add(_v3.set(sx * 0.9, 0, 0.2));
            twoBone(Sv, Wg, L1 * k, L2 * k, pole, E);
        }
        const u = _A.u.subVectors(E, Sv).normalize();
        const df = _A.df.subVectors(Wg, E).normalize();
        // the upper arm: swung from its rest, turned so the elbow's hinge is where the arm bends
        _q.setFromUnitVectors(ARM_DIR[s], u).multiply(RQ[B['upperArm' + s]]);
        const bend = u.angleTo(df);
        if (bend > 0.06) {
            _x.set(1, 0, 0).applyQuaternion(_q);
            const hinge = _v2.crossVectors(u, df).normalize();
            const t = clamp(signedAngle(_x, hinge, u), -1.9, 1.9) * sm(0.12, 0.5, bend);
            _q.premultiply(_q2.setFromAxisAngle(u, t));
        }
        compose(M[B['upperArm' + s]].matrix, Sv, _q, _sc.set(1, 1, k));
        // the forearm: bent at the elbow, twisting with the palm (a quarter of it near the elbow, most at the wrist)
        const F0 = _A.F0.setFromUnitVectors(u, df).multiply(_q);
        const palm = hand.palm;
        _m.copy(_Gi).multiply(palm.matrixWorld);
        if (s === 'L') _m.multiply(_MX);
        M[B['hand' + s]].matrix.copy(_m);
        _x.setFromMatrixColumn(_m, 0).normalize();
        _y.set(1, 0, 0).applyQuaternion(F0);
        let tau = signedAngle(_y, _x, df);
        const prev = this._tau[s];
        while (tau - prev > Math.PI) tau -= 2 * Math.PI;
        while (tau - prev < -Math.PI) tau += 2 * Math.PI;
        if (Math.abs(tau) > 2.6 * Math.PI) tau = Math.atan2(Math.sin(tau), Math.cos(tau));
        this._tau[s] = tau;
        compose(M[B['forearm' + s]].matrix, E, _q.copy(F0).premultiply(_q2.setFromAxisAngle(df, tau * 0.22)), _sc.set(1, 1, k));
        compose(M[B['twist' + s]].matrix, _v.copy(E).addScaledVector(df, L2 * k * 0.55), _q.copy(F0).premultiply(_q2.setFromAxisAngle(df, tau * 0.8)), _sc.set(1, 1, k));
        // the fingers: the game's own bones
        for (const f of FINGER_NAMES) {
            const segs = hand.fingerMeshes[f];
            for (let i = 0; i < 3; i++) {
                _m.copy(_Gi).multiply(segs[i].pivot.matrixWorld);
                if (s === 'L') _m.multiply(_MX);
                M[B[f + i + s]].matrix.copy(_m);
            }
        }
        // how deep the sleeve folds
        if (s === 'L') this.u.uBend.value.x = clamp(bend / 2.2, 0, 1); else this.u.uBend.value.y = clamp(bend / 2.2, 0, 1);
    }
    _childQ(b, parent, q) {
        const P = this.bones[parent].matrix;
        _v4.copy(RP[b]).sub(RP[parent]).applyMatrix4(_m2.copy(P).setPosition(0, 0, 0)).add(_v5.setFromMatrixPosition(P));
        compose(this.bones[b].matrix, _v4, q);
    }

    // ---------------------------------------------------------------- the legs
    _leg(S, crouch, walking, runK, cyc, drop) {
        const ch = this.ch, M = this.bones, s = S.s, sx = S.sx;
        const pivot = s === 'L' ? ch.leftLegPivot : ch.rightLegPivot;
        const Hm = M[B.hips].matrix;
        _q.setFromRotationMatrix(Hm);
        const H = _A.H.copy(RP[B['thigh' + s]]).sub(RP[B.hips]).applyQuaternion(_q).add(_v2.setFromMatrixPosition(Hm));
        const td = _A.td.copy(DOWN).applyQuaternion(pivot.quaternion); // (the game's leg)
        const Lth = ANAT.Lth, Lsh = ANAT.Lsh;
        const floor = FLOOR + drop;
        const air = ch.flying || ch.swimming || ch.jumpAir || ch.knockedDown || !!ch.legPose || (!ch.remote && ch.onGround === false && !walking);
        const lift = ch.legLift && !walking && !air ? ch.legLift : null;
        const raise = lift ? (s === 'L' ? lift.l : lift.r) || 0 : 0, heelKick = lift ? (s === 'L' ? lift.lh : lift.rh) : false;
        let thigh, shin, knee, toeBend = 0;
        const footQ = _A.footQ;
        const legYaw = (_e.setFromQuaternion(_q, 'YXZ').y) + sx * -0.06;
        if (air || raise > 0.05 || heelKick) {
            // the leg as the game has it (a raised knee, a kick: the camera's), bent as the moment asks
            let kneeFlex = ch.jumpAir ? (ch.verticalVelocity > 0 ? 0.95 : 0.4) : ch.swimming ? 0.25 + 0.3 * Math.abs(Math.sin(cyc + (s === 'R' ? 1.5 : 0))) : ch.flying ? 0.12 : ch.knockedDown ? 0.12 : 0.25;
            let tdir = td;
            if (ch.legPose) kneeFlex = clamp(-(s === 'L' ? ch.legPose.left?.hip : ch.legPose.right?.hip) * 1.2 || 0.2, 0.15, 1.5);
            if (!air) {
                // (standing, the camera saw this knee lifted / the heel kicked up behind)
                if (heelKick) { kneeFlex = 1.45; tdir = _A.tdir.set(0, -1, 0.12).normalize(); }
                else { kneeFlex = raise * 1.6; tdir = _A.tdir.set(0, -Math.cos(raise * 1.3), -Math.sin(raise * 1.3)).applyAxisAngle(UP, legYaw); }
            }
            _q2.setFromUnitVectors(LEG_DIR[s], tdir).multiply(RQ[B['thigh' + s]]);
            thigh = _A.thigh.copy(_q2);
            _x.set(1, 0, 0).applyQuaternion(thigh);
            shin = _A.shin.copy(thigh).premultiply(_q3.setFromAxisAngle(_x, -kneeFlex));
            knee = _A.knee.copy(H).addScaledVector(tdir, Lth);
            const sd = _v5.set(0, 0, 1).applyQuaternion(shin);
            const A = _A.A.copy(knee).addScaledVector(sd, Lsh);
            footQ.copy(shin).multiply(_q3.copy(RQ[B['shin' + s]]).invert()).multiply(_q2.setFromAxisAngle(_x.set(1, 0, 0), -0.32));
            this._legBones(s, H, thigh, knee, shin, A, footQ, 0);
            return;
        }
        // on the floor: the foot where it stands (stepping: where the game's step puts it, lifted as it swings)
        const rigFoot = _v4.setFromMatrixPosition(pivot.matrixWorld).applyMatrix4(_Gi).addScaledVector(td, 1.95);
        const A = _A.A;
        let heel = 0;
        if (walking && !(ch.braceK > 0.01)) {
            const ph = cyc + (s === 'R' ? Math.PI : 0), c = Math.cos(ph), sn = Math.sin(ph);
            A.set(H.x + sx * 0.02, floor + 0.166 + (c > 0 ? c * (0.12 + 0.3 * runK) : 0), rigFoot.z * 0.85 + H.z * 0.15);
            if (c < 0 && sn < -0.3) heel = (-sn - 0.3) * 0.5 * (0.5 + runK);
        } else {
            const stance = ch.braceK > 0.01 ? 1 : (crouch > 0.1 ? 0 : sm(0.06, 0.2, Math.abs(td.z) + Math.abs(td.x - sx * 0.07)));
            A.set(H.x + sx * 0.03, floor + 0.166, H.z - 0.04 - 0.06 * crouch).lerp(_v5.set(rigFoot.x, floor + 0.166, rigFoot.z), stance);
            if (crouch > 0.55) heel = (crouch - 0.55) * 0.9;
        }
        A.y += Math.sin(heel) * 0.4;
        toeBend = heel;
        footQ.setFromAxisAngle(UP, legYaw).multiply(_q2.setFromAxisAngle(_x.set(1, 0, 0), -heel));
        // the knee forward
        const pole = _v5.set(sx * 0.08, 0.05, -1).applyAxisAngle(UP, legYaw);
        knee = _A.knee;
        twoBone(H, A, Lth, Lsh, pole, knee);
        const th = _A.th.subVectors(knee, H).normalize(), sh = _A.sh.subVectors(A, knee).normalize();
        A.copy(knee).addScaledVector(sh, Lsh);
        thigh = _A.thigh.setFromUnitVectors(LEG_DIR[s], th).multiply(RQ[B['thigh' + s]]);
        const flex = th.angleTo(sh);
        if (flex > 0.05) {
            _x.set(1, 0, 0).applyQuaternion(thigh);
            const hinge = _v4.crossVectors(sh, th).normalize();
            thigh.premultiply(_q2.setFromAxisAngle(th, clamp(signedAngle(_x, hinge, th), -1.2, 1.2) * sm(0.05, 0.3, flex)));
        }
        shin = _A.shin.setFromUnitVectors(th, sh).multiply(thigh);
        this._legBones(s, H, thigh, knee, shin, A, footQ, toeBend);
    }

    _legBones(s, H, thigh, knee, shin, A, footQ, toeBend) {
        const M = this.bones;
        compose(M[B['thigh' + s]].matrix, H, thigh);
        compose(M[B['shin' + s]].matrix, knee, shin);
        compose(M[B['foot' + s]].matrix, A, footQ);
        // the toes on the floor while the heel is up
        _v.copy(RP[B['toes' + s]]).sub(RP[B['foot' + s]]).applyQuaternion(footQ).add(A);
        compose(M[B['toes' + s]].matrix, _v, _q.copy(footQ).multiply(_q2.setFromAxisAngle(_x.set(1, 0, 0), toeBend)));
        // how deep the trousers fold at the knee
        const flex = _v2.set(0, 0, 1).applyQuaternion(thigh).angleTo(_v3.set(0, 0, 1).applyQuaternion(shin));
        if (s === 'L') this.u.uBend.value.z = clamp(flex / 2, 0, 1); else this.u.uBend.value.w = clamp(flex / 2, 0, 1);
    }

    // ---------------------------------------------------------------- the face
    _faceNow(dt) {
        const ch = this.ch, now = typeof performance !== 'undefined' ? performance.now() : Date.now();
        const live = ch.face && now - (ch.faceAt || 0) < REAL.FACE_FRESH;
        const f = this.face;
        const src = live ? ch.face : idleFace(this._faceIdle, dt, this._restFace);
        const k = 1 - Math.exp(-dt / (live ? 0.035 : 0.05));
        for (const key of FACE_KEYS) f[key] += ((src[key] || 0) - f[key]) * k;
        return f;
    }

    _face(f) {
        const M = this.bones;
        // (a face bone on the head — or, the lower lip, on the jaw: it opens with it)
        const at = (b, dx = 0, dy = 0, dz = 0, rot = null, base = B.head) => {
            const Hm = M[base].matrix;
            _q.setFromRotationMatrix(Hm);
            _v.copy(RP[b]).sub(RP[base]).add(_v3.set(dx, dy, dz)).applyQuaternion(_q).add(_v2.setFromMatrixPosition(Hm));
            compose(M[b].matrix, _v, rot ? _q2.copy(_q).multiply(rot) : _q);
        };
        // the jaw opens round its hinge (and comes a little forward)
        at(B.jaw, 0, 0, -f.jaw * 0.008, _q3.setFromAxisAngle(_x.set(1, 0, 0), -f.jaw * 0.5));
        for (const S of SIDES) {
            const s = S.s, sx = S.sx, L = s === 'L';
            const blink = L ? f.blinkL : f.blinkR, brow = L ? f.browL : f.browR, smile = L ? f.smileL : f.smileR;
            // the eyes look (both the same way), the lids follow them, close, open wide
            _e.set(f.gazeY * 0.32, -f.gazeX * 0.45, 0, 'YXZ');
            at(B['eye' + s], 0, 0, 0, _q3.setFromEuler(_e));
            const wide = Math.max(0, brow) * 0.14;
            at(B['lidUp' + s], 0, 0, 0, _q3.setFromAxisAngle(_x.set(1, 0, 0), -0.07 - blink * 0.45 + wide + f.gazeY * 0.12 - f.squint * 0.08));
            at(B['lidLo' + s], 0, 0, 0, _q3.setFromAxisAngle(_x.set(1, 0, 0), blink * 0.1 + f.squint * 0.14 + f.gazeY * 0.04));
            // the brows (the inner ends: worried up, frowning down and together)
            const frown = Math.max(0, -f.browIn);
            at(B['browIn' + s], -sx * frown * 0.012, (brow * 0.6 + f.browIn * 0.8) * 0.03, -frown * 0.006);
            at(B['browOut' + s], 0, brow * 0.03 - frown * 0.006, 0);
            // the mouth's corners: up and back in a smile, down in sadness, out in a wide mouth, in and forward in an «о»
            const pucker = Math.max(0, -f.wide);
            at(B['corner' + s], sx * (Math.max(0, f.wide) * 0.016 + Math.max(0, smile) * 0.01 - pucker * 0.022), smile * 0.026 - f.jaw * 0.03, Math.max(0, smile) * 0.012 - pucker * 0.016);
            at(B['cheek' + s], 0, Math.max(0, smile) * 0.018 + f.squint * 0.012, -Math.max(0, smile) * 0.006);
        }
        const pucker = Math.max(0, -f.wide);
        at(B.lipUp, 0, -0.0105 + f.lipUp * 0.012 + f.jaw * 0.004, -pucker * 0.02);
        at(B.lipLo, 0, 0.0095 - f.jaw * 0.004, -pucker * 0.018, null, B.jaw);
        at(B.nose, 0, f.lipUp * 0.005, 0);
    }

    dispose() {
        this.disposed = true;
        ALL.delete(this);
        this._hideStandard(false);
        if (this.meshes) for (const m of Object.values(this.meshes)) m.parent?.remove(m);
        for (const m of Object.values(this.wear)) m.parent?.remove(m);
        this.rig.parent?.remove(this.rig);
        this.material.dispose();
        this.hairMat.dispose();
        this.skeleton?.dispose?.();
        this.meshes = null;
    }
}

/** For Game.prewarm: the skin's and the shadow's programs compiled on the loading screen (a tiny skinned sample). */
export function realSamples() {
    const geo = new THREE.BoxGeometry(0.1, 0.1, 0.1);
    const n = geo.attributes.position.count;
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4), 4));
    const w = new Float32Array(n * 4); for (let i = 0; i < n; i++) w[i * 4] = 1;
    geo.setAttribute('skinWeight', new THREE.BufferAttribute(w, 4));
    for (const a of ['aInfo', 'aMix', 'aLimb']) geo.setAttribute(a, new THREE.BufferAttribute(new Float32Array(n * 4).fill(0.5), 4));
    const out = [];
    for (const mat of [realSkinMaterial(), realProxyMaterial(), realHairMaterial()]) {
        const bone = new THREE.Bone();
        const sm2 = new THREE.SkinnedMesh(geo, mat);
        sm2.add(bone);
        sm2.bind(new THREE.Skeleton([bone], [new THREE.Matrix4()]), new THREE.Matrix4());
        sm2.castShadow = true;
        sm2.frustumCulled = false;
        out.push(sm2);
    }
    return out;
}

/** The face from the camera for the realistic hero (Game: every picture). */
export { FaceReader };
