/**
 * ItemTypes.js — what can be found in chests (and what animals drop), their
 * properties and their 3D models. Pure data + THREE models, no game logic.
 *
 * Every item is a small plain object (it travels over the network and into
 * the save): {kind, uid, ...properties}.
 *
 * Magic items have their own advantages (rolled when found), revealed by the
 * wand spell «Раскрой свои секреты»:
 *   wand    — every wand: spells +15% stronger and −15% fatigue; a direction
 *             (duel / destruction / gathering / building: +25% there, building
 *             spends 40% less material); one favourite spell (+40%; for
 *             Protection — holds 40% longer); its own power 1–50% (combat).
 *   weapon  — a magic sword / axe glows a little, hits 1–60% harder and
 *             breaks an ordinary «Protection» it touches.
 *   shield  — wooden / iron / magic; a magic one has its own strength 20–50
 *             that comes back by itself; strong spells break weak shields.
 *   scroll  — burn it: +1–5 max health or +1–10 max strength, for good;
 *             or it teaches a scroll-only spell (Lightning Strike,
 *             Thunderwave, To the Sun, Авада Кедавра — a rare one, Total Destruction —
 *             the rarest).
 *   backpack— put it on (hands behind the back): +3–5 slots.
 *   bow     — plain / fine / magic (1–60% stronger), comes with 10 arrows.
 *   hammer  — Thor's hammer: catches lightning in a storm (3 strikes).
 */

import * as THREE from 'three';
import { woolModel, logsModel } from './BedModels.js';
import { makeSpellBookModel, COVERS, SWIFT_COVER, SWIFT_TRIM } from './BookModel.js';
import { crystalItemModel } from './CrystalModel.js';

export const WAND_DIRS = {
    duel: { name: 'дуэльная', spells: ['Sapira', 'Stupefy', 'AvadaKedavra', 'Levitation', 'Expelliarmus'] },
    destroy: { name: 'разрушения', spells: ['Bombardo', 'BombardoMaxima', 'Inferno', 'Thunderwave', 'Earthquake', 'EarthquakeMaxima', 'LightningStrike', 'Sands', 'Ice', 'TotalDestruction'] },
    gather: { name: 'собирательства', spells: ['Gather', 'Accio', 'Wind', 'WindMaxima', 'Waterball', 'WaveAttack', 'WaveAttackMaxima', 'WaterVortex'] },
    build: { name: 'строительства', spells: ['CreateFloor', 'CreateWall', 'CreateCeiling', 'BuildRoof', 'CreateDoor', 'WaterForming', 'CreateBoard'] },
};
/** Spells a wand can favour; a Maxima form goes with its base spell. */
export const WAND_FAVOURITES = ['Inferno', 'Thunderwave', 'Sapira', 'Ice', 'Sands', 'Bombardo', 'Earthquake', 'Wind', 'Stupefy', 'AvadaKedavra', 'Levitation', 'Accio', 'Protection', 'LightningStrike', 'WaveAttack', 'Lumos', 'Gather', 'Brainrot'];
export const SPELL_RU = {
    Inferno: 'Инферно', Thunderwave: 'Тандервейв', Sapira: 'Сапира', Ice: 'Айс', Sands: 'Даст', Bombardo: 'Бомбардо', Earthquake: 'Earthquake',
    Wind: 'Вайнд', Stupefy: 'Остолбеней', AvadaKedavra: 'Авада Кедавра', Levitation: 'Вингардиум Левиоса', Accio: 'Акцио', Protection: 'Protection',
    LightningStrike: 'Lightning Strike', ToTheSun: 'To the Sun', WaveAttack: 'Wave Attack', Lumos: 'Люмос', Gather: 'Gather', Brainrot: 'Брейнрот', Alive: 'Alive',
    WaterVortex: 'Water Vortex', CreateBoard: 'Create a Board', TotalDestruction: 'Total Destruction', LetItRain: 'Let it rain', Hellfire: 'Let the Hellfire Come', WaterVortexSuperMaxima: 'Water Vortex Super Maxima',
    Unfurl: 'Анфёрл', Furl: 'Фёрл', Overgrown: 'Overgrown', Expelliarmus: 'Экспеллиармус',
};
/** Spells that outside Creative only a burnt scroll teaches (and the scroll's ribbon colour). */
export const SCROLL_SPELL_COLOR = { LightningStrike: 0xffd84a, Thunderwave: 0x8fa8ff, ToTheSun: 0xff9a2b, AvadaKedavra: 0x2ec95a, Alive: 0x9a6a2e, TotalDestruction: 0x1c1c1c, LetItRain: 0xc4d0dc };
/** The ribbon's colour in words (for the hint when a spell isn't learnt yet). */
/** Ribbon colours of every spell scroll (also the ones a book-bird's book can teach, like «Create a Board»). */
export const SPELL_RIBBON = { ...SCROLL_SPELL_COLOR, CreateBoard: 0x2ec4b6 };
export const SCROLL_RIBBON_RU = { LightningStrike: 'золотая', Thunderwave: 'синяя', ToTheSun: 'оранжевая', AvadaKedavra: 'зелёная', Alive: 'коричневая', TotalDestruction: 'чёрная', LetItRain: 'серебряная' };
const SPELL_LABEL = SPELL_RU;
/** The base spell of a Maxima form (for favourites and directions). */
export const baseSpell = (name) => (name || '').replace(/Maxima$/, '');

export const ITEM_INFO = {
    wand: { name: 'Волшебная палочка', icon: '🪄', weight: 0.15 },
    scroll: { name: 'Свиток', icon: '📜', weight: 0.2 },
    shield: { name: 'Щит', icon: '🛡️', weight: 3 },
    backpack: { name: 'Рюкзак', icon: '🎒', weight: 1.5 },
    bow: { name: 'Лук', icon: '🏹', weight: 1 },
    hammer: { name: 'Молот Тора', icon: '🔨', weight: 4 },
    apple: { name: 'Золотое яблоко', icon: '🍏', weight: 0.2, stack: 10 },
    meat: { name: 'Сырое мясо', icon: '🥩', weight: 0.4, stack: 10 },
    steak: { name: 'Жареный стейк', icon: '🍖', weight: 0.4, stack: 10 },
    book: { name: 'Книга заклинаний', icon: '📖', weight: 0.6 },
    arrows: { name: 'Стрелы', icon: '➶', weight: 0.3 },
    // castles: money and market food
    coins: { name: 'Монеты', icon: '💰', weight: 0.3, stack: 500 },
    bread: { name: 'Хлеб', icon: '🍞', weight: 0.3, stack: 10, heal: 3 },
    cheese: { name: 'Сыр', icon: '🧀', weight: 0.3, stack: 10, heal: 3 },
    pie: { name: 'Пирог', icon: '🥧', weight: 0.4, stack: 10, heal: 5 },
    // beds (Beds.js): wool from sheep, bundles of logs thrown out of the hand
    wool: { name: 'Шерсть', icon: '🧶', weight: 0.3, stack: 20 },
    logs: { name: 'Брёвна', icon: '🪵', weight: 1.2 },
    // blocks dropped at a body (Death.js): picked up, they go back into a resource stack
    blocks: { name: 'Блоки', icon: '🧱', weight: 1 },
    // deep in caves (ManaCrystals.js): break one with both hands — the mana maximum +5
    crystal: { name: 'Кристалл маны', icon: '💎', weight: 0.3, stack: 10 },
    // ships (Cannons.js): a ball from the shot rack, put into a gun's muzzle by hand
    cannonball: { name: 'Пушечное ядро', icon: '⚫', weight: 3 },
    // the herds' guardians (HerdGuards.js): what they leave when killed
    bronzeHorn: { name: 'Бронзовый рог', icon: '📯', weight: 1.5 },
    minotaurHorn: { name: 'Рог Минотавра', icon: '🌀', weight: 1.5 }, // (an ingredient of the invisibility potion)
};

/**
 * What a thing is worth at a castle market (the merchant pays about this much;
 * magic things are dear). Weapons lying on a stall count too.
 */
export function itemValue(it) {
    if (!it) return 0;
    switch (it.kind) {
        case 'wand': return it.plain ? 20 : 150 + 2 * (it.power || 0);
        case 'weapon': return it.magic ? 120 + 2 * (it.bonus || 0) : (it.type === 'axe' ? 18 : 15);
        case 'shield': return it.magic ? 90 + (it.max || 0) : 15 + 5 * (it.type || 0);
        case 'scroll': return it.stat === 'flight' || it.stat === 'spell' ? 220 : 60;
        case 'backpack': return 30 + 5 * (it.slots || 3);
        case 'bow': return it.magic ? 90 + (it.bonus || 0) : 25;
        case 'hammer': return 300;
        case 'book': return 50;
        case 'apple': return 12 * (it.count || 1);
        case 'meat': return 1 * (it.count || 1);
        case 'steak': return 3 * (it.count || 1);
        case 'arrows': return Math.max(1, Math.round((it.count || 1) * 0.6));
        case 'bread': case 'cheese': return 1 * (it.count || 1);
        case 'pie': return 2 * (it.count || 1);
        case 'crystal': return 40 * (it.count || 1);
        case 'bronzeHorn': return 160;
        case 'minotaurHorn': return 200;
        default: return 0;
    }
}

/** Is it a magic thing? (for the merchant and the conversation) */
export const isMagicItem = (it) => !!it && (it.kind === 'wand' || it.kind === 'hammer' || it.kind === 'book' || it.magic === true || (it.kind === 'scroll'));

const SHIELD_KINDS = [
    { name: 'Деревянный щит', color: 0x8b5a2b, rim: 0x5a3a1e },
    { name: 'Железный щит', color: 0x9aa3ad, rim: 0x5b6470 },
    { name: 'Щит рыцаря', color: 0x8e2b2b, rim: 0xd4af37 },
];
const BOW_KINDS = ['Простой лук', 'Охотничий лук', 'Длинный лук'];

let _uid = Math.floor(Math.random() * 1e6);
export const newUid = () => 'i' + (++_uid).toString(36) + Math.floor(Math.random() * 1296).toString(36);

const pick = (r, list) => list[Math.floor(r() * list.length) % list.length];
const randInt = (r, a, b) => a + Math.floor(r() * (b - a + 1));

/**
 * Every wizard's own plain wooden wand (given at the start, in every mode):
 * spells 15% stronger than with a bare hand — nothing else (no direction, no
 * favourite spell, no power of its own, no saving of strength).
 */
export function starterWand() {
    return { kind: 'wand', uid: newUid(), plain: true, model: 0, color: 0x8b5a2b, dir: null, fav: null, power: 0 };
}

/** A random wand (unique colour and powers). */
export function rollWand(r = Math.random) {
    const dirs = Object.keys(WAND_DIRS);
    return {
        kind: 'wand', uid: newUid(),
        model: randInt(r, 0, 9),
        color: Math.floor(r() * 0xffffff),
        dir: r() < 0.8 ? pick(r, dirs) : null,
        fav: pick(r, WAND_FAVOURITES),
        power: randInt(r, 1, 50),
    };
}

/**
 * A chest in a village house: mostly food (bread, cheese, pies, steaks), wool,
 * arrows — and rarely something precious (a scroll, a wand, a magic weapon).
 */
export function rollHouseLoot(r = Math.random, rich = false) {
    const out = [];
    const n = randInt(r, 2, rich ? 4 : 3);
    for (let i = 0; i < n; i++) {
        const x = r();
        if (x < (rich ? 0.07 : 0.03)) { out.push(rollKeyItem(r)); continue; }
        if (x < 0.30) out.push({ kind: 'bread', uid: newUid(), count: randInt(r, 1, 3) });
        else if (x < 0.48) out.push({ kind: 'cheese', uid: newUid(), count: randInt(r, 1, 2) });
        else if (x < 0.62) out.push({ kind: 'pie', uid: newUid(), count: 1 });
        else if (x < 0.74) out.push({ kind: 'steak', uid: newUid(), count: randInt(r, 1, 2) });
        else if (x < 0.84) out.push({ kind: 'wool', uid: newUid(), count: randInt(r, 1, 3) });
        else if (x < 0.92) out.push({ kind: 'arrows', uid: newUid(), count: randInt(r, 3, 8) });
        else out.push({ kind: 'apple', uid: newUid(), count: 1 });
    }
    return out;
}

/**
 * Things other features add to loot tables. The fishing rod (fishing session): set
 * `LOOT_EXTRA.fishingRod = (r) => item` and port chests hold one fairly often.
 */
export const LOOT_EXTRA = { fishingRod: null };

/** A chest in a sea castle's port: the sailors' stores — food, arrows, wool; sometimes a fishing rod, rarely something precious. */
export function rollPortLoot(r = Math.random) {
    const out = [];
    if (LOOT_EXTRA.fishingRod && r() < 0.35) out.push(LOOT_EXTRA.fishingRod(r));
    const n = randInt(r, 2, 3);
    for (let i = 0; i < n; i++) {
        const x = r();
        if (x < 0.08) { out.push(rollKeyItem(r)); continue; }
        if (x < 0.32) out.push({ kind: 'bread', uid: newUid(), count: randInt(r, 1, 3) });
        else if (x < 0.46) out.push({ kind: 'cheese', uid: newUid(), count: randInt(r, 1, 2) });
        else if (x < 0.60) out.push({ kind: 'steak', uid: newUid(), count: randInt(r, 1, 2) });
        else if (x < 0.74) out.push({ kind: 'arrows', uid: newUid(), count: randInt(r, 4, 12) });
        else if (x < 0.86) out.push({ kind: 'wool', uid: newUid(), count: randInt(r, 1, 3) });
        else out.push({ kind: 'apple', uid: newUid(), count: randInt(r, 1, 3) });
    }
    return out;
}

/**
 * A ship's chest: ship's food (bread, cheese, meat, pies), something valuable, a weapon now and then —
 * and very often a fishing rod (sailors fish; the rod is the «fishing» feature's thing).
 */
export function rollShipLoot(r = Math.random, captain = false) {
    const out = [];
    if (LOOT_EXTRA.fishingRod && r() < (captain ? 0.5 : 0.7)) out.push(LOOT_EXTRA.fishingRod(r));
    const n = randInt(r, 2, captain ? 4 : 3);
    for (let i = 0; i < n; i++) {
        const x = r();
        if (x < 0.2) out.push({ kind: 'bread', uid: newUid(), count: randInt(r, 1, 3) });
        else if (x < 0.32) out.push({ kind: 'cheese', uid: newUid(), count: randInt(r, 1, 2) });
        else if (x < 0.44) out.push({ kind: 'steak', uid: newUid(), count: randInt(r, 1, 2) });
        else if (x < 0.5) out.push({ kind: 'pie', uid: newUid(), count: 1 });
        else if (x < 0.62) out.push({ kind: 'weapon', type: r() < 0.6 ? 'sword' : 'axe', magic: r() < (captain ? 0.5 : 0.2), bonus: randInt(r, 1, 60), uid: newUid() });
        else if (x < 0.7) out.push({ kind: 'arrows', uid: newUid(), count: randInt(r, 5, 12) });
        else if (x < 0.78) out.push({ kind: 'apple', uid: newUid(), count: 1 });
        else if (x < (captain ? 0.92 : 0.86)) out.push(rollKeyItem(r)); // a wand, a scroll, a shield…
        else out.push({ kind: 'cannonball', uid: newUid() });
    }
    return out;
}

/** A chest holds something precious only now and then (one thing at most). */
export const KEY_CHANCE = 0.25;

/** The precious thing of a chest: a wand, a scroll, a magic weapon, shield or bow, a backpack, Thor's hammer. */
export function rollKeyItem(r = Math.random) {
    const x = r();
    if (x < 0.26) return rollWand(r);
    if (x < 0.52) {
        const y = r();
        // (no scroll of flight any more: «Флайн» is learned only from the swift book-bird's book)
        // (spell scrolls teach «Lightning Strike» / «Thunderwave» / «To the Sun» outside Creative;
        //  «Авада Кедавра» too — its scroll is the rarest)
        return y < 0.16 ? { kind: 'scroll', uid: newUid(), stat: 'hp', amount: randInt(r, 1, 5) }
            : y < 0.28 ? { kind: 'scroll', uid: newUid(), stat: 'spell', spell: 'LightningStrike' }
            : y < 0.40 ? { kind: 'scroll', uid: newUid(), stat: 'spell', spell: 'Thunderwave' }
            : y < 0.45 ? { kind: 'scroll', uid: newUid(), stat: 'spell', spell: 'ToTheSun' }
            : y < 0.48 ? { kind: 'scroll', uid: newUid(), stat: 'spell', spell: 'Alive' }
            : y < 0.52 ? { kind: 'scroll', uid: newUid(), stat: 'spell', spell: 'AvadaKedavra' }
            : y < 0.535 ? { kind: 'scroll', uid: newUid(), stat: 'spell', spell: 'TotalDestruction' }
            : y < 0.58 ? { kind: 'scroll', uid: newUid(), stat: 'spell', spell: 'CreateBoard' }
            : y < 0.60 ? { kind: 'scroll', uid: newUid(), stat: 'spell', spell: 'LetItRain' }
            : y < 0.76 ? { kind: 'scroll', uid: newUid(), stat: 'hp', amount: randInt(r, 1, 5) }
            : { kind: 'scroll', uid: newUid(), stat: 'fatigue', amount: randInt(r, 1, 10) };
    }
    if (x < 0.66) return { kind: 'weapon', type: r() < 0.5 ? 'sword' : 'axe', magic: true, bonus: randInt(r, 1, 60), uid: newUid() };
    if (x < 0.76) { const t = randInt(r, 0, 2); return { kind: 'shield', uid: newUid(), type: t, magic: true, max: randInt(r, 20, 50) }; }
    if (x < 0.86) return { kind: 'backpack', uid: newUid(), slots: randInt(r, 3, 5), color: Math.floor(r() * 0xffffff) };
    if (x < 0.96) return { kind: 'bow', uid: newUid(), type: randInt(r, 0, 2), magic: true, bonus: randInt(r, 1, 60), arrows: 10 };
    return { kind: 'hammer', uid: newUid(), charges: 0 };
}

/** The plain things of a chest: food, a plain bow, arrows, a plain shield or blade, now and then a golden apple. */
export function rollPlainItem(r = Math.random) {
    const x = r();
    if (x < 0.22) return { kind: 'bread', uid: newUid(), count: randInt(r, 1, 3) };
    if (x < 0.36) return { kind: 'cheese', uid: newUid(), count: randInt(r, 1, 2) };
    if (x < 0.48) return { kind: 'steak', uid: newUid(), count: randInt(r, 1, 2) };
    if (x < 0.58) return { kind: 'bow', uid: newUid(), type: randInt(r, 0, 2), magic: false, bonus: 0, arrows: randInt(r, 5, 12) };
    if (x < 0.74) return { kind: 'arrows', uid: newUid(), count: randInt(r, 5, 15) };
    if (x < 0.83) return { kind: 'shield', uid: newUid(), type: randInt(r, 0, 1), magic: false, max: 0 };
    if (x < 0.92) return { kind: 'weapon', type: r() < 0.5 ? 'sword' : 'axe', magic: false, bonus: 0, uid: newUid() };
    return { kind: 'apple', uid: newUid(), count: 1 };
}

/**
 * A chest in a cave or a castle: one or two plain things (food, a plain bow, arrows…) — and only
 * now and then (`key`: 25%) ONE precious thing (a wand, a scroll, a magic weapon…), never more.
 * (Coins come apart, in their pouch: Game.openChest.)
 */
export function rollLoot(r = Math.random, { cave = true, key = KEY_CHANCE } = {}) {
    const out = [];
    if (r() < key) out.push(rollKeyItem(r));
    const n = randInt(r, 1, cave ? 2 : 1);
    for (let i = 0; i < n; i++) out.push(rollPlainItem(r));
    return out;
}

/** «Раскрой свои секреты»: what the hologram says about an item. */
export function describeItem(it) {
    if (!it) return null;
    switch (it.kind) {
        case 'wand': {
            if (it.plain) return { title: '🪄 Обычная деревянная палочка', color: it.color, lines: ['Все заклинания на <b>15%</b> сильнее, чем голой рукой', 'Других свойств нет'] };
            const lines = ['Все заклинания на <b>15%</b> сильнее и на <b>15%</b> меньше маны'];
            if (it.dir) lines.push(`Направление: <b>${WAND_DIRS[it.dir].name}</b> (+25%${it.dir === 'build' ? ', ресурсов на 40% меньше' : ''})`);
            else lines.push('Направление: нет');
            const fav = SPELL_RU[it.fav] || it.fav;
            lines.push(it.fav === 'Protection' ? `Особое заклинание: <b>${fav}</b> — держится на 40% дольше` : `Особое заклинание: <b>${fav}</b> (+40%${['Bombardo', 'Earthquake', 'Wind', 'WaveAttack', 'Protection'].includes(it.fav) ? ', и его Максима' : ''})`);
            lines.push(`Сила палочки: <b>+${it.power}%</b> в бою`);
            return { title: '🪄 Волшебная палочка', color: it.color, lines };
        }
        case 'weapon':
            return it.magic
                ? { title: `✨ Волшебный ${it.type === 'axe' ? 'топор' : 'меч'}`, color: 0x9fd8ff, lines: [`Урон больше на <b>${it.bonus}%</b>`, 'Разбивает обычный «Protection», которого коснётся'] }
                : { title: it.type === 'axe' ? '🪓 Топор' : '🗡️ Меч', color: 0xaaaaaa, lines: ['Обычный, не волшебный'] };
        case 'shield':
            return { title: '🛡️ ' + SHIELD_KINDS[it.type || 0].name + (it.magic ? ' (волшебный)' : ''), color: it.magic ? 0x9fd8ff : 0xaaaaaa, lines: it.magic ? [`Своя сила: <b>${it.max}</b> (восстанавливается)`, 'Держит заклинания и удары; слабый — сильное заклинание его разобьёт'] : ['Держит удары и слабые заклинания', 'Сильное заклинание его разобьёт'] };
        case 'scroll':
            if (it.stat === 'flight') return { title: '📜 Свиток полёта', color: 0x9fd8ff, lines: ['Сожгите его («Инферно»): вы научитесь заклинанию <b>«Флайн»</b> навсегда'] };
            if (it.stat === 'spell') return { title: `📜 Свиток «${SPELL_LABEL[it.spell] || it.spell}»`, color: SPELL_RIBBON[it.spell] || 0xffe9a8, lines: [`Сожгите его («Инферно»): вы научитесь заклинанию <b>«${SPELL_LABEL[it.spell] || it.spell}»</b> навсегда`, ...(it.spell === 'LetItRain' ? ['Рука или палочка к небу и «Let it rain»: гроза с ливнем на 2 игровых часа'] : []), it.spell === 'CreateBoard' ? 'Его можно выучить и из книги птицы-книги' : 'Без свитка оно есть только в Творческом режиме'] };
            return { title: '📜 Свиток', color: 0xffe9a8, lines: [it.stat === 'hp' ? `Сожгите его: здоровье +<b>${it.amount}</b> навсегда` : `Сожгите его: мана +<b>${it.amount}</b> навсегда`] };
        case 'book':
            if (it.runbook) return { title: '📕 Бегущая книга', color: 0xffd23f, lines: ['Раскройте её двумя руками и прочитайте единственную страницу:', 'бег на <b>30%</b> быстрее, пока вы живы', 'Это не заклинание — только быстрота'] };
            if (it.swift || it.spells?.includes('Flight')) return { title: '📘 Быстрая книга', color: SWIFT_COVER, lines: ['Сожгите её («Инферно» с книгой в руке или в огне): вы научитесь заклинанию <b>«Флайн»</b> (полёт) навсегда', 'Раскрыть и прочитать можно, но выучит «Флайн» только тот, кто её сожжёт'] };
            return { title: '📖 Книга заклинаний', color: 0xffe9a8, lines: ['Раскройте и прочитайте (или сожгите «Инферно»): в ней заклинания для стройки'] };
        case 'backpack':
            return { title: '🎒 Рюкзак', color: it.color, lines: [`+<b>${it.slots}</b> ячейки, если надеть (руки за спину)`] };
        case 'bow':
            return { title: '🏹 ' + BOW_KINDS[it.type || 0] + (it.magic ? ' (волшебный)' : ''), color: it.magic ? 0x9fd8ff : 0xaaaaaa, lines: [it.magic ? `Стрелы бьют сильнее на <b>${it.bonus}%</b>` : 'Обычный лук', `Стрел: <b>${it.arrows ?? 0}</b> (до 25)`] };
        case 'hammer':
            return { title: '🔨 Молот Тора', color: 0xbfe3ff, lines: ['В грозу поднимите его вверх — в него ударит молния', 'Наведите на цель: молния бьёт туда (до 3 раз)', `Заряды: <b>${it.charges || 0}</b>`] };
        case 'arrows': return { title: '➶ Стрелы', color: 0xd9b46c, lines: [`Стрел: <b>${it.count}</b>`, 'Возьмите — они сами лягут в колчан лука (до 25)'] };
        case 'apple': return { title: '🍏 Золотое яблоко', color: 0xffd700, lines: ['Поднесите ко рту: +10 HP', 'Коня можно приручить яблоком'] };
        case 'meat': return { title: '🥩 Сырое мясо', color: 0xd9534f, lines: ['Поднесите ко рту: +2 HP', 'Пожарьте на костре («Fire») — будет +4'] };
        case 'steak': return { title: '🍖 Стейк', color: 0xb5651d, lines: ['Поднесите ко рту: +4 HP'] };
        case 'wool': return { title: '🧶 Шерсть', color: 0xf6f4ee, lines: [`Клубков: <b>${it.count || 1}</b>`, 'Для кровати: 3 шерсти + 4 бревна рядом и «Create a Bed»'] };
        case 'coins': return { title: '💰 Монеты', color: 0xffd700, lines: [`Монет: <b>${it.count || 0}</b>`, 'Привяжите к поясу справа: кулак с мешочком на правый бок', 'Платите ими на рынке замка'] };
        case 'bread': case 'cheese': case 'pie': return { title: `${ITEM_INFO[it.kind].icon} ${ITEM_INFO[it.kind].name}`, color: 0xd9b46c, lines: [`Поднесите ко рту: +${ITEM_INFO[it.kind].heal} HP`] };
        case 'crystal': return { title: '💎 Кристалл маны', color: 0x5cb8ff, lines: [`Кристаллов: <b>${it.count || 1}</b>`, 'Возьмитесь за него <b>обеими руками</b> и разломите (разведите руки или поверните) — мана +<b>5</b> к максимуму'] };
        default: return { title: ITEM_INFO[it.kind]?.name || 'Предмет', color: 0xaaaaaa, lines: ['Не волшебный'] };
    }
}

// ================================================================== models
const _mat = new Map();
function mat(color, opts = {}) {
    const key = color + JSON.stringify(opts);
    if (!_mat.has(key)) {
        const m = opts.standard ? new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.4, metalness: opts.metal ?? 0.6, emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.ei ?? 1 }) : new THREE.MeshLambertMaterial({ color, emissive: opts.emissive ?? 0x000000 });
        m.userData.shared = true;
        _mat.set(key, m);
    }
    return _mat.get(key);
}
const box = (w, h, d, m, x = 0, y = 0, z = 0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); return b; };
const cyl = (r1, r2, h, m, x = 0, y = 0, z = 0, seg = 8) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r1, r2, h, seg), m); c.position.set(x, y, z); return c; };

/**
 * Ten wand designs (the colour is each wand's own): along +Y, the tip at y≈0.62.
 */
function wandModel(it) {
    const g = new THREE.Group();
    if (it.plain) {
        // a plain wooden wand: a turned handle and a tapering shaft, no metal, no light
        const wood = mat(0x6b4423), dark = mat(0x4a2e17);
        g.add(cyl(0.034, 0.038, 0.2, dark, 0, 0.1));
        g.add(cyl(0.039, 0.039, 0.02, wood, 0, 0.2));
        g.add(cyl(0.012, 0.03, 0.42, wood, 0, 0.41));
        g.userData.tipY = 0.62;
        return g;
    }
    const col = new THREE.Color(it.color ?? 0x8b5a2b);
    const wood = mat(col.clone().multiplyScalar(0.55).getHex());
    const light = mat(col.clone().lerp(new THREE.Color(0xffffff), 0.35).getHex());
    const gold = mat(0xd4af37, { standard: true, metal: 0.9, rough: 0.3 });
    const glow = new THREE.MeshBasicMaterial({ color: col.clone().lerp(new THREE.Color(0xffffff), 0.5) });
    const m = it.model ?? 0;
    // handle
    g.add(cyl(0.035, 0.04, 0.2, wood, 0, 0.1));
    if (m % 3 === 0) g.add(cyl(0.045, 0.045, 0.03, gold, 0, 0.21));
    if (m === 1 || m === 6) { g.add(cyl(0.046, 0.046, 0.025, light, 0, 0.05)); g.add(cyl(0.046, 0.046, 0.025, light, 0, 0.15)); }
    // shaft
    const shaft = cyl(0.016, 0.03, 0.42, m === 4 ? light : wood, 0, 0.41);
    g.add(shaft);
    if (m === 2 || m === 7) for (let i = 0; i < 6; i++) { const k = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.006, 4, 8), gold); k.rotation.x = Math.PI / 2; k.position.y = 0.26 + i * 0.06; g.add(k); }
    if (m === 3 || m === 8) for (let i = 0; i < 3; i++) g.add(new THREE.Mesh(new THREE.SphereGeometry(0.03, 6, 5), wood)).position.set(0, 0.3 + i * 0.11, 0);
    if (m === 5) { const spiral = new THREE.Mesh(new THREE.TorusKnotGeometry(0.03, 0.006, 40, 4, 1, 8), light); spiral.scale.set(1, 6, 1); spiral.position.y = 0.4; g.add(spiral); }
    // tip
    if (m === 4 || m === 9) { const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.035), glow); c.position.y = 0.64; g.add(c); }
    else if (m === 6) { const f1 = cyl(0.008, 0.012, 0.08, wood, 0.02, 0.65); f1.rotation.z = -0.4; const f2 = f1.clone(); f2.position.x = -0.02; f2.rotation.z = 0.4; g.add(f1, f2); }
    else g.add(new THREE.Mesh(new THREE.SphereGeometry(0.017, 6, 5), glow)).position.set(0, 0.625, 0);
    g.userData.tipY = 0.65;
    return g;
}

function scrollModel(it) {
    const g = new THREE.Group();
    const paper = mat(0xf3e2b3);
    const r = cyl(0.06, 0.06, 0.36, paper);
    r.rotation.z = Math.PI / 2;
    g.add(r);
    const ribbon = cyl(0.064, 0.064, 0.05, mat(it?.stat === 'flight' ? 0x3a9ad9 : it?.stat === 'spell' ? (SPELL_RIBBON[it.spell] || 0x8e2b2b) : 0x8e2b2b)); // (flight: a sky-blue ribbon, spells: their own colour)
    ribbon.rotation.z = Math.PI / 2;
    g.add(ribbon);
    for (const s of [-1, 1]) { const e = cyl(0.03, 0.03, 0.06, mat(0x5a3a1e), s * 0.21, 0); e.rotation.z = Math.PI / 2; g.add(e); }
    return g;
}

function heaterShape(w, h) {
    // a heater shield: a flat top, straight sides, then curving down to a point
    const sh = new THREE.Shape();
    const hw = w / 2, top = h * 0.45, mid = -h * 0.05, bot = -h * 0.55;
    sh.moveTo(-hw, top);
    sh.lineTo(hw, top);
    sh.lineTo(hw, mid);
    sh.quadraticCurveTo(hw * 0.95, bot * 0.75, 0, bot);
    sh.quadraticCurveTo(-hw * 0.95, bot * 0.75, -hw, mid);
    sh.lineTo(-hw, top);
    return sh;
}

function shieldModel(it) {
    const g = new THREE.Group();
    const k = SHIELD_KINDS[it.type || 0];
    const t = it.type || 0;
    const face = mat(k.color), rimM = mat(k.rim);
    if (t === 0) {
        // round wooden shield: planks, an iron rim, a boss in the middle
        const disc = cyl(0.42, 0.42, 0.06, face, 0, 0, 0, 20);
        disc.rotation.x = Math.PI / 2;
        g.add(disc);
        g.add(new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.035, 6, 24), rimM));
        for (let i = -1; i <= 1; i++) g.add(box(0.02, 0.8, 0.07, mat(0x5a3a1e), i * 0.2, 0, 0));
        g.add(new THREE.Mesh(new THREE.SphereGeometry(0.08, 10, 8), mat(0x9aa3ad, { standard: true, metal: 0.8, rough: 0.35 }))).position.z = 0.04;
    } else if (t === 1) {
        // iron heater shield: pointed bottom, a raised edge, a stripe
        const geo = new THREE.ExtrudeGeometry(heaterShape(0.72, 0.95), { depth: 0.05, bevelEnabled: true, bevelSize: 0.025, bevelThickness: 0.02, bevelSegments: 1, curveSegments: 10 });
        geo.translate(0, 0, -0.025);
        g.add(new THREE.Mesh(geo, mat(0xb9c2cc, { standard: true, metal: 0.35, rough: 0.45 })));
        g.add(box(0.08, 0.86, 0.08, rimM, 0, -0.04, 0.02));
        g.add(box(0.66, 0.06, 0.08, rimM, 0, 0.4, 0.02));
    } else {
        // the knight's tower shield: tall and straight, a golden cross
        g.add(box(0.62, 1.05, 0.06, face));
        g.add(box(0.66, 0.06, 0.08, rimM, 0, 0.52)); g.add(box(0.66, 0.06, 0.08, rimM, 0, -0.52));
        g.add(box(0.06, 1.08, 0.08, rimM, 0.32, 0)); g.add(box(0.06, 1.08, 0.08, rimM, -0.32, 0));
        g.add(box(0.09, 0.7, 0.07, mat(0xd4af37), 0, 0, 0.01)); g.add(box(0.45, 0.09, 0.07, mat(0xd4af37), 0, 0.12, 0.01));
    }
    if (it.magic) {
        const halo = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.02, 6, 24), new THREE.MeshBasicMaterial({ color: 0x9fd8ff, transparent: true, opacity: 0.7 }));
        g.add(halo);
        g.userData.halo = halo;
    }
    return g;
}

function backpackModel(it) {
    const g = new THREE.Group();
    const c = mat(it.color ?? 0x7a4a24);
    const dark = mat(new THREE.Color(it.color ?? 0x7a4a24).multiplyScalar(0.6).getHex());
    g.add(box(0.7, 0.85, 0.35, c));
    g.add(box(0.72, 0.25, 0.37, dark, 0, 0.32, 0.01));
    g.add(box(0.5, 0.3, 0.12, dark, 0, -0.15, 0.22));
    g.add(box(0.08, 0.08, 0.05, mat(0xd4af37), 0, 0.22, 0.2));
    // the carrying loop on top (the hand hooks its fingers into it)
    g.add(box(0.24, 0.04, 0.04, dark, 0, 0.52, 0));
    g.add(box(0.03, 0.09, 0.03, dark, -0.105, 0.47, 0));
    g.add(box(0.03, 0.09, 0.03, dark, 0.105, 0.47, 0));
    return g;
}

function bowModel(it) {
    const g = new THREE.Group();
    const wood = mat(it.magic ? 0x6b3f8e : [0x8b5a2b, 0x5a3a1e, 0x7a4a24][it.type || 0]);
    const n = 9, R = it.type === 2 ? 0.75 : 0.6;
    const limbs = [];
    for (let i = 0; i < n; i++) {
        const a = -0.9 + (1.8 * i) / (n - 1);
        const seg = box(0.05, (R * 1.9) / n + 0.02, 0.05, wood, 0, 0, 0);
        limbs.push({ seg, a });
        g.add(seg);
    }
    // the string: two halves from the tips to the nock point (pulled back into a «V» when drawn)
    // (braced well behind the grip: the string clears the bow fist's thumb and knuckles)
    const tipX = Math.cos(0.9) * R * BOW_CURVE - R * BOW_CURVE, tipY = Math.sin(0.9) * R;
    const strMat = new THREE.MeshBasicMaterial({ color: 0xf2efe6 });
    const strGeo = new THREE.CylinderGeometry(0.007, 0.007, 1, 4);
    const up = new THREE.Mesh(strGeo, strMat), down = new THREE.Mesh(strGeo, strMat);
    g.add(up, down);
    g.add(box(0.07, 0.16, 0.07, mat(0x3b2414), 0, 0, 0)); // the leather grip
    g.userData.bowString = { up, down, tipX, tipY, R, limbs, tipXf: tipX, tipYf: tipY };
    setBowString(g, null);
    if (it.magic) g.add(new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshBasicMaterial({ color: 0xc39bff }))).position.set(-0.02, 0, 0);
    return g;
}

/** How deep the bow's limbs curve back (× R): its brace height — the string's distance behind the grip. */
export const BOW_CURVE = 0.5;
/** Drawn fully, the limbs curve this much more (the tips come back and in). */
const BOW_FLEX = 0.6;

/** The limbs bent by the draw (flex 0 at rest … 1 fully drawn): each segment along the deeper curve. */
function flexLimbs(S, flex) {
    if (S.flex === flex) return;
    S.flex = flex;
    const k = BOW_CURVE * (1 + BOW_FLEX * flex), sy = 1 - 0.06 * flex;
    for (const { seg, a } of S.limbs) {
        seg.position.set(Math.cos(a) * S.R * k - S.R * k, Math.sin(a) * S.R * sy, 0);
        // (turned as at rest, plus how much more the deeper curve turns it there)
        seg.rotation.z = a + Math.atan2(k * Math.sin(a), sy * Math.cos(a)) - Math.atan2(BOW_CURVE * Math.sin(a), Math.cos(a));
    }
    S.tipXf = Math.cos(0.9) * S.R * k - S.R * k;
    S.tipYf = Math.sin(0.9) * S.R * sy;
}

const _sa = new THREE.Vector3(), _sb = new THREE.Vector3(), _sy = new THREE.Vector3(0, 1, 0);
function strandBetween(m, ax, ay, bx, by) {
    _sa.set(bx - ax, by - ay, 0);
    const len = _sa.length();
    m.position.set((ax + bx) / 2, (ay + by) / 2, 0);
    m.scale.set(1, Math.max(1e-3, len), 1);
    m.quaternion.setFromUnitVectors(_sy, _sb.copy(_sa).normalize());
}

/**
 * Pull a bow's string to a nock point (bow-local x, or null: at rest, straight);
 * nockY: how high on the string the arrow is nocked (bow-local, 0 = the middle);
 * flex: how far it is drawn (0 … 1) — the limbs bend with it.
 */
export function setBowString(bow, nockX, nockY = 0, flex = 0) {
    const S = bow.userData.bowString;
    if (!S) return;
    if (S.limbs) flexLimbs(S, nockX == null ? 0 : Math.max(0, Math.min(1, flex)));
    const tx = S.tipXf ?? S.tipX, ty = S.tipYf ?? S.tipY;
    const nx = nockX == null ? tx : Math.min(tx, nockX);
    const ny = nockX == null ? 0 : nockY;
    strandBetween(S.up, tx, ty, nx, ny);
    strandBetween(S.down, tx, -ty, nx, ny);
    S.nockX = nx;
    S.nockY = ny;
}

export const ARROW_SCALE = 2.4;

export function arrowModel() {
    const g = new THREE.Group();
    g.scale.setScalar(ARROW_SCALE);
    g.add(cyl(0.012, 0.012, 0.8, mat(0x8b5a2b), 0, 0));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 6), mat(0x9aa3ad, { standard: true }));
    tip.position.y = 0.44;
    g.add(tip);
    for (let i = 0; i < 3; i++) { const f = box(0.004, 0.12, 0.05, mat(0xf2f2f2), 0, -0.34); f.rotation.y = (i * Math.PI * 2) / 3; g.add(f); }
    return g;
}

function hammerModel() {
    const g = new THREE.Group();
    g.add(cyl(0.035, 0.035, 0.45, mat(0x5a3a1e), 0, 0.22));
    g.add(box(0.36, 0.22, 0.22, mat(0xb8c2cc, { standard: true, metal: 0.95, rough: 0.25 }), 0, 0.5));
    g.add(cyl(0.04, 0.04, 0.05, mat(0xd4af37, { standard: true }), 0, 0.02));
    return g;
}

function appleModel() {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), mat(0xffd700, { standard: true, metal: 0.7, rough: 0.3, emissive: 0x332200 })));
    g.add(cyl(0.008, 0.008, 0.06, mat(0x5a3a1e), 0, 0.12));
    const leaf = box(0.06, 0.01, 0.03, mat(0x2e8b2e), 0.03, 0.13);
    g.add(leaf);
    return g;
}

/** A pouch of coins (tied at the neck: the coins are inside, not seen). */
function coinsModel() {
    const g = new THREE.Group();
    const sack = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), mat(0x8b5a2b));
    sack.scale.set(1, 0.85, 1);
    g.add(sack);
    g.add(cyl(0.05, 0.07, 0.07, mat(0x7a4a22), 0, 0.12));
    g.add(cyl(0.055, 0.055, 0.015, mat(0xc9a227), 0, 0.1)); // (the cord)
    return g;
}

function breadModel() {
    const g = new THREE.Group();
    g.add(box(0.3, 0.12, 0.15, mat(0xc68a3e)));
    g.add(box(0.26, 0.04, 0.12, mat(0xa86b2a), 0, 0.07));
    for (let i = -1; i <= 1; i++) g.add(box(0.03, 0.01, 0.13, mat(0xe8c48a), i * 0.08, 0.095));
    return g;
}

function cheeseModel() {
    const g = new THREE.Group();
    g.add(box(0.22, 0.12, 0.16, mat(0xf2c94c)));
    for (const [x, y, z] of [[-0.05, 0.02, 0.081], [0.06, -0.02, 0.081], [0.02, 0.061, 0.02]]) g.add(box(0.03, 0.03, 0.005, mat(0xc9a227), x, y, z));
    return g;
}

function pieModel() {
    const g = new THREE.Group();
    g.add(cyl(0.15, 0.13, 0.07, mat(0xc68a3e)));
    g.add(cyl(0.13, 0.15, 0.025, mat(0xe0a95a), 0, 0.045));
    g.add(cyl(0.05, 0.05, 0.01, mat(0x8e2b2b), 0, 0.06));
    return g;
}

function meatModel(cooked) {
    const g = new THREE.Group();
    g.add(box(0.26, 0.1, 0.18, mat(cooked ? 0x8b4513 : 0xd9534f)));
    g.add(box(0.2, 0.02, 0.14, mat(cooked ? 0x5a2d0c : 0xf2b8b5), 0, 0.055));
    g.add(cyl(0.025, 0.025, 0.14, mat(0xf2efe6), 0.17, 0)).rotation.z = Math.PI / 2;
    return g;
}

/**
 * How big each kind of thing is next to the hero (~4.8 m tall: everything is
 * about 2.5× a real person's things). The models are drawn smaller and scaled.
 */
export const ITEM_SCALE = { bow: 2.4, shield: 2.2, wand: 2.2, scroll: 2, hammer: 2.1, backpack: 1.6, arrows: 1, book: 1.6, apple: 1.8, coins: 1.8, bread: 1.8, cheese: 1.8, pie: 1.8, meat: 1.8, steak: 1.8, bronzeHorn: 2.2, minotaurHorn: 2.4 };

export function makeItemModel(it) {
    const m = buildItemModel(it);
    const s = ITEM_SCALE[it.kind];
    if (s && s !== 1) m.scale.multiplyScalar(s);
    return m;
}

function buildItemModel(it) {
    switch (it.kind) {
        case 'wand': return wandModel(it);
        case 'scroll': return scrollModel(it);
        case 'shield': return shieldModel(it);
        case 'backpack': return backpackModel(it);
        case 'bow': return bowModel(it);
        case 'hammer': return hammerModel(it);
        case 'apple': return appleModel(it);
        case 'meat': return meatModel(false);
        case 'arrows': { const g = new THREE.Group(); for (let i = 0; i < 5; i++) { const a = arrowModel(); a.position.set((i - 2) * 0.12, 0, 0); a.rotation.z = (i - 2) * 0.06; g.add(a); } return g; }
        case 'steak': return meatModel(true);
        case 'coins': return coinsModel();
        case 'bread': return breadModel();
        case 'cheese': return cheeseModel();
        case 'pie': return pieModel();
        case 'wool': return woolModel();
        case 'logs': return logsModel(it.color);
        case 'cannonball': { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 9), mat(0x2b2b2e))); return g; }
        case 'blocks': return blocksModel(it.color);
        case 'crystal': return crystalItemModel();
        case 'bronzeHorn': return hornModel(0xb87333, true);
        case 'minotaurHorn': return hornModel(0x3a3028, false);
        case 'book': return it.swift || it.spells?.includes('Flight') ? makeSpellBookModel(SWIFT_COVER, SWIFT_TRIM) : makeSpellBookModel(COVERS[(it.id || 1) % COVERS.length]);
        default: { const g = new THREE.Group(); g.add(box(0.3, 0.3, 0.3, mat(0xaaaaaa))); return g; }
    }
}

/** A big horn: the bronze bull's (long, curved, metal) or the minotaur's (a dark spiral with a faint glow). */
function hornModel(color, bronze) {
    const g = new THREE.Group();
    const pts = [];
    if (bronze) for (let i = 0; i <= 10; i++) { const t = i / 10; pts.push(new THREE.Vector3(t * 0.5, Math.sin(t * 1.6) * 0.18, 0)); }
    else for (let i = 0; i <= 24; i++) { const a = i / 24 * Math.PI * 2.2, r = 0.17 * (1 - i / 36); pts.push(new THREE.Vector3(Math.sin(a) * r, i * 0.012, -Math.cos(a) * r)); }
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, bronze ? 14 : 40, bronze ? 0.045 : 0.05, 8, false);
    // (tapering to the tip)
    const P = geo.getAttribute('position'), v = new THREE.Vector3(), c = new THREE.Vector3();
    const n = (bronze ? 14 : 40) + 1;
    for (let i = 0; i < P.count; i++) {
        const ring = Math.floor(i / 9), t = Math.min(1, ring / (n - 1));
        curve.getPointAt(t, c);
        v.fromBufferAttribute(P, i).sub(c).multiplyScalar(1 - 0.85 * t).add(c);
        P.setXYZ(i, v.x, v.y, v.z);
    }
    geo.computeVertexNormals();
    const m = bronze ? new THREE.MeshStandardMaterial({ color, metalness: 0.85, roughness: 0.3, emissive: 0x2a0e00 })
        : new THREE.MeshStandardMaterial({ color, roughness: 0.6, emissive: 0x2a1450, emissiveIntensity: 0.6 });
    const mesh = new THREE.Mesh(geo, m);
    mesh.castShadow = true;
    g.add(mesh);
    return g;
}

/** A little heap of gathered blocks (their colour). */
function blocksModel(color = 0x999999) {
    const g = new THREE.Group();
    const m = mat(color);
    g.add(box(0.3, 0.3, 0.3, m, -0.17, 0.15, 0), box(0.3, 0.3, 0.3, m, 0.17, 0.15, 0.04), box(0.3, 0.3, 0.3, m, 0, 0.45, 0.02));
    return g;
}

export function disposeModel(m) {
    m.traverse((o) => { if (o.isMesh) { if (!o.geometry.userData?.shared) o.geometry.dispose(); if (!o.material.userData.shared) o.material.dispose?.(); } });
}
