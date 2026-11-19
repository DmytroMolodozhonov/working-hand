// MageThaw.js — a wizard of the game frozen by the plain «Frozen» / «Айс» thaws himself with «Fire Maxima» (the author 19.11:
// «если NPC-маг заморожен обычным Frozen, он использует Fire Maxima, чтобы разморозиться; всё зависит от того, насколько он сильный маг.
// У магов огня иммунитет — он вообще не берёт это заклинание. У других — вопрос реакции: от 1 до 5 секунд. Это заклинание знают все»).
//
//   fire mage (`v.element === 'fire'`) — the ice does not take him at all (no shell, no stun).
//   any other wizard — frozen, but only for his REACTION time: 5 s (a novice) … 1 s (a supermage / the Saviour), then he says «Fire Maxima!»
//                      and the ice melts (a burst of golden sparks). The stronger the wizard, the quicker.
//   «Айс Максима» (the thick ice): not this — the plain thaw does not break it; the old 10 s stand.
// Pure: the numbers and the rule (the game part is StrongMagic.iceCreature / update).

/** Reaction time (s) by rank: the stronger, the quicker (1…5). */
export const THAW_REACT = { novice: 5, student: 5, adept: 4, teacher: 3, elder: 2.5, master: 2, supermage: 1, savior: 1 };
export const THAW_DEFAULT = 4;

/** Is this creature a wizard of the game (not a farmer, a knight, a sailor)? */
export const isWizardNpc = (c) => !!c && (c.rank != null || c.skillRole != null || c.W != null) && c.role !== 'farmer' && c.role !== 'knight';

/**
 * How the plain ice meets this wizard: { immune: true } (a fire mage) | { delay: s } (thaws himself after it) | null (not a wizard: the usual ice).
 * A big reserve of mana makes him a little quicker (−0.5 s at ≥ 400), never below 1 s.
 */
export function thawRule(c) {
    if (!isWizardNpc(c)) return null;
    if (c.element === 'fire') return { immune: true };
    const base = THAW_REACT[c.rank] ?? THAW_REACT[c.skillRole] ?? THAW_DEFAULT;
    const bonus = (c.maxMana || 0) >= 400 ? 0.5 : 0;
    return { delay: Math.max(1, Math.min(5, base - bonus)) };
}

export const THAW_TARGETS = {
    wizards: { does: 'thaw', why: 'обычный «Frozen/Айс» держит мага лишь время его реакции (1–5 с по силе), затем «Fire Maxima!» — лёд тает' },
    fireMage: { does: 'immune', why: 'маг огня не берёт это заклинание вовсе' },
    maxima: { does: 'none', why: '«Айс Максима» обычным оттаиванием не снять — как прежде' },
    others: { does: 'none', why: 'рыцари, жители, звери, зомби — как прежде' },
};
