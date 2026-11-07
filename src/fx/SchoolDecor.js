/**
 * SchoolDecor.js — the candles of the Great Hall of «Акселдорф» (plan.floatCandles / plan.tableCandles — SchoolLand.js).
 *  - Floating candles: wax with runs and a wick, no holder, high under the roof; each slowly bobs and sways on its own beat, its flame flickers.
 *  - Candelabras on the long tables: the castle-of-ghosts' brass candelabra (GhostProps.js), half size, five flames each.
 * Cheap: the shapes and the material are GhostProps' own (already prewarmed — no new shader), two InstancedMeshes + one for all the flames;
 * shown only while the hero is within NEAR of the hall, the bob written every other frame, nothing created after the start.
 */
import * as THREE from 'three';
import { mergeParts } from '../core/MergeGeometry.js';
import { propMaterial, flameGeometry, flameMaterial, candleParts, candelabraParts, FLAMES } from './GhostProps.js';

const NEAR = 140;           // (m: the hall's candles are drawn only this near)
const FLOAT_S = 1.7;        // (a floating candle: 0.5 m of wax ×1.7 — seen from the floor 13 m below)
const TABLE_S = 0.5;        // (a candelabra on a table: 2.9 m ×0.5 ≈ 1.45 m — about the hero's chest when he sits)
const WICK = FLAMES.candle[0][1] - 1.78; // (the flame over the wick, from the candle's foot)

let _floatGeo = null;
function floatGeometry() {
    if (_floatGeo) return _floatGeo;
    const parts = candleParts([0, 0, 0], 0).slice(1); // (no drip pan: it floats)
    _floatGeo = mergeParts(parts);
    return _floatGeo;
}
let _tableGeo = null;
const tableGeometry = () => _tableGeo || (_tableGeo = mergeParts(candelabraParts()));

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _e = new THREE.Euler();

export class SchoolDecor {
    constructor(game, plan) {
        this.game = game;
        this.plan = plan;
        const F = plan.floatCandles || [], T = plan.tableCandles || [], M = propMaterial();
        this.float = new THREE.InstancedMesh(floatGeometry(), M, Math.max(1, F.length));
        this.table = new THREE.InstancedMesh(tableGeometry(), M, Math.max(1, T.length));
        const nFl = F.length + T.length * FLAMES.candelabra.length;
        this.flames = new THREE.InstancedMesh(flameGeometry(), flameMaterial(), Math.max(1, nFl));
        for (const m of [this.float, this.table, this.flames]) { m.frustumCulled = false; m.visible = false; m.castShadow = false; }
        this.float.name = 'schoolFloatCandles'; this.table.name = 'schoolTableCandles'; this.flames.name = 'schoolFlames'; this.flames.renderOrder = 4;
        // each floating candle: its own beat (pure from its place: the same every visit)
        this.beats = F.map((c, i) => ({ ph: (Math.sin(i * 12.9898 + c.x * 0.7) * 43758.5453) % 1 * 6.283, sp: 0.35 + ((i * 7) % 5) * 0.06, amp: 0.12 + ((i * 3) % 4) * 0.04 }));
        // the candelabras and their flames never move: written once
        T.forEach((c, i) => {
            const yaw = (i % 2) * Math.PI / 2 + Math.PI / 2; // (the bar along the table)
            _q.setFromEuler(_e.set(0, yaw, 0)); _s.setScalar(TABLE_S);
            this.table.setMatrixAt(i, _m.compose(_p.set(c.x, c.y, c.z), _q, _s));
            FLAMES.candelabra.forEach(([fx, fy, fz], k) => {
                const cy = Math.cos(yaw), sy = Math.sin(yaw);
                _p.set(c.x + (fx * cy + fz * sy) * TABLE_S, c.y + fy * TABLE_S, c.z + (-fx * sy + fz * cy) * TABLE_S);
                this.flames.setMatrixAt(F.length + i * FLAMES.candelabra.length + k, _m.compose(_p, _q.identity(), _s.setScalar(TABLE_S)));
            });
        });
        this.float.count = F.length; this.table.count = T.length; this.flames.count = nFl;
        this.table.instanceMatrix.needsUpdate = true;
        this._frame = 0; this.shown = false; this.added = false;
        this._write(0);
    }

    _write(t) {
        const F = this.plan.floatCandles || [];
        for (let i = 0; i < F.length; i++) {
            const c = F[i], b = this.beats[i], w = t * b.sp + b.ph;
            const y = c.y + Math.sin(w) * b.amp, tx = Math.sin(w * 0.7) * 0.05, tz = Math.cos(w * 0.53) * 0.05; // (a slow bob and a slight sway)
            _q.setFromEuler(_e.set(tx, 0, tz)); _s.setScalar(FLOAT_S);
            this.float.setMatrixAt(i, _m.compose(_p.set(c.x, y, c.z), _q, _s));
            this.flames.setMatrixAt(i, _m.compose(_p.set(c.x + tz * -WICK * FLOAT_S, y + WICK * FLOAT_S, c.z + tx * WICK * FLOAT_S), _q.identity(), _s));
        }
        this.float.instanceMatrix.needsUpdate = true;
        this.flames.instanceMatrix.needsUpdate = true;
    }

    update(dt, t) {
        const me = this.game.character?.group?.position, c = this.plan.centre;
        if (!me || !c) return;
        const show = Math.hypot(me.x - c.x, me.z - c.z) < NEAR;
        if (show && !this.added && this.game.scene) { this.game.scene.add(this.float, this.table, this.flames); this.added = true; }
        if (show !== this.shown) { this.shown = show; this.float.visible = this.table.visible = this.flames.visible = show; }
        if (!show) return;
        flameMaterial().uniforms.uTime.value = t;
        if ((this._frame++ & 1) === 0) this._write(t); // (the bob is slow: every other frame is enough)
    }

    dispose() {
        for (const m of [this.float, this.table, this.flames]) { this.game.scene?.remove(m); m.dispose?.(); } // (the shapes and materials are shared: kept)
    }
}
