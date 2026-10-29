/**
 * Rebellion.js — «недовольство королевством» (the author: «Как только король убит — тебя подчиняются все (формально), но в большей
 * степени тебя ненавидят. Если ты вторгаешься в дома — с процентной вероятностью на тебя нападут, даже если ты король. Богатый — высокая
 * вероятность, не богатый — 40 %. Кто-то из рыцарей по-любому через какое-то время нападёт, с небольшим шансом 25 %; не стадом — 2–3
 * рыцаря. Периодически будет ВОССТАНИЕ. Усиливается от ужасных дел; уменьшается, если помогаешь, общаешься и заслуживаешь уважения»).
 *
 * One hidden number per castle / village: `reb` 0…100 (never shown to the player; the journal «решение:» and the codex tell of it).
 * It is the unrest of the people toward the player who holds the place (its owner). It grows with the king's slaying, executions,
 * robbery, killings, arson, blows at the houses; it falls with help, gifts, talk, repairs, offices, and slowly with time.
 * What depends on it: the chance that the people of a house fall on the intruder; the small risings of two or three knights; the
 * friendship people have for the owner (`friendDrag`); the shops and the civilians (`reactionOf`).
 * Pure (no THREE / DOM): tests/unit/rebellion.test.js.
 */

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const r1 = (x) => Math.round(x * 10) / 10;

export const REB = {
    MAX: 100,
    KING_SLAIN: 70, // the old king killed: at once at least this much
    DECAY: 1 / 90, // points a second (about 40 an hour of an awake place)
    RAMP_FROM: 10, // below this nothing happens
    RAMP_FULL: 70, // from here (= right after the old king is killed) the chances are the author's full numbers
    HOME_RICH: 0.8, // «богатый — высокая вероятность»
    HOME_POOR: 0.4, // «не богатый — с вероятностью 40 %»
    HOME_COOL: 150, // s: the same house is rolled once per visit
    KNIGHT_P: 0.25, // a knight rises with this chance each period
    KNIGHT_MIN: 15, // below this unrest knights do not rise
    PERIOD: [200, 420], // s between two looks (a rare fit)
    GROUP_MAX: 3, // never the herd: two or three at most
};

/** What a deed does to the unrest: + grows, − eases. `cap`: the most it may add at once. */
export const DEED_REB = {
    kingSlain: 0, // (set, not added: see `slainKing`)
    execution: 6, // a man killed on the king's order, a prisoner killed
    slay: 8, // an innocent killed by the player
    hurt: 1.5, // a person struck
    theft: 4, // a thing taken from a house / a stall
    arson: 6, // a fire set among the houses
    wreck: 0.15, // per block broken (capped by `cap`)
    raid: 2, // broke into a house and the people fell on him
    // — eases —
    foe: -1.5, // a monster killed in their sight (zombie, gargoyle, enemy)
    saved: -2, // somebody helped
    gift: -2, // a gift, a fair deal
    talk: -0.4, // a kind word
    repair: -1, // a thing mended
    rank: -3, // a friend of the king given an office
    court: -3, // the town's trouble solved
};
const CAPS = { wreck: 10 };

/** A new, empty record. */
export const blank = () => ({ v: 0, t: 0 });

/** The unrest now (0…100), rounded to a tenth. */
export const valueOf = (rec) => clamp(Number(rec && rec.v) || 0, 0, REB.MAX);

/** A deed by the owner: returns the new record (pure). `n` multiplies the deed (blocks, people…). */
export function note(rec, kind, n = 1) {
    const d = DEED_REB[kind];
    if (d == null) return rec || blank();
    const cur = valueOf(rec);
    let add = d * Math.max(0, n);
    if (CAPS[kind] != null) add = Math.min(add, CAPS[kind]);
    return { v: r1(clamp(cur + add, 0, REB.MAX)), t: (rec && rec.t) || 0 };
}

/** The old king was killed by the player: the unrest jumps to at least KING_SLAIN. */
export function slainKing(rec) {
    return { v: Math.max(valueOf(rec), REB.KING_SLAIN), t: (rec && rec.t) || 0 };
}

/** Time passes: it eases slowly. */
export function ease(rec, dt) {
    const cur = valueOf(rec);
    if (cur <= 0) return rec || blank();
    return { v: r1(clamp(cur - dt * REB.DECAY, 0, REB.MAX)), t: (rec && rec.t) || 0 };
}

/** 0 below RAMP_FROM, 1 from RAMP_FULL, up to 1.3 at the top. */
export function ramp(reb) {
    const v = clamp(reb, 0, REB.MAX);
    if (v <= REB.RAMP_FROM) return 0;
    if (v <= REB.RAMP_FULL) return (v - REB.RAMP_FROM) / (REB.RAMP_FULL - REB.RAMP_FROM);
    return 1 + 0.3 * (v - REB.RAMP_FULL) / (REB.MAX - REB.RAMP_FULL);
}

/**
 * How much friendship the people lose to the owner because of the unrest (added to hatred). `temper` 0…100 of the man.
 * Formal obedience (the king's 80) is not touched: «подчиняются все (формально), но ненавидят».
 */
export function friendDrag(reb, temper = 50) {
    return Math.round(clamp(reb, 0, REB.MAX) * 0.5 * (1 + (temper - 50) / 200));
}

/** The chance that a person at home falls on the intruder. `fr`: his friendship to the intruder (a friend is spared mostly). */
export function homeChance(reb, rich, fr = 0) {
    const base = rich ? REB.HOME_RICH : REB.HOME_POOR;
    let p = base * Math.min(1.3, ramp(reb));
    if (fr >= 40) p *= 0.3;
    else if (fr >= 20) p *= 0.6;
    return r1(clamp(p, 0, 0.95) * 1000) / 1000;
}

/**
 * Which knights rise in this fit. `knights`: [{id, fr}]; `rnd` returns 0…1. Each rolls KNIGHT_P (scaled by the unrest, softened by
 * friendship); the band is cut to GROUP_MAX and to less than half of the knights («не стадом, точно не все»).
 */
export function risingKnights(knights, reb, rnd = Math.random) {
    if (!knights.length || reb < REB.KNIGHT_MIN) return [];
    const k = ramp(reb) * REB.KNIGHT_P;
    const picked = [];
    for (const x of knights) {
        const soft = 1 - clamp(x.fr || 0, 0, 80) / 100;
        if (rnd() < k * soft) picked.push(x.id);
    }
    const cap = Math.min(REB.GROUP_MAX, Math.max(1, Math.floor(knights.length / 2)));
    for (let i = picked.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [picked[i], picked[j]] = [picked[j], picked[i]]; }
    return picked.slice(0, cap);
}

/** The next fit comes after this many seconds. */
export const nextPeriod = (rnd = Math.random) => REB.PERIOD[0] + rnd() * (REB.PERIOD[1] - REB.PERIOD[0]);

/** The level of unrest as a word (journal, codex). */
export function levelName(reb) {
    return reb >= 80 ? 'на грани бунта' : reb >= 60 ? 'ненавидят' : reb >= 40 ? 'ропщут' : reb >= 20 ? 'недовольны' : reb >= 10 ? 'косятся' : 'спокойно';
}

/**
 * The reaction of each kind of person (all the humanoid roles — COMMAND_ROLES): what the unrest does to him.
 *   whisper — mutters when the owner passes (from `WHISPER_FROM`); shop — refuses to trade (from `shopFrom`, with that chance);
 *   flee — a civilian runs from him (rare, from `fleeFrom`); rise — may join a small rising; home — may fall on him in a house.
 */
export const ROLE_REACT = {
    knight: { whisper: 25, rise: true, home: false, why: 'бьёт сам, но малой группой' },
    advisor: { whisper: 30, rise: false, home: false, why: 'предупреждает короля, сам не бьёт (заговор — Relations.plotOf)' },
    king: { whisper: 999, rise: false, home: false, why: 'старого короля нет; новый — сам игрок' },
    merchant: { whisper: 20, shopFrom: 45, shopP: 0.6, fleeFrom: 80, home: true, why: 'отказывает в торговле' },
    seller: { whisper: 20, shopFrom: 45, shopP: 0.5, fleeFrom: 80, home: true, why: 'отказывает в торговле' },
    builder: { whisper: 20, fleeFrom: 75, home: true, why: 'шепчется, прячется' },
    farmer: { whisper: 20, fleeFrom: 75, home: true, why: 'шепчется, прячется' },
    wizard: { whisper: 35, rise: false, home: true, why: 'волшебник зол, но в бунте не участвует; дома может ответить' },
    sailor: { whisper: 999, rise: false, home: false, why: 'моряки не подчиняются замку' },
};

/**
 * What a person does now because of the unrest, with a die `roll` 0…1: {kind: 'none'|'whisper'|'refuse'|'flee'}.
 * Rare on purpose — a hint of the mood, not a wall.
 */
export function reactionOf(role, reb, roll = 0.5, { trade = false } = {}) {
    const r = ROLE_REACT[role];
    if (!r || reb < REB.RAMP_FROM) return { kind: 'none' };
    if (trade && r.shopFrom != null && reb >= r.shopFrom && roll < (r.shopP ?? 0.5) * ramp(reb)) return { kind: 'refuse' };
    if (r.fleeFrom != null && reb >= r.fleeFrom && roll < 0.05) return { kind: 'flee' };
    if (reb >= r.whisper && roll < 0.15) return { kind: 'whisper' };
    return { kind: 'none' };
}

export const WHISPER_LINES = ['Это он убил нашего короля…', 'Тише… он идёт.', 'Узурпатор.', 'Не смотри на него.', 'Долго ли мы будем терпеть?'];
export const REFUSE_LINES = ['Не стану с вами торговать, Ваше Величество.', 'Нет товара для убийц.', 'Я закрыт. Для вас — закрыт.'];
export const HOME_CRY = ['Вон из моего дома, король-убийца!', 'Ты и сюда пришёл?! Не отдам!', 'Хватит с нас твоего произвола!'];
export const RISE_CRY = ['За старого короля!', 'Хватит терпеть узурпатора!', 'Смерть убийце короля!'];

/** The record from a saved state; older saves without it give an empty one (migration), junk gives an empty one. */
export function unpackRecord(s) {
    if (s == null) return blank();
    if (typeof s === 'number') return { v: valueOf({ v: s }), t: 0 };
    if (typeof s !== 'object') return blank();
    return { v: valueOf(s), t: Number(s.t) > 0 ? Number(s.t) : 0 };
}
/** The compact form for the state (only when there is something). */
export const packRecord = (rec) => (valueOf(rec) > 0 ? { v: r1(valueOf(rec)), t: (rec && rec.t) || 0 } : null);
