/**
 * JoltLook.js — how «Джолт» looks: a short, sharp bolt of invisible air.
 *
 *   flight   almost nothing is seen of the charge itself (a pale, thin line of trembling air);
 *            translucent white-blue rings of rippling air are shed from its head as it flies,
 *            each widening and fading behind it (the air shoved aside)
 *   hit      a shock ring bursts round the body it struck (wide and flat, rolling outwards)
 *            and a puff of air; «Джолт Максима»: bigger, brighter rings
 *   duel     held against another charge: the beam to the meeting point trembles, rings of air roll from it
 * Visual only: what the spell does is decided in Duel.js (applyJolt).
 */

import * as THREE from 'three';

const _Z = new THREE.Vector3(0, 0, 1), _Y = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3(), _p = new THREE.Vector3();

let GEO = null;
const geo = () => GEO || (GEO = new THREE.RingGeometry(0.62, 1, 28));

export class JoltLook {
    /** @param {object} game {scene} */
    constructor(game) {
        this.game = game;
        this.rings = []; // {mesh, t, T, r0, r1, op}
        this.free = [];
    }

    _ring(color) {
        let m = this.free.pop();
        if (!m) {
            m = new THREE.Mesh(geo(), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
            m.renderOrder = 4;
            this.game.scene?.add(m);
        }
        m.material.color.setHex(color);
        m.visible = true;
        return m;
    }

    _add(p, normal, { T, r0, r1, op, color }) {
        if (!this.game.scene) return;
        const mesh = this._ring(color);
        mesh.position.copy(p);
        mesh.quaternion.setFromUnitVectors(_Z, normal);
        mesh.scale.setScalar(r0);
        this.rings.push({ mesh, t: 0, T, r0, r1, op });
    }

    /** The head of a flying charge (every frame): now and then it sheds a ring of shoved air. */
    trail(head, dir, maxima = false, dt = 1 / 60) {
        this._acc = (this._acc || 0) + dt;
        const every = maxima ? 0.035 : 0.05;
        if (this._acc < every) return;
        this._acc = 0;
        const k = maxima ? 1.6 : 1;
        this._add(head, dir, { T: 0.35, r0: 0.18 * k, r1: 0.75 * k, op: 0.42, color: maxima ? 0xe8f6ff : 0xcfe8ff });
    }

    /**
     * «Джолт» held in a duel (every frame, for the charge `key`): from the hand to the point where the two
     * charges meet the air ripples — small rings along the beam — and wide rings of shoved air roll out
     * from the point towards the other wizard. Clear air, never a coloured beam.
     */
    clash(key, hand, point, maxima = false, dt = 1 / 60) {
        const k = maxima ? 1.5 : 1;
        const dir = _d.subVectors(point, hand);
        const len = dir.length();
        if (len < 0.1) return;
        dir.divideScalar(len);
        key._jAlong = (key._jAlong || 0) + dt;
        if (key._jAlong >= 0.06) {
            key._jAlong = 0;
            _p.copy(hand).addScaledVector(dir, len * (0.15 + 0.8 * Math.random()));
            this._add(_p, dir, { T: 0.3, r0: 0.08 * k, r1: 0.35 * k, op: 0.35, color: 0xd6ecff });
        }
        key._jPoint = (key._jPoint || 0) + dt;
        if (key._jPoint >= (maxima ? 0.12 : 0.18)) {
            key._jPoint = 0;
            this._add(point, dir, { T: 0.45, r0: 0.25 * k, r1: 1.3 * k, op: 0.55, color: maxima ? 0xeef8ff : 0xdff2ff });
        }
    }

    /** The shock ring round a struck body (flat, rolling out) and one facing the blow. */
    hit(p, dir, maxima = false) {
        const k = maxima ? 1.8 : 1;
        this._add(p, _Y, { T: 0.5 * k, r0: 0.4, r1: 2.6 * k, op: 0.75, color: 0xdff2ff });
        this._add(p, dir, { T: 0.3, r0: 0.3, r1: 1.4 * k, op: 0.6, color: 0xffffff });
        if (maxima) this._add(p, _Y, { T: 0.8, r0: 0.6, r1: 4.5, op: 0.45, color: 0xa8d8ff });
    }

    update(dt) {
        for (let i = this.rings.length - 1; i >= 0; i--) {
            const r = this.rings[i];
            r.t += dt;
            const k = r.t / r.T;
            if (k >= 1) { r.mesh.visible = false; this.free.push(r.mesh); this.rings.splice(i, 1); continue; }
            const e = 1 - (1 - k) * (1 - k);
            r.mesh.scale.setScalar(r.r0 + (r.r1 - r.r0) * e);
            // (the rippling: its brightness trembles as it widens)
            r.mesh.material.opacity = r.op * (1 - k) * (0.75 + 0.25 * Math.sin(r.t * 70));
        }
    }
}
