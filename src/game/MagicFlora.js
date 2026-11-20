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
export const FLORA = { CELL: 48, LOAD: 100, KEEP: 145, REGROW_MS: 6 * 60 * 1000, HAND: 0.62, PICK_COOL: 450, MAX_PER_KIND: 90, PER_FRAME: 2 };

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
    armourleaf: {
        id: 'armourleaf', name: 'Бронелист', nameMany: 'бронелисты', icon: '🛡️', item: 'armor_leaf', fromGen: 28, // (= ARMOURLEAF_FROM_GEN in Terrain.js) (only worlds of generation 28 and newer: old worlds do not change)
        biomes: { steppe: 0.32, emerald: 0.3, meadow: 0.1, autumn: 0.16, tundra: 0.14 },
        group: { min: 1, max: 2, spread: 9, gap: 3.4 },
        salt: 6607, height: [1.9, 2.2],
        solid: { r: 0.3, h: 1.6 }, // the stalk
        harm: { fire: 'burn', blast: 'destroy', lightning: 'burn', cold: 'none', gods: 'destroy', alive: 'none', push: 'none' },
    },
    eyeflower: {
        id: 'eyeflower', name: 'Глазоцвет', nameMany: 'глазоцветы', icon: '👁️', item: 'eyeflower_eye', fromGen: 33, // (= EYEFLOWER_FROM_GEN in Terrain.js) (worlds of generation 33 and newer)
        biomes: { forest: 0.4, moon: 0.7, sakura: 0.3, meadow: 0.16, autumn: 0.28, jungle: 0.3, taiga: 0.16 }, // shady and quiet places
        group: { min: 3, max: 7, spread: 7, gap: 1.5 }, // (they grow in company)
        salt: 6709, height: [1.15, 1.35],
        solid: null, // (small, walked among)
        harm: { fire: 'burn', blast: 'destroy', lightning: 'burn', cold: 'none', gods: 'destroy', alive: 'none', push: 'none' },
    },
    cactus: {
        id: 'cactus', name: 'Кактус', nameMany: 'кактусы', fromGen: 27,
        biomes: { desert: .65 },
        group: { min: 2, max: 5, spread: 16, gap: 4 },
        salt: 6803, height: [2.8, 4.8],
        solid: { r: .34, h: 2.7 },
        harm: { fire: 'burn', blast: 'destroy', lightning: 'burn', cold: 'none', gods: 'destroy', alive: 'none', push: 'none' },
    },
};
/**
 * Where a plant's foot stands on the real ground. The ground is not flat under its mound: in the smooth world (generation 6+) the
 * top block is a ramp or a slab, and the neighbouring columns of the foot are other heights. The plant was set at ONE column's
 * top (`top − 0.5`) — over a ramp or on the low side it hung in the air, with a gap under the mound. Now the whole footprint
 * (the centre and two rings) is read with `surfaceY`: the foot stands on the LOWEST of those points (the high side sinks into the
 * ground — a grown-in foot, never a gap); a footprint over water / an empty column / a cliff (spread > `MAX_SPREAD`) grows nothing.
 * `t` — TerrainData (surfaceY, topLayer, get). Returns { y, spread } or null.
 */
export const FOOT_R = { glowcap: 1.3, giantfern: 0.9, azureberry: 0.9, sunherb: 0.7, frostcrystal: 0.8, armourleaf: 0.8, eyeflower: 0.5 }; // (m at scale 1: the mound / the foot)
export const MAX_SPREAD = 2; // (m: more height between the foot's points — a slope too steep for a mound)
export function plantFoot(t, kind, x, z, scale, water) {
    const r = (FOOT_R[kind] || 0.8) * scale;
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < 25; i++) {
        const ring = i === 0 ? 0 : i <= 8 ? 0.5 : 1, a = (i <= 8 ? i - 1 : i - 9) / (i <= 8 ? 8 : 16) * Math.PI * 2 + 0.3;
        const px = x + Math.cos(a) * r * ring, pz = z + Math.sin(a) * r * ring;
        const ix = Math.round(px), iz = Math.round(pz), top = t.topLayer(ix, iz);
        if (!(top > -1e5)) return null; // (an empty column)
        if (water && water(ix, top, iz)) return null; // (water over the foot: it would stand in the water)
        const y = t.surfaceY(px, pz);
        if (y < lo) lo = y;
        if (y > hi) hi = y;
    }
    return hi - lo > MAX_SPREAD ? null : { y: lo - 0.05, spread: hi - lo }; // (a hair into the ground between the sample points)
}

export const FLORA_ORDER = Object.keys(FLORA_KINDS);

/** The things the plants give (merged into ItemTypes.ITEM_INFO). Ids are fixed: potions use them. `heal`: food. */
export const FLORA_ITEMS = {
    glowcap_mushroom: { name: 'Светящийся гриб', icon: '🍄', weight: 0.2, stack: 20 },
    fern_frond: { name: 'Лист папоротника', icon: '🌿', weight: 0.15, stack: 20 },
    azure_berry: { name: 'Лазурная ягода', icon: '🫐', weight: 0.05, stack: 30, heal: 2 },
    sun_herb: { name: 'Солнечница', icon: '🌼', weight: 0.05, stack: 30, heal: 1 },
    frost_shard: { name: 'Ледяная игла', icon: '❄️', weight: 0.1, stack: 20 },
    armor_leaf: { name: 'Лист бронелиста', icon: '🛡️', weight: 0.3, stack: 10 },
    eyeflower_eye: { name: 'Глаз глазоцвета', icon: '👁️', weight: 0.2, stack: 10 },
};
/** Which plant an item came from (item id → kind id). */
export const FLORA_OF_ITEM = Object.fromEntries(FLORA_ORDER.filter(k => FLORA_KINDS[k].item).map(k => [FLORA_KINDS[k].item, k]));

/** What the item says about itself (ItemTypes.itemInfo): usefulness first, then how to use it. */
export const FLORA_ITEM_TEXT = {
    glowcap_mushroom: { color: 0x38c8d8, lines: ['Светится в темноте — пригодится для зелий', 'В пищу сырым не годится', 'Растёт на грибных кочках в лесах и тайге'] },
    fern_frond: { color: 0x4a9a3a, lines: ['Молодой завиток исполинского папоротника — пригодится для зелий', 'Растёт у подножия папоротника в лесах и зарослях'] },
    azure_berry: { color: 0x3a58c8, lines: ['Поднесите ко рту: +2 HP', 'Растёт на кустах лазурницы на лугах; ягоды вырастают снова'] },
    sun_herb: { color: 0xffb030, lines: ['Поднесите ко рту: +1 HP — жуётся горьковато', 'Целебная трава для зелий', 'Растёт золотыми кустиками на лугах и в степи'] },
    armor_leaf: { color: 0x8fb4b8, lines: ['Твёрдый лист, похожий на пластину брони', 'Нужен для пентаграммы защиты от взрывов', 'Растёт бронелистами в степях и на изумрудных холмах'] },
    eyeflower_eye: { color: 0xd8c27a, lines: ['Живой глаз с цветка — нужен для пентаграммы ночного зрения', 'Положите его на круг, встаньте в него и заплатите ману', 'Растёт на глазоцветах в лесах и на тихих лугах; вырастает снова'] },
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


// ======================================================================= the Eye-flower's eye (pure: the look of the instance is made from this)
/** The numbers of the eye (s, rad, m). */
export const EYE = {
    SEE_R: 16, // m: a hero this near is noticed — the eye turns to him (a stranger's look)
    STARE_R: 4, // m: very near — it stares and blinks slowly
    YAW_MAX: 1.45, PITCH_MAX: 0.22, WANDER_PITCH: 0.12, // how far the eye turns (rad): wide to the sides, hardly ever up or down (the author 19.11: «не вверх, а в стороны»)
    WANDER_MIN: 1.6, WANDER_SPAN: 1.8, // s between two glances about
    BLINK_MIN: 3.6, BLINK_SPAN: 2.6, BLINK_T: 0.24, // a blink every 3.6…6.2 s, 0.24 s long
    REST_MIN: 16, REST_SPAN: 8, REST_T: 3.2, // the eye shuts for a rest now and then (s): closes smoothly, opens again
    SHUT: 0.1, // how far it closes (0.1 = a slit)
};
const frac = (x) => x - Math.floor(x);
const smooth = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const gh = (n, phase) => frac(Math.sin(n * 127.1 + phase * 311.7) * 43758.5453);
/**
 * The state of an eye at time t (s) for a flower with this `phase` (0…1, its own — no two look alike). `see`: null, or {yaw, pitch, near} — a hero it
 * notices (yaw/pitch of the way to him, relative to the flower's front; near 0…1). → { open (0…1), yaw, pitch } (pitch > 0 looks down).
 */
export function eyeState(t, phase, see = null) {
    // glances about: every segment a new place to look at, reached in 0.4 s
    const seg = EYE.WANDER_MIN + EYE.WANDER_SPAN * gh(1, phase);
    const n = Math.floor((t + phase * 50) / seg), u = ((t + phase * 50) / seg - n) * seg;
    const ty = (gh(n + 2, phase) - 0.5) * 2 * 1.25, tp = (gh(n + 3, phase) - 0.5) * 2 * EYE.WANDER_PITCH;
    const py = (gh(n + 1, phase) - 0.5) * 2 * 1.25, pp = (gh(n + 2.5, phase) - 0.5) * 2 * EYE.WANDER_PITCH;
    const k = smooth(u / 0.4);
    let yaw = py + (ty - py) * k, pitch = pp + (tp - pp) * k;
    // a hero near: the eye follows him (the nearer, the more)
    if (see && see.near > 0) {
        const w = Math.min(1, see.near) * 0.88;
        yaw += (Math.max(-EYE.YAW_MAX, Math.min(EYE.YAW_MAX, see.yaw)) - yaw) * w;
        pitch += (Math.max(-EYE.PITCH_MAX, Math.min(EYE.PITCH_MAX, see.pitch)) - pitch) * w;
    }
    // blink and rest
    const stare = see && see.near > 0.8;
    const P = (EYE.BLINK_MIN + EYE.BLINK_SPAN * gh(4, phase)) * (stare ? 1.5 : 1);
    const b = (t + phase * P) % P;
    let open = b < EYE.BLINK_T ? 1 - Math.sin(Math.PI * b / EYE.BLINK_T) * (1 - EYE.SHUT) : 1;
    const C = EYE.REST_MIN + EYE.REST_SPAN * gh(5, phase);
    const w = (t + phase * C) % C - (C - EYE.REST_T);
    if (see && see.near > 0.25) open = Math.min(open, 0.8 + 0.1 * Math.sin(t * 0.8 + phase * 9)); // (watching: a narrowed, intrigued eye)
    if (w > 0 && !(see && see.near > 0.3)) open = Math.min(open, 1 - Math.sin(Math.PI * w / EYE.REST_T) * (1 - EYE.SHUT)); // (not while somebody stands by: it watches)
    return { open, yaw, pitch };
}
