/**
 * KingNerve.js — когда король дерётся, а когда прячется (чистые правила, без игры и three.js).
 *
 * Слова автора: «Король на тебя не нападает; он обычно пытается спрятаться где-то в замке. Он нападает
 * только когда ты убил очень много стражи, или когда у него нет выбора — стража повержена или рядом её нет.
 * Скорее убегает.»
 *
 * По умолчанию на угрозу король прячется (VillagerFear: вглубь замка) и зовёт стражу. В бой идёт, только если:
 *   (а) убито много стражи этого замка (`killLimit`), или
 *   (б) загнан: живой стражи рядом нет (`guardRadius` — по размеру замка) и герой уже рядом (`CORNER`).
 * Бой не дёргается туда-сюда: вошёл в «загнан» при 6 м — вышел, только когда герой дальше 12 м или стража вернулась.
 */

export const NERVE = {
    CORNER_IN: 6, // m: герой ближе — деваться некуда (если стражи рядом нет)
    CORNER_OUT: 12, // m: уже дерётся — перестаёт, когда герой дальше
    KILLS_MAX: 7, // сколько убитых рыцарей — предел для любого замка
    KILLS_MIN: 3, // у совсем маленького замка
    KILLS_SHARE: 0.6, // доля стражи замка
    R_MIN: 24, R_MAX: 40, // m: «стража рядом»
};

/** Сколько убитых рыцарей замка делают короля храбрым. */
export function killLimit(knights) {
    return Math.min(NERVE.KILLS_MAX, Math.max(NERVE.KILLS_MIN, Math.ceil((knights || 0) * NERVE.KILLS_SHARE)));
}

/** Радиус «стража рядом» по размеру замка (полуширина стен). */
export function guardRadius(walls) {
    if (!walls) return NERVE.R_MIN;
    const half = Math.max(walls.x1 - walls.x0, walls.z1 - walls.z0) / 2;
    return Math.min(NERVE.R_MAX, Math.max(NERVE.R_MIN, half));
}

/** Сколько рыцарей (номера 1…knights) убито из списка убитых замка. */
export function guardsKilled(killed, knights) {
    let n = 0;
    for (const k of killed || []) if (k >= 1 && k <= knights) n++;
    return n;
}

/**
 * Дерётся ли король сейчас.
 * @param {{killed:number, knights:number, guardNear:number, heroDist:number, fighting:boolean}} s
 *   killed — убито рыцарей; guardNear — живой (не спящей, не оглушённой) стражи рядом; heroDist — до ближайшего врага (Infinity — нет);
 *   fighting — дрался до этого (чтобы не дёргался на границе).
 * @returns {{fight:boolean, why:'kills'|'cornered'|'no'}}
 */
export function kingFights(s) {
    if (s.killed >= killLimit(s.knights)) return { fight: Number.isFinite(s.heroDist), why: 'kills' };
    const lim = s.fighting ? NERVE.CORNER_OUT : NERVE.CORNER_IN;
    if (s.guardNear <= 0 && s.heroDist <= lim) return { fight: true, why: 'cornered' };
    return { fight: false, why: 'no' };
}
