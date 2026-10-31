/**
 * MonsterFear.js — как мир встречает героя в форме монстра («Pentagranium Monstrum»): кто бежит, кто нападает, кто рассеивает тьму
 * (чистые правила и числа, без THREE; игровая часть — MonsterFearLife.js; тест tests/unit/monster-fear.test.js).
 *
 * Слова автора: «Когда я монстр, в основном все должны убегать от меня, если меня видят. Рыцари: 25% могут пытаться атаковать, остальные 75%
 * убегают. Король не считается: он убегает вместе с визирем. Волшебники: младшего уровня 90% убегают; среднего ~70%; высокого 45%; мастер башни
 * (глава) — 0%: он сражается и КРИЧИТ заклинание рассеивания тьмы. Про него знают волшебники высокого уровня с вероятностью 60%, среднего 35%
 * (младшие — не знают; глава — всегда). Если волшебник видит монстра и произносит его, я досрочно возвращаюсь в обычный вид».
 * Заклинание рассеивания — «Nihilis Atra» (NihilisRules.js, `Nihilis.fire` уже снимает форму монстра у героя в конусе).
 *
 * Решение принимается ОДИН раз на существо (по его id — одинаково на всех компьютерах, не мигает) и запоминается; когда — после
 * реакции по рангу (WizardMind.REACT_LAG).
 */
import { hashString } from '../core/math.js';
import { reactLevel } from './WizardMind.js';

export const MFEAR = {
    SEE: 90, // m: дальше монстра не замечают (с прямой видимостью; Danger 'monster' слышат дальше, но это тревога, а не «увидел»)
    KNIGHT_ATTACK: 0.25, // доля рыцарей, которые не боятся и идут в бой
    WIZ_FLEE: { 1: 0.9, 2: 0.7, 3: 0.45, 4: 0 }, // доля бегущих волшебников: младший / средний / высокий (учитель, старейшина) / глава башни
    DISPEL_KNOW: { 1: 0, 2: 0.35, 3: 0.6, 4: 1 }, // доля знающих «Nihilis Atra»
    LAG_OTHER: [0.4, 1.4], // с: сколько жителю нужно, чтобы осознать, что это такое (не рыцарь и не маг)
    CAST_RANGE: 22, // m: с какого расстояния маг начинает говорить рассеивание (конус бьёт на 28)
    CAST_FROM: 12, // m: подходит не ближе (монстр 24-метровый, а у мага палочка)
    CAST_COOL: 2.5, // с между двумя попытками одного мага
    FEAR_REFRESH: 0.3, // с: как часто подтверждается страх (Castle.fear держит 3 с)
    NIHILIS_COST: 40, // = NihilisRules.NIHIL.COST (мана мага)
};

const roll = (id, salt) => { // (хеш строки + перемешивание бит: броски 'бежит' и 'знает' не зависят друг от друга)
    let h = hashString(String(id) + ':mf:' + salt) >>> 0;
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
};

/** Профессия-класс существа для таблицы: 'knight' | 'king' | 'wizard' | 'other'. */
export function classOf(v) {
    if (v.role === 'knight') return 'knight';
    if (v.role === 'king' || v.role === 'advisor') return 'king';
    if (v.wizard) return 'wizard';
    return 'other';
}

/** Глава башни (мастер)? */
export const isMaster = (v) => v.rank === 'master' || v.role === 'master';

/**
 * Решение ОДНОГО существа при первом виде монстра.
 * @returns {{act:'flee'|'fight', dispel:boolean, cls:string, level:number, why:string}}
 */
export function decide(v) {
    const cls = classOf(v);
    const id = v.id;
    if (cls === 'king') return { act: 'flee', dispel: false, cls, level: 0, why: 'король/визирь убегают вместе: не бой' };
    if (cls === 'knight') {
        const brave = roll(id, 'k') < MFEAR.KNIGHT_ATTACK;
        return { act: brave ? 'fight' : 'flee', dispel: false, cls, level: 0, why: brave ? 'рыцарь не боится — идёт в бой (25%)' : 'рыцарь испугался — убегает (75%)' };
    }
    if (cls === 'wizard') {
        const level = isMaster(v) ? 4 : reactLevel(v.rank);
        const flee = level < 4 && roll(id, 'w') < MFEAR.WIZ_FLEE[level];
        const knows = level === 4 || roll(id, 'd') < MFEAR.DISPEL_KNOW[level];
        const act = flee ? 'flee' : 'fight';
        return { act, dispel: !flee && knows, cls, level, why: flee ? 'волшебник испугался — убегает' : knows ? 'волшебник знает «Nihilis Atra» — рассеет тьму' : 'волшебник не боится — дерётся' };
    }
    return { act: 'flee', dispel: false, cls, level: 0, why: 'житель испугался — убегает' };
}

/** Сколько секунд существо «осознаёт» монстра, прежде чем решить (маги — по рангу, REACT_LAG уже на v.reactLag.t). */
export function noticeDelay(v) {
    if (v.reactLag?.t != null) return v.reactLag.t;
    const [lo, hi] = MFEAR.LAG_OTHER;
    return lo + (hi - lo) * roll(v.id, 'lag');
}

/**
 * Может ли маг говорить рассеивание сейчас: палочка есть, мана есть, он не оглушён/не в воздухе, монстр в пределах CAST_RANGE.
 * @returns {'cast'|'approach'|'wait'|'no'}
 */
export function dispelStep({ mana, noWand, stunned, dist, facing, cd }) {
    if (noWand || stunned || mana < MFEAR.NIHILIS_COST) return 'no';
    if (dist > MFEAR.CAST_RANGE) return 'approach';
    if (!facing || cd > 0) return 'wait';
    return 'cast';
}

/** Таблица «кто/что» (CLAUDE.md): как каждый встречает монстра. */
export const MONSTER_FEAR_TARGETS = {
    villagers: { does: 'flee', why: 'жители, торговцы, крестьяне, строители бегут от увиденного монстра (Castle.fear + Danger «monster»)' },
    knights: { does: 'mixed', why: '25% рыцарей замка не боятся и бьют монстра (v.foe), 75% бегут' },
    king: { does: 'flee', why: 'король и визирь убегают вместе, не сражаются' },
    wizards: { does: 'mixed', why: 'младшие 90% бегут, средние 70%, высокие 45%, глава 0%; «Nihilis Atra» знают глава всегда, высокие 60%, средние 35%, младшие нет' },
    sailors: { does: 'flee', why: 'моряки — бегут (если не на корабле в бою: у них свой бой)' },
    animals: { does: 'flee', why: 'звери убегают от монстра сами (Animals)' },
    dragons: { does: 'none', why: 'дракон не боится — у него своя логика (DragonAggro)' },
    zombies: { does: 'none', why: 'зомби не боятся' },
    ice: { does: 'none', why: 'Королева, снеговики, ледяные монстры — своё замечание гиганта (IceQueen.ICE.GIANT)' },
    duel: { does: 'none', why: 'дуэль, арена, космос и планеты: правило не включается' },
    players: { does: 'none', why: 'друг-монстр для жителей такой же, как свой: решают их компьютеры (хост)' },
};
