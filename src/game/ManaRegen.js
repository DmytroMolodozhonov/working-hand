/**
 * ManaRegen.js — a stronger mage gets his mana back faster (the author: «на каждые 100 ячеек маны — 10% быстрее
 * восстановление: 200 ячеек — 20%, и так далее»). Pure.
 *
 * The bonus is in percentage points of the plain pace (1 a second): 100 cells +10 %, 200 cells +20 %, 300 +30 % …
 * It multiplies with the other bonuses of the pace as they do (armour `manaRegen`, achievements `regenK`).
 */

export const REGEN_PER_100 = 0.10;

/** How many full hundreds of cells (mana maximum) the hero has. */
export const regenTier = (max) => Math.max(0, Math.floor((Number.isFinite(max) ? max : 0) / 100));

/** The pace's factor for this maximum: 1 for under 100 cells, 1.1 for 100…199, 1.2 for 200…299 … */
export const regenCellsK = (max) => 1 + REGEN_PER_100 * regenTier(max);

/** The line the hero reads when he reaches `tier` hundreds of cells. */
export const regenLine = (tier) => `✨ Вы стали сильнее как маг: ${tier * 100} ячеек маны — теперь мана восстанавливается на ${Math.round(tier * REGEN_PER_100 * 100)}% быстрее`;
