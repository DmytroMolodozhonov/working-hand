import { createRng, hashString } from '../core/math.js';
import { SPELL_COST } from './SpellCosts.js';
import { shieldMul, shieldPlain } from './Enchant.js';

const STRONG = 15;

export const shieldReserve = item => item.max * shieldMul(item);

export function shieldWear(item, kind, reserve = shieldReserve(item)) {
    const cost = SPELL_COST[kind === 'SapiraDuel' ? 'Sapira' : kind] ?? (kind === 'melee' ? 2 : 8);
    return item.magic
        ? { reserve: Math.max(0, reserve - cost), broken: reserve < 5 && cost >= STRONG }
        : { reserve: 0, broken: cost >= STRONG + shieldPlain(item) };
}

export function knightShield(v) {
    const rng = createRng(hashString(v.id + ':shield'));
    const magic = v.role === 'king' || rng() < .20;
    return { kind: 'shield', type: 2, magic, max: magic ? 20 + Math.floor(rng() * 31) : 0 };
}

/** Only a visible charge approaching the knight's front gives him a chance to raise the shield. */
export function shieldReaction(v, bolt, speed) {
    const dx = v.x - bolt.front.x, dy = v.y + 2.5 - bolt.front.y, dz = v.z - bolt.front.z;
    const distance = Math.hypot(dx, dy, dz);
    if (distance > 28 || distance < .1 || speed <= 0) return null;
    const along = bolt.dir.x * dx + bolt.dir.y * dy + bolt.dir.z * dz;
    if (along <= 0 || (distance * distance - along * along > 1.8 ** 2 && !(bolt.tk === 'v' && bolt.tid === v.id))) return null;
    const front = (dx * Math.sin(v.yaw) + dz * Math.cos(v.yaw)) / distance;
    const warned = v.foe === bolt.by;
    if (front < (warned ? .12 : .52)) return null;
    const rng = createRng(hashString(v.id + ':shield:' + bolt.id));
    const delay = warned ? .12 + rng() * .15 : .29 + rng() * .27;
    if (along / speed < delay || rng() >= (warned ? .92 : .58)) return null;
    return { delay, eta: along / speed, x: bolt.front.x, z: bolt.front.z };
}
