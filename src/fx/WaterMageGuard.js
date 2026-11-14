/**
 * Water guards use the same shield collision surface as NPC Protection, with moving liquid geometry.
 *
 * The author 14.11: «когда маг воды ставит протекшн, он как будто появляется из ниоткуда. Он должен манипулировать той водой, которая у него есть». The guard is no longer
 * switched on in one frame: the water GATHERS into it — a stream flies from the nearest real water block (WaterMageSource.findWater), or from the tank on his back, or
 * (the ones born with that gift) the moisture of the air condenses round him — and the sheet grows from the hands over GUARD_BUILD s; when it goes, it falls back as drops.
 * Every computer draws this from what it knows (the mage's `fx` flag and his look): nothing but the flag is sent.
 */
import * as T from 'three';
import { createWaterMaterial } from './WaterMaterial.js';
import { NPC_SHIELD as S } from '../game/ShieldBounce.js';
import { FX } from './WizardFx.js';
import { BLOCK } from '../world/Terrain.js';
import { findWater, waterKind, streamPoint, GUARD_BUILD } from '../game/WaterMageSource.js';

const ease = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
const _a = { x: 0, y: 0, z: 0 }, _b = { x: 0, y: 0, z: 0 }, _p = { x: 0, y: 0, z: 0 }, _q = { x: 0, y: 0, z: 0 };
const WATER_COL = [0x6ec6ff, 0x9fdcff, 0xd8f2ff, 0x4aa8e8];

export class WaterMageGuard {
    constructor(game) {
        this.game = game; this.time = 0; this.material = createWaterMaterial(); this.material.side = T.DoubleSide;
        this.dome = new T.SphereGeometry(1, 20, 12); this.cap = new T.SphereGeometry(1, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2); this.cap.rotateX(-Math.PI / 2);
        this.slots = []; for (let i = 0; i < 8; i++) { const m = new T.Mesh(this.dome, this.material); m.visible = false; m.frustumCulled = false; game.scene.add(m); this.slots.push(m); }
        this.st = new Map(); // mage id → { grow 0…1, src, kind, scanned, dome }
        this._scans = 0;
    }

    /** Where this mage's water comes from (one scan when his guard starts: a few hundred block reads, at most one a frame). */
    _source(v, st) {
        const d = this.game.terrain?.data;
        if (d && this._scans < 1) {
            this._scans++;
            st.src = findWater((x, y, z) => d.get(x, y, z), (id) => id === BLOCK.WATER, v.x, v.y, v.z, d.landMade ? (x, z) => d.landMade(x, z) : null);
            st.scanned = true;
        }
        st.kind = waterKind(st.src, !!v.entry?.look?.tank);
    }

    /** The gathering water: a few drops along the stream (or the moisture drawn in) every frame while the guard grows. */
    _gather(v, st, hand, dt) {
        const glow = this.game.fx?.glow; if (!glow) return;
        const n = Math.max(1, Math.round(dt * 160));
        for (let i = 0; i < n; i++) {
            const u = Math.random(), col = WATER_COL[(Math.random() * WATER_COL.length) | 0];
            if (st.kind === 'water') {
                _a.x = st.src.x; _a.y = st.src.y + 0.6; _a.z = st.src.z;
                streamPoint(_a, hand, 1.6 + Math.hypot(hand.x - _a.x, hand.z - _a.z) * 0.12, u, _p);
                streamPoint(_a, hand, 1.6 + Math.hypot(hand.x - _a.x, hand.z - _a.z) * 0.12, Math.min(1, u + 0.06), _q);
                glow.spawn(_p.x + (Math.random() - 0.5) * 0.3, _p.y, _p.z + (Math.random() - 0.5) * 0.3, (_q.x - _p.x) * 9, (_q.y - _p.y) * 9, (_q.z - _p.z) * 9, col, 0.22 + Math.random() * 0.2, 0.3, { shrink: 1.5 });
            } else if (st.kind === 'tank') {
                _a.x = v.x + Math.sin(v.yaw) * 0.55; _a.y = v.y + 2.5; _a.z = v.z + Math.cos(v.yaw) * 0.55; // (on his back)
                streamPoint(_a, hand, 0.9, u, _p); streamPoint(_a, hand, 0.9, Math.min(1, u + 0.08), _q);
                glow.spawn(_p.x, _p.y, _p.z, (_q.x - _p.x) * 8, (_q.y - _p.y) * 8, (_q.z - _p.z) * 8, col, 0.2 + Math.random() * 0.15, 0.28, { shrink: 1.5 });
            } else { // the moisture of the air: mist from round him is drawn into his hands
                const a = Math.random() * Math.PI * 2, r = 2.4 + Math.random() * 1.2;
                _a.x = hand.x + Math.cos(a) * r; _a.y = hand.y + (Math.random() - 0.3) * 1.6; _a.z = hand.z + Math.sin(a) * r;
                glow.spawn(_a.x, _a.y, _a.z, (hand.x - _a.x) * 3.2, (hand.y - _a.y) * 3.2, (hand.z - _a.z) * 3.2, Math.random() < 0.5 ? 0xe8f6ff : col, 0.18 + Math.random() * 0.2, 0.4, { shrink: 1.2 });
            }
        }
    }

    /** The guard going: it falls back as drops. */
    _drops(slot, scaleR, dt) {
        const glow = this.game.fx?.glow; if (!glow) return;
        const n = Math.max(1, Math.round(dt * 90));
        for (let i = 0; i < n; i++) {
            const a = Math.random() * Math.PI * 2, r = scaleR * (0.5 + Math.random() * 0.5);
            glow.spawn(slot.position.x + Math.cos(a) * r, slot.position.y + Math.random() * scaleR * 0.8, slot.position.z + Math.sin(a) * r, (Math.random() - 0.5) * 1.2, -2 - Math.random() * 3, (Math.random() - 0.5) * 1.2, WATER_COL[(Math.random() * WATER_COL.length) | 0], 0.14 + Math.random() * 0.14, 0.45, { shrink: 1 });
        }
    }

    update(dt) {
        this.time += dt; this.material.userData.uniforms.uTime.value = this.time; this._scans = 0;
        let i = 0; const p = this.game.character.group.position;
        for (const v of this.game.castleLife.byId.values()) {
            if (v.element !== 'water') continue;
            const near = !v.dead && v.group?.visible && Math.hypot(v.x - p.x, v.z - p.z) <= 80;
            const on = near && !!(v.fx & (FX.DOME | FX.SHIELD));
            let st = this.st.get(v.id);
            if (!st) { if (!on) continue; st = { grow: 0, src: null, kind: 'air', scanned: false, dome: false }; this.st.set(v.id, st); }
            if (on) st.dome = !!(v.fx & FX.DOME);
            if (on && !st.scanned) this._source(v, st);
            const build = st.dome ? GUARD_BUILD.DOME : GUARD_BUILD.SHIELD;
            st.grow = Math.max(0, Math.min(1, st.grow + (on ? dt / build : -dt / GUARD_BUILD.FADE)));
            if (!on && (st.grow <= 0 || !near)) { this.st.delete(v.id); continue; }
            if (i >= this.slots.length) continue;
            const m = this.slots[i++], e = ease(st.grow), fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
            m.visible = e > 0.02; m.geometry = st.dome ? this.dome : this.cap;
            if (st.dome) { m.position.set(v.x, v.y + S.DOME_UP, v.z); m.scale.setScalar(Math.max(0.01, S.DOME_R * e)); m.rotation.set(0, 0, 0); }
            else { m.position.set(v.x + fx * S.FWD - Math.cos(v.yaw) * S.SIDE, v.y + S.UP, v.z + fz * S.FWD + Math.sin(v.yaw) * S.SIDE); m.rotation.set(0, v.yaw, 0); m.scale.set(Math.max(0.01, S.R * e), Math.max(0.01, S.R * e), 0.32 * Math.max(0.05, e)); }
            if (on && st.grow < 1) { _b.x = v.x + fx * 0.7; _b.y = v.y + 2.6; _b.z = v.z + fz * 0.7; this._gather(v, st, _b, dt); }
            else if (!on) this._drops(m, st.dome ? S.DOME_R : S.R, dt);
        }
        for (; i < this.slots.length; i++) this.slots[i].visible = false;
    }
    sampleModel() { const m = new T.Mesh(this.dome, this.material); m.userData.shared = true; return m; }
    dispose() { for (const m of this.slots) this.game.scene.remove(m); this.slots.length = 0; this.st.clear(); this.dome.dispose(); this.cap.dispose(); this.material.dispose(); }
}
