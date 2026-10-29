/**
 * DarkLord.js — «НАСТОЯЩИЙ ТЁМНЫЙ МАГ» (pure, no THREE, node-testable). Игровая часть — DarkLordLife.js.
 *
 * Слова автора: достиг 100-го уровня чёрной магии — становишься настоящим тёмным магом.
 *  - ПРЕВРАЩЕНИЕ. Уровень тьмы стал 100: если герою никто не мешает — сразу; бой/угроза/сон/вода/дуэль/Империус — ждём, потом
 *    начинается (`blocker`). Надпись «Вы стали настоящим тёмным магом», герой парит, вокруг него вихрь тьмы (`LORD.T_*`).
 *  - ОБЛИК. Одежда меняется на тёмную, тёмная накидка и капюшон (лицо в тени); палочка и щиты — тёмные (свойства те же).
 *  - МАНТИЯ. Магическая мантия героя ПОГЛОЩАЕТСЯ нарядом (`lordRobe`): запас прочности, ранг, сильные заклинания остаются.
 *    Мантии не было — наряд всё равно надет (простой, без запаса). Снять нельзя: «Вы не можете снять эту мантию…» (`CURSE_LINE`).
 *  - МЕТКА «слом защиты» (BreakwardMark) на 100 уровне снимается сама, с сообщением.
 *  - МИР. Таблица `LORD_REACT`: кто нападает, кто бежит, кто торгует (дороже в 1,5–2 раза), кто отказывает.
 *  - ДОСПЕХИ. Любой доспех на тёмном маге чернеет и ломается: обычный через 600 с носки, магический через 1200 с
 *    (`curseTick`). Время копится по самой вещи (`curseT`): снял — не идёт, надел снова — продолжается; сохраняется вместе с вещью.
 *    Магическая мантия-наряд сама не ломается (на нулевом запасе просто не отбивает — это правило ArmorTypes).
 *  - СНЯТИЕ — только «Зелье снятия проклятия тёмного мага» (`CURE`): пёрышко феникса → золотое яблоко → «Груша Баксади», одна бутылочка.
 *    Цена — ячейки маны (максимум маны): ≥ 500 — снимает наверняка и берёт 500; 100…499 — шанс растёт от 20 % (100) до 100 % (500),
 *    берёт все; < 100 — не срабатывает. Предупреждение перед питьём (`cureWarning`).
 */

import { hashString } from '../core/math.js';

export const LORD = {
    LEVEL: 100, // уровень тьмы, с которого герой — тёмный маг
    QUIET_S: 6, // сколько секунд после последнего удара/угрозы считается «бой»
    RISE_H: 5.5, // м над стартовой точкой, где парит герой
    T_GATHER: 2.2, // с: тьма стягивается, герой начинает подниматься
    T_RISE: 3.0, // с: подъём
    T_HOLD: 2.6, // с: парит, тьма на пике, одежда меняется (в середине)
    T_FALL: 2.8, // с: опускается обратно
    T_TEXT: 5, // с: крупная надпись на экране
    ARMOR_PLAIN_S: 600, // обычный доспех на тёмном маге ломается через столько секунд носки (10 минут)
    ARMOR_MAGIC_S: 1200, // магический — через 20 минут
    SELL_UP: [1.5, 2.0], // во сколько раз дороже продаёт тот, кто согласен торговать
    SELL_SHARE: 0.5, // доля торговцев, что согласны (остальные отказывают)
    FLEE_SHARE: 0.2, // доля торговцев, что убегают
    SEE_R: 46, // м: дальше этого житель героя не замечает
    SCAN_S: 1.5, // с между осмотрами жителей (хост)
    ROBE_COLOR: 0x0d0b14, // чёрно-фиолетовая ткань наряда
    WAND_COLOR: 0x15101c,
    WAND_TRIM: 0x4a1a6a,
    SHIELD_COLOR: 0x1a0830, // тёмный щит Protection
    SHIELD_EDGE: 0x6a1ad0,
};

export const CURSE_LINE = 'Вы не можете снять эту мантию, так как она часть вас самих. На вас проклятие. Вы должны снять его.';
export const BECAME_LINE = 'Вы стали настоящим тёмным магом';
export const MARK_GONE_LINE = 'Защитная метка снята: тьма поглотила её.';
export const WAIT_LINE = 'Тьма зовёт вас, но сейчас не время. Она подождёт, пока вокруг станет спокойно.';
export const BROKEN_LINE = 'Ваши доспехи сломаны проклятием тёмного мага';

// ------------------------------------------------------------------ когда начинать

/**
 * Что мешает превращению прямо сейчас (null — можно). `s` — срез состояния игры (DarkLordLife.sense):
 * { dead, down, lifted, swimming, sleeping, imperius, duel, arena, danger, sinceHit (с), seated, ghost }.
 * @returns {string|null}
 */
export function blocker(s) {
    if (!s) return 'нет данных';
    if (s.dead) return 'dead';
    if (s.sleeping) return 'сон';
    if (s.imperius) return 'чужое тело';
    if (s.duel || s.arena) return 'дуэль';
    if (s.down || s.lifted) return 'на земле / в чужой власти';
    if (s.swimming) return 'вода';
    if (s.danger) return 'угроза рядом';
    if ((s.sinceHit ?? 1e9) < LORD.QUIET_S) return 'бой';
    return null;
}

/** Где на кривой подъёма мы: фаза и доля внутри неё (0…1). `t` — секунд с начала. */
export function phaseAt(t) {
    const a = LORD.T_GATHER, b = a + LORD.T_RISE, c = b + LORD.T_HOLD, d = c + LORD.T_FALL;
    if (t < a) return { phase: 'gather', k: t / a };
    if (t < b) return { phase: 'rise', k: (t - a) / LORD.T_RISE };
    if (t < c) return { phase: 'hold', k: (t - b) / LORD.T_HOLD };
    if (t < d) return { phase: 'fall', k: (t - c) / LORD.T_FALL };
    return { phase: 'done', k: 1 };
}
export const TOTAL_T = LORD.T_GATHER + LORD.T_RISE + LORD.T_HOLD + LORD.T_FALL;

const ease = (x) => x * x * (3 - 2 * x);
/** Высота парения над стартом в момент `t` (плавно вверх, держится, плавно вниз). */
export function heightAt(t) {
    const { phase, k } = phaseAt(t);
    return phase === 'rise' ? LORD.RISE_H * ease(k) : phase === 'hold' ? LORD.RISE_H : phase === 'fall' ? LORD.RISE_H * (1 - ease(k)) : 0;
}
/** Сила вихря тьмы 0…1 (к пику растёт, на спаде гаснет). */
export function darknessAt(t) {
    const { phase, k } = phaseAt(t);
    return phase === 'gather' ? 0.35 * ease(k) : phase === 'rise' ? 0.35 + 0.65 * ease(k) : phase === 'hold' ? 1 : phase === 'fall' ? 1 - 0.55 * ease(k) : 0.45;
}
/** Когда меняется одежда: в разгар тьмы, когда героя не видно. */
export const SWAP_AT = LORD.T_GATHER + LORD.T_RISE + LORD.T_HOLD * 0.35;

// ------------------------------------------------------------------ мантия-наряд

/** Старая мантия (или нет) → наряд тёмного мага. Запас прочности, ранг, сильные заклинания, зачарование остаются теми же. */
export function lordRobe(old, uid) {
    if (old?.lord) return old;
    if (old && old.kind === 'robe' && !old.archmage) {
        const r = { ...old, lord: true, was: { color: old.color ?? 0, absorbed: true } };
        r.color = LORD.ROBE_COLOR;
        return r;
    }
    // (мантии не было — наряд всё равно надет: простая ткань, запаса нет)
    return { kind: 'robe', uid: uid || `lord-${Date.now().toString(36)}`, magic: false, color: LORD.ROBE_COLOR, lord: true, was: { color: 0, absorbed: false } };
}

/** Проклятие снято: наряд-мантия. Поглощённая старая мантия возвращается обычной (её можно снять); выданная проклятием — исчезает (null). */
export function unlordRobe(robe) {
    if (!robe?.lord) return robe;
    if (!robe.was?.absorbed) return null;
    const r = { ...robe, color: robe.was.color ?? 0 };
    delete r.lord; delete r.was;
    return r;
}

export const isLordRobe = (it) => !!it?.lord;

/** Это мантию с тёмного мага снять нельзя. */
export const cannotTakeOff = (it) => isLordRobe(it);

// ------------------------------------------------------------------ проклятие на доспехах

/** Через сколько секунд носки ломается этот доспех (мантия не в счёте — null). */
export function curseSeconds(item) {
    if (!item || item.kind !== 'armor') return null;
    return item.magic || item.named ? LORD.ARMOR_MAGIC_S : LORD.ARMOR_PLAIN_S;
}

/**
 * Секунда носки доспеха тёмным магом: чернеет сразу, время копится по самой вещи.
 * @returns {boolean} true — доспех сломался (вызывающий убирает его и говорит `BROKEN_LINE`)
 */
export function curseTick(item, dt) {
    const need = curseSeconds(item);
    if (need == null || !(dt > 0)) return false;
    item.cursed = true;
    item.curseT = Math.min(need, Math.max(0, +item.curseT || 0) + dt);
    return item.curseT >= need;
}

/** Сколько секунд носки осталось доспеху (null — не проклят/не доспех). */
export function curseLeft(item) {
    const need = curseSeconds(item);
    return need == null || !item.cursed ? null : Math.max(0, need - (+item.curseT || 0));
}

/** Снятие проклятия: доспех перестаёт быть чёрным и ломаться (накопленное время обнуляется). */
export function uncurse(item) {
    if (!item) return;
    delete item.cursed; delete item.curseT;
}

// ------------------------------------------------------------------ зелье снятия

export const CURE = {
    ID: 'lordcure',
    NAME: 'Зелье снятия проклятия тёмного мага',
    INGREDIENTS: { phoenixFeather: 1, apple: 1, baksadi_pear: 1 }, // apple — золотое яблоко
    ORDER: ['phoenixFeather', 'apple', 'baksadi_pear'], // перо феникса → золотое яблоко → груша Баксади
    BREW: [150, 210], // с: варится дольше всех
    PORTIONS: 1, // бутылочка ровно одна
    CRUMBLE_S: 6, // с: после первой бутылочки остальное темнеет и осыпается
    FULL_CELLS: 500, // с такого запаса ячеек маны — наверняка, и берёт столько
    MIN_CELLS: 100, // меньше — не срабатывает
    P_AT_MIN: 0.2, // шанс при 100 ячейках (линейно до 1 при 500) — автор число не назвал, взято 20 %
};

/** Шанс, что зелье сработает при `cells` ячейках маны. */
export function cureChance(cells) {
    const c = Math.max(0, +cells || 0);
    if (c >= CURE.FULL_CELLS) return 1;
    if (c < CURE.MIN_CELLS) return 0;
    return CURE.P_AT_MIN + (1 - CURE.P_AT_MIN) * (c - CURE.MIN_CELLS) / (CURE.FULL_CELLS - CURE.MIN_CELLS);
}

/** Сколько ячеек возьмёт питьё: 500, а если меньше — все, что есть (от 100); < 100 — ничего не берёт, ничего и не даёт. */
export function cureCost(cells) {
    const c = Math.max(0, Math.floor(+cells || 0));
    return c >= CURE.FULL_CELLS ? CURE.FULL_CELLS : c >= CURE.MIN_CELLS ? c : 0;
}

/** Выпили: { ok, cost, chance }. rng — детерминированный в тестах. */
export function cureRoll(cells, rng = Math.random) {
    const chance = cureChance(cells), cost = cureCost(cells);
    const ok = chance >= 1 ? true : chance > 0 && rng() < chance;
    return { ok, cost, chance };
}

/** Предупреждение перед питьём (первое поднесение ко рту). */
export function cureWarning(cells) {
    const c = Math.floor(+cells || 0);
    if (c >= CURE.FULL_CELLS) return `Если вы выпьете это зелье, ваша сила изменится: вы потеряете ${CURE.FULL_CELLS} ячеек маны. Проклятие будет снято наверняка. Поднесите колбу ко рту ещё раз, чтобы выпить.`;
    if (c >= CURE.MIN_CELLS) return `Если вы выпьете это зелье, ваша сила изменится: вы потеряете все ячейки маны (у вас их ${c}). Но вам не хватает до ${CURE.FULL_CELLS}: проклятие снимется лишь с вероятностью ${Math.round(cureChance(c) * 100)} %. Поднесите колбу ко рту ещё раз, чтобы выпить.`;
    return `У вас всего ${c} ячеек маны — этого мало (нужно хотя бы ${CURE.MIN_CELLS}). Зелье не сработает и пропадёт зря. Поднесите колбу ко рту ещё раз, только если всё равно хотите его выпить.`;
}

// ------------------------------------------------------------------ мир реагирует

/** Реакции: 'attack' нападает (рыцари, стража), 'flee' убегает, 'trade' торгует по-своему (отказ/дороже), 'scorn' презирает. */
export const LORD_REACT = {
    knight: { do: 'attack', why: 'рыцари обычного города нападают сами' },
    king: { do: 'attack', why: 'король зовёт стражу' },
    advisor: { do: 'flee', why: 'визирь прячется' },
    farmer: { do: 'flee', why: 'крестьяне убегают' },
    builder: { do: 'flee', why: 'строители убегают' },
    merchant: { do: 'trade', why: 'часть торговцев отказывает, часть продаёт дороже, немногие убегают' },
    wizard: { do: 'wizard', why: 'в башне и городах маги нападают группой; в малых поселениях презирают, но могут торговать; странники бегут' },
    servant: { do: 'none', why: 'слуга идёт за хозяином' },
    sailor: { do: 'flee', why: 'моряки обходят' },
    other: { do: 'flee', why: 'остальные люди убегают' },
};

const h01 = (id, salt) => (hashString(`lord|${salt}|${String(id)}`) % 10000) / 10000;

/**
 * Что делает этот житель при виде тёмного мага.
 * @param {{role?:string, id?:string|number, wizard?:boolean, wanderer?:boolean}} p
 * @param {'tower'|'town'|'small'|'lone'|null} place — для магов (placeOf из DarkMagic)
 * @returns {{do:'attack'|'flee'|'trade'|'scorn'|'none', refuse?:boolean, mult?:number, say?:string}}
 */
export function reaction(p, place = null) {
    const role = p?.wizard ? 'wizard' : (LORD_REACT[p?.role] ? p.role : 'other');
    const base = LORD_REACT[role].do;
    if (base === 'trade') {
        const u = h01(p.id, 'trade');
        if (u < LORD.FLEE_SHARE) return { do: 'flee' };
        return u < LORD.FLEE_SHARE + (1 - LORD.FLEE_SHARE) * LORD.SELL_SHARE ? { do: 'trade', refuse: true } : { do: 'trade', refuse: false, mult: sellMult(p.id) };
    }
    if (base === 'wizard') {
        if (p.wanderer || p.role === 'wanderer') return { do: 'flee' };
        if (place === 'tower' || place === 'town') return h01(p.id, 'fight') < 0.7 ? { do: 'attack' } : { do: 'flee' };
        // (малое поселение, дом одиночки: презрение; кто терпимее — торгует дороже)
        const t = h01(p.id, 'tol');
        if (t < 0.4) return { do: 'scorn', refuse: false, mult: sellMult(p.id) };
        return t < 0.7 ? { do: 'scorn', refuse: true } : { do: 'flee' };
    }
    return { do: base };
}

/** Во сколько раз дороже продаёт этот торговец (1,5…2, у каждого своя). */
export function sellMult(id) {
    const [a, b] = LORD.SELL_UP;
    return Math.round((a + (b - a) * h01(id, 'mult')) * 100) / 100;
}

/** Цена для тёмного мага. */
export const lordPrice = (price, id) => Math.max(1, Math.round(price * sellMult(id)));

export const LORD_LINES = {
    flee: ['Тёмный маг! Спасайтесь!', 'Это он… не смотрите ему в глаза!', 'Тьма идёт! Бежим!'],
    attack: ['Тёмный маг! Взять его!', 'Не пускать тьму в наш город!', 'За мной! Он проклят!'],
    refuse: ['С тобой я дела не имею.', 'Не продаю таким, как ты.'],
    sell: ['Деньги не пахнут… но цена теперь другая.', 'Хм. Продам, но по другой цене.'],
    scorn: ['От тебя несёт тьмой. Но золото — это золото.', 'Ты потерян для нас, чёрный маг.'],
};

/** Эффективная «чернота кожи» для оценки магов: у тёмного мага — всегда 100 (его признаки не скрыть зельем светлого ума). */
export const effectiveSkin = (skin, lord) => (lord ? 100 : skin | 0);

// ------------------------------------------------------------------ сохранение

export function snapshotLord(s) {
    return s?.on ? { on: 1, t: Math.round(s.since || 0) } : null;
}
