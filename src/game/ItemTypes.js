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
import { makeSpellBookModel, COVERS, SWIFT_COVER, SWIFT_TRIM, WARD_COVER, WARD_TRIM } from './BookModel.js';
import { crystalItemModel } from './CrystalModel.js';
import { pouchModel } from './PouchModel.js';
import { flaskModel } from './CauldronModel.js';
import { recipeById } from './Potions.js';
import { DRAGON_KINDS } from './DragonKinds.js';
import { rollChestArmor, armorValue, describeArmor } from './ArmorTypes.js';
import { armorItemModel } from '../entities/ArmorLook.js';
import { iceRodModel } from './IceModels.js';

export const WAND_DIRS = {
    duel: { name: 'дуэльная', spells: ['Sapira', 'Stupefy', 'AvadaKedavra', 'Levitation', 'Expelliarmus', 'Jolt'] },
    destroy: { name: 'разрушения', spells: ['Bombardo', 'BombardoMaxima', 'Inferno', 'Thunderwave', 'Earthquake', 'EarthquakeMaxima', 'LightningStrike', 'Sands', 'Ice', 'TotalDestruction', 'Drawdown', 'DrawdownMaxima', 'Liquidation', 'LiquidationMaxima'] },
    gather: { name: 'собирательства', spells: ['Gather', 'Accio', 'Wind', 'WindMaxima', 'Waterball', 'WaveAttack', 'WaveAttackMaxima', 'WaterVortex', 'WindImpulse', 'WindImpulseMaxima'] },
    build: { name: 'строительства', spells: ['CreateFloor', 'CreateWall', 'CreateCeiling', 'BuildRoof', 'CreateDoor', 'WaterForming', 'CreateBoard', 'Stitching'] },
};
/** Spells a wand can favour; a Maxima form goes with its base spell. */
export const WAND_FAVOURITES = ['Inferno', 'Thunderwave', 'Sapira', 'Ice', 'Sands', 'Bombardo', 'Earthquake', 'Wind', 'Stupefy', 'AvadaKedavra', 'Levitation', 'Accio', 'Protection', 'LightningStrike', 'WaveAttack', 'Lumos', 'Gather', 'Brainrot'];
export const SPELL_RU = {
    Inferno: 'Инферно', Thunderwave: 'Тандервейв', Sapira: 'Сапира', Ice: 'Айс', Sands: 'Даст', Bombardo: 'Бомбардо', Earthquake: 'Earthquake',
    Wind: 'Вайнд', Stupefy: 'Остолбеней', AvadaKedavra: 'Авада Кедавра', Levitation: 'Вингардиум Левиоса', Accio: 'Акцио', Protection: 'Protection',
    LightningStrike: 'Lightning Strike', ToTheSun: 'To the Sun', WaveAttack: 'Wave Attack', Lumos: 'Люмос', Gather: 'Gather', Brainrot: 'Брейнрот', Alive: 'Alive',
    WaterVortex: 'Water Vortex', CreateBoard: 'Create a Board', TotalDestruction: 'Total Destruction', CircleAttack: 'Circle Attack', Inspirius: 'Inspirius', LetItRain: 'Let it rain', Hellfire: 'Let the Hellfire Come', WaterVortexSuperMaxima: 'Water Vortex Super Maxima',
    Unfurl: 'Анфёрл', Furl: 'Фёрл', Overgrown: 'Overgrown', Expelliarmus: 'Экспеллиармус', Disarmor: 'Disarmor', SuitUp: 'Suit Up', Alohomora: 'Алохомора', Lock: 'Lock', AlohomoraMaxima: 'Алохомора Максима', LevitationMaxima: 'Вингардиум Левиоса Максима', BombardoMaxima: 'Бомбардо Максима', OvergrownMaxima: 'Overgrown Максима', Jolt: 'Джолт', Firefighting: 'Firefighting', FirefightingMaxima: 'Firefighting Максима',
    ProtectionHouse: 'Protection House', ProtectionInvisible: 'Protection Invisible', ProtectionHouseGrant: 'Protection House Grant',
    CreateHouse: 'Create a House', ImproveHouse: 'Improve a House',
    WindImpulse: 'Wind Impulse', WindImpulseMaxima: 'Wind Impulse Maxima', Drawdown: 'Drawdown', DrawdownMaxima: 'Drawdown Maxima', Liquidation: 'Liquidation', LiquidationMaxima: 'Liquidation Maxima',
    Stitching: 'Stitching', Invisibility: 'Invisibility',
    // (the four scrolls of the Temple of the Gods' library — GodsTemple.js; the spells themselves: «Космос»)
    CreatePlanet: 'Create a Planet', EnlargePlanet: 'Enlarge Planet', TerraformPlanet: 'Terraform Planet', LevitationSuperMaxima: 'Wingardium Leviosa Super Maxima',
};
/** Spells that outside Creative only a burnt scroll teaches (and the scroll's ribbon colour). */
export const SCROLL_SPELL_COLOR = { LightningStrike: 0xffd84a, Thunderwave: 0x8fa8ff, ToTheSun: 0xff9a2b, AvadaKedavra: 0x2ec95a, Alive: 0x9a6a2e, TotalDestruction: 0x1c1c1c, LetItRain: 0xc4d0dc, AlohomoraMaxima: 0xb87333, LevitationMaxima: 0xc8a2ff, BombardoMaxima: 0xd2452b, OvergrownMaxima: 0x9be15d, Hellfire: 0x7a0d0d, FirefightingMaxima: 0x3fb6ff, Inspirius: 0x7fe3ff, CreateHouse: 0xffb300, ImproveHouse: 0xf4f1e8, WindImpulse: 0xb8c4cc, Invisibility: 0x5b2a86, CreatePlanet: 0x2f6fd1, EnlargePlanet: 0xff6f3c, TerraformPlanet: 0x1fae7a, LevitationSuperMaxima: 0xf2e6ff, GiveMyPower: 0x9a7b1c }; // («Wind Impulse»: one scroll — its «Максима» too) // («Firefighting» itself is known too: only its Maxima hose comes from a scroll) // («Алохомора» itself is known; only its Maxima comes from a scroll)
/** What the temple's scrolls are for (GodsTemple.js — the library of the Temple of the Gods). */
const TEMPLE_SCROLL_LINE = {
    CreatePlanet: 'Заклинание богов: создать в космосе новую планету',
    EnlargePlanet: 'Заклинание богов: сделать планету больше',
    TerraformPlanet: 'Заклинание богов: переделать планету — воздух, вода, земля, жизнь',
    LevitationSuperMaxima: 'Заклинание богов: двигать целую планету в космосе',
};
/** The ribbon's colour in words (for the hint when a spell isn't learnt yet). */
/** Ribbon colours of every spell scroll (also the ones a book-bird's book can teach, like «Create a Board»). */
export const SPELL_RIBBON = { ...SCROLL_SPELL_COLOR, CreateBoard: 0x2ec4b6 };
export const SCROLL_RIBBON_RU = { LightningStrike: 'золотая', Thunderwave: 'синяя', ToTheSun: 'оранжевая', AvadaKedavra: 'зелёная', Alive: 'коричневая', TotalDestruction: 'чёрная', LetItRain: 'серебряная', AlohomoraMaxima: 'медная', LevitationMaxima: 'сиреневая', BombardoMaxima: 'красная', OvergrownMaxima: 'салатовая', Hellfire: 'багровая', Inspirius: 'сияющая бело-голубая', FirefightingMaxima: 'голубая', CreateHouse: 'янтарная', ImproveHouse: 'белая', WindImpulse: 'светло-серая', Invisibility: 'фиолетовая', GiveMyPower: 'тёмно-золотая', CreatePlanet: 'синяя со звёздами', EnlargePlanet: 'коралловая', TerraformPlanet: 'изумрудная', LevitationSuperMaxima: 'жемчужная' };
const SPELL_LABEL = SPELL_RU;
/** The base spell of a Maxima form (for favourites and directions). */
export const baseSpell = (name) => (name || '').replace(/Maxima$/, '');

/** Raw meat by the animal it came from (HP when eaten raw); roasted on a fire it gives twice as much. */
export const MEAT_HP = { cow: 8, horse: 8, pig: 7, sheep: 6, ram: 6, bull: 9, minotaur: 10, pegasus: 9 };
export const MEAT_RU = { cow: 'говядина', horse: 'конина', pig: 'свинина', sheep: 'баранина', ram: 'баранина', bull: 'говядина', minotaur: 'мясо минотавра', pegasus: 'мясо пегаса' };
/** How much health this food gives (golden apple 10, apple 3, raw meat 5–10 by the animal, roasted ×2, the rest its own `heal`). */
export function foodHeal(it) {
    if (!it) return 0;
    if (it.kind === 'apple') return 10;
    if (it.kind === 'meat') return MEAT_HP[it.from] ?? 6;
    if (it.kind === 'steak') return 2 * (MEAT_HP[it.from] ?? 6);
    if (it.kind === 'fish') return it.cooked ? 10 : 5;
    return ITEM_INFO[it.kind]?.heal ?? 1;
}

export const ITEM_INFO = {
    wand: { name: 'Волшебная палочка', icon: '🪄', weight: 0.15 },
    scroll: { name: 'Свиток', icon: '📜', weight: 0.2 },
    shield: { name: 'Щит', icon: '🛡️', weight: 3 },
    backpack: { name: 'Рюкзак', icon: '🎒', weight: 1.5 },
    bow: { name: 'Лук', icon: '🏹', weight: 1 },
    hammer: { name: 'Молот Тора', icon: '🔨', weight: 4 },
    apple: { name: 'Золотое яблоко', icon: '🍏', weight: 0.2, stack: 10 },
    redApple: { name: 'Яблоко', icon: '🍎', weight: 0.2, stack: 10, heal: 3 }, // (an ordinary apple from an apple tree)
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
    // potions (Cauldrons.js): an empty flask is dipped into a ready cauldron; a full one is drunk
    flask: { name: 'Пустая колба', icon: '⚗️', weight: 0.2, stack: 5 },
    potion: { name: 'Зелье', icon: '🧪', weight: 0.3 },
    // ingredients of the invisibility potion: the giant spider's web (Spider.js), glass of a broken window (Houses.js)
    web: { name: 'Связка паутины', icon: '🕸️', weight: 0.3, stack: 5 },
    glass: { name: 'Осколки стекла', icon: '🔷', weight: 0.3, stack: 10 },
    // (the Ice Queen's chests — IceQueen.js — rollIceQueenLoot)
    // the dragons' lairs (Dragons.js): one egg per dragon on its hoard — for potions later (no hatching)
    dragonEgg: { name: 'Яйцо дракона', icon: '🥚', weight: 4 },
    // the phoenix (Phoenixes.js): what it leaves when it is killed — for potions later (no effect yet)
    phoenixFeather: { name: 'Перо феникса', icon: '🪶', weight: 0.05, stack: 10 },
    // armour and robes (ArmorTypes.js): a piece {piece: helmet | chest | legs, magic, hp…}; put on by hand or «Suit Up»
    armor: { name: 'Доспех', icon: '🪖', weight: 4 },
    robe: { name: 'Мантия', icon: '🧥', weight: 1 },
    // the Ice Queen's rod (IceQueen.js): one in the world, she drops it — not a wand: a staff of ice
    iceRod: { name: 'Ледяной Жезл', icon: '❄️', weight: 2 },
};

/**
 * What a thing is worth at a castle market (the merchant pays about this much;
 * magic things are dear). Weapons lying on a stall count too.
 */
export function itemValue(it) {
    if (!it) return 0;
    switch (it.kind) {
        case 'wand': return it.plain ? 20 : it.dragon ? 900 : 150 + 2 * (it.power || 0);
        case 'dragonEgg': return 700;
        case 'weapon': return it.magic ? 120 + 2 * (it.bonus || 0) : (it.type === 'axe' ? 18 : 15);
        case 'shield': return it.magic ? 90 + (it.max || 0) : 15 + 5 * (it.type || 0);
        case 'scroll': return it.stat === 'flight' || it.stat === 'spell' ? 220 : 60;
        case 'backpack': return 30 + 5 * (it.slots || 3);
        case 'bow': return it.magic ? 90 + (it.bonus || 0) : 25;
        case 'hammer': return 300;
        case 'iceRod': return 2000;
        case 'book': return 50;
        case 'apple': return 12 * (it.count || 1);
        case 'redApple': return 1 * (it.count || 1);
        case 'meat': return 1 * (it.count || 1);
        case 'steak': return 3 * (it.count || 1);
        case 'arrows': return Math.max(1, Math.round((it.count || 1) * 0.6));
        case 'bread': case 'cheese': return 1 * (it.count || 1);
        case 'pie': return 2 * (it.count || 1);
        case 'crystal': return 40 * (it.count || 1);
        case 'bronzeHorn': return 160;
        case 'minotaurHorn': return 200;
        case 'flask': return 3 * (it.count || 1);
        case 'potion': return 60;
        case 'web': return 120 * (it.count || 1);
        case 'glass': return 2 * (it.count || 1);
        case 'phoenixFeather': return 250 * (it.count || 1);
        case 'armor': case 'robe': return armorValue(it);
        default: return 0;
    }
}

/** Is it a magic thing? (for the merchant and the conversation) */
/**
 * Gifts of the gods (CLAUDE.md «Дары богов»): no spell ever destroys or harms them — fire, blasts, «Inspirius»,
 * «Total Destruction», lightning, ice, «Liquidation»… («не действует — дар богов»). Taken, carried, thrown, called
 * by «Акцио» like any thing. The Ice Rod; the creative pedestals are another (World.createPedestal).
 */
export const GOD_GIFTS = new Set(['iceRod']);
export const isGodGift = (it) => !!it && (it.godGift === true || GOD_GIFTS.has(it.kind));
export const isMagicItem = (it) => !!it && (it.kind === 'wand' || it.kind === 'hammer' || it.kind === 'iceRod' || it.kind === 'book' || it.magic === true || (it.kind === 'scroll'));

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

/** A dragon's chest: the treasure it guards — two precious things, fine armour, a plain thing now and then (coins: Game._chestPouch). */
/**
 * The Ice Queen's chests by her throne (CLAUDE.md «Боссы»: what fits the boss — the ice): the Ice Queen's robe
 * (a magic robe the colour of ice: never cold, the simplest magic does nothing on it), mana crystals out of her
 * ice, healing potions, the best of her treasure (wands, scrolls…). (Her coins: Game._chestPouch.)
 */
export function rollIceQueenLoot(r = Math.random, first = true) {
    const out = [rollKeyItem(r), rollKeyItem(r)];
    out.push({ kind: 'crystal', uid: newUid(), count: randInt(r, 2, 4) });
    out.push({ kind: 'potion', uid: newUid(), rec: 'heal', color: 0x9fe8ff }, { kind: 'potion', uid: newUid(), rec: 'heal', color: 0xc8f4ff });
    if (first) out.push({ kind: 'robe', uid: newUid(), magic: true, color: 0xbfe9ff, named: 'Мантия Ледяной Королевы', strong: ['Hellfire', 'LightningStrike'] });
    else if (r() < 0.5) out.push(rollKeyItem(r));
    return out;
}

export function rollDragonLoot(r = Math.random) {
    const out = [rollKeyItem(r), rollKeyItem(r)];
    if (r() < 0.5) out.push(rollKeyItem(r));
    const arm = rollChestArmor(r, { royal: true });
    if (arm) out.push(arm);
    return out;
}

/**
 * The chests of Captain Black Moustache's black ship (CLAUDE.md «Боссы»: the sea's things for a pirate): his own
 * chest in his cabin ('captain' — locked while he lives) holds his gold and the best of his plunder; the officers'
 * chest on the poop — gold and plunder; the stores below — ship's biscuit and meat, powder and shot, sabres and
 * boarding axes, gold now and then. Magic sabres (swords and axes that hit harder), wands, scrolls, magic shields
 * and bows taken from the ships he sank, cannonballs to throw, a fishing rod.
 */
export function rollPirateLoot(r = Math.random, room = 'store') {
    const out = [];
    const coins = (a, b) => out.push({ kind: 'coins', uid: newUid(), count: randInt(r, a, b) });
    const sabre = (magic) => out.push({ kind: 'weapon', type: r() < 0.65 ? 'sword' : 'axe', magic, bonus: randInt(r, magic ? 30 : 1, 60), uid: newUid() });
    if (room === 'captain') {
        coins(250, 450); coins(150, 300);
        out.push(rollKeyItem(r), rollKeyItem(r));
        sabre(true);
        if (r() < 0.5) out.push(rollKeyItem(r));
        return out;
    }
    if (room === 'officers') {
        coins(80, 180);
        out.push(rollKeyItem(r));
        sabre(r() < 0.6);
        if (r() < 0.4) out.push({ kind: 'arrows', uid: newUid(), count: randInt(r, 8, 16) });
        return out;
    }
    if (LOOT_EXTRA.fishingRod && r() < 0.4) out.push(LOOT_EXTRA.fishingRod(r));
    if (r() < 0.6) coins(20, 80);
    out.push({ kind: 'cannonball', uid: newUid() });
    if (r() < 0.5) out.push({ kind: 'cannonball', uid: newUid() });
    out.push(r() < 0.5 ? { kind: 'bread', uid: newUid(), count: randInt(r, 1, 3) } : { kind: 'steak', uid: newUid(), count: randInt(r, 1, 2) });
    sabre(r() < 0.25);
    if (r() < 0.2) out.push(rollKeyItem(r));
    return out;
}

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

/**
 * Who opens the chest now (Game.openChest sets it, then clears it): his mana maximum. The scroll
 * of «Inspirius» turns up only for one whose maximum is already 500 (the author) — for anyone
 * else it never does.
 */
export const LOOT_FOR = { maxMana: 0 };

/** The precious thing of a chest: a wand, a scroll, a magic weapon, shield or bow, a backpack, Thor's hammer. */
export function rollKeyItem(r = Math.random) {
    const x = r();
    if (x < 0.26) return rollWand(r);
    if (x < 0.52) {
        // «Inspirius»: only for a great wizard (the chance asked only then: nothing else changes for the rest)
        if ((LOOT_FOR.maxMana || 0) >= 500 && r() < 0.06) return { kind: 'scroll', uid: newUid(), stat: 'spell', spell: 'Inspirius' };
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
            : y < 0.66 ? { kind: 'scroll', uid: newUid(), stat: 'spell', spell: 'AlohomoraMaxima' } // (the throne room's gates)
            : y < 0.70 ? { kind: 'scroll', uid: newUid(), stat: 'spell', spell: 'BombardoMaxima' }
            : y < 0.73 ? { kind: 'scroll', uid: newUid(), stat: 'spell', spell: 'OvergrownMaxima' }
            : y < 0.745 ? { kind: 'scroll', uid: newUid(), stat: 'spell', spell: 'Hellfire' } // (rare: the strongest fire)
            : y < 0.775 ? { kind: 'scroll', uid: newUid(), stat: 'spell', spell: 'FirefightingMaxima' } // (the hose that drowns even the Hellfire)
            : y < 0.79 ? { kind: 'scroll', uid: newUid(), stat: 'spell', spell: 'LevitationMaxima' } // (houses, trees, ships in the air)
            : y < 0.80 ? { kind: 'scroll', uid: newUid(), stat: 'hp', amount: randInt(r, 1, 5) }
            : y < 0.82 ? { kind: 'scroll', uid: newUid(), stat: 'spell', spell: 'CreateHouse' } // (the first one is far easier: HouseMagic.scrollFor)
            : y < 0.86 ? { kind: 'scroll', uid: newUid(), stat: 'spell', spell: 'ImproveHouse' }
            : y < 0.875 ? { kind: 'scroll', uid: newUid(), stat: 'spell', spell: 'WindImpulse' } // (and its «Максима»)
            : y < 0.89 ? { kind: 'scroll', uid: newUid(), stat: 'spell', spell: 'Invisibility' }
            : y < 0.915 ? { kind: 'scroll', uid: newUid(), stat: 'spell', spell: 'GiveMyPower' } // (your power back from your own skeleton — Legacy.js)
            : { kind: 'scroll', uid: newUid(), stat: 'fatigue', amount: randInt(r, 1, 10) };
    }
    if (x < 0.66) return { kind: 'weapon', type: r() < 0.5 ? 'sword' : 'axe', magic: true, bonus: randInt(r, 1, 60), uid: newUid() };
    if (x < 0.76) { const t = randInt(r, 0, 2); return { kind: 'shield', uid: newUid(), type: t, magic: true, max: randInt(r, 20, 50) }; }
    if (x < 0.86) return { kind: 'backpack', uid: newUid(), slots: randInt(r, 3, 5), color: Math.floor(r() * 0xffffff) };
    if (x < 0.96) return { kind: 'bow', uid: newUid(), type: randInt(r, 0, 2), magic: true, bonus: randInt(r, 1, 60), arrows: 10 };
    if (x < 0.975) return { kind: 'coins', uid: newUid(), magic: true, count: randInt(r, 0, 40) }; // (the magic pouch: no end of coins in it — CoinBelt)
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
export function rollLoot(r = Math.random, { cave = true, key = KEY_CHANCE, royal = false } = {}) {
    const out = [];
    if (r() < key) out.push(rollKeyItem(r));
    // (a royal chest in the keep: many times more fine things than plain ones — a second precious thing too)
    if (royal && r() < 0.6) out.push(rollKeyItem(r));
    // a piece of armour now and then (never a whole set; magic ones half as often — ArmorTypes)
    const arm = rollChestArmor(r, { royal });
    if (royal) { if (arm) out.push(arm); if (r() < 0.3) out.push(rollPlainItem(r)); return out; }
    // (elsewhere it takes the place of one plain thing — still 1–3 things; a magic piece is precious:
    //  never beside another precious thing — then it is a plain one)
    if (arm && out.length && arm.magic) { arm.magic = false; delete arm.strong; if (arm.kind === 'armor') arm.hp = Math.round(arm.hp / 2); }
    if (arm) out.push(arm);
    const n = randInt(r, 1, cave ? 2 : 1) - (arm ? 1 : 0);
    for (let i = 0; i < n; i++) out.push(rollPlainItem(r));
    return out;
}

/** «Раскрой свои секреты»: what the hologram says about an item. */
export function describeItem(it) {
    if (!it) return null;
    switch (it.kind) {
        case 'wand': {
            if (it.plain) return { title: '🪄 Обычная деревянная палочка', color: it.color, lines: ['Все заклинания на <b>15%</b> сильнее, чем голой рукой', 'Других свойств нет'] };
            if (it.dragon) return { title: '🐉 Палочка дракона', color: 0xc0141c, lines: ['Тёмно-алое дерево, светится, как угли', 'Все огненные заклинания на <b>60%</b> сильнее: «Инферно», «Fire», «Fire Maxima», «Let the Hellfire Come»', 'Маны — как обычно', 'Остальные заклинания — на <b>15%</b> сильнее, как с любой палочкой'] };
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
            if (it.stat === 'flight') return { title: '📜 Свиток полёта', color: 0x9fd8ff, lines: ['Сожгите его («Инферно»): вы научитесь заклинанию <b>«Флайн»</b>'] };
            if (it.stat === 'spell') return { title: `📜 Свиток «${SPELL_LABEL[it.spell] || it.spell}»`, color: SPELL_RIBBON[it.spell] || 0xffe9a8, lines: [`Сожгите его («Инферно»): вы научитесь заклинанию <b>«${SPELL_LABEL[it.spell] || it.spell}»</b>`, ...(it.spell === 'LetItRain' ? ['Рука или палочка к небу и «Let it rain»: гроза с ливнем на 2 игровых часа'] : []), ...(it.spell === 'CreateHouse' ? ['Бросьте рядом 3 шерсти и 10 песка, нужно 3 дерева неподалёку; палочку на них и «Create a House» — 20 маны и 0,5 в секунду 10 секунд'] : it.spell === 'ImproveHouse' ? ['Ресурсы рядом с домом, палочку на них и «Improve a House»: дом растёт до 5-го уровня, каждый уровень вдвое дороже'] : []), ...(it.spell === 'CreateBoard' ? ['Его можно выучить и из книги птицы-книги'] : []), ...(TEMPLE_SCROLL_LINE[it.spell] ? [TEMPLE_SCROLL_LINE[it.spell], 'Свиток из библиотеки заброшенного храма богов'] : [])] };
            return { title: '📜 Свиток', color: 0xffe9a8, lines: [it.stat === 'hp' ? `Сожгите его: здоровье +<b>${it.amount}</b>` : `Сожгите его: мана +<b>${it.amount}</b>`] };
        case 'book':
            if (it.runbook) return { title: '📕 Бегущая книга', color: 0xffd23f, lines: ['Раскройте её двумя руками и прочитайте единственную страницу:', 'бег на <b>30%</b> быстрее, пока вы живы', 'Это не заклинание — только быстрота'] };
            if (it.ward || it.spells?.includes('ProtectionHouse')) return { title: '📘🛡️ Книга защиты', color: WARD_COVER, lines: ['Раскройте и прочитайте: в ней группа заклинаний <b>«Защита дома»</b> — Protection House, Protection Invisible, Protection House Grant', 'Прочитали одну страницу — выучили все три'] };
            if (it.swift || it.spells?.includes('Flight')) return { title: '📘 Быстрая книга', color: SWIFT_COVER, lines: ['Сожгите её («Инферно» с книгой в руке или в огне): вы научитесь заклинанию <b>«Флайн»</b> (полёт)', 'Раскрыть и прочитать можно, но выучит «Флайн» только тот, кто её сожжёт'] };
            return { title: '📖 Книга заклинаний', color: 0xffe9a8, lines: ['Раскройте и прочитайте (или сожгите «Инферно»): в ней заклинания для стройки'] };
        case 'backpack':
            return { title: '🎒 Рюкзак', color: it.color, lines: [`+<b>${it.slots}</b> ячейки, если надеть (руки за спину)`] };
        case 'bow':
            return { title: '🏹 ' + BOW_KINDS[it.type || 0] + (it.magic ? ' (волшебный)' : ''), color: it.magic ? 0x9fd8ff : 0xaaaaaa, lines: [it.magic ? `Стрелы бьют сильнее на <b>${it.bonus}%</b>` : 'Обычный лук', `Стрел: <b>${it.arrows ?? 0}</b> (до 25)`] };
        case 'iceRod':
            return { title: '❄️ Ледяной Жезл', color: 0xbfefff, lines: ['Посох Ледяной Королевы (не палочка): держите в кулаке', 'Направьте кристалл на существо и скажите <b>«Frozen»</b> — оно во льду, <b>даже в магических доспехах</b>', 'Направьте на землю, стену или воду — <b>«Frozen»</b> кладёт слой льда (ещё раз — следующий слой)', 'Снеговики рядом слушаются: идут за вами; <b>«Атака»</b> — нападают, на кого показывает жезл'] };
        case 'hammer':
            return { title: '🔨 Молот Тора', color: 0xbfe3ff, lines: ['В грозу поднимите его вверх — в него ударит молния', 'Наведите на цель: молния бьёт туда (до 3 раз)', `Заряды: <b>${it.charges || 0}</b>`] };
        case 'arrows': return { title: '➶ Стрелы', color: 0xd9b46c, lines: [`Стрел: <b>${it.count}</b>`, 'Возьмите — они сами лягут в колчан лука (до 25)'] };
        case 'apple': return { title: '🍏 Золотое яблоко', color: 0xffd700, lines: ['Поднесите ко рту: +10 HP', 'Коня можно приручить яблоком', 'Пегас подпускает: 40% за золотое яблоко'] };
        case 'redApple': return { title: '🍎 Яблоко', color: 0xc8202a, lines: ['Поднесите ко рту: +2 HP', 'Коня можно приручить яблоком', 'Пегас подпускает: 9% за яблоко'] };
        case 'meat': return { title: `🥩 Сырое мясо${MEAT_RU[it.from] ? ' (' + MEAT_RU[it.from] + ')' : ''}`, color: 0xd9534f, lines: [`Поднесите ко рту: +${foodHeal(it)} HP`, `Пожарьте на костре («Fire») или огнём заклинания («Инферно», «Адский огонь») — будет +${2 * foodHeal(it)}`] };
        case 'steak': return { title: `🍖 Жареное мясо${MEAT_RU[it.from] ? ' (' + MEAT_RU[it.from] + ')' : ''}`, color: 0xb5651d, lines: [`Поднесите ко рту: +${foodHeal(it)} HP`] };
        case 'wool': return { title: '🧶 Шерсть', color: 0xf6f4ee, lines: [`Клубков: <b>${it.count || 1}</b>`, 'Для кровати: 3 шерсти + 4 бревна рядом и «Create a Bed»'] };
        case 'coins': if (it.magic) return { title: '✨ Магический мешочек', color: 0xd4243a, lines: [`Монет: <b>${it.count || 0}</b> — влезает сколько угодно (незримое расширение)`, 'Привяжите к поясу, как обычный: монеты из обычных мешочков пересыпаются в него', 'Платите им на рынке замка — сам мешочек остаётся вашим'] };
            return { title: '💰 Монеты', color: 0xffd700, lines: [`Монет: <b>${it.count || 0}</b>`, 'Привяжите к поясу: глядя вниз, левой рукой с мешочком к правому боку (левша — наоборот)', 'Платите ими на рынке замка'] };
        case 'bread': case 'cheese': case 'pie': return { title: `${ITEM_INFO[it.kind].icon} ${ITEM_INFO[it.kind].name}`, color: 0xd9b46c, lines: [`Поднесите ко рту: +${ITEM_INFO[it.kind].heal} HP`] };
        case 'crystal': return { title: '💎 Кристалл маны', color: 0x5cb8ff, lines: [`Кристаллов: <b>${it.count || 1}</b>`, 'Возьмитесь за него <b>обеими руками</b> и разломите (разведите руки или поверните) — мана +<b>5</b> к максимуму'] };
        case 'flask': return { title: '⚗️ Пустая колба', color: 0xcfe9f2, lines: [`Колб: <b>${it.count || 1}</b>`, 'Окуните её в котёл с готовым зельем — она наполнится'] };
        case 'potion': {
            const r = recipeById(it.rec);
            return { title: `🧪 ${r ? r.name : 'Зелье'}`, color: it.color ?? 0x9fd8ff, lines: [r ? r.desc : 'Неизвестное зелье', r?.effect ? 'Поднесите ко рту и подержите — выпьете (колба останется)' : 'Пока его не выпить'] };
        }
        case 'web': return { title: '🕸️ Связка паутины', color: 0xf2f2ff, lines: ['Осталась от гигантской паучихи', 'Ингредиент зелья невидимости: бросьте в кипящий котёл'] };
        case 'dragonEgg': return { title: '🥚 Яйцо дракона', color: DRAGON_KINDS[it.of]?.body ?? 0x2f7a3a, lines: [`Яйцо: <b>${DRAGON_KINDS[it.of]?.short || 'дракона'}</b>`, 'Тяжёлое и тёплое. Пригодится для зелий', 'В карман не влезет — заведите руку с ним за плечо'] };
        case 'glass': return { title: '🔷 Осколки стекла', color: 0xdff3ff, lines: [`Осколков: <b>${it.count || 1}</b>`, 'Выпадают из разбитого окна. Ингредиент зелья невидимости'] };
        case 'armor': case 'robe': return describeArmor(it);
        case 'phoenixFeather': return { title: '🪶 Перо феникса', color: 0xff7a2a, lines: [`Перьев: <b>${it.count || 1}</b>`, 'Осталось от убитого феникса. Светится тёплым огнём', 'Пригодится для зелий (позже)'] };
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

/**
 * The dragon's wand: deep crimson wood, dark-red scales spiralling up its shaft, a claw of black horn
 * holding a glowing ember at its tip (along +Y, the tip at y≈0.66).
 */
function dragonWandModel() {
    const g = new THREE.Group();
    const wood = mat(0x5a0a0e), deep = mat(0x8a0f14), horn = mat(0x1c1214);
    const ember = new THREE.MeshBasicMaterial({ color: 0xff5a1e });
    const core = new THREE.MeshBasicMaterial({ color: 0xffc070 });
    g.add(cyl(0.036, 0.042, 0.2, horn, 0, 0.1)); // (a handle of black horn)
    g.add(cyl(0.047, 0.047, 0.025, deep, 0, 0.205));
    g.add(cyl(0.015, 0.031, 0.42, wood, 0, 0.42));
    // scales up the shaft, like the dragon's own (glowing seams between them)
    for (let i = 0; i < 7; i++) {
        const sc = new THREE.Mesh(new THREE.OctahedronGeometry(0.02), i % 2 ? deep : ember);
        sc.position.set(Math.cos(i * 1.7) * (0.03 - i * 0.002), 0.26 + i * 0.05, Math.sin(i * 1.7) * (0.03 - i * 0.002));
        sc.scale.set(1, 1.6, 0.6);
        g.add(sc);
    }
    for (let i = 0; i < 3; i++) { // (the claw)
        const c = cyl(0.004, 0.009, 0.07, horn, Math.cos(i * 2.1) * 0.017, 0.645, Math.sin(i * 2.1) * 0.017);
        c.rotation.set(Math.sin(i * 2.1) * 0.5, 0, -Math.cos(i * 2.1) * 0.5);
        g.add(c);
    }
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 6), ember)).position.set(0, 0.66, 0);
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.011, 6, 5), core)).position.set(0, 0.66, 0);
    g.userData.tipY = 0.67;
    return g;
}

/** A dragon's egg: big (≈0.45 m), scaled like its dragon, a little warm glow between the scales. */
function dragonEggModel(kind) {
    const K = DRAGON_KINDS[kind] || DRAGON_KINDS.emerald;
    const g = new THREE.Group();
    const shell = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), mat(K.body));
    shell.scale.set(1, 1.3, 1);
    g.add(shell);
    // rows of scale plates round it
    const plate = mat(new THREE.Color(K.body).lerp(new THREE.Color(K.belly), 0.45).getHex());
    for (let r = 0; r < 3; r++) for (let i = 0; i < 6; i++) {
        const a = i / 6 * Math.PI * 2 + r * 0.5, y = -0.12 + r * 0.12, rad = 0.2 * Math.sqrt(1 - (y / 0.26) ** 2);
        const b = box(0.07, 0.06, 0.02, plate, Math.cos(a) * rad, y, Math.sin(a) * rad);
        b.rotation.y = -a + Math.PI / 2;
        g.add(b);
    }
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.205, 10, 8), new THREE.MeshBasicMaterial({ color: K.fire?.[1] ?? 0xff8a1e, transparent: true, opacity: 0.12, depthWrite: false }));
    glow.scale.set(1, 1.3, 1);
    g.add(glow);
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

function appleModel(it, red = false) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.11, 10, 8), red ? mat(0xc8202a) : mat(0xffd700, { standard: true, metal: 0.7, rough: 0.3, emissive: 0x332200 })));
    g.add(cyl(0.008, 0.008, 0.06, mat(0x5a3a1e), 0, 0.12));
    const leaf = box(0.06, 0.01, 0.03, mat(0x2e8b2e), 0.03, 0.13);
    g.add(leaf);
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
export const ITEM_SCALE = { iceRod: 2.1, bow: 2.4, shield: 2.2, wand: 2.2, scroll: 2, hammer: 2.1, backpack: 1.6, arrows: 1, book: 1.6, apple: 1.8, redApple: 1.8, coins: 1.8, bread: 1.8, cheese: 1.8, pie: 1.8, meat: 1.8, steak: 1.8, bronzeHorn: 2.2, minotaurHorn: 2.4, flask: 1.8, potion: 1.8, web: 1.8, glass: 1.8, phoenixFeather: 2 };

export function makeItemModel(it) {
    const m = buildItemModel(it);
    const s = ITEM_SCALE[it.kind];
    if (s && s !== 1) m.scale.multiplyScalar(s);
    return m;
}

function buildItemModel(it) {
    switch (it.kind) {
        case 'wand': return it.dragon ? dragonWandModel() : wandModel(it);
        case 'dragonEgg': return dragonEggModel(it.of);
        case 'scroll': return scrollModel(it);
        case 'shield': return shieldModel(it);
        case 'backpack': return backpackModel(it);
        case 'bow': return bowModel(it);
        case 'hammer': return hammerModel(it);
        case 'iceRod': return iceRodModel();
        case 'apple': return appleModel(it);
        case 'redApple': return appleModel(it, true);
        case 'meat': return meatModel(false);
        case 'arrows': { const g = new THREE.Group(); for (let i = 0; i < 5; i++) { const a = arrowModel(); a.position.set((i - 2) * 0.12, 0, 0); a.rotation.z = (i - 2) * 0.06; g.add(a); } return g; }
        case 'steak': return meatModel(true);
        case 'coins': return pouchModel(it); // (the plain leather pouch / the magic velvet one: PouchModel.js)
        case 'bread': return breadModel();
        case 'cheese': return cheeseModel();
        case 'pie': return pieModel();
        case 'wool': return woolModel();
        case 'logs': return logsModel(it.color);
        case 'cannonball': { const g = new THREE.Group(); g.add(new THREE.Mesh(new THREE.SphereGeometry(0.3, 12, 9), mat(0x2b2b2e))); return g; }
        case 'blocks': return blocksModel(it.color);
        case 'crystal': return crystalItemModel();
        case 'flask': return flaskModel(null);
        case 'potion': return flaskModel(it.color ?? 0x9fd8ff);
        case 'web': return webModel();
        case 'glass': return glassModel();
        case 'phoenixFeather': return phoenixFeatherModel();
        case 'armor': case 'robe': return armorItemModel(it);
        case 'bronzeHorn': return hornModel(0xb87333, true);
        case 'minotaurHorn': return hornModel(0x3a3028, false);
        case 'book': return it.ward || it.spells?.includes('ProtectionHouse') ? makeSpellBookModel(WARD_COVER, WARD_TRIM) : it.swift || it.spells?.includes('Flight') ? makeSpellBookModel(SWIFT_COVER, SWIFT_TRIM) : makeSpellBookModel(COVERS[(it.id || 1) % COVERS.length]);
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

/** A skein of the giant spider's web: silvery-white sticky strands wound round and round, a faint glow. */
function webModel() {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0xf4f4ff, emissive: 0x6670a0, emissiveIntensity: 0.35, roughness: 0.6, transparent: true, opacity: 0.85 });
    for (let i = 0; i < 7; i++) {
        const t = new THREE.Mesh(new THREE.TorusGeometry(0.09 + (i % 3) * 0.012, 0.012, 5, 18), m);
        t.rotation.set(i * 0.9, i * 0.45, i * 1.3);
        g.add(t);
    }
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), m));
    return g;
}

/**
 * A phoenix feather: a long quill (its handle: model y from 0, held in the fist like a thin
 * stick) and a vane that runs from deep crimson through orange into a glowing gold tip.
 */
function phoenixFeatherModel() {
    const g = new THREE.Group();
    const quill = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.014, 0.46, 6), new THREE.MeshStandardMaterial({ color: 0xffe3a0, emissive: 0x7a4a10, emissiveIntensity: 0.5, roughness: 0.4 }));
    quill.position.y = 0.23;
    g.add(quill);
    // the vane: two halves along the quill, a strip of quads with colours from the base to the tip
    const pos = [], col = [], idx = [];
    const N = 12, L = 0.38, y0 = 0.08;
    const c0 = new THREE.Color(0xa0101a), c1 = new THREE.Color(0xff6a1a), c2 = new THREE.Color(0xffd45a), c = new THREE.Color();
    for (let i = 0; i <= N; i++) {
        const t = i / N, y = y0 + t * L;
        const w = 0.075 * Math.pow(Math.sin(Math.PI * (0.12 + 0.8 * t)), 0.8);
        if (t < 0.55) c.copy(c0).lerp(c1, t / 0.55); else c.copy(c1).lerp(c2, (t - 0.55) / 0.45);
        const bend = 0.03 * t * t; // (the vane curves a little)
        pos.push(-w, y, bend, 0, y + 0.012, 0, w * 0.85, y, bend);
        for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
        if (i) { const a = (i - 1) * 3, b = i * 3; idx.push(a, b, a + 1, a + 1, b, b + 1, a + 1, b + 1, a + 2, a + 2, b + 1, b + 2); }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const vane = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0xff5a10, emissiveIntensity: 0.55, roughness: 0.55, side: THREE.DoubleSide }));
    g.add(vane);
    // a soft golden glow round the tip
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffc860, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.y = y0 + L * 0.85;
    g.add(glow);
    return g;
}

/** A few shards of window glass (pale, see-through). */
function glassModel() {
    const g = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0xdff3ff, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.55, side: THREE.DoubleSide });
    for (let i = 0; i < 4; i++) {
        const sh = new THREE.Shape();
        sh.moveTo(0, 0); sh.lineTo(0.12 + i * 0.02, 0.02); sh.lineTo(0.05, 0.14 - i * 0.015);
        const p = new THREE.Mesh(new THREE.ShapeGeometry(sh), m);
        p.position.set((i - 1.5) * 0.04, 0, (i % 2) * 0.03);
        p.rotation.set(-1.2 + i * 0.3, i * 0.8, i * 0.4);
        g.add(p);
    }
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
