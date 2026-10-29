/**
 * HellKills.js — «Let the Hellfire Come» — заклинание ЧЁРНОЙ магии (pure, no THREE, node-testable).
 *
 * Слова автора: сам каст «Hellfire» уровень чёрной магии НЕ повышает (`DarkMagic.DARK_NO_CAST`); зато +1 за КАЖДОГО человекоподобного,
 * которого убило именно оно (волшебник, рыцарь, король, житель, моряк, Ледяная Королева, другой игрок — любое человекоподобное;
 * животные, зомби, скелеты, драконы, деревья, пауки, птицы — нет). Убийство засчитывается один раз (`HellLedger`, мёртвых заново не учитываем),
 * на хосте: автору (в сети — игроку-убийце, `creditKill` → сообщение `mcred` с `dark`). «Убило Hellfire» — последний удар по жертве был его
 * огнём или горением, начатым им (`Burning.ignite(.., hell)`), не больше `HELL.WINDOW` мс назад.
 *
 * Кто/что (CLAUDE.md): таблица `HELL_KILL_TARGETS` — засчитывается ли убийство каждого вида.
 */

export const HELL = {
    DARK: 1, // за каждого убитого человекоподобного
    WINDOW: 3000, // мс: удар огнём Hellfire (или горение от него) и смерть — это одно убийство
    LEDGER_MAX: 400, // сколько последних убитых помним (список с пределом)
    NAME: 'Hellfire',
};

/** Кто/что × засчитывается ли убийство Hellfire в чёрную магию. */
export const HELL_KILL_TARGETS = {
    me: { counts: true, why: 'игрок — человекоподобный: убитого Hellfire игрока (на его компьютере) засчитывает убийце хост/сообщение pdead' },
    players: { counts: true, why: 'другой игрок убит Hellfire — +1 автору огня (в сети хост начисляет игроку-автору)' },
    zombies: { counts: false, why: 'зомби — не человекоподобное существо для этого правила (нежить)' },
    castlePeople: { counts: true, why: 'рыцарь, король, волшебник, торговец, житель, странник — все человекоподобные: +1 за каждого' },
    animals: { counts: false, why: 'животные не человекоподобные' },
    sailors: { counts: true, why: 'моряк (в т. ч. капитан Чёрные Усы) — человек: +1; скелет экипажа — нежить, не считается', skeleton: false },
    spider: { counts: false, why: 'паучиха — не человекоподобная' },
    livingTrees: { counts: false, why: 'ожившее дерево — не человекоподобное' },
    bookBirds: { counts: false, why: 'книги-птицы не человекоподобные' },
    iceCastle: { counts: true, why: 'только Ледяная Королева (человекоподобная): +1; снеговики и ледяные монстры — нет', only: 'queen' },
    blackship: { counts: false, why: 'корабль — не существо' },
    dragon: { counts: false, why: 'дракон — не человекоподобный (и огонь на него не действует)' },
    phoenix: { counts: false, why: 'феникс не человекоподобный' },
    owl: { counts: false, why: 'сова не человекоподобная' },
    gargoyles: { counts: false, why: 'горгульи (адские) огнём ада не ранятся' },
};

/** Человекоподобен ли убитый (вид из `Duel._bodies`: 'v' житель, 'c' моряк, 'I' ледяной, 'p' игрок; `role` / `type`). */
export function humanoid(kind, role = null) {
    if (kind === 'v' || kind === 'p') return true;
    if (kind === 'c') return role !== 'skeleton';
    if (kind === 'I') return role === 'queen';
    return false;
}

/** Убил ли жертву огонь Hellfire: время последнего «адского» удара `t` (мс по `now`) в пределах окна. */
export const hellRecent = (t, now) => !!t && now - t >= 0 && now - t <= HELL.WINDOW;

/** Реестр уже засчитанных убитых (с пределом): мёртвого дважды не учитываем. */
export class HellLedger {
    constructor() { this.done = new Set(); }
    /** @returns {boolean} true — засчитать (первый раз) */
    claim(id) {
        if (id == null) return false;
        const k = String(id);
        if (this.done.has(k)) return false;
        this.done.add(k);
        if (this.done.size > HELL.LEDGER_MAX) this.done.delete(this.done.values().next().value);
        return true;
    }
    clear() { this.done.clear(); }
}

/**
 * Хост: человекоподобного `kind`/`role` с идентификатором `id` убил Hellfire игрока `by`. Один раз на жертву.
 * `credit(by, {dark, how})` — `Mana.creditKill` (своему — сразу, чужому — сообщение).
 */
export function hellKill(ledger, credit, by, kind, role, id) {
    if (by == null || !humanoid(kind, role) || !ledger.claim(kind + ':' + id)) return 0;
    credit(by, { dark: HELL.DARK, how: 'hellfire' });
    return HELL.DARK;
}
