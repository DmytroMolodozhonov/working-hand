/**
 * ProtectionGods.js — «Protection Gods» (божественная защита) and «Protection Gods Maxima»: the gods' shield.
 *
 *   The same as «Protection» / «Protection Maxima» (Combat.js): the same gesture, the same shield before the
 *   stretched-out hand («Protection Gods»), the same dome round the whole body with the arms out in a T
 *   («… Maxima»), put out the same way (a sharp jerk of the shield arm, «стоп»; death; a fall drops the hand
 *   shield, as it does an ordinary one). But golden, and shining richer (the gods' temple's golden ward), and:
 *
 *   - it does not take the strength in (an ordinary shield pays half of every spell it stops): it HOLDS. ANY
 *     spell that is not one of the gods' does not get through at all — no harm, no push, no fall, no stun, no
 *     ice, and NO mana from its holder. Only its price: 100 at once + 3 a second (the dome: 300 + 5 a second);
 *     the mana for holding it gone — it goes out. In Creative: free (no mana rules there).
 *   - a spell of the gods (DIVINE_SPELLS — the scrolls of the gods' library: Mana.GOD_SPELLS, from
 *     GodsTemple.TEMPLE_SCROLLS, so every new one is there by itself) does not get through either, but takes
 *     from its holder's mana HALF of that spell's price × the share of the blow that would have reached him
 *     (a «Бум» from afar, at the edge of its reach: less; a planet blown up under the feet: all of it —
 *     divineHitCost). Not enough mana: the shield breaks, and the rest of the blow goes on (Combat.godsHit).
 *   - CONCENTRATION (Concentration.HELD.GodsShield): while it is held no other spell works — first «стоп»
 *     (Lumos, Nox, «стоп» are free, as always). That is its price too: the one under it cannot attack.
 *   - what is not a spell — a blade, a fist, an arrow, a cannonball, a beast's fangs or fire, a fall, a house
 *     falling on you — as with an ordinary «Protection»: the hand shield facing it holds it (no mana), the
 *     dome too (Combat.shieldFactor); what hits from behind a hand shield gets through. A magic blade breaks
 *     an ordinary «Protection» — the gods' one it does not (it is no spell at all, and the gods' work is stronger).
 *
 * Where it is learnt: only from its scroll on its own pedestal in the library of the gods' temple on Venus
 * (GodsTemple.TEMPLE_SCROLLS: the seventh and the eighth) — burnt with «Инферно». Never on the Earth: no chest,
 * merchant, book-bird, wizards' tower or boss has it (ItemTypes.rollScroll and the rest name their spells;
 * tests/unit/protection-gods.test.js). +100 mana cells the first time each really goes up (Mana.GOD_SPELLS).
 * Known at once in Creative. It works on the Earth, in space and on every planet (Space.spaceSpellBlock: no
 * refusal — the gods' shield needs no air, water or ground).
 *
 * Network: each computer decides its own player (it knows where its shield is and pays its mana — as with
 * «Protection»); the others see the golden shield or dome (Combat.serialize: the 6th number; RemoteAvatar →
 * CombatVisuals gold), and its golden pieces flying when it breaks. The host decides the hits on creatures, as
 * always — no creature casts it (PROTECTION_GODS_TARGETS).
 */

import { GOD_SPELLS } from './Mana.js';

export const PGODS = {
    COST: 100, COST_MAX: 300, // mana at once (the author)
    DRAIN: 3, DRAIN_MAX: 5, // … then each second while it holds
    GOLD: 0xffcf4a, GOLD_LIGHT: 0xfff1b0, GOLD_DEEP: 0xffa81f,
};

/** The gods' spells (one list for every place: the scrolls of the gods' library — Mana.GOD_SPELLS). */
export const DIVINE_SPELLS = GOD_SPELLS;

/**
 * The gods' spells that BREAK the gods' shield (the author): the first blow takes the shield off — it does not kill and
 * takes no mana (no «half the price»); the next one, the shield gone, does what it does. «Дай» (Die): add its name
 * here (and its scroll to GodsTemple.TEMPLE_SCROLLS — that makes it a spell of the gods). Combat.godsHit does it.
 */
export const BREAKS_GODS = new Set(['Die']);

/** Is this kind of hit a spell of the gods? (a kind is a spell's name, or its Mana alias) */
export const isDivine = (kind) => !!kind && DIVINE_SPELLS.has(kind);

/**
 * What hits the body and is NOT a spell (Combat.damage's kinds, BodyImpact's `kind`): the gods' shield is not
 * asked about them here — they are held as by an ordinary shield (where the path asks Combat.shieldFactor).
 * 'Ward': a house's sphere of protection shoving a stranger out is a protection, not an attack — the gods'
 * shield does not open somebody's house (HouseWards.js).
 */
export const NOT_MAGIC = new Set([
    'melee', 'arrow', 'web', 'poison', 'bite', 'dragonFire', 'phoenixFire', 'phoenix', 'animal', 'butt', 'zombie', 'knight',
    'collapse', 'crush', 'thrown', 'fall', 'bleed', 'Cannon', 'Pistol', 'iceMonster', 'punch', 'shatter', 'decap', 'Ward',
]);

/** A spell (of anybody) — not a blow, a beast, a fall? */
export const isMagicKind = (kind) => !!kind && !NOT_MAGIC.has(kind);

/**
 * Spells that strike all round (no one direction a hand could face): where they hurt, nobody asked the hand
 * shield first — the gods' hand shield holds them too (an ordinary one takes half of them: TotalDestruction,
 * Boom…). The others come from somewhere: the path asked Combat.shieldFactor already, and what came from behind
 * the hand gets through — as with «Protection».
 */
export const ALL_ROUND = new Set([
    'TotalDestruction', 'TotalDestructionMaxima', 'CircleAttack', 'CircleAttackMaxima', 'Inspirius', 'Hellfire',
    'WaterVortex', 'WaterVortexSuperMaxima', 'Earthquake', 'EarthquakeMaxima', 'Lightning', 'LightningStrike',
    'Bombardo', 'BombardoMaxima', 'cold', 'air', 'quake', 'water',
]);

/**
 * Does a gods' shield `s` ({type 1 hand | 2 dome, gods, left}) keep this kind of harm off its holder by itself?
 * (Combat.damage / stun / freeze: where no direction is known.) A spell of the gods: no — it is paid for
 * (Combat.godsHit, on its own path).
 */
export function godsKeepsOff(s, kind) {
    if (!s?.gods || !(s.left > 0) || !isMagicKind(kind) || isDivine(kind)) return false;
    return s.type === 2 || ALL_ROUND.has(kind);
}

/**
 * The mana a spell of the gods takes from the gods' shield it strikes: half of the spell's price (`price` —
 * Combat.SPELL_COST, or what it really cost: «Planet Liquidation» + the planet's mass) × the share of the blow
 * that would have reached (`share` 0…1: 1 a direct hit, less at the edge of a blast).
 */
export function divineHitCost(price, share = 1) {
    const k = Math.max(0, Math.min(1, Number.isFinite(share) ? share : 1));
    return Math.max(0, price || 0) / 2 * k;
}

/**
 * Pay a divine hit from `mana` (pure: tests). @returns {{mana, pass}} the mana left and the share of the blow
 * that goes on through (0: all held; >0: the shield broke — what the mana could not hold goes on).
 */
export function payDivine(mana, price, share = 1) {
    const cost = divineHitCost(price, share);
    if (cost <= 0) return { mana, pass: 0 };
    if (mana >= cost) return { mana: mana - cost, pass: 0 };
    const held = Math.max(0, mana) / cost; // (the part of it the mana still held)
    return { mana: 0, pass: Math.max(0, Math.min(1, share)) * (1 - held) };
}

/**
 * Who and what the gods' shield (and its casting) touches — CLAUDE.md «на кого и на что» («не действует» is a
 * decision too, with why).
 */
export const PROTECTION_GODS_TARGETS = {
    holders: 'only players, and only who burnt its scroll from the gods\' library on Venus (or in Creative); no creature casts it — the castle wizards, the Master, the Ice Queen, Captain Black Moustache and the rest know only their own magic (WizardAI: the ordinary «Protection»)',
    me: 'every spell not of the gods: nothing — no harm, push, fall, stun, ice, slowing, lifting, no mana taken (Combat._payHit / damage / stun / freeze / slow, BodyImpact.apply); the gods\' spells: half their price × the share of the blow (Combat.godsHit: «Бум» — Boom._hurtMe, «Planet Liquidation» — PlanetDestroy)',
    players: 'another player\'s shield is decided on his own computer (he pays his mana); everybody sees it gold (Combat.serialize → RemoteAvatar)',
    duelCharges: 'Авада Кедавра, Остолбеней, Айс, Сапира, Даст, Левиоса, Экспеллиармус, Disarmor, Джолт: they stop on it (Duel: shieldFactor + _blocked) — no mana; from behind the hand shield, as with «Protection», they get through (the dome: from everywhere held)',
    blasts: 'Бомбардо (Максима), Total Destruction, Circle Attack, Inspirius, Earthquake, Lightning, the Hellfire, the water storm and vortex: nothing reaches its holder, the hand shield too (they strike all round — ALL_ROUND); a cannonball\'s blast is no spell: as an ordinary shield',
    rays: 'Сапира, Тандервейв, Айс, Инферно, Вайнд, Fire Maxima, Liquidation, the ice balls (Game: birdRay, hits; WaterMagic; Liquidation): stopped — no mana, no push',
    beasts: 'a zombie\'s, a knight\'s, an animal\'s, the spider\'s, a dragon\'s, a phoenix\'s blow, bite or fire, the Ice Queen\'s monsters\' fists: no spell — as an ordinary «Protection» (the shield facing it holds, no mana)',
    iceQueen: 'her ice, «Frozen», snow, the Ice Rod: spells, not of the gods — held fully (IceQueen: _blocked)',
    bosses: 'the king, the Master of the tower, the spider queen, the dragons, the Ice Queen, Captain Black Moustache: none of their magic is of the gods — held fully',
    things: 'an arrow, a thing thrown, a sword, an axe, a cannonball, a pistol\'s bullet: no spell — as an ordinary shield (ShieldBounce, Combat.meleeHit); a magic blade does not break it',
    creatures: 'zombies, castle people, animals, sailors, the spider, living trees, book-birds, dragons, phoenixes, owls, the Ice Castle\'s creatures: not touched (the shield only keeps harm off its holder) — they are not pushed by it',
    world: 'blocks, trees, water, houses, ships, things: not touched (no harm; it is no ward of a place — a house\'s sphere stays the house\'s own: HouseWards)',
    houseSphere: 'a stranger\'s house sphere still keeps its holder out (it is a protection, not an attack: NOT_MAGIC «Ward»)',
    space: 'works everywhere: the Earth, space, every planet (Space.spaceSpellBlock: nothing refused); the Sun still burns — it is no spell, nor is the void',
    castlePeople: 'its golden light frightens nobody (no danger: Danger.js is not told)',
};
