/**
 * DivineSwordFx.js — the divine sword alive in the world (DivineSword.js, DivineSwordModel.js), once a frame for all of them:
 * the shared clock of its glow shaders, the soft sparks that drift up from the blade, the trail of light along a fast swing, the glow
 * breathing brighter while it moves, and its quiet hum when you are near. Sparks come from the shared pool (Effects.spark), no light
 * is made (no PointLight: the blade itself shines — emissive + additive layers), nothing is allocated in the frame.
 * Far away (> FAR m) or unseen it only keeps its glow (the layers are culled by the camera like any mesh).
 */
import * as THREE from 'three';
import { divineClock, bladePoint } from '../entities/DivineSwordModel.js';
import { DIVINE } from '../game/DivineSword.js';

export const DIVINE_FX = { FAR: 70, SPARK_EVERY: 0.09, TRAIL_SPEED: 4.5, HUM_R: 14 };
const _p = new THREE.Vector3(), _q = new THREE.Vector3(), _v = new THREE.Vector3();
const COLS = [0xffffff, 0xfff1c4, 0xffd780, 0xffe9b0, 0xcff4ff];

/** `W` — the WeaponSystem. */
export function divineTick(W, dt) {
    const g = W.game;
    divineClock.value = (divineClock.value + dt) % 1000;
    let hum = 0;
    const me = g.character?.group?.position;
    for (const w of W.weapons) {
        if (w.type !== 'divine' || !w._divine) continue;
        // the glow breathes brighter while it moves (a swing, a flight)
        const sp = w.velocity.length() + w.angularVelocity.length() * 1.2;
        const k = 1 + Math.min(0.8, sp * 0.06);
        const star = w._divine.children[2];
        star.scale.setScalar(k * (0.9 + 0.12 * Math.sin(divineClock.value * 3 + w.position.x)));
        if (!me || !g.fx) continue;
        const d = w.position.distanceTo(me);
        if (d < DIVINE_FX.HUM_R) hum = Math.max(hum, 1 - d / DIVINE_FX.HUM_R);
        if (d > DIVINE_FX.FAR) continue;
        w.mesh.updateMatrixWorld();
        const M = w.model.matrixWorld;
        // drifting sparks of light from the blade
        w._dsT = (w._dsT || 0) - dt;
        if (w._dsT <= 0) {
            w._dsT = DIVINE_FX.SPARK_EVERY * (d < 20 ? 1 : 2);
            bladePoint(0.08 + Math.random() * 0.9, _p).applyMatrix4(M);
            g.fx.spark(_p, COLS[(Math.random() * COLS.length) | 0], 0.06 + Math.random() * 0.07, _v.set((Math.random() - 0.5) * 0.4, 0.5 + Math.random() * 0.8, (Math.random() - 0.5) * 0.4), 0.9 + Math.random() * 0.8);
        }
        // a trail of light along a fast swing (in the hand, or thrown / flying)
        const tipNow = w.getTipPosition(_q);
        if (w._dtip) {
            const tsp = tipNow.distanceTo(w._dtip) / Math.max(dt, 1 / 240);
            if (tsp > DIVINE_FX.TRAIL_SPEED) {
                const n = Math.min(6, 2 + ((tsp / 6) | 0));
                for (let i = 0; i < n; i++) {
                    bladePoint(0.35 + 0.65 * (i / Math.max(1, n - 1)), _p).applyMatrix4(M);
                    g.fx.spark(_p, i % 2 ? DIVINE.COLOR : 0xffffff, 0.09 + 0.05 * (i / n), _v.set(0, 0.15, 0), 0.22 + 0.1 * Math.random());
                }
            }
            w._dtip.copy(tipNow);
        } else w._dtip = tipNow.clone();
    }
    g.sound?.divineHum?.(hum);
}
