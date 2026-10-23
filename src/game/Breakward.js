/**
 * Breakward.js — «Пентаграмма слома магической защиты» (`PENTAGRAMS.breakward`): чистые правила, без THREE.
 *
 * Слова автора: встал на пентаграмму, заплатил 50 маны — на герое невидимая МЕТКА «слом защиты». Метка снимает магические
 * ограничения (но ценой риска):
 *  1. ЯЧЕЙКИ. Заклинание, которому нужно «N ячеек (максимум маны)», можно сказать, имея только ману, которая его стоит
 *     (Total Destruction: 80 маны и 100 ячеек → хватит 80 маны). Если ячеек ПО ПРАВИЛАМ не хватало — 23 % «беда» (`breakwardMishap`).
 *     Заклинания БОГОВ (`Mana.GOD_SPELLS`, `ProtectionGods.isDivine`) метка не снимает: «на то они и божественные».
 *  2. КОНЦЕНТРАЦИЯ. Удерживаемое заклинание продолжает жить, когда мана кончилась: полоска становится ЧЁРНОЙ и «риск» растёт
 *     на 1 %/с; каждые 5 с бросок с шансом = текущему проценту (5, 10, 15 … 100 %). Пока не стряслось — мана не списывается.
 *     Беда → `HOLD_TABLE`; риск сбрасывается, мана 0. Мана вернулась выше 0 — полоска снова синяя, риск убывает.
 *  Метка: держится до смерти (смерть снимает, зельем не снять); сохраняется в сохранении игрока; платить 50 маны каждый раз.
 *  Чёрная магия: +1 к уровню за каждое использование пентаграммы (`addDark(hero, 1, 'ritual')`).
 *
 * Все числа и таблицы — здесь, в одном месте.
 */

import { GOD_SPELLS } from './Mana.js';

export const BREAKWARD = {
    ID: 'breakward',
    COST: 50, // маны за встать на пентаграмму
    DARK: 1, // +1 к чёрному уровню за каждое использование
    DARK_WHY: 'ritual',
    // ячейки
    MISHAP_CHANCE: 0.23, // если ячеек по правилам не хватало
    BIG_GAP: 100, // разрыв (нужно − есть) от которого возможна взорвавшаяся палочка
    WAND_OF_ALL: 0.01, // ≈1 % ВСЕХ таких заклинаний при большом разрыве — палочка
    // концентрация
    RISE: 1, // % риска в секунду, пока мана 0
    FALL: 2, // % риска в секунду, пока мана снова есть
    ROLL_EVERY: 5, // секунд между бросками
};

/** Исходы «беды» при обходе ячеек: веса (сумма не важна). Палочка — только при большом разрыве, её вес вычисляется из `WAND_OF_ALL`. */
export const CELL_TABLE = [
    { kind: 'fizzle', w: 0.55, hint: 'Заклинание вышло из-под контроля — не сработало' },
    { kind: 'wild', w: 0.45, hint: 'Заклинание вышло из-под контроля — взрыв не там, где ждали' },
];
/** «Дикий» взрыв: куда и насколько — веса `modes`. */
export const WILD_MODES = [
    { mode: 'shift', w: 0.4, dist: [6, 24], power: [0.6, 1.0] }, // не в той точке (в сторону)
    { mode: 'weak', w: 0.3, dist: [0, 3], power: [0.25, 0.5] }, // там же, но слабее
    { mode: 'near', w: 0.3, dist: [3, 9], power: [0.5, 0.9] }, // ближе к герою
];

/** Беды удерживаемого: веса. Все обрывают заклинание. `blast` — взрыв у героя, `knock` — отброс. */
export const HOLD_TABLE = [
    { kind: 'stop', w: 41, blast: 0, knock: false, hint: 'Заклинание вышло из-под контроля — оборвалось' },
    { kind: 'blast', w: 30, blast: 1, knock: true, hint: 'Заклинание вышло из-под контроля — взрыв и отброс' },
    { kind: 'knock', w: 25, blast: 0, knock: true, hint: 'Заклинание вышло из-под контроля — вас отбросило' },
    { kind: 'wand', w: 4, blast: 0.5, knock: true, hint: 'Заклинание вышло из-под контроля — палочка взорвалась' },
];

export const MARK_HINT = 'Метка слома защиты наложена';
export const MARK_NOTE = '🜏 Слом защиты: ячейки не нужны — но заклинание может вырваться из-под контроля';
export const BLACK_HINT = 'Мана кончилась — заклинание держится на чёрной силе';

/** Метка не снимает требования у заклинаний богов. */
export const canBypass = (kind) => !(kind && GOD_SPELLS.has(kind));

/** Сколько ячеек не хватало (0: хватало). */
export const deficitOf = (have, need) => Math.max(0, Math.floor(Number(need) || 0) - Math.floor(Number(have) || 0));

const pick = (table, rng, wOf = (e) => e.w) => {
    let sum = 0;
    for (const e of table) sum += wOf(e);
    let r = rng() * sum;
    for (const e of table) { r -= wOf(e); if (r < 0) return e; }
    return table[table.length - 1];
};
const lerp = (r, [a, b]) => a + (b - a) * r;

/**
 * Беда при обходе ячеек. Ячеек хватало — риска нет (null). Иначе 23 %: fizzle / wild (+ параметры) / wand (только при
 * разрыве ≥ BIG_GAP; доля 1 % всех кастов).
 * @returns {null | {kind: 'fizzle'|'wild'|'wand', hint: string, mode?: string, dist?: number, power?: number, ang?: number}}
 */
export function breakwardMishap(deficitCells, rng = Math.random) {
    if (!(deficitCells > 0)) return null;
    if (!(rng() < BREAKWARD.MISHAP_CHANCE)) return null;
    const big = deficitCells >= BREAKWARD.BIG_GAP;
    const wandW = big ? BREAKWARD.WAND_OF_ALL / BREAKWARD.MISHAP_CHANCE : 0; // доля среди бед
    const table = wandW > 0 ? [...CELL_TABLE.map((e) => ({ ...e, w: e.w * (1 - wandW) })), { kind: 'wand', w: wandW, hint: 'Заклинание вышло из-под контроля — палочка взорвалась' }] : CELL_TABLE;
    const o = pick(table, rng);
    if (o.kind !== 'wild') return { kind: o.kind, hint: o.hint };
    const m = pick(WILD_MODES, rng);
    return { kind: 'wild', hint: o.hint, mode: m.mode, dist: lerp(rng(), m.dist), power: lerp(rng(), m.power), ang: rng() * Math.PI * 2 };
}

/** Беда удерживаемого: строка `HOLD_TABLE`. */
export const holdOutcome = (rng = Math.random) => pick(HOLD_TABLE, rng);

/** Шансы и тексты в числах (для тестов, Codex). */
export const wandChanceOfAll = () => BREAKWARD.MISHAP_CHANCE * (BREAKWARD.WAND_OF_ALL / BREAKWARD.MISHAP_CHANCE);

/**
 * Чёрная полоска: риск 0…100 %. `step(dt, dry, rng)`: `dry` — мана 0 и удерживаемое заклинание просит ещё.
 * @returns {{roll:number, chance:number, hit:boolean, outcome:object|null}[]} броски за шаг
 */
export class BlackBar {
    constructor() { this.pct = 0; this.acc = 0; this.black = false; }
    reset() { this.pct = 0; this.acc = 0; this.black = false; }
    step(dt, dry, rng = Math.random, hold = true) {
        const out = [];
        if (dry && hold) {
            this.black = true;
            // (шагами по секунде, чтобы большой dt не перескочил бросок)
            let left = dt;
            while (left > 1e-9) {
                const s = Math.min(left, BREAKWARD.ROLL_EVERY - this.acc);
                left -= s;
                this.pct = Math.min(100, this.pct + BREAKWARD.RISE * s);
                this.acc += s;
                if (this.acc >= BREAKWARD.ROLL_EVERY - 1e-9) {
                    this.acc = 0;
                    const chance = Math.round(this.pct * 1e6) / 1e6;
                    const roll = rng();
                    const hit = roll * 100 < chance || chance >= 100;
                    out.push({ roll, chance, hit, outcome: hit ? holdOutcome(rng) : null });
                    if (hit) { this.pct = 0; this.acc = 0; this.black = false; break; }
                }
            }
        } else if (dry) {
            this.reset(); // (держать нечего)
        } else {
            this.black = false;
            this.acc = 0;
            this.pct = Math.max(0, this.pct - BREAKWARD.FALL * dt);
        }
        return out;
    }
}
