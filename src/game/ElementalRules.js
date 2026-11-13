/** Elemental discipline and endurance are separate: every tier has the same repertoire. */
import { createRng } from '../core/math.js';
import { rollRank,rollMana } from './WizardAI.js';
export function elementalEndurance(entry,fallback=220){
 const r=createRng((entry.seed??1)^0x68a3c521),rolled=rollRank('wanderer',r),tier=entry.rank||(rolled==='teacher'?'elder':rolled);
 return {tier,mana:entry.mana??(entry.seed!=null?rollMana(tier,r):fallback)};
}
