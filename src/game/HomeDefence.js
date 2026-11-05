/**
 * HomeDefence.js — «страх → свой дом → заперся → обороняется» (чистые правила и числа, без THREE; игровая часть — HomeDefenceLife.js).
 *
 * Слова автора: «жители должны стараться БЕЖАТЬ В СВОЙ СОБСТВЕННЫЙ ДОМ, ЗАКРЫВАТЬСЯ там и ОТСТАИВАТЬ свой дом… В доме он ЗАКРЫВАЕТСЯ и
 * пытается ЗАЩИТИТЬСЯ — может взять какой-то предмет (топор, что у него там есть в сундуках)… Не будет такого, что в доме все просто стоят.
 * Это должен быть настолько редкий случай».
 *
 * Как это идёт у одного человека (v.hd):
 *   бежит (VillagerFear: shelter, скорость бега) → вошёл → 'bar' (дверь закрылась — запирает изнутри) → 'arm' (топор/молот/нож из
 *   сундука дома или своё; нет ничего — кулаки) → 'post' (боец: сбоку от проёма, лицом к двери, оружие наготове) / 'hide' (ребёнок,
 *   старик, раненый: в дальний угол, пригнулся) → враг вошёл → 'fight' (бьёт вместе с домашними, не больше 3 на одного) →
 *   опасность прошла → 'peek' (выглянуть) → 'out' (отпер и вышел к своим делам).
 *
 * «Кто/что» (HOME_TARGETS): кто бежит домой и как себя ведёт внутри. Рыцари/стража не прячутся (старые правила), волшебники — WizardLife,
 * король и визирь — глубже в замок (VillagerFear), торговец у прилавка — в здание своей лавки (дом здания) после того, как сделка кончилась.
 */

import { fightsInMob, weaponFor } from './Audacity.js';

export const WALK_SPEED = 2.3, RUN_SPEED = 5.6; // (те же числа, что в CastleLife.WALK/RUN)

export const HOME = {
    RUN_ELDER: 0.7, // старик бежит на 70 % (было 55 %: рядом с ходьбой — «идёт с поднятыми руками»)
    RUN_MIN_K: 1.6, // испуганный бежит не медленнее, чем в 1,6 раза быстрее шага (тест)
    OWN_BONUS: 70, // м: свой дом «стоит» столько метров бега (раньше 15): бежит домой, а не в ближайший
    OWN_REACH: 95, // м: дальше своего дома не ищет (дальше — ближайший)
    BAR_WAIT: 6, // с: ждёт своих у двери (домашние ещё бегут) — потом запирает всё равно
    DOOR_SHUT: 0.08, // рад: дверь «закрыта»
    KNOCK_R: 10, // м: свой, бегущий к запертому дому, ближе этого — ему отпирают
    ARM_T: 1.4, // с: роется в сундуке
    ARM_REACH: 12, // м: сундук дома дальше этого не ищет (в другой комнате/этаже — пропускает)
    ARM_GIVE_UP: 7, // с: не дошёл до сундука — берёт своё
    CHEST_ARMS: 0.6, // шанс, что в сундуке дома лежит что-то тяжёлое/острое (остальное — еда, одежда)
    POST_SIDE: 2.3, // м: стоит сбоку от линии двери (не в проёме)
    POST_DEEP: 2.2, // м: вглубь от входа
    HIDE_K: 0.7, // доля пути «от входа к центру» до укромного места
    FIGHT_MAX: 3, // не больше стольких на одного врага
    INSIDE_R: 1.1, // × радиус дома: «враг в доме» (по горизонтали от центра)
    DOOR_R: 3.2, // м: враг у выломанной/открытой двери — тоже «входит»
    LEASH: 4, // м: враг ушёл дальше радиуса дома на столько — отпускают, возвращаются на пост
    CALM_OUT: 20, // с: никого рядом (не ближе FAR_R) — можно выходить
    FAR_R: 30, // м
    PEEK_T: 5, // с: смотрит из-за двери
    STAGGER: 1.5, // с: выходят не разом
    BRAVE_MEN: 0.1, // порог храбрости взрослого мужчины (из семени 0…1) — почти все
    BRAVE_WOMEN: 0.25,
    BRAVE_MERCHANT: 0.2,
    HP_FIT: 0.4, // раненее — прячется
    IDLE_MAX_SHARE: 0.1, // «стоит без дела» — не больше десятой доли испуганных
    IDLE_LOG_GAP: 12, // с: строку «стоит без дела» пишут не чаще
};

/** Чем можно бить дома: урон (кулак 1, вилы/молот/нож 2 — как у толпы, топор 3) и красивое имя. */
export const HOME_WEAPONS = {
    axe: { dmg: 3, ru: 'топор', rank: 4 },
    hammer: { dmg: 2, ru: 'молот', rank: 3 },
    pitchfork: { dmg: 2, ru: 'вилы', rank: 3 },
    hoe: { dmg: 2, ru: 'мотыга', rank: 2 },
    knife: { dmg: 2, ru: 'кухонный нож', rank: 2 },
    none: { dmg: 1, ru: 'кулаки', rank: 0 },
};

/** Что лежит в сундуках по назначению дома (`flavor`, Items.rollStoreLoot) → чем можно вооружиться. */
export const CHEST_ARMS = {
    arms: ['axe', 'hammer', 'axe'],
    food: ['knife'],
    clothes: [],
    scrolls: [],
    smith: ['hammer', 'axe'],
    default: ['axe', 'knife', 'hammer'],
};

/** Таблица «кто/что»: как человек ведёт себя при страхе. Новый житель — строка (тест требует каждую роль). */
export const HOME_TARGETS = {
    farmer: { home: true, fights: 'if-fit', why: 'крестьянин: бежит в свой дом, запирается, берёт вилы/мотыгу или топор из сундука' },
    builder: { home: true, fights: 'if-fit', why: 'строитель: молот в руке уже есть' },
    merchant: { home: true, fights: 'if-fit', why: 'торговец: сделку не рвёт — доводит или отменяет с возвратом, потом бежит в здание лавки' },
    seller: { home: true, fights: 'if-fit', why: 'продавец: как торговец' },
    knight: { home: false, why: 'рыцарь: не прячется, идёт навстречу опасности (старые правила)' },
    king: { home: false, why: 'король: глубже в замок (VillagerFear)' },
    advisor: { home: false, why: 'визирь: глубже в замок (VillagerFear)' },
    wizard: { home: false, why: 'волшебники — WizardLife (свои правила)' },
};

/** Бежит ли эта роль в дом (по таблице). */
export const runsHome = (role) => !!HOME_TARGETS[role]?.home;

/**
 * Скорость испуганного бега (м/с). Ребёнок и женщина — как все; старик — HOME.RUN_ELDER.
 * @param {{elder?:boolean, level?:number}} p
 */
export function fearRun(p, base = RUN_SPEED) {
    return base * (p.elder ? HOME.RUN_ELDER : 1) * ((p.level ?? 3) >= 3 ? 1 : 0.85);
}

/**
 * Дерётся ли дома (иначе прячется в углу). Почти все взрослые: мужчины с храбростью ≥ 0,1, женщины ≥ 0,25, старики —
 * только очень храбрые (с палкой), дети, раненые и священник — никогда.
 * @returns {{fights:boolean, why:string}}
 */
export function defenderClass(p) {
    if (p.child || p.kid) return { fights: false, why: 'ребёнок: прячется' };
    if (p.hpFrac != null && p.hpFrac < HOME.HP_FIT) return { fights: false, why: 'ранен: прячется' };
    if (p.trade === 'priest') return { fights: false, why: 'священник: молится в углу' };
    const brave = p.brave ?? 0.5;
    if (p.elder || p.weak) return brave >= 0.7 ? { fights: true, why: 'старик, но храбрый: с палкой' } : { fights: false, why: 'старик: прячется' };
    const need = p.female ? HOME.BRAVE_WOMEN : (p.role === 'merchant' || p.role === 'seller') ? HOME.BRAVE_MERCHANT : HOME.BRAVE_MEN;
    return brave >= need ? { fights: true, why: 'взрослый: защищает дом' } : { fights: false, why: `робкий (храбрость ${(brave * 100).toFixed(0)} %): прячется` };
}

/** Доля бойцов среди взрослых/всех (для теста и журнала): people — список p для defenderClass. */
export function shareFighting(people) {
    let n = 0;
    for (const p of people) if (defenderClass(p).fights) n++;
    return people.length ? n / people.length : 0;
}

/** Детерминированное число 0…1 из строки (для «что лежит в сундуке»). */
export function hash01(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
}

/**
 * Что взять из сундука дома (или null — в нём нет ничего подходящего). Сундук один на всех: `taken` — уже взятое.
 * @param {string} chestId @param {string|null} flavor @param {Set<string>} taken
 */
export function chestWeapon(chestId, flavor, taken) {
    if (taken?.has(chestId)) return null;
    if (hash01(chestId + ':arms') >= HOME.CHEST_ARMS) return null;
    const list = CHEST_ARMS[flavor] || CHEST_ARMS.default;
    if (!list.length) return null;
    return list[Math.floor(hash01(chestId + ':which') * list.length) % list.length];
}

/**
 * Чем вооружён человек: из сундука (лучше, чем свой, по rank) / своё по работе (Audacity.weaponFor) / что держит в руках / кулаки.
 * → { tool, from: 'сундук'|'своё'|'кулаки', dmg }
 */
export function armsFor(p, fromChest) {
    const own = weaponFor({ ...p, tool: p.tool });
    let ownTool = own;
    if (ownTool === 'none' && p.tool && HOME_WEAPONS[p.tool] && p.tool !== 'none') ownTool = p.tool; // (в руках уже что-то: вилы, молот)
    const ch = fromChest && HOME_WEAPONS[fromChest] ? fromChest : null;
    if (ch && (HOME_WEAPONS[ch].rank > HOME_WEAPONS[ownTool].rank)) return { tool: ch, from: 'сундук', dmg: HOME_WEAPONS[ch].dmg };
    if (ownTool !== 'none') return { tool: ownTool, from: 'своё', dmg: HOME_WEAPONS[ownTool].dmg };
    if (ch) return { tool: ch, from: 'сундук', dmg: HOME_WEAPONS[ch].dmg };
    return { tool: 'none', from: 'кулаки', dmg: 1 };
}

// ------------------------------------------------------------------------------------------------ места в доме
/** Ось входа: от двери (наружная точка) внутрь. → {ax, az} единичный. */
export function doorAxis(h) {
    const dx = h.inside.x - h.door.x, dz = h.inside.z - h.door.z, d = Math.hypot(dx, dz) || 1;
    return { ax: dx / d, az: dz / d };
}

/**
 * Пост у двери: сбоку от проёма, чуть вглубь — не в проходе (линия входа свободна), лицом к двери. k-й из n делят две стороны
 * (на одной стороне — не плечом к плечу, 2,3 м).
 */
export function postSpot(h, k) {
    const { ax, az } = doorAxis(h);
    const side = k % 2 === 0 ? 1 : -1;
    const row = Math.floor(k / 2);
    const off = HOME.POST_SIDE + row * 1.7;
    const deep = HOME.POST_DEEP + (row % 2) * 0.8;
    return { x: h.inside.x + ax * (deep - 1) - az * off * side, z: h.inside.z + az * (deep - 1) + ax * off * side };
}

/** Укромное место (ребёнок, старик): дальше от двери к середине дома и за неё, в стороне от окон-двери. */
export function hideSpot(h, k) {
    const c = h.c || h.inside;
    const side = k % 2 === 0 ? 1 : -1;
    const { ax, az } = doorAxis(h);
    const t = HOME.HIDE_K * 2;
    return { x: h.inside.x + (c.x - h.inside.x) * t - az * side * (0.9 + 0.9 * (k >> 1)), z: h.inside.z + (c.z - h.inside.z) * t + ax * side * (0.9 + 0.9 * (k >> 1)) };
}

/** Враг в доме (по горизонтали и по этажу) или у двери, пока она открыта/выломана. */
export function intruderIn(h, p, { doorOpen = false } = {}) {
    const c = h.c || h.inside;
    const dy = p.y - (h.inside.y ?? 0);
    if (dy > -2.5 && dy < 14 && Math.hypot(p.x - c.x, p.z - c.z) <= (h.r || 6) * HOME.INSIDE_R) {
        const { ax, az } = doorAxis(h);
        // (за порогом: ближе к середине, чем наружная точка двери)
        const toIn = (p.x - h.door.x) * ax + (p.z - h.door.z) * az;
        if (toIn > 1.2) return true;
    }
    return doorOpen && Math.hypot(p.x - h.inside.x, p.z - h.inside.z) < HOME.DOOR_R;
}

/** Враг ушёл от дома — отпускают его (не гонятся по деревне). */
export function leashed(h, p) {
    const c = h.c || h.inside;
    return Math.hypot(p.x - c.x, p.z - c.z) > (h.r || 6) * HOME.INSIDE_R + HOME.LEASH;
}

// ------------------------------------------------------------------------------------------------ выход
/** Можно ли выходить: спокойно давно, никого рядом, день (ночью — остаются, NightLife положит спать). */
export function mayComeOut({ calm, need, threatD, night, now }) {
    if (night) return false;
    if (calm < Math.max(need ?? 0, HOME.CALM_OUT)) return false;
    if (threatD < HOME.FAR_R) return false;
    return now >= 0;
}

/** Сколько ещё домашних бежит к этому дому (ждём их у двери: не запираем перед носом). */
export function pendingFamily(list, houseIndex, door) {
    let n = 0;
    for (const o of list) if (o.houseIndex === houseIndex && Math.hypot(o.x - door.x, o.z - door.z) < HOME.KNOCK_R * 3) n++;
    return n;
}

/** Состояния v.hd (для журнала и теста). */
export const HD_STATES = ['bar', 'arm', 'post', 'hide', 'fight', 'peek', 'out'];

/** Статистика «стоят без дела»: считает, сколько испуганных дома и сколько из них ничего не делают без причины. */
export function idleShare(stats) {
    return stats.total ? stats.idle / stats.total : 0;
}

export { fightsInMob };
