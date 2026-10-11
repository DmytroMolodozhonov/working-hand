/**
 * SeveredPart.js — a cut-off arm, leg, head or branch lying in the world: it flies
 * off with the blow, tumbles, falls, rolls to rest flat on the ground, bleeds for a
 * while and stays a couple of minutes before it sinks into the ground.
 */

import * as THREE from 'three';

export const PROP_LIFE = 120; // s on the ground
const SINK_TIME = 4;
const BLEED_TIME = 6;
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _box = new THREE.Box3();

export class SeveredPart {
    /**
     * @param {object} game  needs scene, fx (optional)
     * @param {THREE.Group} piece  from LimbSurgery.cutLimb (world transform already set)
     */
    constructor(game, piece, { vel = new THREE.Vector3(), spin = new THREE.Vector3(), blood = 25 } = {}) {
        this.game = game;
        this.obj = piece;
        this.velocity = vel.clone();
        this.spin = spin.clone();
        this.age = 0;
        this.sleeping = false;
        this.calm = 0;
        this.life = PROP_LIFE;
        this.sinkT = 0;
        this.limb = piece.userData.limb;
        piece.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.layers.set(0); } });
        game.scene?.add(piece);
        piece.updateMatrixWorld(true);
        // the corners of the piece in its own frame (contacts with the ground)
        _box.makeEmpty();
        const inv = new THREE.Matrix4().copy(piece.matrixWorld).invert();
        piece.traverse((o) => {
            if (!o.isMesh || !o.visible) return;
            if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
            const b = o.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld));
            _box.union(b);
        });
        if (_box.isEmpty()) _box.set(new THREE.Vector3(-0.2, -0.2, -0.2), new THREE.Vector3(0.2, 0.2, 0.2));
        this.corners = [];
        for (let i = 0; i < 8; i++) this.corners.push(new THREE.Vector3(i & 1 ? _box.max.x : _box.min.x, i & 2 ? _box.max.y : _box.min.y, i & 4 ? _box.max.z : _box.min.z));
        const size = _box.getSize(new THREE.Vector3());
        this.longAxis = size.x >= size.y && size.x >= size.z ? new THREE.Vector3(1, 0, 0) : size.y >= size.z ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
        this.cutEnd = piece.userData.cutEnd ? piece.userData.cutEnd.clone() : _box.getCenter(new THREE.Vector3());
        if (game.fx?.blood) game.fx.blood(this.worldCutEnd(_v), blood);
    }

    get position() { return this.obj.position; }

    worldCutEnd(out = new THREE.Vector3()) {
        return out.copy(this.cutEnd).applyMatrix4(this.obj.matrixWorld);
    }

    _ground(x, z, y) {
        const c = this.game.collision || this.game.world?.collision;
        if (!c) return -0.5;
        return c.groundAt ? c.groundAt(x, z, y + 0.5) : c.groundY ? c.groundY(x, z) : c.surfaceY ? c.surfaceY(x, z) : -0.5;
    }

    /** One frame; false when it is gone (disposed). */
    step(dt) {
        if (!(dt > 0)) return true;
        const raw = dt;
        dt = Math.min(dt, 0.05); // (the physics in small steps; time itself runs on)
        this.age += raw;
        const o = this.obj;
        if (this.age > this.life) {
            // sinks into the ground and is gone
            this.sinkT += raw;
            o.position.y -= Math.min(raw, 1) * 0.25;
            if (this.sinkT >= SINK_TIME) { this.dispose(); return false; }
            o.updateMatrixWorld(true);
            return true;
        }
        if (!this.sleeping) {
            for (let k = 0; k < 2; k++) this._sub(dt / 2);
        } else if (this.settle != null && this.settle < 1) {
            // lies down flat: the longest side along the ground
            this.settle = Math.min(1, this.settle + dt / 0.3);
            o.quaternion.slerp(this.flatQ, this.settle);
            this._rest();
        }
        o.updateMatrixWorld(true);
        // blood from the cut for a while
        if (this.age < BLEED_TIME && this.game.fx?.spark && Math.random() < dt * 6) {
            this.worldCutEnd(_v);
            this.game.fx.spark(_v, Math.random() < 0.5 ? 0xb3001b : 0x7a0010, 0.07, _w.set((Math.random() - 0.5) * 0.4, -1.2, (Math.random() - 0.5) * 0.4), 0.9);
        }
        return true;
    }

    _sub(dt) {
        const o = this.obj;
        this.velocity.y -= 14 * dt;
        this.velocity.multiplyScalar(1 - 0.15 * dt);
        o.position.addScaledVector(this.velocity, dt);
        const w = this.spin.length();
        if (w > 1e-4) {
            _q.setFromAxisAngle(_v.copy(this.spin).divideScalar(w), w * dt);
            o.quaternion.premultiply(_q).normalize();
        }
        o.updateMatrixWorld(true);
        // the lowest corner against the ground
        let pen = 0;
        for (const c of this.corners) {
            _v.copy(c).applyMatrix4(o.matrixWorld);
            const gy = this._ground(_v.x, _v.z, _v.y);
            if (gy - _v.y > pen) pen = gy - _v.y;
        }
        if (pen > 0) {
            o.position.y += pen;
            if (this.velocity.y < -2) this.velocity.y *= -0.25; else this.velocity.y = Math.max(0, this.velocity.y);
            const f = Math.max(0, 1 - 4 * dt);
            this.velocity.x *= f; this.velocity.z *= f;
            this.spin.multiplyScalar(Math.max(0, 1 - 5 * dt));
            if (this.velocity.lengthSq() < 0.09 && this.spin.lengthSq() < 0.25) this.calm += dt; else this.calm = 0;
            if (this.calm > 0.4) this._sleep();
        }
    }

    _sleep() {
        this.sleeping = true;
        this.velocity.set(0, 0, 0);
        this.spin.set(0, 0, 0);
        // the flat rest: turn so the long axis lies horizontal, keeping the heading
        const o = this.obj;
        const ax = _v.copy(this.longAxis).applyQuaternion(o.quaternion);
        const flat = _w.copy(ax).setY(0);
        if (flat.lengthSq() < 1e-4) flat.set(1, 0, 0);
        flat.normalize();
        _q2.setFromUnitVectors(ax.normalize(), flat);
        this.flatQ = o.quaternion.clone().premultiply(_q2);
        this.settle = 0;
    }

    _rest() {
        const o = this.obj;
        o.updateMatrixWorld(true);
        let low = Infinity, gy = -Infinity;
        for (const c of this.corners) {
            _v.copy(c).applyMatrix4(o.matrixWorld);
            if (_v.y < low) { low = _v.y; gy = this._ground(_v.x, _v.z, _v.y + 1); }
        }
        if (Number.isFinite(low) && Number.isFinite(gy)) o.position.y += gy - low;
    }

    dispose() {
        const o = this.obj;
        o.parent?.remove(o);
        for (const g of o.userData.own || []) g.dispose();
        this.obj.userData.own = [];
        this.disposed = true;
    }
}
