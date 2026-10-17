/**
 * SpellBook.js — which spells the hero knows (pure, node-testable). The ONE place for it:
 * the cast (Game.knowsSpell → Builder.knows too), the voice's wait for a longer spell
 * (NativeVoice.knows, Game.castLocalSpell), the pause menu's spell book and the codex' badges.
 *
 * Creative (and the test mode) knows everything. Elsewhere (the author):
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
    'Lumos', 'LumosMaxima', 'Nox', 'Reveal', 'Draw', 'Accio', 'Up', 'Levitation', 'Wind', 'WindMaxima',
    'Alohomora', 'Lock', 'Attack', 'Rescue', 'SuitUp', 'Stand', 'Stop', 'Pause',
    // duel («Айс» = «Frozen»: one spell; «Максима» in a clash of charges)
    'Sands', 'Sapira', 'Stupefy', 'Expelliarmus', 'Disarmor', 'Ice', 'Frozen', 'Jolt', 'Maxima',
    // fight and guard
    'Inferno', 'Bombardo', 'Earthquake', 'Liquidation', 'Protection', 'FireMaxima',
    // water: only «Firefighting»
    'Firefighting',
    // building: the campfire, a bed and its colour, a passage sewn up, gathering
    'Fire', 'ChangeColor', 'CreateBed', 'Stitching', 'Gather',
    // a thing in the hand is the key (the Ice Rod, Thor's hammer)
    'RodFrozen', 'RodIce', 'Hammer',
]);

/** A spell taught by another spell's scroll / book (the rest: by the key of their own name). */
export const TAUGHT_BY = {
    WindImpulseMaxima: 'WindImpulse', AliveMaxima: 'Alive', TotalDestructionMaxima: 'TotalDestruction',
    CircleAttackMaxima: 'CircleAttack', DrawdownMaxima: 'Drawdown', AirBubbleMaxima: 'AirBubble', WaveAttackMaxima: 'WaveAttack',
    WaterForming: 'Waterball', VortexBubble: 'WaterVortex', Furl: 'Unfurl', BreakthroughMaxima: 'Breakthrough',
    WallRise: 'Breakthrough', WallRiseMaxima: 'Breakthrough', WardGrow: 'ProtectionHouse',
};

/** Learned from the book-birds' books (BookBirds.BOOK_POOL; the book of protection; the swift book — «Флайн»). */
export const BOOK_SPELLS = new Set(['CreateFloor', 'CreateWall', 'CreateCeiling', 'BuildRoof', 'CreateDoor', 'CreateBoard',
    'ProtectionHouse', 'ProtectionInvisible', 'ProtectionHouseGrant', 'Flight']);

/** Learned otherwise: «Flying Maxima» opens by itself at 1000 cells of mana (Space.checkUnlock). */
export const MANA_SPELLS = new Set(['FlyingMaxima']);

/** The scroll / book key that teaches this spell. */
export const teachKey = (name) => TAUGHT_BY[name] || name;

const free = (mode) => mode === 'creative' || mode === 'test';

/**
 * Does the hero know this spell? `who`: { mode, spells (bonus.spells), learned (books.learned), flight (bonus.flight) }.
 * «Флайн» outside «Выживание» stays free, as it was (Game.knowsFlight).
 */
export function knows(name, who = {}) {
    if (!name) return false;
    if (free(who.mode) || START_SPELLS.has(name)) return true;
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
