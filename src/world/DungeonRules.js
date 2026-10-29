/**
 * DungeonRules.js — the dungeons of the wild: the kinds, their sizes and numbers (pure data, no three.js, no Terrain.js).
 *
 * (the author: «Игрок гуляет по миру и может найти ДАНЖ — постройку, может быть крутую».)
 *
 *  - On the ground: six ruins, three MAGICAL and three PLAIN, each three in a ladder of size and grandeur — a small weak
 *    ruin, a middling one, a great stately one. The chests in the magical ones hold magical things (mostly scrolls), the
 *    plain ones hold plain things and weapons, a magical thing now and then (ItemTypes.rollDungeonLoot).
 *  - Under the ground: small and middling ones — an old mine, a crypt, a passage, a tomb, catacombs, a cave temple. They are
 *    not «magical» or «plain»: the chests are as in a cave (both kinds of things turn up). More chests than usual — up to 5,
 *    in different rooms.
 *
 * Placed by Dungeons.js (a cell of DUNGEON.CELL m holds at most one), built by DungeonBuild.js. World generation 11 and later
 * (Terrain.DUNGEON_FROM_GEN).
 */

export const DUNGEON = {
    CELL: 240, // m: at most one dungeon per cell
    CHANCE: 0.32, // a cell holds one this often (a third of them fail on water, steep land or another site's: about one dungeon to two castles)
    UNDER_SHARE: 0.42, // …and this share of them is under the ground
    MIN_SPAWN: 200, // m: never nearer the world's start
    MARGIN: 5, // m between a dungeon and its cell's edge (a dungeon never leaves its cell)
    BLEND: 10, // m of slope from the levelled land into the wild
    TRIES: 14, // spots tried in a cell
    PAD: 8, // half-size (m) of the levelled yard before an underground dungeon's entrance
    SIZE_WEIGHTS: { S: 40, M: 35, L: 25 }, // the ruins on the ground: a small one is the commonest, a great one the rarest (the great ones fail on the ground more often)
    UNDER_WEIGHTS: { S: 55, M: 45 },
    HEAD: 5, // layers of air in a passage (the hero is ~3.5 m tall)
    WIDE: 3, // the narrowest passage (blocks)
};

/**
 * The kinds. `zone`: half-size of the levelled land of a ruin; `chests`: [fewest, most]; `look`: the chests' look (Chest.js);
 * `flavor`: what the chests hold on the ground (ItemTypes.rollDungeonLoot: 'magic' | 'ruin'; under the ground: the cave's).
 * Under the ground: `depth` (layers from the yard down to the floor), `W` half-width and `LEN` length of the whole (from the
 * entrance, the stair included) — the dungeon never leaves its cell (Dungeons.js checks).
 */
export const KINDS = {
    // ------------------------------------------------------------------ on the ground, plain
    ruin_tower: { id: 'ruin_tower', name: 'Развалины сторожевой башни', under: false, magic: false, size: 'S', zone: 14, spread: 4, chests: [1, 2], look: 'plain', flavor: 'ruin' },
    ruin_manor: { id: 'ruin_manor', name: 'Заброшенная усадьба', under: false, magic: false, size: 'M', zone: 30, spread: 6, chests: [3, 4], look: 'plain', flavor: 'ruin' },
    ruin_fort: { id: 'ruin_fort', name: 'Развалины форта', under: false, magic: false, size: 'L', zone: 50, spread: 8, chests: [5, 6], look: 'iron', flavor: 'ruin' },
    // ------------------------------------------------------------------ on the ground, magical
    ruin_chapel: { id: 'ruin_chapel', name: 'Руины часовни магов', under: false, magic: true, size: 'S', zone: 14, spread: 4, chests: [1, 2], look: 'painted', flavor: 'magic' },
    ruin_temple: { id: 'ruin_temple', name: 'Руины храма магов', under: false, magic: true, size: 'M', zone: 30, spread: 6, chests: [3, 4], look: 'painted', flavor: 'magic' },
    ruin_citadel: { id: 'ruin_citadel', name: 'Руины цитадели магов', under: false, magic: true, size: 'L', zone: 50, spread: 8, chests: [5, 6], look: 'rich', flavor: 'magic' },
    // ------------------------------------------------------------------ under the ground
    mine: { id: 'mine', name: 'Старая шахта', under: true, size: 'S', depth: 9, W: 23, LEN: 76, chests: [2, 3], look: 'crate' },
    crypt: { id: 'crypt', name: 'Склеп', under: true, size: 'S', depth: 9, W: 12, LEN: 56, chests: [2, 3], look: 'iron' },
    passage: { id: 'passage', name: 'Подземный ход', under: true, size: 'S', depth: 9, W: 22, LEN: 74, chests: [2, 3], look: 'plain' },
    tomb: { id: 'tomb', name: 'Гробница', under: true, size: 'M', depth: 11, W: 22, LEN: 104, chests: [4, 5], look: 'rich' },
    catacombs: { id: 'catacombs', name: 'Забытая крипта', under: true, size: 'M', depth: 11, W: 30, LEN: 106, chests: [4, 5], look: 'iron' },
    cavetemple: { id: 'cavetemple', name: 'Пещерный храм', under: true, size: 'M', depth: 11, W: 28, LEN: 104, chests: [4, 5], look: 'painted' },
};
export const KIND_IDS = Object.keys(KINDS);
export const SURFACE_IDS = KIND_IDS.filter((k) => !KINDS[k].under);
export const UNDER_IDS = KIND_IDS.filter((k) => KINDS[k].under);

/** The kind of a cell by the draws `x` (0…1) and `y` (0…1): size first (the weights), then which of the kinds of that size. */
export function pickKind(under, x, y) {
    const W = under ? DUNGEON.UNDER_WEIGHTS : DUNGEON.SIZE_WEIGHTS;
    let total = 0;
    for (const k of Object.keys(W)) total += W[k];
    let r = x * total, size = Object.keys(W)[0];
    for (const k of Object.keys(W)) { r -= W[k]; if (r < 0) { size = k; break; } }
    const ids = KIND_IDS.filter((k) => KINDS[k].under === under && KINDS[k].size === size);
    return ids[Math.min(ids.length - 1, Math.floor(y * ids.length))];
}

/** Chests: how many, by the kind and a draw (0…1). */
export function chestCount(kind, x) {
    const [a, b] = KINDS[kind].chests;
    return a + Math.min(b - a, Math.floor(x * (b - a + 1)));
}
