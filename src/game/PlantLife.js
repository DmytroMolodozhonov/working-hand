/**
 * PlantLife.js — the creatures of the plant world: rules, numbers and the table of kinds (no THREE: the tests read it).
 *
 *   Телевильпин  a big red glowing flower (not a rose: tall stems, thorns). Groups of ~5, 0.6× as often as apple trees.
 *                Pricks whoever stands at it (−1 HP, about once a second per flower) — unless the visitor wears a FULL SET of
 *                steel (helmet + breastplate + greaves, magic ones too; a robe and cloth do not count): then the thorns slide off.
 *                Broken (blade, fire, blast, spell) → one «Листок телевильпина» (a red glowing leaf).
 *   Плотоядная голова  a carnivorous plant half the height of a tree: a stem, a snapping trap on top, thin lashing tendrils.
 *                Groups of 2–5, 0.5× as often as apple trees. Stands where it grows; a living thing coming near is grabbed by the
 *                tendrils, bitten and swallowed — an animal in three bites, a man without armour too. Armour is indigestible.
 *                Destroyed → «Головка плотоядной».
 *
 * ADDING A KIND = one row in PLANT_KINDS (id, height, rate relative to apple trees, group, HP, drop, the «who/what» table).
 */

/** Apple trees (Animals.APPLE_TREES): one cell of 110 m grows one with this chance (golden 0.15 + ordinary 0.65). */
export const APPLE = { CELL: 110, RATE: 0.8 };

/** The real trees of the world are 14–25 m (TreeBuild.TREE_SIZES: oak 14–18, spruce 19–25); a head is about half of that. */
export const TREE_TYPICAL_H = 17;

export const PLANT_KINDS = {
    telewilpin: {
        id: 'telewilpin', name: 'Телевильпин', nameMany: 'телевильпины', icon: '🌹',
        height: [4.6, 6.4], // m: the long stem and the bloom on top
        rel: 0.6, // as often as apple trees × this
        group: { min: 4, max: 6, mode: 5, spread: 7, gap: 2.4 }, // «около 5», within `spread` m of the group's centre, ≥ `gap` m apart
        hp: 12, drop: 'telewilpinLeaf', dropCount: 1,
        salt: 1103,
        // who/what: how each way of harm acts on it (CLAUDE.md table)
        harm: { blade: 'hurts', fist: 'weak', fire: 'burns fast', blast: 'kills', cold: 'brittle', arrow: 'hurts', lightning: 'burns', alive: 'none' },
        prick: { dmg: 1, every: 1.0, reach: 1.7 }, // HP, s between pricks of one flower, m from its stem
        needsMetalSet: true,
    },
    carnivore: {
        id: 'carnivore', name: 'Плотоядная голова', nameMany: 'плотоядные головы', icon: '🪴',
        height: [7.4, 9.4], // m ≈ half of a tree
        rel: 0.5,
        group: { min: 2, max: 5, mode: 3, spread: 9, gap: 5.5 },
        hp: 60, drop: 'carnivoreHead', dropCount: 1,
        salt: 2207,
        harm: { blade: 'hurts', fist: 'weak', fire: 'burns fast', blast: 'kills', cold: 'freezes', arrow: 'hurts', lightning: 'burns', alive: 'none' },
        notice: 10, // m: a living thing this near wakes it
        reach: 6.5, // m: how far the tendrils throw
    },
};
export const PLANT_ORDER = Object.keys(PLANT_KINDS);

/** The numbers of the carnivorous head's meal (s). */
export const EAT = {
    GRAB: 0.55, // the tendrils reach and wrap a leg
    PULL: 1.2, // dragged up to the jaws
    BITE_EVERY: 0.7, BITES: 3, // «раз, два, три»
    GULP: 0.5, // the swallow
    DIGEST: 5, // the bulge on the stem goes down
    SPIT_ARMOUR: 7, // a breastplate: it tries this long and spits the man out
    HURT: 1, // HP a second inside
    BITE_DMG: 2, // HP a bite on a man
    INSIDE_MAX: 10, // s: the most a man is kept inside (then he is spat out, tired: not a certain death)
    SPIT_V: 11, // m/s of a spat-out body
    COOL: 6, // s before it eats again after a meal
    COOL_MAN: 25, // … after it spat a man out (full, tired of him): he has time to walk away
    ANIMAL_BITE: 6, // HP a bite on an animal (three bites kill most)
    TOSS_V: 9, // m/s: tendrils fling a creature
};

const hash = (a, b, seed, salt = 0) => {
    let x = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(seed, 1442695041) + Math.imul(salt, 2246822519)) | 0;
    x = Math.imul(x ^ (x >>> 13), 1274126177);
    x = Math.imul(x ^ (x >>> 16), 2246822507);
    return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
};

/** Does a group of this kind grow in the cell (gx, gz) of a world (seed)? The chance = apple trees' × `rel`. Same on every computer. */
export function plantGroupAt(kind, gx, gz, seed) {
    const K = PLANT_KINDS[kind];
    return hash(gx * 5 + 3, gz * 11 + 7, seed, K.salt) < APPLE.RATE * K.rel;
}

/**
 * The flowers / heads of the group in a cell: [{x, z, h (0…1 pick of height), yaw, i}], deterministic from the seed. The group's
 * centre lies 15…95 m into the cell (like apple trees), the members round it at least `gap` m apart.
 */
export function plantGroupIn(kind, gx, gz, seed) {
    if (!plantGroupAt(kind, gx, gz, seed)) return null;
    const K = PLANT_KINDS[kind], G = K.group, s = K.salt;
    const cx = gx * APPLE.CELL + 15 + hash(gx, gz, seed, s + 1) * (APPLE.CELL - 30);
    const cz = gz * APPLE.CELL + 15 + hash(gz + 5, gx - 3, seed, s + 2) * (APPLE.CELL - 30);
    // the size: mostly `mode`, sometimes one less / more
    const r = hash(gx, gz, seed, s + 3), span = G.max - G.min;
    let n = G.mode;
    if (r < 0.2) n = Math.max(G.min, G.mode - 1 - (r < 0.06 ? 1 : 0)); else if (r > 0.8) n = Math.min(G.max, G.mode + 1 + (r > 0.94 ? 1 : 0));
    n = Math.min(G.max, Math.max(G.min, n));
    const out = [];
    for (let i = 0, tries = 0; out.length < n && tries < 60; tries++) {
        const a = hash(gx + tries, gz - i, seed, s + 10 + tries) * Math.PI * 2;
        const d = Math.sqrt(hash(gz + tries * 3, gx + i, seed, s + 40 + tries)) * G.spread;
        const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
        if (out.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < G.gap * G.gap)) continue;
        out.push({ x, z, h: hash(gx * 7 + i, gz * 3 + tries, seed, s + 70), yaw: hash(gx - i, gz + 9, seed, s + 90 + tries) * Math.PI * 2, i: out.length });
        i++;
    }
    return { kind, gx, gz, cx, cz, members: out, span };
}

/** The stable id of a member: the same on every computer (for the network and for what is remembered). */
export const plantId = (kind, gx, gz, i) => `${kind === 'telewilpin' ? 't' : 'c'}${gx},${gz}.${i}`;

/** Height of a member (m). */
export const plantHeight = (kind, h01) => { const [a, b] = PLANT_KINDS[kind].height; return a + (b - a) * h01; };

// ======================================================================= armour rules
/**
 * What a body wears, as the plants need it. `worn`: {helmet, chest, legs, robe} (Armor.js items or null).
 *   metalSet  helmet + breastplate + greaves all there (plain or magic — all are steel) → telewilpin thorns do nothing
 *   chest     a breastplate of any kind (plain or magic) → the head cannot eat him
 *   magicRobe a magic robe → the head spits him out at once
 *   (an ordinary robe and cloth are just clothes to a plant)
 */
export function plantGear(worn = {}) {
    const has = (p) => !!worn[p] && worn[p].kind !== 'robe';
    return { metalSet: has('helmet') && has('chest') && has('legs'), chest: has('chest'), magicRobe: !!worn.robe?.magic };
}

/** Does a telewilpin prick this wearer? */
export const thornsPrick = (worn) => !plantGear(worn).metalSet;

/**
 * The carnivorous head's verdict on a living thing it holds: 'eat' | 'tire' (tries, then spits him out after EAT.SPIT_ARMOUR s) | 'spit' (at once).
 * `gear`: plantGear(worn) for a man / a villager; null for an animal (animals wear nothing and cannot defend themselves).
 */
export function swallowVerdict(gear) {
    if (!gear) return 'eat';
    if (gear.magicRobe) return 'spit';
    if (gear.chest) return 'tire';
    return 'eat';
}

// ======================================================================= who / what
/**
 * ON WHOM AND ON WHAT (CLAUDE.md «кто/что»). `kind` 'pricks' = telewilpin, 'eats' = head, 'avoid' = walkers go round it.
 */
export const PLANT_TARGETS = {
    me: { does: 'both', why: 'я: телевильпин колет 1 HP/с (полный металлический комплект — нет); голова ловит щупальцами, откусывает и проглатывает (нагрудник — выплёвывает через ~7 с, магическая мантия — сразу, без урона; обычная мантия не защищает)' },
    players: { does: 'both', why: 'другие игроки — то же самое; каждый компьютер решает про СВОЕГО игрока и сообщает хосту' },
    zombies: { does: 'pricks', why: 'зомби колются о телевильпины; голова зомби не ест — они мертвы (она живое ест)' },
    castlePeople: { does: 'both', why: 'жители без доспехов — как игрок без доспехов; рыцари в доспехах выплёвываются, рыцарь рубит растение; жители обходят растения (Crowd)' },
    animals: { does: 'both', why: 'животные не умеют защищаться: колются, голова съедает их за три укуса и проглатывает — мяса не остаётся' },
    sailors: { does: 'both', why: 'моряки — как жители (на суше)' },
    spider: { does: 'none', why: 'гигантская паучиха слишком велика: растения её не ловят' },
    livingTrees: { does: 'none', why: 'ожившие деревья слишком велики и грубы' },
    bookBirds: { does: 'none', why: 'книги-птицы летают — растения не достают' },
    dragons: { does: 'none', why: 'драконы слишком велики; щупальца не держат' },
    phoenixes: { does: 'none', why: 'феникс в небе' },
    owls: { does: 'none', why: 'умная сова улетает от растения' },
    iceCastle: { does: 'none', why: 'ледяные существа не едят и холодные' },
    gargoyle: { does: 'none', why: 'каменная горгулья несъедобна' },
    items: { does: 'none', why: 'вещи растение не берёт' },
};

/**
 * HOW EACH SPELL / BLOW ACTS ON THE PLANTS (the same for both kinds; the head has more HP).
 *   blade   hurts (sword/axe: full)     fist  weak (×0.4)    arrow  hurts    fire  burns fast (−12 HP/s while it burns)
 *   blast   kills (Bombardo)            cold  telewilpin brittle (dies); head freezes 6 s (does not eat)
 *   alive («Alive»): no effect — they are not trees: a plant creature already lives.
 *   gods' spells: kill (nothing protects a plant).
 */
export const PLANT_DAMAGE = {
    melee: 1, fist: 0.4, punch: 0.4, arrow: 0.8, Bombardo: 3, BombardoMaxima: 6, Lightning: 3, Inferno: 0.5, Fire: 0.5, Hellfire: 2,
    Thunderwave: 2, Inspirius: 99, TotalDestruction: 99, Avada: 0, AvadaKedavra: 0, // (a green plant has no heart to stop; «Авада» fails as on a living tree)
};
export const FIRE_KINDS = new Set(['Inferno', 'Fire', 'Hellfire', 'fire', 'FireMaxima']);
export const COLD_KINDS = new Set(['Ice', 'IceDuel', 'Frozen', 'chill', 'cold', 'IceBall', 'Snowman']);
export const BURN = { DPS: 12, TIME: 6 };
export const FREEZE = { TIME: 6 };

/** Damage a plant takes from a hit of this kind (number of HP). */
export function plantDamage(kind, dmg) {
    if (FIRE_KINDS.has(kind)) return Math.max(dmg, 4);
    if (COLD_KINDS.has(kind)) return 0; // (cold is handled by freeze / brittle, not HP)
    const m = PLANT_DAMAGE[kind];
    if (m === undefined) return dmg; // (a new kind: as much as it does)
    if (m >= 99) return 999;
    if (m === 0) return 0;
    return kind === 'melee' || kind === 'fist' || kind === 'punch' || kind === 'arrow' ? dmg * m : Math.max(dmg, m * 4);
}

/** Wounds of a leaf / head stack to 10 in one slot, like meat. */
export const DROP_STACK = 10;
