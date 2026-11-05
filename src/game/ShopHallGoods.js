/**
 * ShopHallGoods.js — what the two big shops of a wizards' settlement sell and for how much (pure, node-testable; the author 05.11).
 *
 *  - the POTION HALL: every potion of the world (Potions.RECIPES) — «одно зелье может стоить от 700 до 5000 монет, в зависимости от того,
 *    насколько оно мощное»; a cauldron 500; empty flasks 20 each. A new recipe gets its price by itself (POTION_PRICE, else by its ingredients);
 *  - the SCROLL HALL: the scrolls of the simple spells — «не будет чёрной магии вообще… простейшие заклинания, которые требуют 50 и меньше маны
 *    за раз; любое из них можно будет купить; по цене — как с зельями» (700…5000 by the mana a cast takes). Not sold: the dark spells
 *    (DarkMagic.isDark), the gods' (Mana.GOD_SPELLS), what is known from the start or taught by a book-bird / the gods' gift (SpellBook.howLearned),
 *    what costs more than 50 mana. A new spell of a scroll (ItemTypes.SCROLL_WEIGHTS) with its cost ≤ 50 is on the tables by itself.
 * And the words: which good the buyer names (a potion by POTION_WORDS / its name, a scroll by the spell's words — SpellManager.matchSpell,
 * or its title), «да / беру», «нет», «что есть», «колбы ×N», «котёл».
 */

import { RECIPES, INGREDIENT_RU } from './Potions.js';
import { POTION_WORDS, findRecipe } from './PotionMaster.js';
import { SPELL_COST } from './Combat.js';
import { BUILD_SPELLS } from './Builder.js';
import { isDark } from './DarkMagic.js';
import { GOD_SPELLS, NOT_SPELLS, spellTitle } from './Mana.js';
import { howLearned, teachKey } from './SpellBook.js';
import { SCROLL_WEIGHTS } from './ItemTypes.js';

export const HALL_PRICE = {
    MIN: 700, MAX: 5000, // (a potion, a scroll: the author's range)
    CAULDRON: 500,
    FLASK: 20, // each
    SCROLL_MANA: 50, // a scroll's spell costs at most this much mana a cast
};

/** The potions by their might (the author: 700…5000; the transformations dear — the wings 4800, the mermaid 3800). A recipe not here — by its ingredients (potionPrice). */
export const POTION_PRICE = {
    heal: 700, potionreset: 900, waterbreath: 1200, clearmind: 1500, dazzle: 1800, disguise: 2200,
    luck: 2600, mermaid: 3800, wings: 4800,
};
/** Never sold (the author 05.11): the dragon's — «вообще его не будет»; the cure of the dark mage's curse — «лучше вообще его не будет». */
export const NOT_SOLD = new Set(['dragonform', 'lordcure']);
export const soldPotions = () => RECIPES.filter((r) => !NOT_SOLD.has(r.id));

/**
 * The ingredients' room (the author: «элементы для варки зелий — все, которые сейчас доступны, кроме яйца дракона; от 100 до 700 монет,
 * в зависимости от сложности достать»). A new ingredient: its price here, else by its shelf (INGREDIENT_KIND).
 */
export const INGREDIENT_PRICE = {
    redApple: 100, bread: 100, cheese: 100, pie: 120, wool: 100, meat: 100, steak: 120, glass: 100,
    sun_herb: 120, fern_frond: 120, azure_berry: 150, glowcap_mushroom: 200, baksadi_pear: 300, telewilpinLeaf: 350, carnivoreHead: 450,
    owlFeather: 250, web: 250, swanWings: 300, minotaurHorn: 450, glowfinTail: 500, spencerFeather: 550,
    crystal: 300, frost_shard: 350, magicPebble: 450,
    apple: 500, brightCore: 600, magicSwanWings: 650, phoenixFeather: 700,
};
export const INGREDIENT_NOT_SOLD = new Set(['dragonEgg', 'scroll', 'fish']);
/** Every ingredient the room sells (the potions' ingredients and every thing a cauldron takes), sorted by price. */
export function hallIngredients() {
    const set = new Set([...Object.keys(INGREDIENT_RU), ...RECIPES.flatMap((r) => Object.keys(r.ingredients))]);
    for (const k of INGREDIENT_NOT_SOLD) set.delete(k);
    return [...set].sort((a, b) => ingredientPrice(a) - ingredientPrice(b) || (a < b ? -1 : 1));
}
export function ingredientPrice(kind) { return Math.max(100, Math.min(700, INGREDIENT_PRICE[kind] ?? 250)); }
export const ingredientName = (kind) => INGREDIENT_RU[kind] || kind;

/** Which ingredient the words name (by the stems of its Russian name; the fuller name wins: «золотое яблоко» over «яблоко»). */
export function findIngredient(text) {
    const t = ' ' + String(text || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9\s]/g, ' ').replace(/\s+/g, ' ') + ' ';
    let best = null, bs = 0, bw = 0;
    for (const k of hallIngredients()) {
        const words = ingredientName(k).toLowerCase().replace(/ё/g, 'е').split(/\s+/).filter((w) => w.length >= 3);
        let sc = 0, all = true;
        for (const w of words) { const st = w.slice(0, Math.max(4, w.length - 2)); if (t.includes(' ' + st)) sc += st.length; else all = false; }
        if (!sc) continue;
        const score = sc + (all ? 10 : 0);
        if (score > bs || (score === bs && words.length < bw)) { best = k; bs = score; bw = words.length; }
    }
    return best;
}

const RARE = new Set(['phoenixFeather', 'dragonEgg', 'magicSwanWings', 'brightCore', 'apple', 'spencerFeather', 'glowfinTail', 'carnivoreHead']);
const round50 = (n) => Math.round(n / 50) * 50;
const clamp = (n) => Math.max(HALL_PRICE.MIN, Math.min(HALL_PRICE.MAX, n));

/** A potion's price in the potion hall. */
export function potionPrice(rec) {
    const r = typeof rec === 'string' ? RECIPES.find((x) => x.id === rec) : rec;
    if (!r) return HALL_PRICE.MIN;
    if (POTION_PRICE[r.id]) return POTION_PRICE[r.id];
    let n = 0, rare = 0;
    for (const [k, c] of Object.entries(r.ingredients || {})) { n += c; if (RARE.has(k)) rare += c; }
    return clamp(round50(HALL_PRICE.MIN + 450 * n + 1100 * rare + (r.effect?.timed ? 300 : 0)));
}

/** The mana one cast of a spell takes (null: not known). */
export function manaOf(name) {
    if (SPELL_COST[name] != null) return SPELL_COST[name];
    if (BUILD_SPELLS[name]) return BUILD_SPELLS[name].cost;
    return null;
}

/** The scrolls the scroll hall sells: the keys of the scrolls (a spell's own scroll), each once, in the order of their price. */
export function hallScrolls() {
    const out = [];
    for (const [name] of SCROLL_WEIGHTS) {
        if (typeof name !== 'string' || name.startsWith('pent:')) continue; // (the pentagrams' drawings: not spells to cast)
        const key = teachKey(name);
        if (key !== name || out.includes(key)) continue;
        const cost = manaOf(key);
        if (cost == null || cost > HALL_PRICE.SCROLL_MANA) continue;
        if (isDark(key) || GOD_SPELLS.has(key) || NOT_SPELLS.has(key) || howLearned(key) !== 'scroll') continue;
        out.push(key);
    }
    return out.sort((a, b) => scrollPrice(a) - scrollPrice(b) || (a < b ? -1 : 1));
}

/** A scroll's price in the scroll hall: by the mana a cast takes (5 → ~900, 25 → ~2450, 50 → 5000). */
export function scrollPrice(spell) {
    const c = manaOf(spell);
    if (c == null) return HALL_PRICE.MAX;
    return clamp(round50(HALL_PRICE.MIN + (HALL_PRICE.MAX - HALL_PRICE.MIN) * Math.pow(Math.min(1, c / HALL_PRICE.SCROLL_MANA), 1.3)));
}

/** A potion's colour on the shelves (the same circle of hues as the potion-maker's lair). */
export function hallPotionColor(i, n) {
    const h = (i / Math.max(1, n)) % 1, s = 0.75, l = 0.5;
    const f = (k) => { const a = s * Math.min(l, 1 - l), t = (k + h * 12) % 12; return l - a * Math.max(-1, Math.min(t - 3, 9 - t, 1)); };
    return (Math.round(f(0) * 255) << 16) | (Math.round(f(8) * 255) << 8) | Math.round(f(4) * 255);
}

/**
 * What lies where in the potion hall: slots → [{slot, item, price}] (items are templates without a uid). Every potion has its run of
 * shelf, the same potion together (a buyer finds «the luck shelf»), as many places to each as the shelves give; the flasks on their table.
 */
export function potionStock(slots, flasks) {
    const out = [];
    const list = soldPotions(), n = list.length, per = Math.max(1, Math.floor(slots.length / n));
    list.forEach((r, i) => {
        const color = hallPotionColor(RECIPES.indexOf(r), RECIPES.length);
        for (let k = 0; k < per; k++) {
            const s = slots[i * per + k];
            if (s) out.push({ slot: s, item: { kind: 'potion', rec: r.id, color }, price: potionPrice(r) });
        }
    });
    for (const s of flasks) out.push({ slot: s, item: { kind: 'flask', count: 1 }, price: HALL_PRICE.FLASK });
    return out;
}

/** The ingredients' room: every ingredient, twice where the places allow (the cheap first in line). */
export function ingredientStock(slots) {
    const list = hallIngredients(), out = [];
    for (let i = 0; i < slots.length; i++) {
        const k = list[i % list.length];
        if (i >= list.length * 2) break;
        out.push({ slot: slots[i], item: { kind: k, count: 1 }, price: ingredientPrice(k) });
    }
    return out;
}

/** The scroll hall: each scroll of hallScrolls once (the tables first, then the side pigeonholes); `known` (spell → bool) leaves out what the host knows. */
export function scrollStock(slots, known = null) {
    const out = [];
    let i = 0;
    for (const sp of hallScrolls()) {
        if (known && known(sp)) continue;
        const s = slots[i++];
        if (!s) break;
        out.push({ slot: s, item: { kind: 'scroll', stat: 'spell', spell: sp }, price: scrollPrice(sp) });
    }
    return out;
}

// ------------------------------------------------------------------ the words
const norm = (t) => ' ' + String(t || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9\s]/g, ' ').replace(/\s+/g, ' ').trim() + ' ';

const YES = /( да | давай| беру | возьму | покупаю| куплю | согласен | согласна | ок | хорошо | заверните| идет | по рукам)/;
const NO = /( нет | не надо| не нужно| не буду| передумал| отмена| дорого )/;
const LIST = /(что (у тебя |у вас )?(есть|продае|продаешь|продаете)|какие (зелья|свитки)|что можно купить|ассортимент|покажи все|что в продаже)/;
const PRICE = /(сколько|почем|цена|стоит|стоимост)/;
const WHERE = /(где |покажи|найди|подскажи|есть ли|у тебя есть|у вас есть)/;
const WANT = /(хочу|дай|дайте|продай|продайте|куплю|покупаю|беру|возьму|нужн|мне бы|заверни|подай|принеси)/;
const NUM = { одн: 1, одна: 1, один: 1, две: 2, два: 2, три: 3, четыр: 4, пят: 5, шест: 6, сем: 7, восем: 8, девят: 9, десят: 10, пар: 2 };

/** How many: «5 колб», «пять склянок», «пару» → n (1 when nothing said). */
export function countOf(text) {
    const t = norm(text);
    const d = t.match(/ (\d{1,2}) /);
    if (d) return Math.max(1, Math.min(20, +d[1]));
    for (const [w, n] of Object.entries(NUM)) if (new RegExp(' ' + w).test(t)) return n;
    return 1;
}

/**
 * The buyer's words to the keeper → {do: 'yes'|'no'|'list'|'ask', good?: {kind, rec?, spell?}, price?: bool, count?} or null.
 * `kind` 'potions' | 'scrolls' — which hall; `spellOf(text)` — the game's spell recogniser (SpellManager.matchSpell) for the scrolls.
 */
export function parseHallWords(text, kind, spellOf = null) {
    const t = norm(text);
    if (t.trim() === '') return null;
    let good = null;
    if (kind === 'potions') {
        if (/(колб|склянк|пузыр|флакон|бутыл)/.test(t) && !/(зель|снадоб)/.test(t)) good = { kind: 'flask' };
        else if (/(котел|котл|казан)/.test(t)) good = { kind: 'cauldron' };
        else { const r = findRecipe(t); if (r) good = { kind: 'potion', rec: r.id }; }
    } else if (kind === 'ingredients') {
        if (/(драконь|дракона)/.test(t) && /(яйц|яиц)/.test(t)) good = { kind: 'dragonEgg' };
        else { const k = findIngredient(t); if (k) good = { kind: 'ingredient', item: k }; }
    } else {
        const sp = scrollNamed(t, spellOf);
        if (sp) good = { kind: 'scroll', spell: sp };
    }
    const price = PRICE.test(t), where = WHERE.test(t), want = WANT.test(t);
    if (good) return { do: 'ask', good, price, where, want, count: good.kind === 'flask' ? countOf(t) : 1 };
    if (LIST.test(t)) return { do: 'list' };
    if (NO.test(t)) return { do: 'no' };
    if (YES.test(t) && !/(купить|покупк|хочу|продай)/.test(t)) return { do: 'yes' };
    // («хочу купить», «хочу купить зелье», «что-нибудь продайте» — no good made out: the words over every good near — ShopHallLife.labels)
    if (want || price || /(купить|покупк)/.test(t)) return { do: 'pick' };
    return null;
}

/** Which scroll of the hall the words name (null). */
export function scrollNamed(text, spellOf = null) {
    const t = norm(text), list = hallScrolls();
    const sp = spellOf ? spellOf(t.trim()) : null;
    const name = typeof sp === 'string' ? sp : sp?.name || sp?.spell || null;
    if (name) { const k = teachKey(name); if (list.includes(k)) return k; }
    let best = null, bl = 0;
    for (const k of list) {
        const title = norm(spellTitle(k)).trim();
        if (title.length > bl && t.includes(' ' + title + ' ')) { best = k; bl = title.length; }
    }
    return best;
}

/** The potions' words (for the codex and the tests): every recipe is named somehow. */
export const potionWords = (id) => POTION_WORDS[id] || [RECIPES.find((r) => r.id === id)?.name || id];

/** The keeper's lines. */
export const HALL_LINES = {
    welcome: {
        ingredients: ['Ингредиенты для зелий — здесь. Травы, перья, кристаллы — что нужно?', 'Заходите! Всё для варки — назовите, перенесу на прилавок.'],
        potions: ['Добро пожаловать в лавку зелий! Проходите, всё на полках — спрашивайте.', 'Заходите, заходите! Любое зелье — у меня. Что ищете?', 'Рад гостю! Зелья, колбы, котлы — всё здесь. Подсказать?'],
        scrolls: ['Добро пожаловать в лавку свитков! Простые заклинания — любое, спрашивайте.', 'Заходите! Свитки на столах и в ячейках. Какое заклинание ищете?', 'Рад гостю! Ищете заклинание? Назовите — покажу.'],
    },
    call: { ingredients: ['Подходите к прилавку, помогу подобрать!'], potions: ['Подходите сюда, покажу!', 'Сюда, сюда — у меня для вас кое-что есть!'], scrolls: ['Подойдите, помогу выбрать!', 'Сюда, к столам, — покажу!'] },
    here: ['Вот оно — светится.', 'Вот здесь, смотрите.', 'Вот, на этой полке.'],
    offer: (name, price) => `${name[0].toUpperCase() + name.slice(1)} — ${price} монет. Берёте?`,
    noMoney: (need) => `Не хватает ${need} монет. Приходите, когда будет.`,
    sold: ['Держите! Хорошего дня.', 'Ваше! Пользуйтесь на здоровье.', 'Спасибо за покупку!'],
    onCounter: 'Руки у вас заняты — положил на прилавок, заберите.',
    nothing: { ingredients: 'Такого у нас нет — назовите по-другому?', potions: 'Такого зелья у меня нет — может, назовёте по-другому?', scrolls: 'Такого свитка нет: у меня только простые заклинания — без чёрной магии.' },
    known: 'Это заклинание вы уже знаете — свиток вам ни к чему.',
    soldOut: 'Этого сейчас нет на полке — подвезут чуть позже.',
    no: ['Как скажете. Смотрите ещё.', 'Хорошо, не тороплю.'],
    cauldron: (p) => `Котёл — ${p} монет, стоит вот там. Берёте?`,
    cauldronPaid: 'Котёл ваш — тащите его домой.',
    dark: 'Чёрной магии здесь нет и не будет.',
    notSold: 'Такого зелья мы не продаём и не варим — даже не просите.',
    noEgg: 'Яиц дракона не держим: их не достать ни за какие деньги.',
    levitate: 'Вингардиум Левиоса!',
    onIts: (name, price) => `${name[0].toUpperCase() + name.slice(1)} на прилавке — ${price} монет. Кладите мешочек с монетами на прилавок и скажите «беру».`,
    putCoins: 'Кладите мешочек с монетами на прилавок — сдачу верну.',
    pick: 'Над каждым товаром — название. Скажите, что именно вам нужно.',
    backToShelf: 'Не берёте — верну на полку.',
    noTouch: ['Не трогайте товар руками — скажите, что нужно, я подам.', 'Товар на полках не трогаем! Скажите, что нужно.'],
    thief: ['Вор! Держи вора!', 'Стой! Товар не оплачен!'],
    guardWatch: ['Я за порядком смотрю. Покупки — у продавцов.', 'Всё в порядке? Покупать — у прилавка.'],
    guardWarn: 'Без глупостей в лавке.',
};

/** «What do you sell» — a short list with prices. */
export function listLine(kind, goods) {
    if (kind === 'ingredients') {
        const parts = hallIngredients().map((k) => `${ingredientName(k)} — ${ingredientPrice(k)}`);
        return `Ингредиенты для зелий: ${parts.join(', ')}. Яйца дракона не держим.`;
    }
    if (kind === 'potions') {
        const parts = soldPotions().map((r) => `${r.name.replace(/^Зелье /, '').toLowerCase()} — ${potionPrice(r)}`);
        return `Все зелья: ${parts.join(', ')}. Колбы — по ${HALL_PRICE.FLASK}, котёл — ${HALL_PRICE.CAULDRON}.`;
    }
    const sp = (goods || hallScrolls()).slice(0, 12).map((k) => `${spellTitle(k)} — ${scrollPrice(k)}`);
    return `Свитки простых заклинаний: ${sp.join(', ')}${(goods || hallScrolls()).length > 12 ? ' и другие' : ''}. Назовите — покажу.`;
}
