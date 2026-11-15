/**
 * Scars.js — the mark a cutting blade leaves on a creature: a wound that follows the line of the blade across its body («Sectura»).
 *
 * The author 07.11: «даже если я ничего не отрезал, то всё равно должны быть какие-то шрамы там, где я прошёлся лезвием — прямо по шву, не рандомные. И кровь сочится».
 *
 * How: the blade's sheet (origin, forward f, swing s) crosses a body; the cut line is where the sheet meets the creature's skin. For each sample along the sheet
 * (across the body, 9 of them) a ray flies from the caster's side along f to the REAL model (THREE.Raycaster, once per hit — not per frame); a miss falls back to the
 * body's ball. The points become a ribbon (red lips, a dark crust in the middle, tapering at the ends) lying a hair above the skin, parented to the creature's group
 * (it walks with it). While the creature bleeds (`t.bleed > 0` / `t.woundHold`) drops fall from the scar. A creature keeps at most MAX_PER scars, the world MAX of them (the
 * oldest go first); a scar dies with its creature (swept every few seconds: the geometry is disposed, the material is shared).
 *
 * «Кто/что»: every creature with a model (animals, villagers, sailors, zombies, other players' avatars, bosses…) is scarred the same way — the picture is the same on every
 * computer (each runs the same sheet test). Ghosts / gargoyles / Diabolos / the fire serpent (the rules' `none`) are never reached. My own hero: no scar (the camera sees no
 * back; the wound is the HUD's red).
 */
import * as THREE from 'three';

export const SCAR = {
    MAX: 80, MAX_PER: 6,
    SAMPLES: 9,
    LIFT: 0.03, // m above the skin
    WIDTH: 0.16, // m (the lips); the crust is 0.42 of it
    DRIP: 3.5, // drops a second from a scar of a bleeding creature
    SWEEP: 3, // s between looks for dead scars
    NEAR: 70, // m: farther scars are not dripped
};

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _n = new THREE.Vector3(), _t = new THREE.Vector3(), _l = new THREE.Vector3(), _p = new THREE.Vector3();
const _ray = new THREE.Raycaster();
let _mat = null;
function scarMat() {
    return _mat || (_mat = Object.assign(new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), { userData: { shared: true } }));
}

/**
 * PURE: the points where a sheet (through `o`, forward `f`, swing `s`) meets a ball body (axis `a`→`b`, radius `r`), as a line across the body facing the caster.
 * → [{x, y, z, nx, ny, nz}] (world), or [] if the sheet misses the ball. Used as the guess before the rays and as the fallback.
 */
export function ballLine(o, f, s, a, b, r, samples = SCAR.SAMPLES) {
    // the plane's normal n = f × s
    const nx = f.y * s.z - f.z * s.y, ny = f.z * s.x - f.x * s.z, nz = f.x * s.y - f.y * s.x;
    const nl = Math.hypot(nx, ny, nz) || 1;
    const Nx = nx / nl, Ny = ny / nl, Nz = nz / nl;
    // the axis point nearest to the plane
    const da = (a.x - o.x) * Nx + (a.y - o.y) * Ny + (a.z - o.z) * Nz;
    const db = (b.x - o.x) * Nx + (b.y - o.y) * Ny + (b.z - o.z) * Nz;
    let k = 0;
    if (Math.abs(da - db) > 1e-6) k = Math.max(0, Math.min(1, da / (da - db)));
    const cx = a.x + (b.x - a.x) * k, cy = a.y + (b.y - a.y) * k, cz = a.z + (b.z - a.z) * k;
    const d = (cx - o.x) * Nx + (cy - o.y) * Ny + (cz - o.z) * Nz; // signed distance of the centre from the plane
    if (Math.abs(d) >= r) return [];
    const hl = Math.sqrt(r * r - d * d); // half the chord (along s)
    const px = cx - Nx * d, py = cy - Ny * d, pz = cz - Nz * d; // the centre projected on the plane
    const out = [];
    for (let i = 0; i < samples; i++) {
        const u = (i / (samples - 1) * 2 - 1) * hl * 0.96;
        const depth = Math.sqrt(Math.max(0, hl * hl - u * u)); // the skin facing the caster (toward −f)
        const x = px + s.x * u - f.x * depth, y = py + s.y * u - f.y * depth, z = pz + s.z * u - f.z * depth;
        out.push({ x, y, z, nx: -f.x, ny: -f.y, nz: -f.z });
    }
    return out;
}

// ------------------------------------------------------------------ the wound DECAL (the author 15.11: «наклеивает какую-то штуку… очень нереалистично. Надо переделать»)
// A flat ribbon floated over a boxy body looked like a sticker. Now the cut is PROJECTED onto the real triangles it crosses (every mesh of the creature the
// blade's strip touches: the torso, the arm, the leg…): the triangles are clipped to a strip along the cut line, so the wound lies flush on each surface, bends
// round the edges of the parts, and — being made of pieces of the creature's own meshes — moves with them (a skinned part gets the same bones). A drawn wound
// (lens-shaped lips, a dark clotted centre, glossy blood, a few runs and beads) is its texture, shared by all (one material).
let _woundTex = null, _woundMat = null;
function woundTexture() {
    if (_woundTex) return _woundTex;
    if (typeof document === 'undefined') return null;
    const W = 256, H = 64, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    c.clearRect(0, 0, W, H);
    const lens = (inset, ampK) => { // a lens: pointed ends, bulging in the middle, slightly crooked (a real cut is not a ruler line)
        c.beginPath();
        const top = (x) => H / 2 - Math.sin(Math.PI * x) * (H * 0.3 * ampK) - Math.sin(x * 11) * 1.2;
        const bot = (x) => H / 2 + Math.sin(Math.PI * x) * (H * 0.3 * ampK) * 0.9 + Math.sin(x * 9 + 1) * 1.2;
        const x0 = inset * W, x1 = W - inset * W;
        c.moveTo(x0, H / 2);
        for (let i = 0; i <= 40; i++) { const x = i / 40; c.lineTo(x0 + (x1 - x0) * x, top(x * 0.98 + 0.01)); }
        for (let i = 40; i >= 0; i--) { const x = i / 40; c.lineTo(x0 + (x1 - x0) * x, bot(x * 0.98 + 0.01)); }
        c.closePath();
    };
    // the bruised, swollen flesh round it (soft, low alpha), the lips, the blood, the dark depth, the gloss
    const g = c.createRadialGradient(W / 2, H / 2, 4, W / 2, H / 2, W * 0.5); g.addColorStop(0, 'rgba(150,40,50,0.55)'); g.addColorStop(1, 'rgba(150,40,50,0)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    lens(0.04, 0.95); c.fillStyle = 'rgba(176,42,52,0.95)'; c.fill(); // (the torn lips)
    lens(0.07, 0.68); c.fillStyle = '#7d0d17'; c.fill(); // (blood)
    lens(0.1, 0.4); c.fillStyle = '#2a0408'; c.fill(); // (the dark depth)
    c.strokeStyle = 'rgba(255,170,170,0.55)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(W * 0.2, H * 0.4); c.quadraticCurveTo(W * 0.5, H * 0.3, W * 0.78, H * 0.41); c.stroke(); // (the gloss on the wet edge)
    // runs of blood and a few beads below the lower lip
    for (const [x, len] of [[0.3, 0.3], [0.52, 0.42], [0.7, 0.24]]) { c.fillStyle = 'rgba(120,8,18,0.9)'; c.beginPath(); const px = x * W; c.moveTo(px - 2, H * 0.62); c.lineTo(px + 2, H * 0.62); c.lineTo(px + 1, H * (0.62 + len * 0.38)); c.lineTo(px - 1, H * (0.62 + len * 0.38)); c.closePath(); c.fill(); c.beginPath(); c.arc(px, H * (0.62 + len * 0.38) + 1.5, 2.2, 0, Math.PI * 2); c.fill(); }
    const t = new THREE.CanvasTexture(cv); t.anisotropy = 4; t.userData = { shared: true };
    return (_woundTex = t);
}
function woundMat() {
    if (_woundMat) return _woundMat;
    const map = woundTexture();
    _woundMat = new THREE.MeshLambertMaterial({ map, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, color: map ? 0xffffff : 0x8a0a14 });
    _woundMat.userData.shared = true;
    return _woundMat;
}

const _v0 = new THREE.Vector3(), _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _w0 = new THREE.Vector3(), _w1 = new THREE.Vector3(), _w2 = new THREE.Vector3(), _fn = new THREE.Vector3(), _e1 = new THREE.Vector3(), _e2 = new THREE.Vector3();
/** Clip a convex polygon (array of {p: Vector3, b: [b0, b1, b2]}) against the plane n·x ≤ d; barycentrics are interpolated with the points. */
function clipPoly(poly, n, d) {
    const out = [];
    for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        const da = n.dot(a.p) - d, db = n.dot(b.p) - d;
        if (da <= 0) out.push(a);
        if ((da < 0 && db > 0) || (da > 0 && db < 0)) {
            const k = da / (da - db);
            out.push({ p: a.p.clone().lerp(b.p, k), b: [a.b[0] + (b.b[0] - a.b[0]) * k, a.b[1] + (b.b[1] - a.b[1]) * k, a.b[2] + (b.b[2] - a.b[2]) * k] });
        }
    }
    return out;
}

/**
 * PURE-ish: the triangles of `mesh` (current pose, world) inside the box {c, ax (along the cut), ay (across), az (projection, towards the caster = −f), hx, hy, hz} →
 * { pos: [bind/local x,y,z …], uv: [..], skin: [index4, weight4 …] | null } or null. `facing`: a triangle must face the caster (n·az > FACE).
 */
export function projectOnMesh(mesh, box, lift = 0.012) {
    const geo = mesh.geometry;
    const P = geo?.attributes?.position;
    if (!P) return null;
    const idx = geo.index, count = idx ? idx.count : P.count;
    const skinned = !!mesh.isSkinnedMesh && geo.attributes.skinIndex;
    mesh.updateMatrixWorld(true);
    const M = mesh.matrixWorld;
    const world = (i, out) => { out.fromBufferAttribute(P, i); if (skinned) mesh.boneTransform(i, out); return out.applyMatrix4(M); };
    const planes = [[box.ax, box.hx], [box.ax.clone().negate(), box.hx], [box.ay, box.hy], [box.ay.clone().negate(), box.hy], [box.az, box.hz], [box.az.clone().negate(), box.hz]];
    const pos = [], uv = [], nor = [], sk = [], sw = [], tdepth = []; // (tdepth: per emitted triangle, how far towards the caster its nearest point is)
    const SI = geo.attributes.skinIndex, SW = geo.attributes.skinWeight, N = geo.attributes.normal;
    const raw = (i) => new THREE.Vector3().fromBufferAttribute(P, i);
    for (let t = 0; t < count; t += 3) {
        const i0 = idx ? idx.getX(t) : t, i1 = idx ? idx.getX(t + 1) : t + 1, i2 = idx ? idx.getX(t + 2) : t + 2;
        world(i0, _w0); world(i1, _w1); world(i2, _w2);
        // (a quick reject: the triangle's box against the decal's ball)
        const cx = (_w0.x + _w1.x + _w2.x) / 3 - box.c.x, cy = (_w0.y + _w1.y + _w2.y) / 3 - box.c.y, cz = (_w0.z + _w1.z + _w2.z) / 3 - box.c.z;
        if (cx * cx + cy * cy + cz * cz > box.reach * box.reach) continue;
        _fn.crossVectors(_e1.subVectors(_w1, _w0), _e2.subVectors(_w2, _w0));
        const fl = _fn.length(); if (fl < 1e-9) continue;
        _fn.divideScalar(fl);
        const face = _fn.dot(box.az); // (normals out of a closed mesh: front faces point at the caster)
        if (Math.abs(face) < 0.3) continue; // (sideways: skip — the wound wraps on the next face)
        if (face < 0) continue; // (the back faces)
        let poly = [{ p: _w0.clone(), b: [1, 0, 0] }, { p: _w1.clone(), b: [0, 1, 0] }, { p: _w2.clone(), b: [0, 0, 1] }];
        for (const [n, d] of planes) { poly = clipPoly(poly, n, n.dot(box.c) + d); if (poly.length < 3) break; }
        if (poly.length < 3) continue;
        const r0 = raw(i0), r1 = raw(i1), r2 = raw(i2);
        const rn = N ? new THREE.Vector3().fromBufferAttribute(N, i0) : _fn.clone();
        const dom = (b) => (b[0] >= b[1] && b[0] >= b[2] ? i0 : b[1] >= b[2] ? i1 : i2);
        const vert = (q) => {
            const lp = r0.clone().multiplyScalar(q.b[0]).addScaledVector(r1, q.b[1]).addScaledVector(r2, q.b[2]);
            lp.addScaledVector(rn, lift / Math.max(0.2, Math.min(3, (mesh.scale?.y || 1)))); // (a hair off the skin: along the normal)
            const rel = _v0.subVectors(q.p, box.c);
            return { lp, u: (rel.dot(box.ax) / box.hx + 1) / 2, v: (rel.dot(box.ay) / box.hy + 1) / 2, vi: dom(q.b) };
        };
        const vs = poly.map(vert);
        let dep = -1e9; for (const q of poly) dep = Math.max(dep, _v0.subVectors(q.p, box.c).dot(box.az));
        for (let k = 1; k < vs.length - 1; k++) { tdepth.push(dep); for (const q of [vs[0], vs[k], vs[k + 1]]) {
            pos.push(q.lp.x, q.lp.y, q.lp.z); uv.push(q.u, q.v); nor.push(rn.x, rn.y, rn.z);
            if (skinned) { sk.push(SI.getX(q.vi), SI.getY(q.vi), SI.getZ(q.vi), SI.getW(q.vi)); sw.push(SW.getX(q.vi), SW.getY(q.vi), SW.getZ(q.vi), SW.getW(q.vi)); }
        } }
    }
    if (!pos.length) return null;
    return { pos, uv, nor, tdepth, sk: skinned ? sk : null, sw: skinned ? sw : null };
}

/** Keep only the triangles within `band` of the nearest surface the blade met (the first thing in its way, not the arm behind the body). */
export function nearestSurface(r, maxDepth, band = 0.4) {
    const keep = r.tdepth.map((d) => d >= maxDepth - band);
    if (!keep.some(Boolean)) return null;
    const out = { pos: [], uv: [], nor: [], sk: r.sk ? [] : null, sw: r.sw ? [] : null };
    keep.forEach((k, t) => { if (!k) return; for (let v = 0; v < 3; v++) { const i = t * 3 + v; out.pos.push(r.pos[i * 3], r.pos[i * 3 + 1], r.pos[i * 3 + 2]); out.uv.push(r.uv[i * 2], r.uv[i * 2 + 1]); out.nor.push(r.nor[i * 3], r.nor[i * 3 + 1], r.nor[i * 3 + 2]); if (r.sk) { for (let q = 0; q < 4; q++) { out.sk.push(r.sk[i * 4 + q]); out.sw.push(r.sw[i * 4 + q]); } } } });
    return out;
}

export class Scars {
    constructor(game) {
        this.game = game;
        this.list = []; // {mesh, owner, parent, pts (local), t}
        this._sweepT = 0;
        this._dripT = 0;
    }

    /** A sample for the shader warm-up (Game.prewarm). */
    sampleMesh() {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute([1, 0, 0, 1, 0, 0, 1, 0, 0], 3));
        const m = new THREE.Mesh(g, scarMat());
        m.frustumCulled = false;
        return m;
    }

    /** The object a creature's marks hang on (its group), or null. */
    static parentOf(t) {
        if (!t) return null;
        if (t.group?.isObject3D) return t.group;
        const m = t.model;
        if (m?.isObject3D) return m;
        if (m?.root?.isObject3D) return m.root;
        if (m?.group?.isObject3D) return m.group;
        if (t.isObject3D) return t;
        return null;
    }

    /**
     * One slash crossed `owner` (a creature object): leave the mark. `sheet`: {o, f, s} (world); `body`: {a, b, r} the ball the hit was found on.
     * → true if a scar was made.
     */
    mark(owner, sheet, body, seed = 0) {
        const parent = Scars.parentOf(owner);
        if (!parent || !parent.parent) return false;
        const guess = ballLine(sheet.o, sheet.f, sheet.s, body.a, body.b, body.r);
        if (guess.length < 2) return false;
        // the real skin: a ray at each sample from the caster's side along f
        let hits = 0;
        const pts = guess.map((g) => {
            _a.set(g.x, g.y, g.z).addScaledVector(sheet.f, -(body.r + 0.5)); // (from before the body)
            _ray.set(_a, _b.copy(sheet.f));
            _ray.far = body.r * 2 + 1;
            let best = null;
            try {
                const res = _ray.intersectObject(parent, true);
                for (const h of res) { if (h.object?.isMesh && h.object.visible !== false && !h.object.userData?.scar && h.object.material?.visible !== false) { best = h; break; } }
            } catch (_) { best = null; }
            if (best && best.point.distanceTo(_c.set(g.x, g.y, g.z)) < body.r * 1.1 + 0.3) {
                hits++;
                const nrm = best.face ? _n.copy(best.face.normal).transformDirection(best.object.matrixWorld) : _n.set(g.nx, g.ny, g.nz);
                if (nrm.dot(_t.copy(sheet.f)) > 0) nrm.negate(); // (the side that faces the caster)
                return { x: best.point.x, y: best.point.y, z: best.point.z, nx: nrm.x, ny: nrm.y, nz: nrm.z };
            }
            return g;
        });
        // the wound lies ON the surfaces it crosses (projected decal); the floating ribbon is only the fallback for a model that gave no triangles (see the header)
        const decal = this._decal(pts, parent, sheet, body, seed); // (no rays needed: it works on the posed triangles itself — the rays above miss skinned models, whose bind-pose bounds are elsewhere: that is why the old ribbon floated)
        if (decal) {
            const mine0 = this.list.filter((e) => e.owner === owner);
            if (mine0.length >= SCAR.MAX_PER) this._drop(mine0[0]);
            while (this.list.length >= SCAR.MAX) this._drop(this.list[0]);
            this.list.push({ objs: decal.objs, owner, parent, t: 0, anchor: decal.anchor });
            return true;
        }
        // (a model that did not answer at all: the ball's line, kept a little outside)
        const lift = hits ? SCAR.LIFT : SCAR.LIFT + 0.06;
        const mesh = this._ribbon(pts, parent, lift, body.r);
        if (!mesh) return false;
        // (at most MAX_PER on one creature, MAX in the world: the oldest go)
        const mine = this.list.filter((e) => e.owner === owner);
        if (mine.length >= SCAR.MAX_PER) this._drop(mine[0]);
        while (this.list.length >= SCAR.MAX) this._drop(this.list[0]);
        parent.add(mesh);
        this.list.push({ objs: [mesh], owner, parent, t: 0, anchor: null });
        return true;
    }

    /** The decal strip along the cut: → {objs, anchor} or null. */
    _decal(pts, parent, sheet, body, seed) {
        const first = pts[0], last = pts[pts.length - 1];
        const ax = new THREE.Vector3(last.x - first.x, last.y - first.y, last.z - first.z);
        const len = ax.length();
        if (len < 0.12) return null;
        ax.divideScalar(len);
        const az = new THREE.Vector3().copy(sheet.f).negate(); // (towards the caster)
        const ay = new THREE.Vector3().crossVectors(az, ax); if (ay.lengthSq() < 1e-6) return null; ay.normalize();
        ax.crossVectors(ay, az).normalize(); // (re-orthogonalised)
        const c = new THREE.Vector3(); for (const p of pts) c.add(_a.set(p.x, p.y, p.z)); c.divideScalar(pts.length);
        const hx = Math.min(len * 0.55, body.r * 1.0 + 0.1), hy = Math.max(0.07, Math.min(0.16, 0.07 + body.r * 0.05));
        const flip = ((seed * 2654435761) >>> 0) & 1;
        const box = { c, ax, ay: flip ? ay.clone().negate() : ay, az, hx, hy, hz: 4, reach: Math.hypot(hx, hy, 4) + 0.2 }; // (a thin slab round the skin points: only what the blade really crossed, not the arms and the things behind)
        const objs = [];
        parent.updateMatrixWorld(true);
        const meshes = [];
        parent.traverse((o) => { if (o.isMesh && o.visible && !o.userData?.scar && o.material?.visible !== false && o.geometry?.attributes?.position && !o.isInstancedMesh) meshes.push(o); });
        let budget = 80000; // (triangles looked at: one wound is cheap, a huge merged model is not allowed to hitch the frame)
        const found = []; let maxDepth = -1e9;
        for (const m of meshes) {
            const tris = (m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count) / 3;
            if ((budget -= tris) < 0) break;
            const r = projectOnMesh(m, box);
            if (!r) continue;
            found.push([m, r]); for (const d of r.tdepth) maxDepth = Math.max(maxDepth, d);
        }
        for (const [m, r0] of found) { // (only the nearest surface along the blade's way — the first thing it meets)
            const r = nearestSurface(r0, maxDepth);
            if (!r) continue;
            const geo = new THREE.BufferGeometry();
            geo.setAttribute('position', new THREE.Float32BufferAttribute(r.pos, 3));
            geo.setAttribute('uv', new THREE.Float32BufferAttribute(r.uv, 2));
            geo.setAttribute('normal', new THREE.Float32BufferAttribute(r.nor, 3));
            let mesh;
            if (r.sk) {
                geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(r.sk, 4));
                geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(r.sw, 4));
                mesh = new THREE.SkinnedMesh(geo, woundMat());
                mesh.bindMode = m.bindMode;
                mesh.bind(m.skeleton, m.bindMatrix);
            } else mesh = new THREE.Mesh(geo, woundMat());
            mesh.frustumCulled = false; mesh.renderOrder = 3; mesh.userData.scar = true;
            m.add(mesh); objs.push(mesh);
        }
        this.lastDecal = { meshes: meshes.length, made: objs.length };
        if (!objs.length) return null;
        return { objs, anchor: parent.worldToLocal(c.clone()) };
    }

    _ribbon(pts, parent, lift, bodyR) {
        const N = pts.length;
        parent.updateMatrixWorld(true);
        const inv = new THREE.Matrix4().copy(parent.matrixWorld).invert();
        const W = Math.max(0.08, Math.min(0.3, SCAR.WIDTH * (0.6 + bodyR * 0.25)));
        const pos = [], nor = [], col = [], idx = [];
        const lipC = [0.62, 0.02, 0.07], crustC = [0.2, 0.0, 0.03];
        for (let i = 0; i < N; i++) {
            const p = pts[i], q0 = pts[Math.max(0, i - 1)], q1 = pts[Math.min(N - 1, i + 1)];
            _t.set(q1.x - q0.x, q1.y - q0.y, q1.z - q0.z);
            if (_t.lengthSq() < 1e-8) return null;
            _t.normalize();
            _n.set(p.nx, p.ny, p.nz).normalize();
            _l.crossVectors(_t, _n);
            if (_l.lengthSq() < 1e-6) _l.set(0, 1, 0);
            _l.normalize();
            const u = i / (N - 1);
            const taper = Math.pow(Math.sin(Math.PI * Math.min(1, Math.max(0.04, u))), 0.55); // (a needle at both ends)
            for (const [w, c, up] of [[-W * 0.5 * taper, lipC, lift], [-W * 0.21 * taper, crustC, lift * 1.9], [W * 0.21 * taper, crustC, lift * 1.9], [W * 0.5 * taper, lipC, lift]]) {
                _p.set(p.x, p.y, p.z).addScaledVector(_l, w).addScaledVector(_n, up).applyMatrix4(inv);
                pos.push(_p.x, _p.y, _p.z);
                _a.copy(_n).transformDirection(inv);
                nor.push(_a.x, _a.y, _a.z);
                col.push(c[0], c[1], c[2]);
            }
            if (i < N - 1) { const o = i * 4; for (let k = 0; k < 3; k++) idx.push(o + k, o + k + 1, o + k + 4, o + k + 1, o + k + 5, o + k + 4); }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
        geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
        geo.setIndex(idx);
        geo.computeBoundingSphere();
        const mesh = new THREE.Mesh(geo, scarMat());
        mesh.userData.scar = true;
        mesh.frustumCulled = true;
        mesh.renderOrder = 2;
        return mesh;
    }

    _drop(e) {
        const i = this.list.indexOf(e);
        if (i >= 0) this.list.splice(i, 1);
        for (const o of e.objs) { o.parent?.remove(o); o.geometry?.dispose(); }
    }

    /** Every frame: drops from the scars of the bleeding, and now and then the sweep for the dead. */
    update(dt) {
        const g = this.game;
        if (!this.list.length) return;
        if ((this._sweepT -= dt) <= 0) {
            this._sweepT = SCAR.SWEEP;
            for (const e of [...this.list]) {
                const o = e.owner;
                let up = e.objs[0]?.parent, ok = false;
                while (up) { if (up === g.scene) { ok = true; break; } up = up.parent; }
                if (!ok || o?.removable || o?.gone) this._drop(e);
            }
        }
        if ((this._dripT -= dt) > 0) return;
        this._dripT = 0.25;
        const cam = g.camera?.position;
        for (const e of this.list) {
            const o = e.owner;
            if (!(o?.bleed > 0 || o?.woundHold) || o.dead || o.isDead) continue;
            if (Math.random() > SCAR.DRIP * 0.25) continue;
            if (e.anchor) e.parent.localToWorld(_a.copy(e.anchor)).addScaledVector(_b.set(Math.random() - 0.5, (Math.random() - 0.5) * 0.4, Math.random() - 0.5), 0.5);
            else { const m = e.objs[0], pos = m.geometry.attributes.position; const k = Math.floor(Math.random() * (pos.count / 4)) * 4 + (Math.random() < 0.5 ? 1 : 2); _a.fromBufferAttribute(pos, Math.min(pos.count - 1, k)).applyMatrix4(m.matrixWorld); }
            if (cam && _a.distanceToSquared(cam) > SCAR.NEAR * SCAR.NEAR) continue;
            g.dismember?._drip?.(_a);
        }
    }

    dispose() { for (const e of [...this.list]) this._drop(e); }
}
