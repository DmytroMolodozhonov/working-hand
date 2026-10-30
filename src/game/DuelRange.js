/**
 * DuelRange.js — how far a duel charge flies (pure rules, no THREE).
 * Author: «длина луча = количество маны у колдующего, 1 мана = 1 метр, максимум 200 м; мана за метры не берётся».
 * The reach is read ONCE, at the moment of casting, from the mana BEFORE the spell's price is paid; a charge
 * already flying is never cut short because the mana ran out later. The same for the player and for every
 * caster of the castle (wizards, the Master, knights-mages): their `mana` is read the same way.
 */
export const DUEL_RANGE = {
    MAX: 200, // m: no more, however much mana there is
    EMPTY: 30, // m: a charge with nobody on its line goes out at this distance (no long flight into the void)
};

/**
 * @param {number} mana  mana before the price of this spell is paid
 * @param {{creative?: boolean}} [o]  creative: mana is endless → the longest reach
 * @returns {number} metres, 0…200 (0: not a single metre — nothing to cast with)
 */
export function duelRange(mana, o = {}) {
    if (o.creative) return DUEL_RANGE.MAX;
    const m = Number(mana);
    if (!(m > 0)) return 0; // (also NaN / undefined)
    return Math.min(DUEL_RANGE.MAX, m);
}

/** A charge with nobody on the line: it goes out sooner than the reach (a ceiling, not a duty). */
export function emptyRange(reach, hasBody) {
    return hasBody ? reach : Math.min(reach, DUEL_RANGE.EMPTY);
}
