/**
 * SailorDisarm.js — «Экспеллиармус» on the crews: Captain Black Moustache's rapier, a skeleton's cutlass or axe, a sailor's cutlass.
 *
 * The author: «Капитана можно победить так: сначала обезоружить заклинанием «Экспеллиармус» (выбить саблю), а потом атаковать».
 * The blade flies out of the hand as a REAL weapon (the captain's rapier is the same magic sword he drops when he falls) and lies on
 * the deck for anyone to take. Disarmed, he fights with his fists (half the blows — EXPELLIARMUS.FIST); the captain has no rapier to beat
 * charges aside with (Sailors.parryBolt) until he has it again. He goes for it (FETCH: it lies within RANGE m on his own deck), bends
 * for it GRAB_MIN…GRAB_MAX s — time to strike him or to take the rapier first; a player who has it in his hand (or stands with it
 * in a pocket) has won it for good. A pistol knocked out clatters away: he is unarmed, with nothing to fetch.
 * He never leaves his ship for it (the black ship's captain stays on his deck while skeletons live — Blackbeard.js).
 */

export const DISARM = {
    RANGE: 14, // m: a blade farther away than this (or on another deck) he gives up on
    GRAB_MIN: 3, GRAB_MAX: 5, // s: bending for it — the blow's chance
    GIVE_UP: 20, // s: he cannot reach it for so long — fists for good (till someone gives it back)
    REACH: 1.2, // m: he is at the blade
    FLY_MIN: 2.5, FLY_MAX: 5, // m: how far the blade flies across the deck
};

/** What a sailor's tool (VillagerModel.toolKind) becomes when knocked out: the weapon type of the world, magic bonus %. null item: no thing (a pistol). */
export const DISARM_TOOLS = {
    rapier: { item: 'sword', bonus: 60 }, // (Captain Black Moustache's: the same magic sword he drops at his death — Blackbeard.died)
    cutlass: { item: 'sword', bonus: 0 },
    sword: { item: 'sword', bonus: 0 },
    axe: { item: 'axe', bonus: 0 },
    pistol: { item: null, bonus: 0 },
};

/** CLAUDE.md «кто/что»: what «Экспеллиармус» does to each sort of the crews. */
export const DISARM_TARGETS = {
    blackbeard: { does: 'disarm', why: 'сабля вылетает и лежит на палубе; без неё он бьёт кулаками, не парирует заряды, но идёт за ней и тянется несколько секунд' },
    skeleton: { does: 'disarm', why: 'сабля или топор вылетают из костлявой руки; пистолет улетает без следа — скелет безоружен' },
    sailor: { does: 'disarm', why: 'матрос роняет саблю; бьёт кулаками, пока не подберёт' },
    captain: { does: 'disarm', why: 'капитан корабля роняет саблю — как матрос' },
    boatswain: { does: 'disarm', why: 'боцман роняет саблю — как матрос' },
};

/** The tool a creature of the crews holds now (`tool`: its model's toolKind) → {item, bonus} | null. */
export const knockable = (tool) => DISARM_TOOLS[tool] || null;

/**
 * One step of a disarmed sailor going for his blade (pure; the state `a` = {t, grab, tool} lives on the sailor).
 * `st`: {taken (somebody holds it / it is gone), dist (m, on his deck; Infinity: other deck / in the sea), busy (stunned, in the air, fighting hand to hand…)}.
 * → 'wait' | 'walk' | 'grab' | 'done' | 'giveup'
 */
export function fetchStep(a, dt, st, rng = Math.random) {
    if (st.taken) return 'giveup';
    a.t += dt;
    if (a.t > DISARM.GIVE_UP && !(a.grab > 0)) return 'giveup';
    if (!(st.dist <= DISARM.RANGE)) return 'giveup';
    if (st.busy) { a.grab = 0; return 'wait'; } // (knocked about: the bending starts over)
    if (st.dist > DISARM.REACH) { a.grab = 0; return 'walk'; }
    if (!(a.grab > 0)) a.grab = DISARM.GRAB_MIN + rng() * (DISARM.GRAB_MAX - DISARM.GRAB_MIN);
    a.grab -= dt;
    return a.grab <= 0 ? 'done' : 'grab';
}
