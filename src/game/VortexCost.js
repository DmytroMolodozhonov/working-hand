/**
 * VortexCost.js — the price of the vortexes (the author: 20 mana at the cast + 1 mana a second while the vortex lives —
 * circling, following the wand, in a shield; out of mana it falls apart). Pure; shared by «Ground Vortex» and «Water Vortex».
 */
export const VORTEX_PRICE = { COST_ONCE: 20, PER_SECOND: 1 };

/** Mana the held vortex takes in `dt` seconds. */
export const vortexDrain = (dt) => VORTEX_PRICE.PER_SECOND * Math.max(0, dt);

/** May it be cast with this much mana? */
export const vortexAffordable = (mana) => (mana ?? 0) >= VORTEX_PRICE.COST_ONCE;
