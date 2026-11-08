/**
 * HeroItems.js — предметы, которые герой Творческого мира берёт с собой с самого начала (чистые данные, без THREE).
 *
 * Автор (02.11): «стенды с предметами у начала убрать… можно выбрать предметы вручную — как зелья в продвинутых настройках;
 * игрок набирает себе предметов в интерфейс; если выбрано больше, чем ячеек, ячейки увеличиваются; максимум 10 — предметов
 * и зелий вместе». Раньше эти вещи лежали на пьедесталах у начала (Game.js): меч, топор, луки, щиты, палочка, кристалл, яблоко, колбы.
 *
 * `START_ITEMS` — что можно выбрать; `make(uid)` делает запись для ячейки (как у найденной вещи); `kit` — метка, чтобы
 * после возрождения не выдать вторую такую же, если первая ещё у героя (HeroApply.initial).
 */

/** Сколько всего можно выбрать: предметов и зелий вместе (автор: «максимум 10»). */
export const KIT_MAX = 10;

export const START_ITEMS = [
    { id: 'sword', name: 'Меч', icon: '🗡️', hint: 'Обычный железный меч.', make: () => ({ kind: 'weapon', type: 'sword', magic: false, bonus: 0 }) },
    { id: 'axe', name: 'Топор', icon: '🪓', hint: 'Боевой топор.', make: () => ({ kind: 'weapon', type: 'axe', magic: false, bonus: 0 }) },
    { id: 'bow0', name: 'Простой лук', icon: '🏹', hint: 'С колчаном стрел.', make: (u) => ({ kind: 'bow', uid: u, type: 0, magic: false, bonus: 0, arrows: 25 }) },
    { id: 'bow1', name: 'Охотничий лук', icon: '🏹', hint: 'С колчаном стрел.', make: (u) => ({ kind: 'bow', uid: u, type: 1, magic: false, bonus: 0, arrows: 25 }) },
    { id: 'bow2', name: 'Длинный лук (волшебный)', icon: '🏹', hint: 'Стрелы летят сильнее обычных.', make: (u) => ({ kind: 'bow', uid: u, type: 2, magic: true, bonus: 35, arrows: 25 }) },
    { id: 'shield0', name: 'Деревянный щит', icon: '🛡️', hint: 'Держит удары и слабые заклинания.', make: (u) => ({ kind: 'shield', uid: u, type: 0, magic: false, max: 0 }) },
    { id: 'shield1', name: 'Железный щит', icon: '🛡️', hint: 'Держит удары и слабые заклинания.', make: (u) => ({ kind: 'shield', uid: u, type: 1, magic: false, max: 0 }) },
    { id: 'shield2', name: 'Щит рыцаря (волшебный)', icon: '🛡️', hint: 'У него своя сила, и она восстанавливается.', make: (u) => ({ kind: 'shield', uid: u, type: 2, magic: true, max: 40 }) },
    { id: 'wand', name: 'Волшебная палочка', icon: '🪄', hint: 'Фиолетовая, любимое заклинание — «Инферно».', make: (u) => ({ kind: 'wand', uid: u, color: 0x8e5bd8, model: 4, fav: 'Inferno', power: 30, dir: 'destroy' }) },
    { id: 'crystal', name: 'Кристалл маны', icon: '💎', hint: 'Возьмите в руку и сожмите — прибавит ячейку маны.', make: (u) => ({ kind: 'crystal', uid: u, count: 1 }) },
    { id: 'apple', name: 'Золотое яблоко', icon: '🍏', hint: 'Еда; нужно и для зелья исцеления.', make: (u) => ({ kind: 'apple', uid: u, count: 1 }) },
    { id: 'flask', name: 'Пустые колбы (3)', icon: '⚗️', hint: 'Чтобы разливать зелья из котла.', make: (u) => ({ kind: 'flask', uid: u, count: 3 }) },
];

const BY_ID = new Map(START_ITEMS.map((x) => [x.id, x]));
export const startItem = (id) => BY_ID.get(id) || null;

/** Выбранные предметы: только известные, по одному, в порядке списка. */
export function heroItems(list) {
    const want = new Set(Array.isArray(list) ? list.map(String) : []);
    return START_ITEMS.filter((x) => want.has(x.id)).map((x) => x.id);
}

/** Вещи, которые кладутся на спину (не в карманы): меч, топор, лук, щит — у спины две ячейки (Inventory.BACK_KINDS). */
const BACK = new Set(['weapon', 'bow', 'shield']);
export const itemGoesToBack = (id) => BACK.has(startItem(id)?.make().kind);

/** Сколько ячеек карманов нужно этому набору (то, что идёт за спину, карманов не занимает, пока на спине есть место). */
export function pocketsNeeded(itemIds, potionCount, backFree = 2) {
    let back = backFree, pockets = potionCount | 0;
    for (const id of itemIds) { if (itemGoesToBack(id) && back > 0) back--; else pockets++; }
    return pockets;
}

/**
 * Вещи, которые раньше лежали на пьедесталах у начала Творческого (убраны 02.11). В старом сохранении они записаны как «лежат
 * вещи» — без пьедесталов они бы упали на землю, поэтому при загрузке Творческого мира их пропускают (WorldSave).
 */
export const OLD_STAND_IDS = new Set(['tA', 'tS', 'tS2', 'cb0', 'cb1', 'cb2', 'cs0', 'cs1', 'cs2', 'cw0', 'cr1', 'cr2', 'cr3', 'cmc0', 'cmc1', 'cfl0', 'cap0']);
