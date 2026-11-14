/** Elemental discipline and endurance are separate: every tier has the same repertoire. */
import { createRng } from '../core/math.js';
import { rollRank,rollMana } from './WizardAI.js';
export function elementalEndurance(entry,fallback=220){
 const r=createRng((entry.seed??1)^0x68a3c521),rolled=rollRank('wanderer',r),tier=entry.rank||(rolled==='teacher'?'elder':rolled);
 return {tier,mana:entry.mana??(entry.seed!=null?rollMana(tier,r):fallback)};
}

/**
 * The air mage lifts a player with the air and THROWS him (the author 14.11: «маг воздуха сможет поднять другого игрока с помощью воздуха и кинуть куда-то. Это одна из его
 * атакующих возможностей. Защититься можно при помощи Protection Maxima; обычный Protection не сможет»). The lift is the great kind («Левиоса Максима»: goes through magic armour,
 * holds while his mana lasts); the dome of «Protection Maxima» turns it away or breaks it (Levitation.liftMe/_updateLifted: `air`).
 * HOLD s overhead, then the swing: the body flies `SPEED` m/s horizontally, `UP` up, aside by up to `SPREAD` rad from straight away from the mage.
 */
export const AIR_THROW = { HOLD: 2.8, SPEED: 13, UP: 6, SPREAD: 0.7 };
/** The throw's velocity {x, y, z}: from the mage (mx, mz) over the foe (fx, fz), a die `roll` 0…1 for the side. Never zero. */
export function throwVector(mx, mz, fx, fz, roll) {
    let dx = fx - mx, dz = fz - mz; const l = Math.hypot(dx, dz);
    if (l < 0.01) { dx = 0; dz = -1; } else { dx /= l; dz /= l; }
    const a = (roll * 2 - 1) * AIR_THROW.SPREAD, c = Math.cos(a), s = Math.sin(a);
    return { x: (dx * c - dz * s) * AIR_THROW.SPEED, y: AIR_THROW.UP, z: (dx * s + dz * c) * AIR_THROW.SPEED };
}
