/** A small physical impulse only for a newly lethal magical hit. */
import { SPELL_PHYSICS } from './Impact.js';
import { DOLL } from './Ragdoll.js';

export const magicalImpactKind = kind => Object.hasOwn(SPELL_PHYSICS, kind);

export function deathImpulse(game, target, by, direction = null) {
    const p = target.group?.position || target;
    const source = by === 'local' || by === game.localId ? game.character?.group?.position
        : game.remotes?.get(by)?.position || game.castleLife?.byId?.get(by) || game.ships?.crew?.byId?.get(by);
    let x = direction?.x ?? (source ? p.x - source.x : Math.sin(target.yaw || 0));
    let z = direction?.z ?? (source ? p.z - source.z : Math.cos(target.yaw || 0));
    const length = Math.hypot(x, z);
    if (length < 1e-6) { x = 0; z = 1; }
    else { x /= length; z /= length; }
    return [x * SPELL_PHYSICS.Jolt.push * 0.25, SPELL_PHYSICS.Jolt.toss * 0.25, z * SPELL_PHYSICS.Jolt.push * 0.25];
}

/** Keep stronger existing movement (explosions, throws), instead of adding a second launch. */
export function kickDeadDoll(doll, kick) {
    if (!doll || !Array.isArray(kick) || kick.length !== 3 || !kick.every(Number.isFinite)) return;
    let vx = 0, vy = 0, vz = 0;
    const n = doll.x.length / 3;
    if (!n) return;
    for (let i = 0; i < doll.x.length; i += 3) {
        vx += doll.x[i] - doll.o[i]; vy += doll.x[i + 1] - doll.o[i + 1]; vz += doll.x[i + 2] - doll.o[i + 2];
    }
    const scale = 1 / (n * DOLL.DT);
    vx *= scale; vy *= scale; vz *= scale;
    if (Math.hypot(vx, vz) >= SPELL_PHYSICS.Jolt.push * 0.25) return;
    doll.push(kick[0] - vx, Math.abs(vy) > kick[1] ? 0 : kick[1] - vy, kick[2] - vz);
    // The upper body yields first: a small physical topple, not an upright slide.
    let centerY = 0;
    for (let i = 1; i < doll.x.length; i += 3) centerY += doll.x[i] / n;
    const length = Math.hypot(kick[0], kick[2]) || 1;
    for (let i = 0; i < doll.x.length; i += 3) {
        const turn = (doll.x[i + 1] - centerY) * 0.8 * DOLL.DT;
        doll.o[i] -= kick[0] / length * turn;
        doll.o[i + 2] -= kick[2] / length * turn;
    }
}
