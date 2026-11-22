/**
 * GrassSpecies.js — the living ground's catalogue (the author 21.11: «трава должна быть отдельной крутой частью игры, а не фоном…
 * 20 разных видов, сплошные отдельно, кусты… лужи, мелкие элементы, какашки животных. Земля — не плоскость с травой»).
 *
 * Pure data (no THREE: the terrain workers read it — FloraBuild.js). Every kind says where it grows (the land's biome, near water
 * or dry, how thick its colonies are), how it looks (its painted cell in the atlas — GrassAtlas.js, its height and width in metres),
 * how it moves (flex: how far the wind and a passing body bend it; heavy reeds little, feather grass a lot).
 * Sizes from the world's measures: a block 1 m, the hero ~3.5 m (knee ≈ 1 m): meadow grass reaches his shin, timothy his knee,
 * reeds over his head.
 *
 * Kinds: 'tuft' — upright crossed cards (grasses, reeds); 'carpet' — low, many a block, the turf that hides the block's flatness;
 * 'bush' — a dome of leafy cards that casts a shadow; 'lie' — lying flat on the ground (stones, leaves, dung, puddles' rims);
 * 'mound' — a little raised heap (molehills, clods); 'puddle' — water lying in a hollow.
 */

/** The atlas: 8 × 8 cells of 128 × 256 px in a 1024 × 2048 texture (GrassAtlas paints them; the one grass picture of the whole world,
 * so bigger than the usual 256 — `optimization`: a unique, world-wide texture). */
export const ATLAS = { COLS: 8, ROWS: 8, CW: 128, CH: 256, W: 1024, H: 2048 };

/** The cell's uv rectangle [u0, v0, u1, v1] (v up); `sq` — the lower square half of the cell (bushes, things lying flat). */
export function cellUV(cell, sq = false) {
    const c = cell % ATLAS.COLS, r = Math.floor(cell / ATLAS.COLS);
    const u0 = c / ATLAS.COLS, u1 = (c + 1) / ATLAS.COLS;
    const vTop = 1 - r / ATLAS.ROWS, vBot = 1 - (r + 1) / ATLAS.ROWS;
    return sq ? [u0, vBot, u1, vBot + (vTop - vBot) / 2] : [u0, vBot, u1, vTop];
}

// (w — the card's width; h — height range; n — crossed cards a plant; flex 0 stiff … 1 limp; tint — how much the land's grass colour
// colours it (0: its own colour always — reeds' brown heads, the moon's glow); colony — the size of its patches in m; wet — 1 only by
// water, −1 never by water, 0 anywhere; where — biome id → weight)
export const GRASSES = [
    { id: 'bluegrass', ru: 'Мятлик луговой', cell: 0, h: [0.45, 0.85], w: 0.55, n: 2, flex: 0.8, tint: 0.9, colony: 7, wet: 0, where: { meadow: 1, emerald: 0.8, sakura: 0.9, forest: 0.4, autumn: 0.5 } },
    { id: 'fescue', ru: 'Овсяница', cell: 1, h: [0.35, 0.6], w: 0.45, n: 3, flex: 0.5, tint: 0.6, colony: 5, wet: -1, where: { tundra: 1, taiga: 0.6, emerald: 0.5, mesa: 0.3 } },
    { id: 'timothy', ru: 'Тимофеевка', cell: 2, h: [0.8, 1.4], w: 0.5, n: 2, flex: 0.6, tint: 0.8, colony: 9, wet: 0, where: { meadow: 0.9, forest: 0.4, autumn: 0.6, emerald: 0.5 } },
    { id: 'feather', ru: 'Ковыль', cell: 3, h: [0.9, 1.6], w: 0.7, n: 2, flex: 1, tint: 0.35, colony: 14, wet: -1, where: { steppe: 1, mesa: 0.7, tundra: 0.2 } },
    { id: 'foxtail', ru: 'Лисохвост', cell: 4, h: [0.6, 1.1], w: 0.5, n: 2, flex: 0.7, tint: 0.7, colony: 6, wet: 0.4, where: { meadow: 0.8, sakura: 0.6, emerald: 0.5, forest: 0.3 } },
    { id: 'couch', ru: 'Пырей', cell: 5, h: [0.6, 1.05], w: 0.5, n: 2, flex: 0.55, tint: 0.7, colony: 10, wet: -0.5, where: { steppe: 0.8, meadow: 0.5, autumn: 0.7, mesa: 0.4 } },
    { id: 'sedge', ru: 'Осока', cell: 6, h: [0.5, 0.95], w: 0.55, n: 3, flex: 0.35, tint: 0.5, colony: 4, wet: 1, where: { '*': 1 } },
    { id: 'cattail', ru: 'Рогоз', cell: 7, h: [2.0, 3.0], w: 0.6, n: 2, flex: 0.2, tint: 0.3, colony: 5, wet: 1, near: 2, where: { '*': 1 } },
    { id: 'reed', ru: 'Тростник', cell: 8, h: [2.6, 3.8], w: 0.75, n: 2, flex: 0.3, tint: 0.35, colony: 8, wet: 1, near: 3, where: { '*': 1 } },
    { id: 'bent', ru: 'Полевица', cell: 9, h: [0.4, 0.75], w: 0.6, n: 2, flex: 0.85, tint: 0.5, colony: 8, wet: 0, where: { meadow: 0.7, autumn: 0.8, tundra: 0.4, emerald: 0.4 } },
    { id: 'cocksfoot', ru: 'Ежа сборная', cell: 10, h: [0.7, 1.25], w: 0.55, n: 2, flex: 0.5, tint: 0.8, colony: 6, wet: 0, where: { forest: 0.9, meadow: 0.5, jungle: 0.3, taiga: 0.3 } },
    { id: 'smallreed', ru: 'Вейник', cell: 11, h: [1.0, 1.65], w: 0.6, n: 2, flex: 0.6, tint: 0.35, colony: 12, wet: 0, where: { taiga: 0.9, autumn: 0.9, forest: 0.6, tundra: 0.3 } },
    { id: 'matgrass', ru: 'Белоус', cell: 12, h: [0.25, 0.45], w: 0.4, n: 3, flex: 0.3, tint: 0.4, colony: 6, wet: -0.5, where: { tundra: 1, taiga: 0.4, mesa: 0.4 } },
    { id: 'wildoat', ru: 'Овсюг', cell: 13, h: [0.8, 1.3], w: 0.6, n: 2, flex: 0.75, tint: 0.4, colony: 9, wet: -0.5, where: { steppe: 0.8, meadow: 0.4, autumn: 0.6 } },
    { id: 'quaking', ru: 'Трясунка', cell: 14, h: [0.4, 0.7], w: 0.5, n: 2, flex: 0.95, tint: 0.5, colony: 5, wet: 0, where: { meadow: 0.7, sakura: 0.6, emerald: 0.5 } },
    { id: 'foxbarley', ru: 'Ячмень гривастый', cell: 15, h: [0.4, 0.7], w: 0.55, n: 2, flex: 0.9, tint: 0.3, colony: 6, wet: 0, where: { steppe: 0.6, meadow: 0.5, sakura: 0.5, mesa: 0.4 } },
    { id: 'harestail', ru: 'Зайцехвост', cell: 16, h: [0.3, 0.5], w: 0.45, n: 2, flex: 0.7, tint: 0.4, colony: 4, wet: -0.5, where: { sakura: 0.8, meadow: 0.4, steppe: 0.3 } },
    { id: 'millet', ru: 'Бор развесистый', cell: 17, h: [0.6, 1.0], w: 0.6, n: 2, flex: 0.85, tint: 0.7, colony: 8, wet: 0, where: { forest: 0.8, jungle: 0.6, taiga: 0.4 } },
    { id: 'elephant', ru: 'Слоновья трава', cell: 18, h: [1.4, 2.4], w: 0.9, n: 2, flex: 0.45, tint: 0.8, colony: 10, wet: 0, where: { jungle: 1 } },
    { id: 'moonsedge', ru: 'Лунная осока', cell: 19, h: [0.5, 0.9], w: 0.55, n: 3, flex: 0.6, tint: 0.2, colony: 6, wet: 0, glow: true, where: { moon: 1 } },
];

/** The turf and the low herbs (many a block: the ground reads as a living cover, not a block's flat top). */
export const CARPETS = [
    // (the author 21.11: «нет прямой травы, все плюс-минус одинаковые; должна быть прямая, очень сплошная»): a dense upright sward —
    // straight blades standing edge to edge, the meadows' main cover; the cards of neighbouring blocks overlap into one wall of grass
    { id: 'sward', ru: 'Сплошная прямая трава', cell: 32, h: [0.5, 0.95], w: 0.85, per: 3, flex: 0.55, tint: 1, colony: 11, where: { meadow: 1, emerald: 1, sakura: 0.9, forest: 0.5, autumn: 0.8, jungle: 0.7, steppe: 0.6, taiga: 0.4, moon: 0.6 } },
    { id: 'turf', ru: 'Дернина', cell: 20, h: [0.12, 0.24], w: 0.5, per: 3, flex: 0.6, tint: 1, colony: 0, where: { meadow: 1, emerald: 1, sakura: 1, forest: 0.8, autumn: 0.8, jungle: 0.9, taiga: 0.6, tundra: 0.6, steppe: 0.5, moon: 0.8, mesa: 0.3 } },
    { id: 'clover', ru: 'Клевер', cell: 21, h: [0.1, 0.2], w: 0.42, per: 3, flex: 0.4, tint: 0.5, colony: 5, where: { meadow: 0.8, emerald: 0.6, sakura: 0.6, forest: 0.3 } },
    { id: 'moss', ru: 'Мох', cell: 22, h: [0.06, 0.12], w: 0.6, per: 2, flex: 0.1, tint: 0.4, colony: 6, flat: true, where: { taiga: 1, forest: 0.8, tundra: 0.6, jungle: 0.5, moon: 0.5 } },
    { id: 'herbs', ru: 'Подорожник и тысячелистник', cell: 23, h: [0.18, 0.4], w: 0.45, per: 1, flex: 0.5, tint: 0.6, colony: 6, where: { meadow: 0.6, steppe: 0.4, forest: 0.3, autumn: 0.5 } },
    { id: 'fern', ru: 'Папоротник', cell: 24, h: [0.7, 1.3], w: 0.9, per: 1, flex: 0.5, tint: 0.6, colony: 7, where: { forest: 1, jungle: 0.9, taiga: 0.8, moon: 0.4 } },
];

/** Bushes (a dome of leafy cards; they cast a shadow). r — the dome's radius, h — its height. */
export const BUSHES = [
    { id: 'hazel', ru: 'Лещина', cell: 25, r: [0.9, 1.4], h: [1.6, 2.6], flex: 0.25, tint: 0.6, where: { forest: 1, meadow: 0.35, autumn: 0.8, emerald: 0.5, sakura: 0.4 } },
    { id: 'dogrose', ru: 'Шиповник', cell: 26, r: [0.7, 1.1], h: [1.3, 2.1], flex: 0.25, tint: 0.4, where: { meadow: 0.8, steppe: 0.6, sakura: 0.6, mesa: 0.4 } },
    { id: 'blueberry', ru: 'Черничник', cell: 27, r: [0.5, 0.8], h: [0.4, 0.65], flex: 0.3, tint: 0.4, where: { taiga: 1, forest: 0.7, tundra: 0.5 } },
    { id: 'juniper', ru: 'Можжевельник', cell: 28, r: [0.6, 0.9], h: [1.4, 2.4], flex: 0.15, tint: 0.2, where: { tundra: 0.9, taiga: 0.8, mesa: 0.5, steppe: 0.3 } },
];

/**
 * Small things on the ground (lying flat or a little raised). `sub` — which of the cell's four quarters (each thing has 4 looks).
 * dung — only where herds graze (meadows, steppes; Terrain's pastures are not known to a worker: a herd's land is its biome);
 * leaves and twigs — under woods; stones — anywhere, more on dry land; mushrooms — in damp woods.
 */
export const LITTER = [
    { id: 'pebbles', ru: 'Камешки', cell: 29, size: [0.25, 0.6], kind: 'lie', share: 0.05, where: { '*': 0.6, mesa: 1.5, steppe: 1.2, tundra: 1.5 } },
    { id: 'leaves', ru: 'Опавшие листья', cell: 30, size: [0.5, 1.0], kind: 'lie', share: 0.12, where: { forest: 1, autumn: 2, sakura: 1.2, jungle: 0.6, moon: 0.6 } },
    { id: 'twigs', ru: 'Ветки и шишки', cell: 31, size: [0.4, 0.9], kind: 'lie', share: 0.05, where: { forest: 1, taiga: 1.5, autumn: 0.8 } },
    { id: 'dung', ru: 'Навоз', cell: 29, sub: true, size: [0.35, 0.6], kind: 'lie', share: 0.006, where: { meadow: 1, steppe: 1, emerald: 0.8, tundra: 0.5 } },
    { id: 'mushroom', ru: 'Грибы', cell: 30, sub: true, size: [0.25, 0.45], kind: 'stand', share: 0.012, where: { forest: 1, taiga: 1, autumn: 1.4, jungle: 0.6, moon: 0.8 } },
    { id: 'molehill', ru: 'Кротовина', cell: 31, sub: true, size: [0.6, 0.9], kind: 'mound', share: 0.004, where: { meadow: 1, emerald: 1, sakura: 0.6, forest: 0.3 } },
];

/** A puddle: in a hollow of open grass land (a block lower than at least 3 of its 4 neighbours), more after rain (the shader). */
export const PUDDLES = { SHARE: 0.15, MIN_R: 0.5, MAX_R: 1.3 };

/** Every biome's index by id (Landscape.BIOMES order) → the weight table of a kind, for the worker's fast lookup. */
export function weightsByBiome(biomes, list) {
    return list.map((k) => biomes.map((b) => (k.where[b.id] ?? k.where['*'] ?? 0)));
}
