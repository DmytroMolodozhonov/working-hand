/**
 * HydroRules.js — «Пентаграмма водяной силы» («Pentagranium Aquaris», белая): pure rules (PentagramHydro.js plays them).
 *
 * The author 07.11: «Пентаграмма водяной силы. 50 маны. Игрок встаёт в неё и в этот момент должен держать воду заклинанием Waterbollow (или другим способом, но не лёд):
 * главное — чтобы была концентрация на воде. Это даёт возможность колдовать водяные заклинания БЕЗ воды: из влажности атмосферы. В пустынях нельзя — там совсем сухо.
 * Все водяные заклинания больше не требуют указывать на воду. Белая пентаграмма, ничего плохого.»
 *
 *   make the circle (50 mana, at the stand) while a LIQUID water spell is held (the water ball of «Waterbollow», the storm, a wave, the vortex — never ice) →
 *   the gift for good (until death; «Give Me My Power» brings it back): «Waterbollow», «Wave Attack», «Water Vortex», «Water Vortex Super Maxima» take their water from the
 *   air's moisture where no water is near. Not in a desert (the pyramids' sand), not off the Earth (the water spells have their own rules there), not in hell (steam).
 *
 * «Кто/что»: the gift is the hero's (saved, taken by death); a guest's gift counts on his computer (his spells run there) — the world sees the water as any water spell's.
 */
export const HYDRO = {
    COST: 50, // mana, at the stand in the circle
    SPRING_UP: 2.4, // m: the moisture gathers this far under the hand's spot (the ball rises "out of the air" from there)
    RAISE_FLOOR: 0.4, // m above the ground the humid spring is never lower than
    MIST_S: 0.9, // s the mist gathers to the hand when the spell takes its water from the air
    NOTE_COOL: 5, // s between the same hint
};

export const HYDRO_HINT = {
    have: 'Влага из воздуха вам уже подвластна — второй раз не нужно.',
    noWater: 'Встаньте в круг, держа воду: поднимите шар «Waterbollow» (жидкая вода, не лёд) и не отпускайте его.',
    ice: 'Изо льда влагу не вытянуть — держите жидкую воду («Waterbollow»), а не лёд.',
    noMana: (n) => `Нужно ${n} маны, чтобы пентаграмма водяной силы приняла вас.`,
    done: '💧 Вода послушна вам: теперь водяные заклинания не просят реки — влагу они берут прямо из воздуха (кроме пустынь).',
    dry: '🏜️ Здесь слишком сухо — в воздухе нет влаги: водяным заклинаниям нужна настоящая вода.',
    lost: 'Вы больше не можете брать воду из воздуха.',
};

/**
 * Does the hero hold LIQUID water now (the gift's condition)? `h`: { ball: {frozen}|null, storm: bool, wave: bool, vortex: {frozen}|null }.
 * → { ok, why: null | 'ice' | 'none' }.
 */
export function holdsLiquidWater(h) {
    const liquid = (h.ball && !h.ball.frozen) || h.storm || h.wave || (h.vortex && !h.vortex.frozen);
    if (liquid) return { ok: true, why: null };
    const ice = (h.ball && h.ball.frozen) || (h.vortex && h.vortex.frozen);
    return { ok: false, why: ice ? 'ice' : 'none' };
}

/** May the moisture of the air feed a water spell here? → null (yes) or a reason: 'space' | 'desert' | 'hell'. */
export function airWet({ offEarth, hell, desert }) {
    if (offEarth) return 'space';
    if (hell) return 'hell';
    if (desert) return 'desert';
    return null;
}
