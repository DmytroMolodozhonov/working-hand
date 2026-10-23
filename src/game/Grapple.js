/**
 * Grapple.js — the grapnels and the boarding plank between two ships (the king's boarding order, FleetOrders.js).
 *
 * `B` (the boarding ship) throws her grapnels at `T` (the enemy): `T` is hauled in alongside `B`, her gangway abreast of B's
 * own, and a plank is laid across. The same lines and plank as the black ship's (Blackbeard.js: the same constants, BB.GAP /
 * BB.HAUL), but for any ship that boards another. The host moves T (step); every computer draws the lines and the plank
 * (the plank is a real mover: Collision, and the gangway rails of both ships open while it lies there — Ships.boardPlank).
 */

import * as THREE from 'three';
import { BB } from './Blackbeard.js';
import { hullHalfWidth } from './ShipLayout.js';
import { PlankCollider } from './ShipCollision.js';
import { angleDiff } from './FleetMath.js';

const _o = { x: 0, y: 0, z: 0 };
const _l = { x: 0, y: 0, z: 0 };
let LINE_MAT = null, PLANK_GEO = null, PLANK_MAT = null;

export class Grapple {
    /** @param {object} [pre] a state from the network (a guest's view): {side, flip, planks} */
    constructor(game, B, T, pre = null) {
        this.game = game; this.B = B; this.T = T;
        this.view = null;
        if (pre) { this.side = pre.side; this.flip = !!pre.flip; this.planks = !!pre.planks; return; }
        B.pose.toLocal(T.st.x, B.pose.y, T.st.z, _l);
        this.side = _l.x >= 0 ? 1 : -1;
        const dyaw = angleDiff(T.st.yaw, B.st.yaw);
        this.flip = Math.abs(dyaw) > Math.PI / 2;
        // where the lines hold her: abeam at BB.GAP between the hulls, her gangway abreast of ours
        this.ox = _l.x; this.oz = _l.z; this.oyaw = dyaw;
        this.wx = this.side * ((B.layout.B + T.layout.B) / 2 + BB.GAP);
        this.wz = this.flip ? B.layout.gangZ + T.layout.gangZ : B.layout.gangZ - T.layout.gangZ;
        this.wyaw = this.flip ? Math.PI : 0;
        this.planks = false;
        this.t = 0;
        T.lashTo = B.id;
    }

    /** (host, Ships._simulate) The held ship: where the lines hold her, alongside. false: she is let go. */
    step(dt) {
        const { B, T } = this;
        if (!B.awake || B.state === 'sinking' || B.state === 'wreck' || T.state === 'sinking' || T.state === 'wreck') return false;
        this.t += dt;
        const k = Math.min(1, dt * BB.HAUL);
        this.ox += (this.wx - this.ox) * k; this.oz += (this.wz - this.oz) * k; this.oyaw += angleDiff(this.wyaw, this.oyaw) * k;
        const c = Math.cos(B.st.yaw), sn = Math.sin(B.st.yaw);
        const st = T.st;
        st.x = B.st.x + this.ox * c + this.oz * sn;
        st.z = B.st.z - this.ox * sn + this.oz * c;
        st.yaw = B.st.yaw + this.oyaw;
        const f = Math.cos(this.oyaw);
        st.u = B.st.u * f; st.v = B.st.v * f; st.r = B.st.r; st.wheel = 0;
        if (!this.planks && Math.abs(this.ox - this.wx) < 0.6 && Math.abs(this.oz - this.wz) < 1.2) this.planks = true;
        T.changed = true;
        return true;
    }

    /** The two gangway points across the gap: B's and T's, ship-local (the plank's ends). */
    gangways(out) {
        const { B, T } = this;
        out.a = { x: this.side * (hullHalfWidth(B.layout, B.layout.gangZ, B.layout.deck) - 1.0), y: B.layout.deck, z: B.layout.gangZ };
        const sT = (this.flip ? 1 : -1) * this.side; // (her side that faces ours)
        out.b = { x: sT * (hullHalfWidth(T.layout, T.layout.gangZ, T.layout.deck) - 1.0), y: T.layout.deck, z: T.layout.gangZ };
        return out;
    }

    /** (every computer) The four grapnel lines from our rail to hers, and the plank once it is laid. */
    draw() {
        const g = this.game, { B, T } = this;
        if (!B.awake || !T.awake) { this.drop(); return; }
        if (!this.view) {
            const mat = LINE_MAT || (LINE_MAT = new THREE.LineBasicMaterial({ color: 0x2a2018 }));
            const lines = new THREE.LineSegments(new THREE.BufferGeometry(), mat);
            lines.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(8 * 3), 3));
            lines.frustumCulled = false;
            g.scene.add(lines);
            this.view = { lines, plank: null, col: null };
        }
        const V = this.view;
        const arr = V.lines.geometry.attributes.position.array;
        const sT = (this.flip ? 1 : -1) * this.side;
        const zs = [-14, -5, 5, 14];
        for (let i = 0; i < 4; i++) {
            const z = B.layout.gangZ + zs[i];
            B.pose.toWorld(this.side * hullHalfWidth(B.layout, z, B.layout.deck), B.layout.railTopAt(z), z, _o);
            T.pose.toLocal(_o.x, _o.y, _o.z, _l);
            const tz = Math.max(-T.layout.L / 2 + 2, Math.min(T.layout.L / 2 - 2, _l.z));
            T.pose.toWorld(sT * hullHalfWidth(T.layout, tz, T.layout.deck), T.layout.railTopAt(tz), tz, _l);
            arr.set([_o.x, _o.y, _o.z, _l.x, _l.y, _l.z], i * 6);
        }
        V.lines.geometry.attributes.position.needsUpdate = true;
        if (!this.planks) return;
        if (!V.plank) {
            V.plank = new THREE.Mesh(PLANK_GEO || (PLANK_GEO = new THREE.BoxGeometry(2.4, 0.15, 1)), PLANK_MAT || (PLANK_MAT = new THREE.MeshLambertMaterial({ color: 0x3a2a1e })));
            V.plank.castShadow = true;
            g.scene.add(V.plank);
            V.col = new PlankCollider();
            g.collision?.addMover?.(V.col);
            B.boardPlank = true; T.boardPlank = true;
        }
        const gw = this.gangways(this._gw || (this._gw = {}));
        B.pose.toWorld(gw.a.x + Math.sign(gw.a.x) * 0.4, gw.a.y, gw.a.z, _o);
        T.pose.toWorld(gw.b.x + Math.sign(gw.b.x) * 0.4, gw.b.y, gw.b.z, _l);
        V.col.set(_o, _l);
        const len = Math.hypot(_l.x - _o.x, _l.y - _o.y, _l.z - _o.z);
        V.plank.scale.set(1, 1, Math.max(0.5, len));
        V.plank.position.set((_o.x + _l.x) / 2, (_o.y + _l.y) / 2 + 0.08, (_o.z + _l.z) / 2);
        V.plank.lookAt(_l.x, _l.y + 0.08, _l.z);
    }

    /** The lines cast off, the plank pulled back (the view is gone; the host lets the ship go). */
    drop() {
        const g = this.game, V = this.view;
        if (V) {
            g.scene.remove(V.lines);
            V.lines.geometry.dispose();
            if (V.plank) g.scene.remove(V.plank);
            if (V.col) g.collision?.removeMover?.(V.col);
            this.view = null;
        }
        this.B.boardPlank = false; this.T.boardPlank = false;
    }

    /** Let her go (host): the lines off. */
    release() {
        this.drop();
        if (this.T.lashTo === this.B.id) this.T.lashTo = null;
    }
}
