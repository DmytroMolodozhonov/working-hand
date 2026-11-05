/**
 * RigidProp.js — the one physics a loose solid thing in the world gets by default (the author 05.11: «вещь всегда по умолчанию получала
 * физику… не было проблемы, что какая-то вещь новая имеет такие ограничения»; «части тела после Пилбидрио как будто не имеют физики»;
 * «вещи зависают в воздухе, особенно после Бомбарды»). Rule and checklist: .claude/skills/physics/SKILL.md.
 *
 *   a box (from the model's own bounds) with a mass and a real inertia: gravity G, air; its eight corners meet the ground and the walls with
 *   impulses AT THE CORNER — so a blow on one end turns it, it tips over its edge and lies down by itself (no «slerp to flat»), friction
 *   at the contact makes it roll and stop; it sleeps when still — and a sleeping one looks under itself now and then (`CHECK_T`): the
 *   ground blown away (a crater, a wall knocked down under it) → it wakes and falls. Never left hanging in the air.
 * `world` = { ground(x, z, y) → the floor's y under a point at y, blocked(x, y, z) → solid there }.
 */
import * as THREE from 'three';

export const RIGID = {
    G: 22, // m/s² (as everything that falls in the game)
    E: 0.22, // bounce off the ground (a body part: soft, little bounce)
    MU: 0.65, // friction at a contact
    AIR: 0.06, // 1/s of the speed lost in the air
    ANG_AIR: 0.25, // 1/s of the turning lost in the air
    ROLL: 5, // 1/s of turning lost while it touches the ground (rolling resistance)
    SUB: 3, // sub-steps a frame
    MAX_DT: 0.05, // s: a longer frame is cut (time itself runs on)
    SLEEP_V: 0.3, // m/s …
    SLEEP_W: 0.7, // rad/s … slower than this, touching, for …
    SLEEP_T: 0.5, // s → asleep
    CHECK_T: 0.4, // s: a sleeping thing looks under itself this often
    WAKE_GAP: 0.12, // m: its lowest corner this far over the floor → it falls again
};

const _p = new THREE.Vector3(), _r = new THREE.Vector3(), _vp = new THREE.Vector3(), _n = new THREE.Vector3(), _t = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _J = new THREE.Vector3(), _q = new THREE.Quaternion(), _c = new THREE.Vector3();
const _m4 = new THREE.Matrix4(), _R = new THREE.Matrix3(), _Rt = new THREE.Matrix3(), _I = new THREE.Matrix3();
const _box = new THREE.Box3();

/** The model's box in its own frame (visible meshes only). */
export function localBox(obj, out = new THREE.Box3()) {
    out.makeEmpty();
    obj.updateMatrixWorld(true);
    const inv = _m4.copy(obj.matrixWorld).invert();
    const m = new THREE.Matrix4();
    obj.traverse((o) => {
        if (!o.isMesh || !o.visible) return;
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        out.union(_box.copy(o.geometry.boundingBox).applyMatrix4(m.multiplyMatrices(inv, o.matrixWorld)));
    });
    if (out.isEmpty()) out.set(new THREE.Vector3(-0.2, -0.2, -0.2), new THREE.Vector3(0.2, 0.2, 0.2));
    return out;
}

export class RigidProp {
    /**
     * @param {THREE.Object3D} obj  its world transform set (position, quaternion); scale is kept
     * @param {object} o  vel, spin (rad/s, world), box (THREE.Box3 in obj's frame; else measured), e, mu
     */
    constructor(obj, o = {}) {
        this.obj = obj;
        const box = o.box || localBox(obj);
        const s = obj.scale;
        this.c = box.getCenter(new THREE.Vector3()); // (the centre of mass, in obj's frame)
        const size = box.getSize(new THREE.Vector3()).multiply(_a.set(Math.abs(s.x), Math.abs(s.y), Math.abs(s.z)));
        this.size = size;
        this.corners = [];
        for (let i = 0; i < 8; i++) this.corners.push(new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
        // a solid box of mass 1: I = (b² + c²) / 12 about each axis (a thin thing still turns: never below a small floor)
        const sx = Math.max(0.05, size.x), sy = Math.max(0.05, size.y), sz = Math.max(0.05, size.z);
        this.invIBody = new THREE.Vector3(12 / (sy * sy + sz * sz), 12 / (sx * sx + sz * sz), 12 / (sx * sx + sy * sy));
        this.v = (o.vel || _a.set(0, 0, 0)).clone();
        this.w = (o.spin || _a.set(0, 0, 0)).clone();
        this.e = o.e ?? RIGID.E;
        this.mu = o.mu ?? RIGID.MU;
        this.sleeping = false;
        this.calm = 0;
        this.chk = 0;
        this.touching = false;
    }

    /** World centre of mass now. */
    com(out = new THREE.Vector3()) { return out.copy(this.c).multiply(this.obj.scale).applyQuaternion(this.obj.quaternion).add(this.obj.position); }

    /** A corner in the world now. */
    corner(i, out = new THREE.Vector3()) { return out.copy(this.corners[i]).multiply(this.obj.scale).applyQuaternion(this.obj.quaternion).add(this.obj.position); }

    /** Push it (a blow, a blast): wakes it. `at` (world) turns it too. */
    push(dv, at = null) {
        this.wake();
        this.v.add(dv);
        if (at) { this.com(_p); _r.subVectors(at, _p); this._applyInvI(_a.crossVectors(_r, dv), _b); this.w.add(_b); }
    }

    wake() { this.sleeping = false; this.calm = 0; }

    /** One frame. */
    step(dt, world) {
        if (!(dt > 0) || !world) return;
        if (this.sleeping) {
            this.chk += dt;
            if (this.chk < RIGID.CHECK_T) return;
            this.chk = 0;
            // (asleep: is there still something under it? a crater, a wall blown away → it falls)
            let low = Infinity;
            for (let i = 0; i < 8; i++) { this.corner(i, _p); low = Math.min(low, _p.y - world.ground(_p.x, _p.z, _p.y)); }
            if (low > RIGID.WAKE_GAP) this.wake();
            return;
        }
        dt = Math.min(dt, RIGID.MAX_DT);
        const h = dt / RIGID.SUB;
        for (let s = 0; s < RIGID.SUB; s++) this._sub(h, world);
        // still and touching for a while → asleep
        if (this.touching && this.v.lengthSq() < RIGID.SLEEP_V ** 2 && this.w.lengthSq() < RIGID.SLEEP_W ** 2) this.calm += dt; else this.calm = 0;
        if (this.calm > RIGID.SLEEP_T) { this.sleeping = true; this.v.set(0, 0, 0); this.w.set(0, 0, 0); this.chk = 0; }
    }

    /** invI (world) × a → out. */
    _applyInvI(a, out) {
        _m4.makeRotationFromQuaternion(this.obj.quaternion);
        _R.setFromMatrix4(_m4); _Rt.copy(_R).transpose();
        _I.set(this.invIBody.x, 0, 0, 0, this.invIBody.y, 0, 0, 0, this.invIBody.z);
        return out.copy(a).applyMatrix3(_Rt).applyMatrix3(_I).applyMatrix3(_R);
    }

    _sub(h, world) {
        const o = this.obj;
        // fly
        this.v.y -= RIGID.G * h;
        this.v.multiplyScalar(1 - RIGID.AIR * h);
        this.w.multiplyScalar(1 - RIGID.ANG_AIR * h);
        o.position.addScaledVector(this.v, h);
        // turn about the centre of mass (the obj's origin may lie elsewhere)
        const wl = this.w.length();
        if (wl > 1e-5) {
            this.com(_c);
            _q.setFromAxisAngle(_a.copy(this.w).divideScalar(wl), wl * h);
            o.quaternion.premultiply(_q).normalize();
            const c2 = this.com(_b);
            o.position.add(_c.sub(c2));
        }
        // the corners against the ground and the walls: impulses where they touch
        this.touching = false;
        for (let it = 0; it < 2; it++) {
            let lift = 0;
            this.com(_c);
            for (let i = 0; i < 8; i++) {
                this.corner(i, _p);
                const gy = world.ground(_p.x, _p.z, _p.y);
                let depth = 0;
                if (_p.y < gy) { _n.set(0, 1, 0); depth = gy - _p.y; lift = Math.max(lift, depth); }
                else if (world.blocked && world.blocked(_p.x, _p.y, _p.z)) {
                    // a wall: out the way it came (its point's own way, flat)
                    _r.subVectors(_p, _c);
                    _vp.crossVectors(this.w, _r).add(this.v);
                    _n.set(-_vp.x, 0, -_vp.z);
                    if (_n.lengthSq() < 1e-6) continue;
                    _n.normalize();
                    o.position.addScaledVector(_n, 0.04);
                } else continue;
                this.touching = true;
                _r.subVectors(_p, _c);
                _vp.crossVectors(this.w, _r).add(this.v);
                const vn = _vp.dot(_n);
                if (vn >= 0) continue;
                // normal impulse (mass 1)
                const kn = 1 + _n.dot(_a.crossVectors(this._applyInvI(_b.crossVectors(_r, _n), _a), _r));
                const e = vn < -1.5 ? this.e : 0; // (a slow touch does not bounce: it settles)
                const jn = -(1 + e) * vn / kn;
                _J.copy(_n).multiplyScalar(jn);
                // friction along the ground at that corner (it rolls, it tips, it stops)
                _t.copy(_vp).addScaledVector(_n, -vn);
                const vt = _t.length();
                if (vt > 1e-4) {
                    _t.divideScalar(vt);
                    const kt = 1 + _t.dot(_a.crossVectors(this._applyInvI(_b.crossVectors(_r, _t), _a), _r));
                    const jt = Math.min(vt / kt, this.mu * jn);
                    _J.addScaledVector(_t, -jt);
                }
                this.v.add(_J);
                this.w.add(this._applyInvI(_a.crossVectors(_r, _J), _b));
            }
            if (lift > 0) o.position.y += lift; // (out of the ground)
        }
        // (rolling resistance while it lies on something: the rocking of resting contacts dies out — it settles, then sleeps)
        if (this.touching) this.w.multiplyScalar(Math.max(0, 1 - RIGID.ROLL * h));
    }
}
