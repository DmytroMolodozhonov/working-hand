/**
 * SpellBook.js — which spells the hero knows (pure, node-testable). The ONE place for it:
 * the cast (Game.knowsSpell → Builder.knows too), the voice's wait for a longer spell
 * (NativeVoice.knows, Game.castLocalSpell), the pause menu's spell book and the codex' badges.
 *
 * Creative (and the test mode) knows everything (Creative's «Настройки героя» may leave out the gods' spells and «Inspirius»: HeroSetup.knownInCreative). Elsewhere (the author):
 *  - START_SPELLS: known from the very start, without a scroll or a book;
 *  - every other spell is learned: a burnt scroll (`bonus.spells[key]`), a read book-bird's book
 *    (`books.learned`), the gods' temple library, or 1000 cells of mana («Flying Maxima»).
 *    TAUGHT_BY names the scroll / book key when it is not the spell's own name.
 * Nothing about the start is saved: an old world's hero who «knew» a spell only by default no longer
 * does; what a scroll or a book taught stays (it is in `bonus.spells` / `books.learned`).
 */

/** Known from the start outside Creative (the author's list; a Maxima is a spell of its own here). */
export const START_SPELLS = new Set([
    // light, things, moving
    'Lumos', 'LumosMaxima', 'LumosFlashlight', 'LumosAhead', 'Nox', 'Reveal', 'Draw', 'Accio', 'Up', 'Levitation', 'Wind', 'WindMaxima',
    'Alohomora', 'Lock', 'Attack', 'Rescue', 'SuitUp', 'Stand', 'Stop', 'Pause',
    // duel («Айс» = «Frozen»: one spell; «Максима» in a clash of charges)
    'Sands', 'Sapira', 'Stupefy', 'Expelliarmus', 'Disarmor', 'Ice', 'Frozen', 'Jolt', 'Maxima',
    // fight and guard
    'Inferno', 'Bombardo', 'Earthquake', 'Liquidation', 'Protection',
    // water: only «Firefighting»
    'Firefighting',
    // building: the campfire, a bed and its colour, a passage sewn up, gathering, a bridge (the author: «без свитка»)
    'Fire', 'ChangeColor', 'CreateBed', 'Stitching', 'Gather', 'CreateBridge',
    // the fireworks over the wand (the author: «изначально известно без свитка»)
    'Fireworks',
    // «забрать свою силу» со своего скелета (слова автора: «известно с начала, без свитка»)
    'GiveMyPower',
    // a thing in the hand is the key (the Ice Rod, Thor's hammer)
    'RodFrozen', 'RodIce', 'Hammer',
]);

/** A spell taught by another spell's scroll / book (the rest: by the key of their own name). */
export const TAUGHT_BY = {
    WindImpulseMaxima: 'WindImpulse', AliveMaxima: 'Alive', TotalDestructionMaxima: 'TotalDestruction',
    CircleAttackMaxima: 'CircleAttack', DrawdownMaxima: 'Drawdown', AirBubbleMaxima: 'AirBubble', WaveAttackMaxima: 'WaveAttack',
    WaterForming: 'Waterball', VortexBubble: 'WaterVortex', Furl: 'Unfurl', BreakthroughMaxima: 'Breakthrough',
    WallRise: 'Breakthrough', WallRiseMaxima: 'Breakthrough', WardGrow: 'ProtectionHouse', GroundShield: 'GroundVortex',
};

/** Learned from the book-birds' books (BookBirds.BOOK_POOL; the book of protection; the swift book — «Флайн»). */
export const BOOK_SPELLS = new Set(['CreateFloor', 'CreateWall', 'CreateCeiling', 'BuildRoof', 'CreateDoor', 'CreateBoard',
    'ProtectionHouse', 'ProtectionInvisible', 'ProtectionHouseGrant', 'StrengthenHouse', 'WardDispel', 'Flight']);

/** Learned otherwise: «Flying Maxima», a spell of the gods, is their gift at 1000 cells of mana (Space.checkUnlock) — never a scroll, never sold. */
export const MANA_SPELLS = new Set(['FlyingMaxima']);

/** The scroll / book key that teaches this spell. */
export const teachKey = (name) => TAUGHT_BY[name] || name;

import { knownInCreative } from './HeroSetup.js';

const free = (mode) => mode === 'creative' || mode === 'test';

/**
 * Does the hero know this spell? `who`: { mode, spells (bonus.spells), learned (books.learned), flight (bonus.flight) }.
 * «Флайн» outside «Выживание» stays free, as it was (Game.knowsFlight).
 */
export function knows(name, who = {}) {
    if (!name) return false;
    if (who.mode === 'creative' && who.hero) { // (Творческий: «все заклинания есть» или «только сильного мага» — HeroSetup.js; не известное — доучить свитком можно)
        if (knownInCreative(who.hero, name) || START_SPELLS.has(name)) return true;
    } else if (free(who.mode) || START_SPELLS.has(name)) return true;
    if (name === 'Flight') return who.mode !== 'freeworld' || !!who.flight || !!who.learned?.has?.('Flight');
    const k = teachKey(name);
    return !!who.spells?.[k] || !!who.learned?.has?.(k);
}

/** How a spell is learned outside Creative: 'start' | 'book' | 'mana' | 'scroll' (the codex' badge). */
export function howLearned(name) {
    if (START_SPELLS.has(name)) return 'start';
    if (MANA_SPELLS.has(name)) return 'mana';
    if (BOOK_SPELLS.has(teachKey(name)) && teachKey(name) !== 'CreateBoard') return 'book';
    return 'scroll';
}

// ---------------------------------------------------------------- scrolls already known never turn up again (the author)
/**
 * The author: «если игрок уже сжёг/выучил этот свиток, то этот свиток больше никогда ему не попадётся (сундуки, лавки, птицы, боссы)». The knowledge is
 * PERSONAL: what a chest holds is rolled at the moment it is opened, for the one who opens it (ItemTypes.LOOT_FOR.known). A spell's scroll is named by the
 * scroll that teaches it (`teachKey`: a Maxima that a scroll of its own teaches is its own key), a drawing's scroll by the figure.
 * @returns {string|null} 's:<key>' | 'p:<figure>' | null (a scroll of health / strength, or not a scroll: never "known")
 */
export function scrollKey(it) {
    if (!it || it.kind !== 'scroll') return null;
    if (it.stat === 'spell' && it.spell) return 's:' + teachKey(it.spell);
    if (it.stat === 'pentagram' && it.pent) return 'p:' + it.pent;
    return null;
}

/** The set of scroll keys a hero has already burnt or learnt: `who` { spells (bonus.spells), learned (books.learned), pent (the figures seen) }. */
export function knownScrollKeys(who = {}) {
    const out = new Set();
    for (const [k, v] of Object.entries(who.spells || {})) if (v) out.add('s:' + k);
    for (const k of who.learned || []) out.add('s:' + k);
    for (const k of who.pent || []) out.add('p:' + k);
    return out;
}

/** Does this hero already know the scroll `it`? `keys`: knownScrollKeys(...) | a Set of keys. */
export function scrollKnown(it, keys) {
    const k = scrollKey(it);
    return !!k && !!keys && keys.has(k);
}
