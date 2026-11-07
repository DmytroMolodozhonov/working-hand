/**
 * WoundCareRules.js — what people do about a bleeding wound (pure rules; WoundCare.js plays them).
 *
 * The author 07.11 (about «Sectura»): «NPC прям хватается за эту рану рукой. Если это волшебник среднего или выше уровня — поднимает палочку вверх, говорит
 * Rescue, и у него снимается кровотечение, хотя рана остаётся. Младший волшебник — как обычный NPC. А если средний волшебник заметил, что ты младшего так
 * сделал, то поможет младшему. Обычный NPC поможет тому, кто беззащитен.»
 *
 *   everybody who bleeds holds the wound with a hand (`v.woundHold`, drawn by VillagerModel: the hand at the belly, a stoop) until the blood stops
 *   a wizard of the middle rank or higher (adept, teacher, elder, master — and the roles that are never beginners) who has his wand and some mana:
 *       his own wound  → the wand UP, «Rescue», the blood stops (the wound stays: the scar on the model stays too, the hand drops)
 *       a bleeding junior wizard / a defenceless person he sees → he comes, points the wand at them, «Rescue»
 *   a junior wizard (novice) is «as an ordinary person»: holds the wound, cannot stop it himself
 *   an ordinary person (not a fighter, not a middle wizard) who sees a bleeding DEFENCELESS one comes, presses the wound (the blood runs half as fast while they
 *       are at it) and calls for a wizard — a middle wizard that hears the call comes and does «Rescue»
 *
 * «Кто/что»: the villagers of castles, settlements, towers (castleLife) — all of it; the sailors, animals, zombies, bosses do not clutch or get helped (they only bleed
 * and scar). A fighter (knight, king, guard) is not «defenceless» and is not helped by the plain folk — his own surgeons are the wizards.
 */

export const CARE = {
    SEE: 26, // m: a wounded one is noticed by a helper this near (and in sight)
    HEAR: 40, // m: a call for a wizard is heard this far
    SCAN: 0.7, // s between looks for the bleeding
    RESCUE_T: 1.7, // s: the wand goes up … the word … it works (the author: «поднимает палочку вверх, говорит Rescue»)
    SAY_AT: 0.8, // s into the raising the word is said
    COST: 3, // mana of a wizard's «Rescue»
    PRESS_FACTOR: 0.5, // the plain helper's hands halve the bleeding
    GIVE_UP: 45, // s: a helper that cannot get there gives up
    NEAR: 2.4, // m: where the helper stands to the wounded
    RUN: 3.2, // m/s: they hurry
    COOL: 6, // s before a wizard who has done a «Rescue» does another
};

const MID_RANKS = new Set(['adept', 'teacher', 'elder', 'master']);
const ALWAYS_MID_ROLES = new Set(['teacher', 'master', 'seller']);
const FIGHTERS = new Set(['knight', 'king', 'archer', 'guard']);

/** A wizard of the middle rank or higher (he knows «Rescue»)? A novice or a student without a rank — no. */
export function isMidWizard(v) {
    if (!v || !v.wizard) return false;
    if (v.rank) return MID_RANKS.has(v.rank);
    const r = v.skillRole || v.role;
    return ALWAYS_MID_ROLES.has(r) || r === 'wanderer' || r === 'townwiz' || r === 'mage';
}

/** Can he cast «Rescue» right now (a wand in hand, mana, not stunned, not held)? */
export function canRescue(v) {
    return isMidWizard(v) && !v.dead && !v.noWand && !(v.stunT > 0) && !v.lev && !v.carriedBy && !v.vy && (v.mana ?? 99) >= CARE.COST;
}

/** A fighter by trade: the plain folk do not nurse him (and he is not «defenceless»). */
export function isFighter(v) { return !!v && FIGHTERS.has(v.role); }

/** Defenceless: a person who cannot fight for himself — a plain villager, a junior wizard (not a knight, not a middle wizard). */
export function isDefenceless(v) { return !!v && !v.dead && !isFighter(v) && !isMidWizard(v); }

/** A helper from the plain folk: a villager at ease (not a fighter, not a wizard of the middle rank — they have their own way). */
export function isPlainHelper(v) { return !!v && !v.dead && !isFighter(v) && !v.wizard && !(v.stunT > 0) && !v.lev && !v.carriedBy && !v.foe && !(v.fleeT > 0) && !v.seated; }

/** Which hand holds the wound: stable per person (the left for about one in three). */
export function woundSide(id) {
    let h = 0;
    const s = String(id);
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return (h & 3) === 0 ? 'l' : 'r';
}

/** Does the bleeding one stop his own blood (a middle wizard with a wand)? */
export const staysSelf = (victim) => !!victim && victim.bleed > 0 && canRescue(victim);

/**
 * The wizard who comes to a bleeding DEFENCELESS one: the nearest of `near` ([{v, d}]) who can «Rescue», within `range` (SEE; HEAR once somebody has called). null if none.
 * (A middle wizard also does not mind the plain folk: «поможет тому, кто беззащитен».)
 */
export function pickWizard(victim, near, range = CARE.SEE) {
    if (!isDefenceless(victim) || !(victim.bleed > 0)) return null;
    let best = null;
    for (const c of near) if (c.v !== victim && !c.v.care && c.d <= range && canRescue(c.v) && (!best || c.d < best.d)) best = c;
    return best ? best.v : null;
}

/** The plain person who runs to a bleeding defenceless one and presses the wound: the nearest not busy within SEE × 0.6. null if none. */
export function pickPlain(victim, near) {
    if (!isDefenceless(victim) || !(victim.bleed > 0)) return null;
    let best = null;
    for (const c of near) if (c.v !== victim && !c.v.care && c.d <= CARE.SEE * 0.6 && isPlainHelper(c.v) && (!best || c.d < best.d)) best = c;
    return best ? best.v : null;
}

/** What a plain helper shouts and what a wizard says (a short word). */
export const CARE_LINES = {
    plain: ['Держитесь! Я рядом!', 'Не двигайтесь, я прижму рану!', 'Кто-нибудь, лекаря!', 'Потерпите, сейчас придут на помощь!'],
    call: ['Волшебника сюда! Он истекает кровью!', 'Нужен маг! Скорее!', 'Помогите ему — кто умеет!'],
    wizard: ['Rescue!'],
    thanks: ['Спасибо…', 'Больно… но легче.', 'Кровь остановилась…'],
};
