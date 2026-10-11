/**
 * Overgrown.js — «Overgrown» («Овергроун»): the raised hand points at one creature or a crowd
 * and they are thrown apart — away from the line of the spell, to both sides and up.
 * «Overgrown Максима» is twice as strong (further and higher).
 *
 * The spell itself never hurts: whoever it throws off a ledge gets the ordinary fall damage
 * when it lands (Levitation.watchFall / watchMyFall).
 */

import * as THREE from 'three';
import { spellPush, SPELL_PHYSICS } from './Impact.js';

export const OVERGROWN = {
    CONE: 0.6, // rad around the pointing
    NEAR: 2.5, // m: closer than this, anything in front counts
};

/** Reach of the spell (m). */
export const overgrownRange = (name) => SPELL_PHYSICS[name]?.range || 16;

const _to = new THREE.Vector3();
const _f = new THREE.Vector3();
const _s = new THREE.Vector3();

/**
 * The throw (hero m/s, y = up) given to a body at `pos` by the spell cast from `origin` along
 * `dir` (normalised), or null when it is out of reach. Bodies fly away from the line of the
 * spell (left of it — to the left, right of it — to the right) and a little onward; one right on
 * the line goes to a side of its own.
 */
export function overgrownPush(name, origin, dir, pos, out = new THREE.Vector3()) {
    const P = SPELL_PHYSICS[name];
    if (!P) return null;
    const to = _to.subVectors(pos, origin);
    const dist = to.length();
    if (dist > P.range || dist < 1e-3) return null;
    const dn = _s.copy(to).divideScalar(dist);
    if (dist > OVERGROWN.NEAR ? dir.angleTo(dn) > OVERGROWN.CONE : dir.dot(dn) < 0) return null;
    // on the ground: onward along the pointing, and the side away from its line
    const fwd = _f.set(dir.x, 0, dir.z);
    if (fwd.lengthSq() < 1e-6) fwd.set(to.x, 0, to.z); // (pointing straight down / up: away from the hand)
    if (fwd.lengthSq() < 1e-6) fwd.set(0, 0, 1);
    fwd.normalize();
    const along = to.x * fwd.x + to.z * fwd.z;
    const side = _s.set(to.x - fwd.x * along, 0, to.z - fwd.z * along);
    if (side.length() < 0.3) {
        // on the line: to the left or to the right (the same on every computer)
        const k = Math.sin(pos.x * 12.9898 + pos.z * 78.233) * 43758.5453;
        const sgn = k - Math.floor(k) < 0.5 ? 1 : -1;
        side.set(-fwd.z * sgn, 0, fwd.x * sgn);
    } else side.normalize();
    const k = spellPush(name, dist);
    out.copy(side).multiplyScalar(0.85).addScaledVector(fwd, 0.5).normalize().multiplyScalar(k);
    out.y = P.toss || 0;
    return out;
}
