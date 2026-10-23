/**
 * DarkMagic.js — чёрная магия (pure, no THREE, node-testable).
 *
 * Слова автора: магия, которую магическое сообщество презирает как опасную. Сюда входят «Alive», «Alive Maxima»,
 * «Авада Кедавра», «Империус» (обычный; «Империус Максима» — божественное, исключение), «Give Me My Power» и
 * ритуал дьявольской силы (пентаграмма чёрной магии с телом убитого волшебника; сама пентаграмма и «Пентаграниум» — не чёрные: вызывающий код сам даёт `addDark(hero, 1, 'ritual')`).
 *
 *  - Уровень тьмы героя 0 … 100. Каждый каст чёрного заклинания даёт +1 с шансом 50 % (`onDarkCast`);
 *    «Give Me My Power» и ритуал — всегда +1. Хранится у героя (WorldSave `dark`), у каждого игрока свой;
 *    смерть забирает как прочие прокачки, тело хранит (Legacy: captureLegacy / wipeHero / absorbLegacy).
 *  - Стадии (`darkStage`): 0 'clean'; 1–40 'hidden' (знаки слишком малы — никто не замечает, игроку ни слова);
 *    41–80 'scorned'; 81–100 'outcast'. Сообщение игроку — только на порогах 11, 41, 81 (`DARK.NOTICE_AT`).
 *  - Обнаружить чёрного мага могут ТОЛЬКО волшебники (`wizardDetects`); обычные жители — нет.
 *  - Отношение волшебников (`attitude`): в башне и городах — 41–80 презрение, лавки отказывают в 50 %
 *    (`shopRefuses`), 81–100 — ничего не продают, не учат, изгоняют (`expelled`). В малых поселениях магов и в домах
 *    одиночек всё мягче: у каждого мага своя «терпимость» из сида (`tolerance`), продаёт ~55 % при любой стадии.
 *  - Чёрные маги в мире (`darkMageLevel`): детерминированно от id (одинаково на всех компьютерах, генерацию мира
 *    не трогает — ни одного числа из потока мира не берёт).
 *  - Вид (`darkLook`): параметры для шейдерной маски на телах, одежде, доспехах и дыма; кэш по шагам 5.
 */

import { hashString } from '../core/math.js';

export const DARK = {
    MAX: 100,
    CAST_CHANCE: 0.5, // шанс +1 за каст чёрного заклинания
    HIDDEN_MAX: 40, // до этого — раны слишком малы, их не обнаружить
    SCORN_MAX: 80,  // 41…80 презрение, 81…100 изгой
    NOTICE_AT: [11, 41, 81], // игрок видит слово только на этих порогах («сначала невозможно заметить»)
    STEP: 5, // шаг кэша вида
    SHOP_REFUSE_SCORNED: 0.5, // лавки магов (города, башня) при 41…80
    SMALL_SELL: 0.55, // малое поселение / дом одиночки: продаёт при любой стадии вот таким долям магов
    DARK_MAGE_CHANCE: { lone: 0.2, wanderer: 0.15, small: 0.1, merchant: 0.08, tower: 0, town: 0.03 }, // у кого уровень задан заранее
    DARK_MAGE_MIN: 8, DARK_MAGE_MAX: 95,
    CACHE_MAX: 32,
};

/** Виды заклинаний чёрной магии (имена как в Mana / SpellBook). «ImperiusMaxima» — НЕ тут (божественное). */
/** («Пентаграниум» и сама пентаграмма сюда НЕ входят — бывают и хорошие; +1 даёт только РИТУАЛ дьявольской силы: вызывающий код сам делает addDark(hero, 1, 'ritual').) */
export const DARK_SPELLS = new Set(['Alive', 'AliveMaxima', 'AvadaKedavra', 'Imperius', 'GiveMyPower', 'Accentric']);
/** Эти всегда дают +1 (не 50 %). */
export const DARK_ALWAYS = new Set(['GiveMyPower']);
/** Вторая сессия (пентаграммы) может добавить свой вид. */
export const registerDark = (kind, always = false) => { DARK_SPELLS.add(kind); if (always) DARK_ALWAYS.add(kind); };

export const isDark = (kind) => DARK_SPELLS.has(kind);

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const clampDark = (n) => clamp(Math.floor(Number.isFinite(+n) ? +n : 0), 0, DARK.MAX);

/** 'clean' | 'hidden' | 'scorned' | 'outcast'. */
export function darkStage(level) {
    const n = clampDark(level);
    return n <= 0 ? 'clean' : n <= DARK.HIDDEN_MAX ? 'hidden' : n <= DARK.SCORN_MAX ? 'scorned' : 'outcast';
}

/** Уровень героя `hero` (то, что хранит `game.dark`, либо число / объект с `dark`). */
export function darkLevel(hero) {
    if (hero == null) return 0;
    if (typeof hero === 'number') return clampDark(hero);
    if (hero.dark != null) return darkLevel(hero.dark);
    return clampDark(hero.level);
}

/**
 * Прибавить `n` к уровню героя (`hero` — DarkHero или объект `{level}`); `why`: 'cast' | 'ritual' | 'legacy' | …
 * @returns {number} на сколько выросло
 */
export function addDark(hero, n = 1, why = 'cast') {
    const h = hero?.dark && typeof hero.dark === 'object' ? hero.dark : hero;
    if (!h) return 0;
    const was = clampDark(h.level), now = clampDark(was + n);
    h.level = now;
    if (now !== was) h.onGrow?.(was, now, why);
    return now - was;
}

/** Каст чёрного заклинания героем игры `game`: +1 с шансом 50 % (всегда у GiveMyPower / ритуала). */
export function onDarkCast(game, kind, rng = Math.random) {
    if (!isDark(kind)) return 0;
    if (!DARK_ALWAYS.has(kind) && !(rng() < DARK.CAST_CHANCE)) return 0;
    return addDark(game?.dark || game, 1, DARK_ALWAYS.has(kind) ? 'ritual' : 'cast');
}

/** Слово игроку при переходе `was → now`: только на порогах (иначе null — ранние уровни незаметны). */
export function darkNotice(was, now) {
    for (let i = DARK.NOTICE_AT.length - 1; i >= 0; i--) {
        const t = DARK.NOTICE_AT[i];
        if (was < t && now >= t) return ['Что-то тёмное шевельнулось под кожей…', 'Тёмные прожилки ползут по рукам. Волшебники будут это чувствовать.', 'Тьма почти поглотила вас. Волшебники больше вас не примут.'][i];
    }
    return null;
}

/** Герой с уровнем тьмы на игре: хранение, смерть, сохранение. */
export class DarkHero {
    constructor(game) { this.game = game; this.level = 0; }
    get stage() { return darkStage(this.level); }
    onGrow(was, now) {
        const text = darkNotice(was, now);
        if (text) this.game?.hud?.setVoice?.(`🜏 <span style="color:#9a6bd1">${text}</span>`, true);
        this.game?.net?.sendDark?.(now); // (виден другим игрокам)
    }
    onDeath() { this.level = 0; }
    snapshot() { return this.level > 0 ? { level: this.level } : null; }
    restore(s) { this.level = clampDark(s?.level); this.game?.net?.sendDark?.(this.level); }
}

// ------------------------------------------------------------------ как к этому относятся

/** Виды мест: 'tower' | 'town' (сильное презрение) · 'small' (малое поселение магов) | 'lone' (дом одиночки) (мягко). */
const HARSH = new Set(['tower', 'town']);
export const isHarsh = (settlement) => HARSH.has(settlement);

/** Какое это место для отношения магов: башня / город (строго) · малое поселение, дом одиночки, странник (мягко). */
export function placeOf(def, entry = null) {
    if (def?.kind === 'tower') return 'tower';
    if (entry?.town) return 'town';
    return def?.kind === 'hamlet' && def.wizHut ? 'lone' : 'small';
}

/** Заметит ли волшебник метки (обычные жители — никогда). */
export const wizardDetects = (level) => darkStage(level) === 'scorned' || darkStage(level) === 'outcast';

/** Терпимость мага 0…1 из сида (его id): ниже `SMALL_SELL` — торгует и не презирает. */
export const tolerance = (id) => (hashString('dark-tol|' + String(id)) % 1000) / 1000;

/** 'none' | 'scorn' | 'tolerant' | 'refuse' — как маг (`id`) этого места смотрит на героя. */
export function attitude(level, settlement, id = '') {
    const st = darkStage(level);
    if (st === 'clean' || st === 'hidden') return 'none';
    if (isHarsh(settlement)) return st === 'outcast' ? 'refuse' : 'scorn';
    return tolerance(id) < DARK.SMALL_SELL ? 'tolerant' : 'scorn';
}

/** Откажет ли лавка мага (rng — детерминированный в тестах; `id` — продавец, для малых мест). */
export function shopRefuses(level, settlement, rng = Math.random, id = null) {
    const st = darkStage(level);
    if (st === 'clean' || st === 'hidden') return false;
    if (!isHarsh(settlement)) return id != null ? tolerance(id) >= DARK.SMALL_SELL : rng() >= DARK.SMALL_SELL;
    return st === 'outcast' ? true : rng() < DARK.SHOP_REFUSE_SCORNED;
}

/** Будет ли маг учить героя (свитки, уроки). */
export const teaches = (level, settlement, id = '') => !shopRefuses(level, settlement, () => 0.99, id) && !(isHarsh(settlement) && darkStage(level) === 'outcast');

/** Изгоняют ли героя из башни / города магов (выставляют за дверь, не допускают). */
export const expelled = (level, settlement) => isHarsh(settlement) && darkStage(level) === 'outcast';

/** Реплика мага героя (null — относится как обычно). */
export function wizardLine(level, settlement, id = '') {
    const a = attitude(level, settlement, id);
    if (a === 'refuse') return 'Уходи. Тебе здесь не место, чёрный маг.';
    if (a === 'scorn') return 'От тебя несёт тьмой… Мы не одобряем такую магию.';
    return null;
}
export const REFUSE_LINE = 'Ты чёрный маг. Не продаю.';
export const EXPEL_LINE = 'Уходи.';

// ------------------------------------------------------------------ чёрные маги в мире

/**
 * Заранее заданный уровень тьмы у мага мира (0 — не чёрный). `kind`: 'lone' | 'wanderer' | 'small' | 'merchant' | 'town' | 'tower'.
 * Только от id (одинаково на всех компьютерах); потока случайных чисел мира не трогает.
 */
export function darkMageLevel(id, kind) {
    const p = DARK.DARK_MAGE_CHANCE[kind] || 0;
    if (p <= 0) return 0;
    const h = hashString('dark-mage|' + kind + '|' + String(id));
    if ((h % 10000) / 10000 >= p) return 0;
    const t = ((h >>> 8) % 1000) / 1000;
    return Math.round(DARK.DARK_MAGE_MIN + (DARK.DARK_MAGE_MAX - DARK.DARK_MAGE_MIN) * t * t * 0.5 + (DARK.DARK_MAGE_MAX - DARK.DARK_MAGE_MIN) * t * 0.5);
}

/** Малое поселение магов: 1–2 чёрных мага иногда (по id поселения и номеру мага). */
/** Волшебники: у кого из жителей мира может быть уровень тьмы (не глава башни, не старейшина). */
const WIZ = new Set(['student', 'teacher', 'seller', 'wanderer', 'townwiz', 'mage']);
/** Уровень тьмы жителя-мага места `def` (0 — не чёрный): странник, дом одиночки, малое поселение, город. По id — одинаково у всех. */
export function darkOfEntry(def, e, id) {
    if (!e || !WIZ.has(e.role) || e.elder || def?.kind === 'tower') return 0;
    const kind = def?.kind === 'wander' || e.role === 'wanderer' ? 'wanderer' : def?.kind === 'hamlet' ? (e.role === 'seller' ? 'merchant' : def.people?.length === 1 ? 'lone' : 'small') : def?.kind === 'wizvillage' ? 'small' : e.town ? 'town' : null;
    return kind ? darkMageLevel(id, kind) : 0;
}

export function settlementDarkMages(siteId, count) {
    const out = [];
    for (let i = 0; i < count; i++) { const l = darkMageLevel(siteId + '#' + i, 'small'); if (l) out.push([i, l]); }
    return out.slice(0, 2);
}

/**
 * Мелкая строка голограммы свитка («Раскрой свои секреты»): { text, color } — «Заклинание» / «Чёрная магия» (багрово-тёмная) /
 * «Пентаграмма» / «Чёрная пентаграмма» (свиток-рисунок: `stat === 'pentagram'` или `pentagram`, `dark: true`). null — не свиток.
 */
export function scrollKindLabel(item) {
    if (!item || item.kind !== 'scroll') return null;
    if (item.stat === 'pentagram' || item.pentagram) return item.dark ? { text: 'Чёрная пентаграмма', color: '#8a1030' } : { text: 'Пентаграмма', color: '#b9b2a6' };
    if (item.stat === 'spell') return isDark(item.spell) ? { text: 'Чёрная магия', color: '#8a1030' } : { text: 'Заклинание', color: '#b9b2a6' };
    return null;
}

// ------------------------------------------------------------------ вид

const _cache = new Map();
/**
 * Параметры вида для уровня (шаг 5): spots 0…1 (пятна, до ~10 почти не видны), veins 0…1 (прожилки, ясно с 40),
 * black 0…1 (тело чернеет к 100), smoke 0…1 (частиц в секунду × SMOKE_RATE), cloth 0…1 (одежда темнеет),
 * crack 0…1 (трещины доспехов), magicCrack (магические — слабее). Объекты общие — не менять.
 */
export function darkLook(level) {
    const n = clampDark(level);
    const s = n <= 0 ? 0 : Math.min(DARK.MAX, Math.ceil(n / DARK.STEP) * DARK.STEP);
    let l = _cache.get(s);
    if (l) return l;
    const f = s / DARK.MAX;
    l = Object.freeze({
        step: s,
        spots: s <= 10 ? s * 0.004 : Math.min(1, 0.04 + (s - 10) * 0.0105),
        veins: s < 20 ? 0 : clamp((s - 20) / 60, 0, 1),
        black: s < 60 ? 0 : clamp((s - 60) / 40, 0, 1),
        smoke: s < 20 ? 0 : clamp(f * f * 1.2, 0, 1),
        cloth: clamp(f * 0.95, 0, 0.95),
        crack: s < 15 ? 0 : clamp((s - 10) / 90, 0, 1),
        magicCrack: s < 15 ? 0 : clamp((s - 10) / 90, 0, 1) * 0.5,
    });
    if (_cache.size >= DARK.CACHE_MAX) _cache.clear();
    _cache.set(s, l);
    return l;
}
