/**
 * Potions.js — what a cauldron does with what goes into it (pure, node-testable).
 *
 * The author's order: a campfire («Fire») → the big cauldron put on it (a holder appears:
 * Cauldrons.js) → water («Waterbollow» at a river, the ball brought and poured in; the water is
 * only the medium — it may be poured in any time before, and it stays) → over the burning fire
 * the water heats up and BOILS (BOIL_TIME s) → only then the ingredients count: thrown or dropped
 * in by hand (or let go over it with «Левиоса»), in any order. From the FIRST ingredient a
 * countdown runs (the recipe's window, 30 s): all of a recipe's ingredients must be in by then.
 * As soon as they are, it brews: it churns and bubbles, colours swirl — a random 30–60 s.
 *   - «Зелье готово!»: the liquid settles into a colour of its own (random every time: the
 *     colour never tells which potion it is); up to 10 flasks (a full cauldron) are scooped out
 *     of it by hand, each one lowering the level; after the last it is empty;
 *   - too late, the fire out, wrong things or something more fell in → grey sludge: the
 *     cauldron must be tipped over by hand (that pours it out) and filled again.
 * Things into a dry cauldron, or into water that does not boil, just sink and count for nothing.
 *
 * RECIPES is the one table to add potions to: {id, name, ingredients: {kind: count}, window,
 * effect, desc}. The ingredients are item kinds (ItemTypes.js), in any order.
 */

/** The cauldron's size (m, the hero is ~4.8 m tall) and its brewing rules. */
export const CAULDRON = {
    H: 2.7, // the rim's top above the ground (half a hero and more)
    R_BODY: 1.7, // the widest belly (wider than tall: 3.4 m across)
    R_RIM: 1.45, // the rim's middle
    R_IN: 1.32, // the opening: a thing this near the axis falls in
    BOTTOM: 0.62, // the inside's floor above its feet (it stands on three short legs)
    TOP_IN: 2.45, // a full cauldron's water surface
    FULL: 6, // m³ of water: one big ball («Waterbollow» + «Максима»); a small one fills a third
    BOIL_TIME: 15, // s over a burning fire before cold water boils
    COOL_TIME: 30, // s off the fire before boiling water is cold again
    WINDOW: 30, // s from the first ingredient to have them all in (a recipe may have its own)
    BREW_MIN: 30, // s
    BREW_MAX: 60,
    PORTIONS: 10, // flasks scooped out of one brew
    SPILL_TILT: 0.9, // rad: tipped this far, everything pours out
    PRICE: 150, // coins at the master of cauldrons and potions
    CAVE_CHANCE: 0.14, // share of caves where a forgotten cauldron lies
    CAVE_TIPPED: 0.5, // …and how often it lies overturned
};

/**
 * The potions. effect: hp — health back at once; mana — mana back at once; null — its effect is
 * not described yet (it can be brewed and scooped, but not drunk). window: s for all its ingredients.
 */
export const RECIPES = [
    {
        id: 'heal', name: 'Зелье исцеления', ingredients: { apple: 1, crystal: 1 }, window: 30,
        effect: { hp: 30 }, desc: 'Выпейте: +30 HP',
    },
    {
        // (the author: the giant spider's web, the Minotaur's horn, glass from a broken window — within 30 s)
        id: 'invis', name: 'Зелье невидимости', ingredients: { web: 1, minotaurHorn: 1, glass: 1 }, window: 30,
        effect: null, desc: 'Что оно делает — автор скоро расскажет (пока его не выпить)',
    },
    {
        // (the author: the owl's feather → the phoenix's feather → the golden apple; the body's dark marks go, the dark LEVEL stays — DarkMagic.js)
        // brew: it stews longer than the others (2–3 minutes); skin: how much of the body's darkness one flask takes away (DARK.CLEAR_STEP)
        id: 'clearmind', name: 'Зелье светлого ума', ingredients: { owlFeather: 1, phoenixFeather: 1, apple: 1 }, window: 30, brew: [120, 180],
        effect: { skin: 30 }, desc: 'Выпейте: чёрные пятна на теле светлеют (до 30 за колбу). Уровень чёрного мага не снижается',
    },
];

/** Things that never dissolve: they sink to the bottom and lie there (a hand can fish them out). */
export const DURABLE = new Set(['wand', 'bow', 'shield', 'backpack', 'hammer', 'iceRod', 'book', 'coins', 'arrows', 'cannonball', 'logs', 'blocks', 'flask', 'potion']);

/** Item kinds by name, for the hints (what went in). */
export const INGREDIENT_RU = {
    apple: 'золотое яблоко', crystal: 'кристалл маны', wool: 'шерсть', meat: 'сырое мясо', steak: 'стейк',
    bread: 'хлеб', cheese: 'сыр', pie: 'пирог', scroll: 'свиток', fish: 'рыба',
    web: 'связка паутины', minotaurHorn: 'рог Минотавра', glass: 'осколки стекла', owlFeather: 'перо совы', phoenixFeather: 'перо феникса',
};

export const recipeById = (id) => RECIPES.find((r) => r.id === id) || null;

/** The longest window any recipe gives (the countdown after the first ingredient). */
export const brewWindow = () => Math.max(CAULDRON.WINDOW, ...RECIPES.map((r) => r.window || 0));

/** A fresh cauldron's insides: dry, cold and inert. */
export function newBrew() {
    return { phase: 'empty', water: 0, heat: 0, ings: {}, win: 0, t: 0, dur: 0, rec: null, color: 0, por: 0 };
}

/** Which recipe these things are (exactly: the same kinds, the same counts, nothing more; any order) — or null. */
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

/** Is its water boiling (on a burning fire long enough)? */
export const boiling = (st) => st.water >= 0.3 && (st.heat || 0) >= 1;

/**
 * Water poured in (m³). Returns how much ran over the rim. Brewing, ready or spoilt: it
 * is full already — the water runs over and changes nothing. Cold water poured into hot
 * cools it a little.
 */
export function addWater(st, vol) {
    if (!(vol > 0)) return 0;
    const room = CAULDRON.FULL - st.water;
    const took = Math.max(0, Math.min(room, vol));
    if (st.phase === 'empty' || st.phase === 'water') {
        if (took > 1e-4) st.heat = (st.heat || 0) * st.water / (st.water + took);
        st.water += took;
        if (st.water > 1e-3) st.phase = 'water';
        return vol - took;
    }
    return vol;
}

/**
 * A thing fell into the cauldron. Returns:
 *   'dry'   — no water: it just lies on the bottom (it does not count);
 *   'sink'  — a thing that never dissolves (a wand, a flask…): it sinks, counts for nothing;
 *   'spoil' — it fell into a ready potion / a sludge / a brew: that is sludge now (at its end);
 *   'cold'  — the water does not boil: it sinks and counts for nothing;
 *   'in'    — it dissolved in the boiling water and counts (the first one starts the countdown).
 */
export function addIngredient(st, kind, n = 1) {
    if (st.phase === 'empty' || st.water < 0.3) return 'dry';
    if (DURABLE.has(kind)) return 'sink';
    if (st.phase === 'ready' || st.phase === 'sludge') {
        st.phase = 'sludge'; st.rec = null; st.por = 0; st.color = SLUDGE;
        return 'spoil';
    }
    if (st.phase === 'brewing') { st.ings[kind] = (st.ings[kind] || 0) + Math.max(1, n | 0); return 'spoil'; }
    if (!boiling(st)) return 'cold';
    if (!ingCount(st)) st.win = brewWindow();
    st.ings[kind] = (st.ings[kind] || 0) + Math.max(1, n | 0);
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

function toSludge(st) {
    st.phase = 'sludge'; st.rec = null; st.color = SLUDGE; st.por = 0; st.ings = {}; st.win = 0; st.t = 0;
}

/**
 * Time passes; `fire`: it stands on a burning campfire. Returns an event when something happens:
 *   'boil'   — the water started boiling (ingredients count now);
 *   'brew'   — all of a recipe's ingredients are in: it brews;
 *   'late'   — the countdown ran out before they were all in: sludge;
 *   'out'    — the fire went out (or it was taken off) during the countdown or the brew: sludge;
 *   'ready'  — the potion is ready (st.rec, st.color, st.por);
 *   'sludge' — the brew ended in nothing.
 */
export function stepBrew(st, dt, rng = Math.random, fire = false) {
    const wasBoiling = boiling(st);
    if (fire && st.water >= 0.3) st.heat = Math.min(1, (st.heat || 0) + dt / CAULDRON.BOIL_TIME);
    else st.heat = Math.max(0, (st.heat || 0) - dt / CAULDRON.COOL_TIME);
    const boils = boiling(st);
    if (st.phase === 'water') {
        if (ingCount(st)) {
            if (!boils) { toSludge(st); return 'out'; }
            const rc = matchRecipe(st.ings);
            if (rc) {
                st.phase = 'brewing'; st.t = 0; st.win = 0;
                const [b0, b1] = rc.brew || [CAULDRON.BREW_MIN, CAULDRON.BREW_MAX];
                st.dur = b0 + rng() * (b1 - b0);
                return 'brew';
            }
            st.win -= dt;
            if (st.win <= 0) { toSludge(st); return 'late'; }
            return null;
        }
        return boils && !wasBoiling ? 'boil' : null;
    }
    if (st.phase === 'brewing') {
        if (!boils) { toSludge(st); return 'out'; }
        st.t += dt;
        if (st.t < st.dur) return null;
        const r = matchRecipe(st.ings);
        st.ings = {};
        st.t = 0;
        if (r) {
            // (a full cauldron: ten flasks; less water, fewer)
            st.phase = 'ready'; st.rec = r.id; st.color = randomColor(rng); st.por = Math.max(1, Math.round(CAULDRON.PORTIONS * fullness(st)));
            return 'ready';
        }
        toSludge(st);
        return 'sludge';
    }
    return null;
}

/** A flask dipped in: one portion out (the recipe id), or null. Each lowers the level; the last leaves it empty. */
export function takePortion(st) {
    if (st.phase !== 'ready' || st.por <= 0) return null;
    const rec = st.rec;
    st.water -= st.water / st.por; // (the level goes down a step)
    st.por--;
    if (st.por <= 0) Object.assign(st, newBrew());
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
