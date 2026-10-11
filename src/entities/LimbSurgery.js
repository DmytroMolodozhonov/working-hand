/**
 * LimbSurgery.js — cutting a limb off a voxel model exactly where a blade went
 * through it (pure three.js: runs in node for the tests).
 *
 * A body describes its limbs (see CutBodies.js):
 *   { limbs: [{ name, kind: 'arm'|'leg'|'head'|'branch', side,
 *               segs: [{ obj, o: [x,y,z], ax: [x,y,z], len, whole? , objs? }],   // a chain of bones
 *               line?: { obj, a, b },  parts?: [Object3D] }],                  // the head: neck line + what goes
 *     attach?: Set<Object3D> }                                                // carried things: by their origin
 * A limb is measured from its root (shoulder / hip) along the chain: `d` = how much is left.
 *
 *  - The meshes the cut goes through are trimmed at the cut plane (the faces along the bone are
 *    shortened with their texture / colours, nothing is stretched); what lies beyond is hidden.
 *  - A flesh-and-bone cap closes the stump; the cut-off piece is a copy of what was cut off, as it
 *    was (clothes, the hand's fingers, a knight's sword in his fist).
 *  - Everything is kept to put back (respawn): `restoreAll`.
 * State on the model object: `root.limbs = {leftArm: 0.6, head: true, …}` (d left; head true).
 */

import * as THREE from 'three';

export const CAP_MAX_TILT = 0.61; // rad (35°): the cut face follows the blade, at most this far from square

const FLESH = new THREE.MeshLambertMaterial({ color: 0x8a0b14 });
FLESH.name = 'stump-flesh';
const BONE = new THREE.MeshLambertMaterial({ color: 0xefe6d2 });
BONE.name = 'stump-bone';
const UNIT = new THREE.BoxGeometry(1, 1, 1);
UNIT.userData.keep = true;
export const STUMP_MATERIALS = { flesh: FLESH, bone: BONE };

const _m = new THREE.Matrix4();
const _mi = new THREE.Matrix4();
const _n3 = new THREE.Matrix3();
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _u = new THREE.Vector3();
const _q = new THREE.Quaternion();

// ============================================================ geometry
/**
 * The part of a geometry on one side of a plane (P, N: N points to the far end of the limb).
 * keepFar=false keeps the near part (the stump), true the far part (the piece).
 * Box faces come in fours: a corner beyond the plane slides along its edge to the plane (its uv
 * and colour with it), so a trimmed box keeps its texture unstretched.
 * @returns {THREE.BufferGeometry|null|false}  the same geometry when it is all kept, null when all is cut away
 */
export function cutGeometry(geo, P, N, keepFar = false) {
    const pos = geo.attributes.position;
    const n = pos.count;
    const A = pos.array;
    const sg = keepFar ? -1 : 1;
    const s = new Float32Array(n);
    let any = false, all = true;
    for (let i = 0; i < n; i++) {
        s[i] = sg * ((A[i * 3] - P.x) * N.x + (A[i * 3 + 1] - P.y) * N.y + (A[i * 3 + 2] - P.z) * N.z);
        if (s[i] > 1e-5) any = true; else all = false;
    }
    if (!any) return geo;
    if (all) return null;
    const g = geo.clone();
    g.userData = { cut: true };
    const O = g.attributes.position.array;
    const uvA = geo.attributes.uv?.array, uvO = g.attributes.uv?.array;
    const cA = geo.attributes.color?.array, cO = g.attributes.color?.array;
    const quads = n % 4 === 0;
    const F = quads ? 4 : 1;
    for (let f = 0; f < n; f += F) {
        for (let i = f; i < f + F; i++) {
            if (s[i] <= 1e-5) continue;
            // its partner: the kept corner of the same face nearest across the bone
            let best = -1, bd = Infinity;
            for (let j = f; j < f + F; j++) {
                if (s[j] > 1e-5) continue;
                const dx = A[i * 3] - A[j * 3], dy = A[i * 3 + 1] - A[j * 3 + 1], dz = A[i * 3 + 2] - A[j * 3 + 2];
                const along = dx * N.x + dy * N.y + dz * N.z;
                const d2 = dx * dx + dy * dy + dz * dz - along * along;
                if (d2 < bd) { bd = d2; best = j; }
            }
            if (best >= 0) {
                const t = -s[best] / (s[i] - s[best]);
                for (let k = 0; k < 3; k++) O[i * 3 + k] = A[best * 3 + k] + (A[i * 3 + k] - A[best * 3 + k]) * t;
                if (uvO) for (let k = 0; k < 2; k++) uvO[i * 2 + k] = uvA[best * 2 + k] + (uvA[i * 2 + k] - uvA[best * 2 + k]) * t;
                if (cO) for (let k = 0; k < 3; k++) cO[i * 3 + k] = cA[best * 3 + k] + (cA[i * 3 + k] - cA[best * 3 + k]) * t;
            } else {
                // the whole face is beyond: flat on the plane
                const k = s[i] * sg;
                O[i * 3] = A[i * 3] - N.x * k; O[i * 3 + 1] = A[i * 3 + 1] - N.y * k; O[i * 3 + 2] = A[i * 3 + 2] - N.z * k;
            }
        }
    }
    g.attributes.position.needsUpdate = true;
    g.computeBoundingBox();
    g.computeBoundingSphere();
    return g;
}

/** A direction tilted at most `max` rad away from `axis` (both unit, same frame). */
export function clampTilt(n, axis, max = CAP_MAX_TILT) {
    const out = new THREE.Vector3().copy(n);
    if (out.dot(axis) < 0) out.negate();
    if (out.lengthSq() < 1e-8) return out.copy(axis);
    out.normalize();
    const ang = out.angleTo(axis);
    if (ang <= max) return out;
    // rotate the axis towards n by max
    const perp = _u.copy(out).addScaledVector(axis, -out.dot(axis));
    if (perp.lengthSq() < 1e-10) return out.copy(axis);
    perp.normalize();
    return out.copy(axis).multiplyScalar(Math.cos(max)).addScaledVector(perp, Math.sin(max)).normalize();
}

// ============================================================ the chain
/** Total length of a limb chain. */
export function limbLength(limb) {
    if (limb.kind === 'head') return 0;
    let t = 0;
    for (const s of limb.segs) t += s.len;
    return t;
}

/** Which segment a distance falls in: {i, seg, local} (local = along that segment). */
export function segmentAt(limb, d) {
    let cum = 0;
    for (let i = 0; i < limb.segs.length; i++) {
        const s = limb.segs[i];
        if (d < cum + s.len || i === limb.segs.length - 1) return { i, seg: s, local: Math.min(s.len, Math.max(0, d - cum)), cum };
        cum += s.len;
    }
    return null;
}

/** Objects of a segment (a "whole" segment may be several objects, e.g. both hand models). */
const segObjs = (s) => s.objs || [s.obj];

/** Matrix taking `obj` space into `root` space (obj below root in the tree). */
function relMatrix(obj, root, out) {
    out.identity();
    let o = obj;
    while (o && o !== root) { o.updateMatrix(); out.premultiply(o.matrix); o = o.parent; }
    return out;
}

function saved(root) {
    return root._cutSaved || (root._cutSaved = { geo: new Map(), vis: new Map(), caps: [], limbs: {} });
}

function hide(root, o, rec) {
    const sv = saved(root);
    if (!sv.vis.has(o)) sv.vis.set(o, o.visible);
    o.visible = false;
    rec.hidden.push(o);
}

function setGeo(root, mesh, g, rec) {
    const sv = saved(root);
    if (!sv.geo.has(mesh)) sv.geo.set(mesh, mesh.geometry);
    else if (mesh.geometry !== sv.geo.get(mesh) && mesh.geometry.userData?.cut) mesh.geometry.dispose();
    mesh.geometry = g;
    rec.meshes.push(mesh);
}

/**
 * Walk the subtree of a segment object (not into later segments / carried things).
 * cb(o, kind): kind 'mesh' | 'attach' | 'later'
 */
function walk(o, stop, attach, cb, top = true) {
    if (!top && stop.has(o)) { cb(o, 'later'); return; }
    if (!top && attach?.has(o)) { cb(o, 'attach'); return; }
    if (o.isMesh && !o.userData.stump) cb(o, 'mesh');
    for (const c of o.children) walk(c, stop, attach, cb, false);
}

/**
 * The cut plane of a limb at d, in the frame of the segment object.
 * nSeg: the blade's cut normal in that frame (optional; square to the bone when missing).
 */
export function cutPlane(limb, d, nSeg = null) {
    const at = segmentAt(limb, d);
    const s = at.seg;
    const ax = new THREE.Vector3().fromArray(s.ax).normalize();
    const P = new THREE.Vector3().fromArray(s.o || [0, 0, 0]).addScaledVector(ax, at.local);
    const N = nSeg ? clampTilt(new THREE.Vector3().fromArray(nSeg), ax) : ax.clone();
    return { at, P, N, ax };
}

/**
 * Cut the meshes of one segment by a plane given in that segment's frame.
 * keepFar=false: on the body (near part stays); later segments are hidden.
 * Returns the biggest trimmed mesh (for the cap size).
 */
function cutSegmentOnBody(root, limb, i, P, N, attach, rec) {
    const s = limb.segs[i];
    const stop = new Set();
    for (let k = i + 1; k < limb.segs.length; k++) for (const o of segObjs(limb.segs[k])) stop.add(o);
    let biggest = null, bigR = -1;
    for (const so of segObjs(s)) {
        if (s.whole) { if (!s.noHide) hide(root, so, rec); continue; }
        walk(so, stop, attach, (o, kind) => {
            if (kind === 'later') { if (!(limb.segs.find((q) => segObjs(q).includes(o))?.noHide)) hide(root, o, rec); return; }
            relMatrix(o, so, _m);
            if (kind === 'attach') {
                _v.setFromMatrixPosition(_m);
                if (_v.sub(P).dot(N) > 0) hide(root, o, rec);
                return;
            }
            // the plane in the mesh's own frame
            _mi.copy(_m).invert();
            const Pm = P.clone().applyMatrix4(_mi);
            // (normals go into the mesh frame by the inverse-transpose of _mi = the transpose of _m)
            const Nm = N.clone().applyMatrix3(_n3.setFromMatrix4(_m).transpose()).normalize();
            const base = saved(root).geo.get(o) || o.geometry;
            const g = cutGeometry(o.geometry, Pm, Nm, false);
            if (g === o.geometry) return;
            if (g === null) { hide(root, o, rec); return; }
            setGeo(root, o, g, rec);
            if (!base.boundingSphere) base.computeBoundingSphere();
            const r = base.boundingSphere.radius;
            if (r > bigR) { bigR = r; biggest = { mesh: o, Pm, Nm }; }
        });
    }
    return biggest;
}

/** A flesh cap (with the bone in the middle) on a trimmed mesh, lying in the cut plane. */
function addCap(root, mesh, Pm, Nm, rec) {
    // the size of the cut face: the corners now lying in the plane
    const A = mesh.geometry.attributes.position.array;
    const t1 = new THREE.Vector3(), t2 = new THREE.Vector3();
    t1.set(1, 0, 0); if (Math.abs(t1.dot(Nm)) > 0.9) t1.set(0, 1, 0);
    t1.addScaledVector(Nm, -t1.dot(Nm)).normalize();
    t2.crossVectors(Nm, t1);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity, cnt = 0;
    for (let i = 0; i < A.length; i += 3) {
        _v.set(A[i], A[i + 1], A[i + 2]).sub(Pm);
        if (Math.abs(_v.dot(Nm)) > 1e-3) continue;
        const a = _v.dot(t1), b = _v.dot(t2);
        u0 = Math.min(u0, a); u1 = Math.max(u1, a); v0 = Math.min(v0, b); v1 = Math.max(v1, b); cnt++;
    }
    if (!cnt) { u0 = v0 = -0.2; u1 = v1 = 0.2; }
    const cap = makeCap(u1 - u0, v1 - v0);
    _v.copy(Pm).addScaledVector(t1, (u0 + u1) / 2).addScaledVector(t2, (v0 + v1) / 2);
    cap.position.copy(_v);
    _m.makeBasis(t1, Nm, t2);
    cap.quaternion.setFromRotationMatrix(_m);
    mesh.add(cap);
    saved(root).caps.push(cap);
    rec.caps.push(cap);
    return cap;
}

/** A cap of w × h (in the plane, +Y = out of the stump). */
export function makeCap(w, h) {
    const cap = new THREE.Group();
    cap.name = 'stump';
    cap.userData.stump = true;
    const flesh = new THREE.Mesh(UNIT, FLESH);
    flesh.scale.set(Math.max(0.05, w * 0.98), 0.04, Math.max(0.05, h * 0.98));
    flesh.userData.stump = true;
    cap.add(flesh);
    const bone = new THREE.Mesh(UNIT, BONE);
    bone.scale.set(Math.max(0.03, w * 0.3), 0.07, Math.max(0.03, h * 0.3));
    bone.userData.stump = true;
    cap.add(bone);
    return cap;
}

/**
 * A copy of what is cut off (from d on).
 * World transform = the segment object's. userData.cutEnd = the cut point in the piece's frame.
 */
function buildPiece(limb, d, P, N, attach) {
    const at = segmentAt(limb, d);
    const i = at.i;
    const piece = new THREE.Group();
    piece.name = 'severed-' + limb.name;
    const own = [];
    const first = limb.segs[i];
    const ref = segObjs(first)[0];
    ref.updateWorldMatrix(true, false);
    ref.matrixWorld.decompose(piece.position, piece.quaternion, piece.scale);
    const stopAll = new Set();
    for (const s of limb.segs) for (const o of segObjs(s)) stopAll.add(o);
    for (const so of segObjs(first)) {
        const c = so.clone(true);
        // the clone sits in the piece where the original sits relative to `ref`
        relMatrix(so, ref.parent, _m);
        ref.updateMatrix();
        _mi.copy(ref.matrix).invert().multiply(_m);
        _mi.decompose(c.position, c.quaternion, c.scale);
        c.visible = true;
        piece.add(c);
        if (first.whole) continue;
        // trim the clone: the far side of the plane (parallel walk of original and clone)
        const pairs = [];
        const pair = (a, b) => { pairs.push([a, b]); for (let k = 0; k < a.children.length; k++) if (b.children[k]) pair(a.children[k], b.children[k]); };
        pair(so, c);
        const later = new Set();
        for (let k = i + 1; k < limb.segs.length; k++) for (const o of segObjs(limb.segs[k])) later.add(o);
        const skip = new Set();
        for (const [a, b] of pairs) {
            if (skip.has(a)) { for (const ch of a.children) skip.add(ch); continue; }
            if (a !== so && later.has(a)) { for (const ch of a.children) skip.add(ch); continue; }
            if (a.userData.stump) { b.visible = false; continue; }
            relMatrix(a, so, _m);
            if (a !== so && attach?.has(a)) {
                _v.setFromMatrixPosition(_m);
                if (_v.sub(P).dot(N) <= 0) b.visible = false;
                for (const ch of a.children) skip.add(ch);
                continue;
            }
            if (!a.isMesh) continue;
            _mi.copy(_m).invert();
            const Pm = P.clone().applyMatrix4(_mi);
            const Nm = N.clone().applyMatrix3(_n3.setFromMatrix4(_m).transpose()).normalize();
            const g = cutGeometry(a.geometry, Pm, Nm, true);
            if (g === null) { b.visible = false; continue; }
            if (g !== a.geometry) { b.geometry = g; own.push(g); }
        }
    }
    piece.userData.cutEnd = P.clone();
    piece.userData.own = own;
    piece.userData.limb = limb.name;
    return piece;
}

// ============================================================ the public cut
/**
 * Cut `name` of a body at d (what is left from its root). nSeg = the cut normal in the frame of the
 * segment the cut is in (optional).
 * @returns {{changed:boolean, piece:THREE.Group|null, d:number}}
 */
export function cutLimb(root, body, name, d, nSeg = null, { piece = true } = {}) {
    const limb = body.limbs.find((l) => l.name === name);
    if (!limb) return { changed: false, piece: null, d };
    const st = root.limbs || (root.limbs = {});
    const sv = saved(root);
    if (limb.kind === 'head') {
        if (st.head) return { changed: false, piece: null, d: 0 };
        let pc = null;
        if (piece) pc = buildHeadPiece(limb);
        const rec = { hidden: [], meshes: [], caps: [] };
        for (const p of limb.parts) hide(root, p, rec);
        // a cap on the neck: square to the neck line, at its lower end
        const L = limb.line;
        const a = new THREE.Vector3().fromArray(L.a), b = new THREE.Vector3().fromArray(L.b);
        const nrm = b.clone().sub(a).normalize();
        const cap = makeCap(L.w || 0.9, L.h || 0.7);
        cap.position.copy(a).lerp(b, 0.15);
        cap.quaternion.setFromUnitVectors(_v.set(0, 1, 0), nrm);
        L.obj.add(cap);
        sv.caps.push(cap);
        if (root._fpv) cap.traverse((c) => c.layers.set(1));
        st.head = true;
        sv.limbs.head = rec;
        return { changed: true, piece: pc, d: 0 };
    }
    const total = limbLength(limb);
    d = Math.max(0, Math.min(total, d));
    const prev = st[name];
    if (prev != null && prev <= d + 0.02) return { changed: false, piece: null, d };
    // a second cut nearer the body: put the limb back first (the middle piece falls)
    if (prev != null) restoreLimb(root, name);
    const { P, N } = cutPlane(limb, d, nSeg);
    const at = segmentAt(limb, d);
    let pc = null;
    if (piece) {
        pc = buildPiece(limb, d, P, N, body.attach);
        if (prev != null) trimPieceAt(pc, limb, d, prev);
    }
    const rec = { hidden: [], meshes: [], caps: [] };
    const big = cutSegmentOnBody(root, limb, at.i, P, N, body.attach, rec);
    if (big) addCap(root, big.mesh, big.Pm, big.Nm, rec);
    else {
        // through a "whole" segment (a hand) or air: the cap where it was cut
        const ref = segObjs(at.seg)[0];
        const host = at.seg.whole ? (ref.parent || ref) : ref;
        const cap = makeCap(at.seg.capW || 0.3, at.seg.capW || 0.3);
        if (at.seg.whole && ref.parent) { ref.updateMatrix(); cap.position.copy(ref.position); }
        else cap.position.copy(P);
        cap.quaternion.setFromUnitVectors(_v.set(0, 1, 0), at.seg.whole ? new THREE.Vector3().fromArray(limb.segs[Math.max(0, at.i - 1)].ax) : N);
        host.add(cap);
        sv.caps.push(cap);
        rec.caps.push(cap);
    }
    // a marker for the stump's end (blood drips there, a lost hand's "position")
    const mark = new THREE.Object3D();
    mark.name = 'stump-end';
    mark.userData.stump = true;
    mark.position.copy(P);
    const mhost = at.seg.whole ? (segObjs(at.seg)[0].parent || segObjs(at.seg)[0]) : segObjs(at.seg)[0];
    if (at.seg.whole) { const r = segObjs(at.seg)[0]; r.updateMatrix(); mark.position.copy(r.position); }
    mhost.add(mark);
    sv.caps.push(mark);
    rec.caps.push(mark);
    rec.mark = mark;
    st[name] = d;
    sv.limbs[name] = rec;
    body.afterCut?.();
    return { changed: true, piece: pc, d };
}

/** A middle piece: the copy runs to the end of the limb; cut it where the old stump ended. */
function trimPieceAt(pc, limb, d, prev) {
    // simple and robust: hide the copy beyond `prev` by cutting each mesh of the piece with the
    // plane at prev expressed in the piece frame (the piece frame = the frame of the segment at d)
    const atD = segmentAt(limb, d), atE = segmentAt(limb, prev);
    const refD = segObjs(atD.seg)[0], refE = segObjs(atE.seg)[0];
    const ax = new THREE.Vector3().fromArray(atE.seg.ax).normalize();
    const P = new THREE.Vector3().fromArray(atE.seg.o || [0, 0, 0]).addScaledVector(ax, atE.local);
    // plane at prev in refD's frame
    refD.updateWorldMatrix(true, false); refE.updateWorldMatrix(true, false);
    const toD = new THREE.Matrix4().copy(refD.matrixWorld).invert().multiply(refE.matrixWorld);
    const PD = P.clone().applyMatrix4(toD);
    const ND = ax.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(toD)).normalize();
    pc.updateMatrixWorld(true);
    _mi.copy(pc.matrixWorld).invert();
    pc.traverse((m) => {
        if (!m.isMesh || !m.visible || m.userData.stump) return;
        const rel = new THREE.Matrix4().copy(_mi).multiply(m.matrixWorld); // mesh → piece (= refD) frame
        const inv = rel.clone().invert();
        const Pm = PD.clone().applyMatrix4(inv);
        const Nm = ND.clone().applyMatrix3(new THREE.Matrix3().setFromMatrix4(rel).transpose()).normalize();
        const g = cutGeometry(m.geometry, Pm, Nm, false);
        if (g === null) m.visible = false;
        else if (g !== m.geometry) { m.geometry = g; pc.userData.own.push(g); }
    });
}

function buildHeadPiece(limb) {
    const piece = new THREE.Group();
    piece.name = 'severed-head';
    const ref = limb.parts[0];
    ref.updateWorldMatrix(true, true);
    ref.matrixWorld.decompose(piece.position, piece.quaternion, piece.scale);
    _mi.copy(ref.matrixWorld).invert();
    for (const p of limb.parts) {
        const c = p.clone(true);
        c.visible = true;
        c.traverse((o) => { if (o.userData.stump) o.visible = false; o.layers.set(0); });
        _m.copy(_mi).multiply(p.matrixWorld);
        _m.decompose(c.position, c.quaternion, c.scale);
        piece.add(c);
    }
    const L = limb.line;
    L.obj.updateWorldMatrix(true, false);
    const a = new THREE.Vector3().fromArray(L.a).lerp(_w.fromArray(L.b), 0.15).applyMatrix4(L.obj.matrixWorld).applyMatrix4(_mi);
    piece.userData.cutEnd = a;
    piece.userData.own = [];
    piece.userData.limb = 'head';
    return piece;
}

/** Put one limb back as it was. */
export function restoreLimb(root, name) {
    const sv = root._cutSaved;
    if (!sv) return;
    const rec = sv.limbs[name];
    if (rec) {
        for (const o of rec.hidden) if (sv.vis.has(o)) { o.visible = sv.vis.get(o); sv.vis.delete(o); }
        for (const m of rec.meshes) {
            const g0 = sv.geo.get(m);
            if (g0 && m.geometry !== g0) { if (m.geometry.userData?.cut) m.geometry.dispose(); m.geometry = g0; }
            sv.geo.delete(m);
        }
        for (const c of rec.caps) { c.parent?.remove(c); const i = sv.caps.indexOf(c); if (i >= 0) sv.caps.splice(i, 1); }
        delete sv.limbs[name];
    }
    if (root.limbs) delete root.limbs[name];
    root._cutBody?.afterCut?.();
}

/** The whole body as it was (respawn). */
export function restoreAll(root) {
    const sv = root._cutSaved;
    if (sv) {
        for (const name of Object.keys(sv.limbs)) restoreLimb(root, name);
        for (const [o, v] of sv.vis) o.visible = v;
        for (const [m, g0] of sv.geo) { if (m.geometry !== g0) { if (m.geometry.userData?.cut) m.geometry.dispose(); m.geometry = g0; } }
        for (const c of sv.caps) c.parent?.remove(c);
        root._cutSaved = null;
    }
    root.limbs = {};
    root._cutBody?.afterCut?.();
}

/** World position of a stump's end (null when that limb is whole). */
export function stumpEnd(root, name, out = new THREE.Vector3()) {
    const rec = root._cutSaved?.limbs?.[name];
    if (!rec?.mark?.parent) return null;
    return rec.mark.getWorldPosition(out);
}

/** Is anything cut off? */
export function anyLost(st) {
    if (!st) return false;
    for (const k in st) if (st[k] != null && st[k] !== false) return true;
    return false;
}

/** Bring a model to a given state (late joiners, saves): no pieces. */
export function applyState(root, body, st) {
    const cur = root.limbs || {};
    const same = Object.keys(cur).length === Object.keys(st || {}).length && Object.keys(st || {}).every((k) => cur[k] === st[k] || Math.abs(cur[k] - st[k]) < 0.011);
    if (same) return false;
    restoreAll(root);
    for (const k of Object.keys(st || {})) {
        if (st[k] == null || st[k] === false) continue;
        cutLimb(root, body, k, k === 'head' ? 0 : st[k], null, { piece: false });
    }
    return true;
}

export { segObjs };
