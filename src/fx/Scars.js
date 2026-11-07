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
        // (a model that did not answer at all: the ball's line, kept a little outside)
        const lift = hits ? SCAR.LIFT : SCAR.LIFT + 0.06;
        const mesh = this._ribbon(pts, parent, lift, body.r);
        if (!mesh) return false;
        // (at most MAX_PER on one creature, MAX in the world: the oldest go)
        const mine = this.list.filter((e) => e.owner === owner);
        if (mine.length >= SCAR.MAX_PER) this._drop(mine[0]);
        while (this.list.length >= SCAR.MAX) this._drop(this.list[0]);
        parent.add(mesh);
        this.list.push({ mesh, owner, parent, t: 0 });
        return true;
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
        e.mesh.parent?.remove(e.mesh);
        e.mesh.geometry?.dispose();
    }

    /** Every frame: drops from the scars of the bleeding, and now and then the sweep for the dead. */
    update(dt) {
        const g = this.game;
        if (!this.list.length) return;
        if ((this._sweepT -= dt) <= 0) {
            this._sweepT = SCAR.SWEEP;
            for (const e of [...this.list]) {
                const o = e.owner;
                let up = e.mesh.parent, ok = false;
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
            const pos = e.mesh.geometry.attributes.position;
            const k = Math.floor(Math.random() * (pos.count / 4)) * 4 + (Math.random() < 0.5 ? 1 : 2);
            _a.fromBufferAttribute(pos, Math.min(pos.count - 1, k)).applyMatrix4(e.mesh.matrixWorld);
            if (cam && _a.distanceToSquared(cam) > SCAR.NEAR * SCAR.NEAR) continue;
            g.dismember?._drip?.(_a);
        }
    }

    dispose() { for (const e of [...this.list]) this._drop(e); }
}
