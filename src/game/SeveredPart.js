/**
 * SeveredPart.js — a cut-off arm, leg, head or branch lying in the world: it flies
 * off with the blow, tumbles, falls, rolls to rest flat on the ground, bleeds for a
 * while and stays a couple of minutes before it sinks into the ground.
 */

import * as THREE from 'three';
import { RigidProp, localBox } from './RigidProp.js';

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
        this.age = 0;
        this.sleeping = false;
        this.life = PROP_LIFE;
        this.sinkT = 0;
        this.limb = piece.userData.limb;
        piece.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.layers.set(0); } });
        game.scene?.add(piece);
        piece.updateMatrixWorld(true);
        // a real solid body (RigidProp: the corners meet the ground with impulses — it tumbles, tips over its edge, lies down by
        //  itself, never hangs in the air if the ground under it is blown away)
        const box = localBox(piece, new THREE.Box3());
        this.body = new RigidProp(piece, { vel, spin, box });
        this.cutEnd = piece.userData.cutEnd ? piece.userData.cutEnd.clone() : box.getCenter(new THREE.Vector3());
        this.bleeds = blood > 0; // (a tree's branch: no blood)
        if (this.bleeds && game.fx?.blood) game.fx.blood(this.worldCutEnd(_v), blood);
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
        this.body.step(dt, this._world || (this._world = { ground: (x, z, y) => this._ground(x, z, y), blocked: (x, y, z) => !!(this.game.collision || this.game.world?.collision)?.pointBlocked?.(x, y, z) }));
        this.sleeping = this.body.sleeping;
        o.updateMatrixWorld(true);
        // blood from the cut for a while
        if (this.bleeds && this.age < BLEED_TIME && this.game.fx?.spark && Math.random() < dt * 6) {
            this.worldCutEnd(_v);
            this.game.fx.spark(_v, Math.random() < 0.5 ? 0xb3001b : 0x7a0010, 0.07, _w.set((Math.random() - 0.5) * 0.4, -1.2, (Math.random() - 0.5) * 0.4), 0.9);
        }
        return true;
    }

    get velocity() { return this.body.v; }
    get spin() { return this.body.w; }

    dispose() {
        const o = this.obj;
        o.parent?.remove(o);
        for (const g of o.userData.own || []) g.dispose();
        this.obj.userData.own = [];
        this.disposed = true;
    }
}
