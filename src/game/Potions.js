/**
 * Potions.js — what a cauldron does with what goes into it (pure, node-testable).
 *
 * A big black cauldron is inert until it is filled with water («Waterbollow» at a river,
 * the ball carried over and thrown / dropped in). Then things thrown or dropped into it
 * (by hand) dissolve in the water. A few seconds after the last one, if the water is full,
 * it starts brewing: it churns and bubbles, colours swirl — for a random 30–60 s. Then:
 *   - the things matched a recipe → «Зелье готово!»: the liquid settles into a colour of its
 *     own (random every time: the colour never tells which potion it is), a few portions;
 *     an empty flask dipped into it fills with one;
 *   - they matched nothing (or something more fell in) → grey sludge: «Ничего не вышло…»;
 *     the cauldron must be tipped over by hand (that pours it out) and filled again.
 *
 * RECIPES is the one table to add potions to: {id, name, ingredients: {kind: count}, effect,
 * desc}. The ingredients are item kinds (ItemTypes.js), in any order, after the water.
 */

/** The cauldron's size (m, the hero is ~4.8 m tall) and its brewing rules. */
export const CAULDRON = {
    H: 2.7, // the rim's top above the ground (half a hero and more)
    R_BODY: 1.7, // the widest belly (wider than tall: 3.4 m across)
    R_RIM: 1.45, // the rim's middle
    R_IN: 1.32, // the opening: a thing this near the axis falls in
    BOTTOM: 0.62, // the inside's floor above the ground (it stands on three short legs)
    TOP_IN: 2.45, // a full cauldron's water surface
    FULL: 6, // m³ of water: one big ball («Waterbollow» + «Максима»); a small one fills a third
    SETTLE: 5, // s after the last thing fell in before it starts brewing
    BREW_MIN: 30, // s
    BREW_MAX: 60,
    PORTIONS: 3, // flasks one brew fills
    SPILL_TILT: 0.9, // rad: tipped this far, everything pours out
    PRICE: 150, // coins at the master of cauldrons and potions
    CAVE_CHANCE: 0.14, // share of caves where a forgotten cauldron lies
    CAVE_TIPPED: 0.5, // …and how often it lies overturned
};

/**
 * The potions. effect: hp — health back at once; mana — mana back at once.
 * (The invisibility potion comes when the author describes it.)
 */
export const RECIPES = [
    {
        id: 'heal', name: 'Зелье исцеления', ingredients: { apple: 1, crystal: 1 },
        effect: { hp: 30 }, desc: 'Выпейте: +30 HP',
    },
];

/** Things that never dissolve: they sink to the bottom and lie there (a hand can fish them out). */
export const DURABLE = new Set(['wand', 'bow', 'shield', 'backpack', 'hammer', 'book', 'coins', 'arrows', 'cannonball', 'logs', 'blocks', 'flask', 'potion']);

/** Item kinds by name, for the hints (what went in). */
export const INGREDIENT_RU = {
    apple: 'золотое яблоко', crystal: 'кристалл маны', wool: 'шерсть', meat: 'сырое мясо', steak: 'стейк',
    bread: 'хлеб', cheese: 'сыр', pie: 'пирог', scroll: 'свиток', fish: 'рыба',
};

export const recipeById = (id) => RECIPES.find((r) => r.id === id) || null;

/** A fresh cauldron's insides: dry and inert. */
export function newBrew() {
    return { phase: 'empty', water: 0, ings: {}, t: 0, dur: 0, rec: null, color: 0, por: 0 };
}

/** Which recipe these things are (exactly: the same kinds, the same counts, nothing more) — or null. */
export function matchRecipe(ings) {
    const kinds = Object.keys(ings || {}).filter((k) => ings[k] > 0);
    if (!kinds.length) return null;
    for (const r of RECIPES) {
        const want = Object.keys(r.ingredients);
        if (want.length !== kinds.length) continue;
        if (want.every((k) => (ings[k] || 0) === r.ingredients[k])) return r;
    }
    return null;
}

/** How many things are in it. */
export const ingCount = (st) => Object.values(st.ings || {}).reduce((a, b) => a + b, 0);

/** How full it is (0…1). */
export const fullness = (st) => Math.max(0, Math.min(1, (st.water || 0) / CAULDRON.FULL));

/**
 * Water poured in (m³). Returns how much ran over the rim. Brewing, ready or spoilt: it
 * is full already — the water runs over and changes nothing.
 */
export function addWater(st, vol) {
    if (!(vol > 0)) return 0;
    const room = CAULDRON.FULL - st.water;
    const took = Math.max(0, Math.min(room, vol));
    if (st.phase === 'empty' || st.phase === 'water') {
        st.water += took;
        if (st.water > 1e-3) st.phase = 'water';
        if (took > 1e-4) st.t = 0; // (stirred up: the settling starts again)
        return vol - took;
    }
    return vol;
}

/**
 * A thing fell into the cauldron. Returns:
 *   'dry'   — no water: it just lies on the bottom (it does not count);
 *   'sink'  — a thing that never dissolves (a wand, a flask…): it sinks, counts for nothing;
 *   'in'    — it dissolved and counts (the brew decides at its end what it was);
 *   'spoil' — it fell into a ready potion / a sludge: that is sludge now.
 */
export function addIngredient(st, kind, n = 1) {
    if (st.phase === 'empty' || st.water < 0.3) return 'dry';
    if (DURABLE.has(kind)) return 'sink';
    if (st.phase === 'ready' || st.phase === 'sludge') {
        st.phase = 'sludge'; st.rec = null; st.por = 0; st.color = SLUDGE;
        return 'spoil';
    }
    st.ings[kind] = (st.ings[kind] || 0) + Math.max(1, n | 0);
    if (st.phase === 'water') st.t = 0;
    return 'in';
}

export const SLUDGE = 0x6d6a55;

/** A random bright colour (each potion its own — the colour does not tell which potion it is). */
export function randomColor(rng = Math.random) {
    const h = rng(), s = 0.65 + rng() * 0.3, l = 0.42 + rng() * 0.16;
    // hsl → rgb
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = (t) => {
        t = (t + 1) % 1;
        const v = t < 1 / 6 ? p + (q - p) * 6 * t : t < 0.5 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p;
        return Math.round(v * 255);
    };
    return (f(h + 1 / 3) << 16) | (f(h) << 8) | f(h - 1 / 3);
}

/**
 * Time passes. Returns an event when something happens:
 *   'brew'   — it started brewing (the water full, things in it, settled);
 *   'ready'  — the potion is ready (st.rec, st.color, st.por);
 *   'sludge' — nothing came of it.
 */
export function stepBrew(st, dt, rng = Math.random) {
    if (st.phase === 'water') {
        if (!ingCount(st) || st.water < CAULDRON.FULL * 0.98) { st.t = 0; return null; }
        st.t += dt;
        if (st.t < CAULDRON.SETTLE) return null;
        st.phase = 'brewing';
        st.t = 0;
        st.dur = CAULDRON.BREW_MIN + rng() * (CAULDRON.BREW_MAX - CAULDRON.BREW_MIN);
        return 'brew';
    }
    if (st.phase === 'brewing') {
        st.t += dt;
        if (st.t < st.dur) return null;
        const r = matchRecipe(st.ings);
        st.ings = {};
        st.t = 0;
        if (r) {
            st.phase = 'ready'; st.rec = r.id; st.color = randomColor(rng); st.por = CAULDRON.PORTIONS;
            return 'ready';
        }
        st.phase = 'sludge'; st.rec = null; st.color = SLUDGE; st.por = 0;
        return 'sludge';
    }
    return null;
}

/** A flask dipped in: one portion out (the recipe id), or null. The last one leaves it empty and dry. */
export function takePortion(st) {
    if (st.phase !== 'ready' || st.por <= 0) return null;
    const rec = st.rec;
    st.por--;
    if (st.por <= 0) Object.assign(st, newBrew());
    else st.water = Math.max(0.5, st.water - CAULDRON.FULL / (CAULDRON.PORTIONS + 1));
    return rec;
}

/** Tipped over: everything pours out. Returns true if there was anything to pour. */
export function spill(st) {
    const had = st.water > 0.05 || ingCount(st) > 0;
    Object.assign(st, newBrew());
    return had;
}

/** A filled flask: the potion and its colour. */
export function potionItem(rec, color, uid) {
    return { kind: 'potion', uid, rec, color };
}

/** A forgotten cauldron in this cave? (deterministic from the cave's own random) → null or {tipped}. */
export function rollCaveCauldron(rng, always = false) {
    if (rng() >= CAULDRON.CAVE_CHANCE && !always) return null;
    return { tipped: rng() < CAULDRON.CAVE_TIPPED, yaw: rng() * Math.PI * 2, dir: rng() * Math.PI * 2, at: rng() };
}

/**
 * The cauldron's outer wall: its radius at height y above its feet (the legs below
 * BOTTOM − 0.2 are not its wall). A smooth belly: narrow bottom, wide middle, the rim.
 */
export function wallRadius(y) {
    const P = PROFILE;
    if (y <= P[0][1]) return P[0][0];
    for (let i = 1; i < P.length; i++) {
        if (y <= P[i][1]) { const [r0, y0] = P[i - 1], [r1, y1] = P[i]; return r0 + (r1 - r0) * (y - y0) / (y1 - y0); }
    }
    return P[P.length - 1][0];
}

/** [radius, height] of the outer wall from the bottom to the rim (the lathe's profile). */
export const PROFILE = [[0.05, 0.42], [0.75, 0.45], [1.2, 0.62], [1.5, 0.9], [1.68, 1.3], [1.7, 1.6], [1.62, 2.0], [1.5, 2.35], [1.45, 2.6]];

/** The flat inside radius at height y (the wall is ~0.1 m thick). */
export const innerRadius = (y) => Math.max(0.2, wallRadius(Math.max(CAULDRON.BOTTOM, y)) - 0.1);

/** The water surface's height above the feet. */
export const surfaceY = (st) => CAULDRON.BOTTOM + 0.05 + fullness(st) * (CAULDRON.TOP_IN - CAULDRON.BOTTOM - 0.05);
