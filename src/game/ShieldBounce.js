/**
 * ShieldBounce.js — arrows (and other things flying fast) bounce off a «Protection» / «Protection
 * Maxima» instead of passing through it: the hand shield is a disc of light before the hand, the
 * dome a sphere round the body. The thing hits its surface and is mirrored off it (the velocity
 * reflected about the surface's normal, a little slower). No mana: an arrow is no spell.
 *
 * Whose shields: mine, the other players' (as their computers send them), the castle wizards'
 * (their hand shield and the Master's dome — the `fx` bits every computer sees). Every computer
 * flies every arrow itself (Gear.js), and each one bounces it off the same shields.
 * Not the shooter's own shields (his bow is in his hands; his own dome would only trap it).
 */

import * as THREE from 'three';
import { PVP } from './Combat.js';
import { FX } from '../fx/WizardFx.js';

/** The castle wizards' shields (WizardFx: the hand shield's disc before the body, the dome). */
export const NPC_SHIELD = { R: 1.82, FWD: 1.3, UP: 2.6, SIDE: 0.35, DOME_R: 3.2 };

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _n = new THREE.Vector3(), _q = new THREE.Vector3();

/** Every shield up now: discs {disc: true, c, n, r, by} and spheres {c, r, by}. */
export function shieldsNow(g) {
    const out = [];
    const c = g.combat;
    if (c?.shield && c.shield.left > 0 && !c.dead) {
        const ch = g.character;
        if (c.shield.type === 2) out.push({ c: c.center(new THREE.Vector3()), r: PVP.DOME_R, by: g.localId });
        else {
            const n = c.shieldDir(c.shield.side, new THREE.Vector3());
            out.push({ disc: true, c: c.shieldAt(c.shield.side, new THREE.Vector3()).addScaledVector(n, 0.45), n, r: PVP.SHIELD_SCALE, by: g.localId });
        }
    }
    for (const [id, r] of g.remotes || []) {
        const rc = r.combat;
        if (r.dead || !rc?.shield || !(rc.shieldLeft > 0)) continue;
        if (rc.shield === 2) out.push({ c: r.position.clone().add(_a.set(0, 0.6, 0)), r: PVP.DOME_R, by: id });
        else {
            const hp = r.handPose(rc.side);
            out.push({ disc: true, c: hp.origin.clone().addScaledVector(hp.dir, 0.45), n: hp.dir.clone(), r: PVP.SHIELD_SCALE, by: id });
        }
    }
    for (const cs of g.castleLife?.castles?.values?.() || []) {
        for (const v of cs.active?.values?.() || []) {
            if (!v.wizard || v.dead || !(v.fx & (FX.SHIELD | FX.DOME))) continue;
            if (v.fx & FX.DOME) out.push({ c: new THREE.Vector3(v.x, v.y - 0.2, v.z), r: NPC_SHIELD.DOME_R, by: v.id });
            else {
                const fx = -Math.sin(v.yaw), fz = -Math.cos(v.yaw);
                out.push({ disc: true, c: new THREE.Vector3(v.x + fx * NPC_SHIELD.FWD - Math.cos(v.yaw) * NPC_SHIELD.SIDE, v.y + NPC_SHIELD.UP, v.z + fz * NPC_SHIELD.FWD + Math.sin(v.yaw) * NPC_SHIELD.SIDE), n: new THREE.Vector3(fx, 0, fz), r: NPC_SHIELD.R, by: v.id });
            }
        }
    }
    return out;
}

/**
 * The step `was` → `p` of a thing flying with `vel` crosses a shield? Then it is mirrored off it:
 * `p` is put on the shield's surface (just outside) and `vel` reflected (× `keep`).
 * @returns {object|null} the shield it bounced off
 */
export function bounceOffShields(shields, was, p, vel, by = null, keep = 0.75) {
    for (const s of shields) {
        if (by != null && s.by === by) continue;
        if (s.disc) {
            const d0 = _a.subVectors(was, s.c).dot(s.n), d1 = _b.subVectors(p, s.c).dot(s.n);
            if ((d0 > 0) === (d1 > 0) || d0 === d1) continue;
            const t = d0 / (d0 - d1);
            _q.copy(was).lerp(p, t);
            if (_q.distanceTo(s.c) > s.r) continue;
            _n.copy(s.n).multiplyScalar(d0 > 0 ? 1 : -1); // (the side it came from)
            reflect(vel, _n, keep);
            p.copy(_q).addScaledVector(_n, 0.05);
            return s;
        }
        // the dome: from outside in (what is inside — its owner's own — goes out freely)
        if (was.distanceTo(s.c) < s.r || p.distanceTo(s.c) >= s.r) continue;
        const d = _a.subVectors(p, was), f = _b.subVectors(was, s.c);
        const A = d.dot(d), B = 2 * f.dot(d), C = f.dot(f) - s.r * s.r;
        const disc = B * B - 4 * A * C;
        const t = disc < 0 || A < 1e-9 ? 0 : Math.max(0, Math.min(1, (-B - Math.sqrt(disc)) / (2 * A)));
        _q.copy(was).addScaledVector(d, t);
        _n.subVectors(_q, s.c).normalize();
        reflect(vel, _n, keep);
        p.copy(_q).addScaledVector(_n, 0.05);
        return s;
    }
    return null;
}

/** v mirrored about the surface with normal n (only if it goes into it), × keep. */
function reflect(v, n, keep) {
    const k = v.dot(n);
    if (k < 0) v.addScaledVector(n, -2 * k);
    v.multiplyScalar(keep);
}
