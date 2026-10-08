/**
 * Weapon.js — a physical sword/axe.
 *
 * A real rigid body (position, orientation, linear & angular velocity, mass,
 * inertia of a rod) with impulse-based contacts against the ground, terrain,
 * tables, chests and walls. That gives:
 *   - lying on a table → falls when the table is blown up,
 *   - dropped → tumbles and comes to rest on its side,
 *   - thrown → flies with the hand's actual linear + angular velocity,
 *   - held → driven towards the hand grip by a stiff spring (weight, inertia),
 *     but still collides: the blade stops at a wall instead of passing through.
 *
 * Grabbing is decided by WeaponSystem (game/Weapons.js). This class only does
 * the physics, the grip frame maths and network serialisation.
 */

import * as THREE from 'three';
import { buildWeapon, WEAPON_SPECS } from './WeaponModels.js';

const GRAVITY = -14;
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _n = new THREE.Vector3();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _m3 = new THREE.Matrix3();
const _inertiaInvWorld = new THREE.Matrix3();

let NEXT_ID = 1;

export class Weapon {
    /**
     * @param {THREE.Scene} scene
     * @param {string} type 'sword' | 'axe'
     * @param {object} opts {position, quaternion, renderer, id}
     */
    constructor(scene, type, opts = {}) {
        this.scene = scene;
        this.type = type === 'axe' ? 'axe' : 'sword';
        this.id = opts.id ?? `w${NEXT_ID++}`;
        // headless: physics only (unit tests / servers)
        const { group, spec } = opts.headless
            ? { group: new THREE.Group(), spec: WEAPON_SPECS[this.type] }
            : buildWeapon(this.type, opts.renderer);
        this.spec = spec;
        this.S = spec.scale;
        this.model = group;
        // The model is offset so the body origin is the centre of mass.
        this.mesh = new THREE.Group();
        this.mesh.name = 'weapon';
        this.model.scale.setScalar(this.S);
        this.model.position.set(-spec.com[0] * this.S, -spec.com[1] * this.S, -spec.com[2] * this.S);
        this.mesh.add(this.model);
        scene.add(this.mesh);

        // Rigid body state
        this.position = this.mesh.position; // centre of mass, world
        this.quaternion = this.mesh.quaternion;
        this.velocity = new THREE.Vector3();
        this.angularVelocity = new THREE.Vector3();
        this.mass = spec.mass;
        const L = spec.length * this.S;
        // Thin rod about COM; small axial inertia keeps spinning about the blade stable.
        const Ixx = this.mass * L * L / 12 + 0.02, Iyy = this.mass * 0.01 + 0.01, Izz = Ixx;
        this.invInertiaBody = new THREE.Matrix3().set(1 / Ixx, 0, 0, 0, 1 / Iyy, 0, 0, 0, 1 / Izz);

        // Body-space collision samples (relative to COM)
        this.samples = spec.samples.map(([x, y, z, r]) => ({
            local: new THREE.Vector3((x - spec.com[0]) * this.S, (y - spec.com[1]) * this.S, (z - spec.com[2]) * this.S),
            radius: r * this.S,
        }));

        this.sleeping = true;
        this.sleepTimer = 0;
        this.holder = null; // {playerId, side} when held
        this.drive = null; // target pose while held
        this.lastHitTime = 0;
        this.remoteTarget = null; // network interpolation for items owned by someone else
        this.contactHard = 0; // strongest collision this frame (for sounds / hand pushback)

        if (opts.position) this.position.copy(opts.position);
        if (opts.quaternion) this.quaternion.copy(opts.quaternion);
        this.mesh.updateMatrixWorld(true);
    }

    // ------------------------------------------------------------ geometry
    /** World point of a model-space point (model units). */
    modelToWorld(x, y, z, out = new THREE.Vector3()) {
        out.set((x - this.spec.com[0]) * this.S, (y - this.spec.com[1]) * this.S, (z - this.spec.com[2]) * this.S);
        return out.applyQuaternion(this.quaternion).add(this.position);
    }

    /** Handle segment in world space. */
    getHandleSegment(a = new THREE.Vector3(), b = new THREE.Vector3()) {
        this.modelToWorld(0, this.spec.handle[0], 0, a);
        this.modelToWorld(0, this.spec.handle[1], 0, b);
        return [a, b];
    }

    /** Striking part (blade / axe head) segment in world space. */
    getBladeSegment(a = new THREE.Vector3(), b = new THREE.Vector3()) {
        this.modelToWorld(0, this.spec.bladeStart, 0, a);
        this.modelToWorld(0, this.spec.length, 0, b);
        return [a, b];
    }

    getTipPosition(out = new THREE.Vector3()) {
        return this.modelToWorld(0, this.spec.length, 0, out);
    }

    /** Velocity of a world point attached to the body. */
    pointVelocity(worldPoint, out = new THREE.Vector3()) {
        _v3.subVectors(worldPoint, this.position);
        return out.crossVectors(this.angularVelocity, _v3).add(this.velocity);
    }

    /**
     * Pose the weapon so it rests at the given place (e.g. lying on a table).
     * `quat` orientation, `centre` desired COM position.
     */
    placeAt(centre, quat) {
        this.position.copy(centre);
        this.quaternion.copy(quat);
        this.velocity.set(0, 0, 0);
        this.angularVelocity.set(0, 0, 0);
        this.mesh.updateMatrixWorld(true);
    }

    wake() {
        this.sleeping = false;
        this.sleepTimer = 0;
        this._restRef = null;
    }

    // ------------------------------------------------------------- physics
    /**
     * @param {number} dt
     * @param {CollisionWorld} collision
     */
    step(dt, collision) {
        this.contactHard = 0;
        if (this.remoteTarget) {
            this._followRemote(dt);
            return;
        }
        if (this.sleeping && !this.drive) return;

        // Sub-step for stability with fast swings
        const sub = this.drive ? 3 : 2;
        const h = dt / sub;
        for (let s = 0; s < sub; s++) this._integrate(h, collision);
        this.mesh.updateMatrixWorld(true);

        if (!this.drive) {
            // Asleep when it stops moving (velocity) or stays in place (micro-jitter)
            if (!this._restRef) this._restRef = this.position.clone();
            const still = this.position.distanceToSquared(this._restRef) < 0.0004;
            if (!still) this._restRef.copy(this.position);
            const calm = (this.velocity.lengthSq() < 0.09 && this.angularVelocity.lengthSq() < 0.25) || (still && this.velocity.lengthSq() < 1.0);
            this.sleepTimer = calm ? this.sleepTimer + dt : 0;
            if (this.sleepTimer > 0.4) {
                this.sleeping = true;
                this.velocity.set(0, 0, 0);
                this.angularVelocity.set(0, 0, 0);
            }
        }
    }

    _integrate(h, collision) {
        if (this.drive) {
            // Critically-damped spring towards the hand grip — the weapon has weight and lags a little.
            const k = this.spec.stiffness;
            _v1.subVectors(this.drive.position, this.position).multiplyScalar(k);
            this.velocity.lerp(_v1, Math.min(1, h * 30));
            _q1.copy(this.quaternion).invert();
            _q2.multiplyQuaternions(this.drive.quaternion, _q1);
            if (_q2.w < 0) { _q2.x = -_q2.x; _q2.y = -_q2.y; _q2.z = -_q2.z; _q2.w = -_q2.w; }
            const angle = 2 * Math.acos(Math.min(1, _q2.w));
            const sinHalf = Math.sqrt(Math.max(0, 1 - _q2.w * _q2.w));
            if (sinHalf > 1e-5) _v2.set(_q2.x / sinHalf, _q2.y / sinHalf, _q2.z / sinHalf).multiplyScalar(angle * k);
            else _v2.set(0, 0, 0);
            this.angularVelocity.lerp(_v2, Math.min(1, h * 30));
        } else {
            this.velocity.y += GRAVITY * h;
            // Air drag
            this.velocity.multiplyScalar(1 - 0.08 * h);
            this.angularVelocity.multiplyScalar(1 - 0.25 * h);
        }

        this.position.addScaledVector(this.velocity, h);
        integrateQuaternion(this.quaternion, this.angularVelocity, h);

        if (collision) this._contacts(h, collision);
    }

    _worldInvInertia() {
        _m.makeRotationFromQuaternion(this.quaternion);
        _m3.setFromMatrix4(_m);
        _inertiaInvWorld.copy(_m3).multiply(this.invInertiaBody).multiply(_m3.clone().transpose());
        return _inertiaInvWorld;
    }

    _contacts(h, collision) {
        const invI = this._worldInvInertia();
        const invMass = 1 / this.mass;
        const friction = 0.55;
        let touching = 0;
        for (let iter = 0; iter < 2; iter++) {
        for (const s of this.samples) {
            const p = _v1.copy(s.local).applyQuaternion(this.quaternion).add(this.position);
            const depth = contactAgainstWorld(p, s.radius, collision, _n);
            if (depth <= 0) continue;
            touching++;
            // Positional correction (split between holder spring and body)
            if (iter === 0) this.position.addScaledVector(_n, depth * 0.9);
            if (this.drive) this.contactHard = Math.max(this.contactHard, depth);

            const r = _v2.subVectors(p, this.position);
            const vp = _v3.crossVectors(this.angularVelocity, r).add(this.velocity);
            const vn = vp.dot(_n);
            if (vn >= 0) continue;
            this.contactHard = Math.max(this.contactHard, -vn * 0.05);
            // Bounce only on real impacts; slow contacts just stop (no jitter at rest)
            const restitution = this.drive || -vn < 1.5 ? 0.0 : 0.25;
            // Normal impulse
            const rxn = new THREE.Vector3().crossVectors(r, _n);
            const term = rxn.clone().applyMatrix3(invI).cross(r).dot(_n);
            const j = -(1 + restitution) * vn / (invMass + term);
            const impulse = _n.clone().multiplyScalar(j);
            // Friction impulse
            const vt = vp.clone().addScaledVector(_n, -vn);
            const vtLen = vt.length();
            if (vtLen > 1e-4) {
                const t = vt.divideScalar(vtLen);
                const rxt = new THREE.Vector3().crossVectors(r, t);
                const termT = rxt.clone().applyMatrix3(invI).cross(r).dot(t);
                const jt = Math.min(vtLen / (invMass + termT), friction * j);
                impulse.addScaledVector(t, -jt);
            }
            this.velocity.addScaledVector(impulse, invMass);
            this.angularVelocity.add(new THREE.Vector3().crossVectors(r, impulse).applyMatrix3(invI));
        }
        }
        if (touching && !this.drive) {
            // Rolling / resting friction: lying objects settle instead of creeping
            const k = Math.max(0, 1 - 6 * h);
            this.angularVelocity.multiplyScalar(k);
            if (this.velocity.lengthSq() < 1.0) this.velocity.x *= k, this.velocity.z *= k;
        }
    }

    // ------------------------------------------------------------- holding
    /** Start being held: `drive` = {position, quaternion} target updated each frame by the holder. */
    attach(holder) {
        this.holder = holder;
        this.drive = { position: this.position.clone(), quaternion: this.quaternion.clone() };
        this.wake();
    }

    /** Release (throw) — keeps the current velocity and spin, physics takes over. */
    release() {
        this.holder = null;
        this.drive = null;
        this.velocity.clampLength(0, 22);
        this.angularVelocity.clampLength(0, 30);
        this.wake();
    }

    // ------------------------------------------------------------ networking
    serialize() {
        const p = this.position, q = this.quaternion;
        const r = (v) => Math.round(v * 1000) / 1000;
        return [this.id, this.type, r(p.x), r(p.y), r(p.z), r(q.x), r(q.y), r(q.z), r(q.w), this.sleeping ? 1 : 0];
    }

    /** Follow a pose owned by someone else (holder on another machine / host physics). */
    setRemoteTarget(arr) {
        if (!this.remoteTarget) this.remoteTarget = { p: new THREE.Vector3(), q: new THREE.Quaternion() };
        this.remoteTarget.p.set(arr[2], arr[3], arr[4]);
        this.remoteTarget.q.set(arr[5], arr[6], arr[7], arr[8]);
    }

    clearRemote() {
        this.remoteTarget = null;
    }

    _followRemote(dt) {
        const k = Math.min(1, dt * 15);
        if (this.position.distanceToSquared(this.remoteTarget.p) > 64) {
            this.position.copy(this.remoteTarget.p);
            this.quaternion.copy(this.remoteTarget.q);
        } else {
            this.position.lerp(this.remoteTarget.p, k);
            this.quaternion.slerp(this.remoteTarget.q, k);
        }
        this.mesh.updateMatrixWorld(true);
    }

    dispose() {
        this.scene.remove(this.mesh);
        this.model.traverse((o) => {
            if (o.isMesh) {
                o.geometry.dispose();
                o.material.dispose();
            }
        });
    }
}

/** q += 0.5 * (w ⊗ q) * h, normalised. */
export function integrateQuaternion(q, w, h) {
    const hx = w.x * h * 0.5, hy = w.y * h * 0.5, hz = w.z * h * 0.5;
    const x = q.x, y = q.y, z = q.z, qw = q.w;
    q.x = x + hx * qw + hy * z - hz * y;
    q.y = y + hy * qw + hz * x - hx * z;
    q.z = z + hz * qw + hx * y - hy * x;
    q.w = qw - hx * x - hy * y - hz * z;
    q.normalize();
}

/**
 * Sphere (p, r) vs static world. Returns penetration depth (>0) and writes the
 * push-out normal into `n`. Handles ground/terrain, tables/chests/trunks, map walls.
 */
export function contactAgainstWorld(p, r, collision, n) {
    let best = 0;
    // Ground / terrain under the point
    const ground = collision.surfaceY(p.x, p.z);
    if (p.y - r < ground) {
        // Terrain: if we're inside a raised column, prefer side push-out.
        best = ground - (p.y - r);
        n.set(0, 1, 0);
        if (best > 1.2 && collision.terrain) {
            const ix = Math.round(p.x), iz = Math.round(p.z);
            const fx = p.x - ix, fz = p.z - iz;
            // Push towards the nearest lower neighbour column
            const opts = [[1, 0, 0.5 - fx], [-1, 0, 0.5 + fx], [0, 1, 0.5 - fz], [0, -1, 0.5 + fz]];
            let bestSide = null;
            for (const [dx, dz, dist] of opts) {
                const top = collision.terrain.topLayer(ix + dx, iz + dz) - 0.5;
                if (top < p.y && (!bestSide || dist < bestSide[2])) bestSide = [dx, dz, dist];
            }
            if (bestSide) {
                n.set(bestSide[0], 0, bestSide[1]);
                best = bestSide[2] + r;
            }
        }
    }
    // Boxes
    const boxes = collision.queryBoxes(p.x - r, p.x + r, p.z - r, p.z + r);
    for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        const d = sphereBoxDepth(p, r, b.minX, b.minY, b.minZ, b.maxX, b.maxY, b.maxZ, _v2);
        if (d > best) { best = d; n.copy(_v2); }
    }
    // Map walls (grid)
    if (collision.walls) {
        const cs = collision.walls.cellSize;
        const gx = Math.round(p.x / cs), gz = Math.round(p.z / cs);
        for (let dz = -1; dz <= 1; dz++) {
            for (let dx = -1; dx <= 1; dx++) {
                if (!collision.walls.set.has((gx + dx) + ',' + (gz + dz))) continue;
                const cx = (gx + dx) * cs, cz = (gz + dz) * cs;
                const d = sphereBoxDepth(p, r, cx - cs / 2, -1, cz - cs / 2, cx + cs / 2, collision.walls.height, cz + cs / 2, _v2);
                if (d > best) { best = d; n.copy(_v2); }
            }
        }
    }
    return best;
}

/** Penetration depth of a sphere into an AABB, normal written to `n`. */
export function sphereBoxDepth(p, r, minX, minY, minZ, maxX, maxY, maxZ, n) {
    const cx = Math.max(minX, Math.min(p.x, maxX));
    const cy = Math.max(minY, Math.min(p.y, maxY));
    const cz = Math.max(minZ, Math.min(p.z, maxZ));
    const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > 1e-10) {
        if (d2 >= r * r) return 0;
        const d = Math.sqrt(d2);
        n.set(dx / d, dy / d, dz / d);
        return r - d;
    }
    // Centre inside the box: shortest way out
    const exits = [
        [p.x - minX, -1, 0, 0], [maxX - p.x, 1, 0, 0],
        [p.y - minY, 0, -1, 0], [maxY - p.y, 0, 1, 0],
        [p.z - minZ, 0, 0, -1], [maxZ - p.z, 0, 0, 1],
    ];
    let m = exits[0];
    for (const e of exits) if (e[0] < m[0]) m = e;
    n.set(m[1], m[2], m[3]);
    return m[0] + r;
}
