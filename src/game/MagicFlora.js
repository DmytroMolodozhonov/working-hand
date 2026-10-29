/**
 * MagicFlora.js — the wild magic plants of the meadows, forests and the cold north: rules, numbers and the tables (no THREE: the tests read it).
 *
 *   Светлошляпка         glowing mushrooms in the forests, taiga, jungle and the moon groves. The caps shine at night. Picked by hand →
 *                        «Светящийся гриб» (`glowcap_mushroom`, an ingredient). Not food: the mushrooms of the dark are not eaten raw.
 *   Исполинский папоротник  a fern as tall as a tree, its fronds 4 m high and 7 m across, in the forests, jungle, emerald hills and taiga.
 *                        The young curled fronds at its foot are picked → «Лист папоротника» (`fern_frond`, an ingredient). Its spores drift
 *                        up when somebody walks through the fronds.
 *   Лазурница            a berry bush of the meadows, cherry valleys and autumn woods. The dusky-blue berries heal 2 HP each →
 *                        «Лазурная ягода» (`azure_berry`, food); they grow again.
 *   Солнечница           a golden healing herb of the meadows, steppe, highlands and emerald hills. Picked blooms → «Солнечница»
 *                        (`sun_herb`, heals a little when chewed; an ingredient of healing potions).
 *   Хрустальник          a crystal tree of ice in the cold north (highlands and taiga). The hanging needles are picked → «Ледяная игла»
 *                        (`frost_shard`, an ingredient). Fire melts it, a blast shatters it; cold does nothing to it.
 *
 * ADDING A KIND = one row in FLORA_KINDS (biomes, chance, group, regrow time, collision, drop, the «who/what» harm) + a shape in fx/FloraModels.js
 * + a row in FLORA_TARGETS if a new kind of creature meets it. Only worlds of BAKSADI_FROM_GEN and newer have them.
 */

/** The cells (like the apple trees' cells, but small: wild plants are much commoner), how far they are loaded / kept. */
export const FLORA = { CELL: 48, LOAD: 130, KEEP: 190, REGROW_MS: 6 * 60 * 1000, HAND: 0.62, PICK_COOL: 450, MAX_PER_KIND: 90, PER_FRAME: 2 };

export const FLORA_KINDS = {
    glowcap: {
        id: 'glowcap', name: 'Светлошляпка', nameMany: 'светлошляпки', icon: '🍄', item: 'glowcap_mushroom',
        biomes: { forest: 0.5, taiga: 0.3, jungle: 0.45, moon: 0.9, sakura: 0.15, autumn: 0.2 }, // chance of a group in a cell, by the land
        group: { min: 1, max: 3, spread: 12, gap: 3.2 },
        salt: 6101, height: [1.6, 1.9], glow: true,
        solid: null, // (mushrooms are walked among: no collision, like grass and flowers — the stems are thin)
        harm: { fire: 'burn', blast: 'destroy', lightning: 'burn', cold: 'none', gods: 'destroy', alive: 'none', push: 'none' },
    },
    giantfern: {
        id: 'giantfern', name: 'Исполинский папоротник', nameMany: 'исполинские папоротники', icon: '🌿', item: 'fern_frond',
        biomes: { forest: 0.28, jungle: 0.6, emerald: 0.4, taiga: 0.2, moon: 0.3 },
        group: { min: 1, max: 2, spread: 8, gap: 5.5 },
        salt: 6203, height: [4, 4.4],
        solid: { r: 0.32, h: 3 }, // the scaly trunk
        harm: { fire: 'burn', blast: 'destroy', lightning: 'burn', cold: 'none', gods: 'destroy', alive: 'none', push: 'none' },
    },
    azureberry: {
        id: 'azureberry', name: 'Лазурница', nameMany: 'лазурницы', icon: '🫐', item: 'azure_berry',
        biomes: { meadow: 0.34, sakura: 0.3, autumn: 0.2, forest: 0.1, emerald: 0.12 },
        group: { min: 1, max: 3, spread: 7, gap: 3 },
        salt: 6307, height: [1.7, 1.9],
        solid: { r: 0.7, h: 1.5 }, // the thick of the bush
        harm: { fire: 'burn', blast: 'destroy', lightning: 'burn', cold: 'none', gods: 'destroy', alive: 'none', push: 'none' },
    },
    sunherb: {
        id: 'sunherb', name: 'Солнечница', nameMany: 'солнечницы', icon: '🌼', item: 'sun_herb',
        biomes: { meadow: 0.42, steppe: 0.3, tundra: 0.25, emerald: 0.3, sakura: 0.15 },
        group: { min: 3, max: 6, spread: 8, gap: 1.6 },
        salt: 6401, height: [1.2, 1.4], glow: true,
        solid: null,
        harm: { fire: 'burn', blast: 'destroy', lightning: 'burn', cold: 'none', gods: 'destroy', alive: 'none', push: 'none' },
    },
    frostcrystal: {
        id: 'frostcrystal', name: 'Хрустальник', nameMany: 'хрустальники', icon: '❄️', item: 'frost_shard',
        biomes: { tundra: 0.45, taiga: 0.22 },
        group: { min: 1, max: 2, spread: 7, gap: 4.5 },
        salt: 6503, height: [3.3, 4.7], glow: true,
        solid: { r: 0.42, h: 4 }, // the crystal trunk
        harm: { fire: 'melt', blast: 'destroy', lightning: 'destroy', cold: 'none', gods: 'destroy', alive: 'none', push: 'none' },
    },
};
export const FLORA_ORDER = Object.keys(FLORA_KINDS);

/** The things the plants give (merged into ItemTypes.ITEM_INFO). Ids are fixed: potions use them. `heal`: food. */
export const FLORA_ITEMS = {
    glowcap_mushroom: { name: 'Светящийся гриб', icon: '🍄', weight: 0.2, stack: 20 },
    fern_frond: { name: 'Лист папоротника', icon: '🌿', weight: 0.15, stack: 20 },
    azure_berry: { name: 'Лазурная ягода', icon: '🫐', weight: 0.05, stack: 30, heal: 2 },
    sun_herb: { name: 'Солнечница', icon: '🌼', weight: 0.05, stack: 30, heal: 1 },
    frost_shard: { name: 'Ледяная игла', icon: '❄️', weight: 0.1, stack: 20 },
};
/** Which plant an item came from (item id → kind id). */
export const FLORA_OF_ITEM = Object.fromEntries(FLORA_ORDER.map((k) => [FLORA_KINDS[k].item, k]));

/** What the item says about itself (ItemTypes.itemInfo): usefulness first, then how to use it. */
export const FLORA_ITEM_TEXT = {
    glowcap_mushroom: { color: 0x38c8d8, lines: ['Светится в темноте — пригодится для зелий', 'В пищу сырым не годится', 'Растёт на грибных кочках в лесах и тайге'] },
    fern_frond: { color: 0x4a9a3a, lines: ['Молодой завиток исполинского папоротника — пригодится для зелий', 'Растёт у подножия папоротника в лесах и зарослях'] },
    azure_berry: { color: 0x3a58c8, lines: ['Поднесите ко рту: +2 HP', 'Растёт на кустах лазурницы на лугах; ягоды вырастают снова'] },
    sun_herb: { color: 0xffb030, lines: ['Поднесите ко рту: +1 HP — жуётся горьковато', 'Целебная трава для зелий', 'Растёт золотыми кустиками на лугах и в степи'] },
    frost_shard: { color: 0x9fdcff, lines: ['Холодная игла хрусталя — пригодится для зелий', 'Растёт на хрустальниках на холодном севере'] },
};

const hash = (a, b, seed, salt = 0) => {
    let x = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(seed, 1442695041) + Math.imul(salt, 2246822519)) | 0;
    x = Math.imul(x ^ (x >>> 13), 1274126177);
    x = Math.imul(x ^ (x >>> 16), 2246822507);
    return ((x ^ (x >>> 15)) >>> 0) / 4294967296;
};

/** The centre of a kind's group in a cell: 4…44 m into the 48 m cell (the same on every computer). */
export function floraCentre(kind, gx, gz, seed) {
    const s = FLORA_KINDS[kind].salt, C = FLORA.CELL;
    return { x: gx * C + 4 + hash(gx, gz, seed, s + 1) * (C - 8), z: gz * C + 4 + hash(gz + 5, gx - 3, seed, s + 2) * (C - 8) };
}

/**
 * The group of a kind in the cell (gx, gz) of a world (seed): null, or {kind, gx, gz, cx, cz, members: [{x, z, yaw, scale, variant, i, id}]}.
 * `biomeOf(x, z)` → the land's id ('forest'…) at the group's centre decides the chance. Deterministic.
 */
export function floraGroupIn(kind, gx, gz, seed, biomeOf) {
    const K = FLORA_KINDS[kind], c = floraCentre(kind, gx, gz, seed);
    const land = biomeOf(c.x, c.z), chance = K.biomes[land];
    if (!chance || hash(gx * 5 + 3, gz * 11 + 7, seed, K.salt) >= chance) return null;
    const G = K.group, s = K.salt, out = [];
    const n = Math.min(G.max, G.min + Math.floor(hash(gx, gz, seed, s + 3) * (G.max - G.min + 1)));
    for (let tries = 0; out.length < n && tries < 40; tries++) {
        const a = hash(gx + tries, gz - out.length, seed, s + 10 + tries) * Math.PI * 2;
        const d = Math.sqrt(hash(gz + tries * 3, gx + out.length, seed, s + 40 + tries)) * G.spread;
        const x = Math.round(c.x + Math.cos(a) * d), z = Math.round(c.z + Math.sin(a) * d);
        if (out.some((p) => (p.x - x) ** 2 + (p.z - z) ** 2 < G.gap * G.gap)) continue;
        const i = out.length;
        out.push({ x, z, yaw: hash(gx - i, gz + 9, seed, s + 90 + tries) * Math.PI * 2, scale: 0.88 + 0.28 * hash(gx + i * 7, gz, seed, s + 120 + tries), variant: Math.floor(hash(gx * 3 + i, gz * 5, seed, s + 150 + tries) * 3) % 3, i, id: `${kind}:${gx},${gz}.${i}` });
    }
    return out.length ? { kind, gx, gz, cx: c.x, cz: c.z, members: out } : null;
}

// ======================================================================= the harm (CLAUDE.md «кто/что»)
export const FIRE_KINDS = new Set(['Inferno', 'Fire', 'Hellfire', 'fire', 'FireMaxima']);
export const COLD_KINDS = new Set(['Ice', 'IceDuel', 'Frozen', 'chill', 'cold', 'IceBall', 'Snowman']);
export const BLAST_KINDS = new Set(['Bombardo', 'BombardoMaxima', 'Thunderwave']);
export const GOD_KINDS = new Set(['Inspirius', 'TotalDestruction', 'Boom']);
export const LIGHTNING_KINDS = new Set(['Lightning']);
/** Burning plants burn this long (s) before they are gone; the embers fly meanwhile. */
export const BURN_TIME = 3.5;

/**
 * What a spell / blow of this kind does to a plant of this kind: 'destroy' (gone at once, the parts fall as items), 'burn' (burns 3.5 s, then ash),
 * 'melt' (the crystal tree melts to a puddle), 'none' (no effect — written with the reason in FLORA_TARGETS).
 */
export function floraHarm(kind, spell) {
    const K = FLORA_KINDS[kind];
    if (!K) return 'none';
    if (GOD_KINDS.has(spell)) return K.harm.gods;
    if (FIRE_KINDS.has(spell)) return K.harm.fire;
    if (LIGHTNING_KINDS.has(spell)) return K.harm.lightning;
    if (BLAST_KINDS.has(spell)) return K.harm.blast;
    if (COLD_KINDS.has(spell)) return K.harm.cold;
    return 'none'; // (Avada, Alive, Overgrown, winds, pushes, charms: a plant is rooted and green only — nothing for them to act on)
}

/**
 * ON WHOM AND ON WHAT (CLAUDE.md): every kind of creature and every way of harm, and what happens with the wild plants. «none» is a decision too.
 */
export const FLORA_TARGETS = {
    me: { does: 'pick', why: 'руки: пустая рука рядом с ягодами, грибом, цветком или иглой срывает их; сорванное вырастает через 6 минут' },
    players: { does: 'pick', why: 'другие игроки рвут так же: сообщение хосту, хост решает и сообщает всем' },
    zombies: { does: 'none', why: 'зомби ничего не рвут; идут сквозь кусты не задевая — коллизия лишь у ствола' },
    castlePeople: { does: 'avoid', why: 'жители обходят стволы и кусты (Crowd видит коллизию); сами растения не рвут' },
    animals: { does: 'avoid', why: 'животные не топчут растения, обходят стволы' },
    sailors: { does: 'none', why: 'моряки на суше растения не трогают' },
    spider: { does: 'none', why: 'гигантская паучиха растения не замечает' },
    livingTrees: { does: 'none', why: 'ожившие деревья не трогают траву и кусты' },
    bookBirds: { does: 'none', why: 'летают выше' },
    dragons: { does: 'none', why: 'дракон растения не топчет; его огонь горит через мир (деревья, блоки), а дикие растения зажигают Инферно, молния и взрывы — честно: пламя дракона их пока не берёт' },
    phoenixes: { does: 'none', why: 'феникс в небе' },
    owls: { does: 'none', why: 'сова улетает от растений' },
    iceCastle: { does: 'none', why: 'ледяные существа растения не трогают; хрустальник им не враг и не друг' },
    gargoyle: { does: 'none', why: 'горгульи растения не замечают' },
    items: { does: 'none', why: 'вещи растение не берёт; сорванные части становятся обычными вещами' },
};

/**
 * HOW EACH SPELL ACTS ON THE WILD PLANTS (floraHarm): fire/lightning burn (the crystal tree melts), blasts and the gods' spells destroy,
 * cold does nothing (a rime on a leaf is nothing; the crystal tree is made of it), «Alive» / «Overgrown» / «Авада» / winds / pushes: nothing.
 * The «Gather» spell pointed at a plant takes all of its ripe parts into the slots.
 */
export const FLORA_SPELLS = {
    fire: 'burn', blast: 'destroy', lightning: 'burn', cold: 'none', gods: 'destroy', alive: 'none: это не деревья — «Alive» оживляет только дерево или могилу',
    overgrown: 'none: растение укоренено, его не отбросить', avada: 'none: у растения нет сердца', gather: 'берёт всё спелое', winds: 'none: ветер лишь покачивает листья',
};

/** Plants and the parts left on the ground after a destroyed plant: one item per ripe part (at most `max`). */
export const SCATTER_MAX = 4;
