/**
 * ShipTypes.js — the three kinds of 17th-century ships (pure data, Node-testable).
 *
 * Ship-local axes: x = starboard, y = up from the waterline, z = aft (the bow is −z,
 * the way the hero faces −Z). Everything is built to the hero's scale (~2.2× real), then grown ×SHIP_SCALE (grow below).
 *
 * Physics numbers (per unit mass): sailK — thrust per (apparent wind)² per open sail,
 * c1/c2 — linear/quadratic water drag, turnR — the turning circle's radius (m) with the wheel hard over,
 * yawD1 — how quickly the yaw follows the rudder at rest (faster under way),
 * waveLag — how slowly the hull follows the waves (heavier = slower).
 */

/** How much bigger the ships are than their first drawing (the author 19.11: «все корабли раза в два больше — морякам проще ходить»). */
export const SHIP_SCALE = 2;
const r1 = (n) => Math.round(n * 10) / 10;
/**
 * The first drawing of a class (the numbers below) grown by SHIP_SCALE: every length, height and depth ×k, the guns ×k (more room — more of them),
 * the crew ×1.5, health ×k. Doors, stairs, rails, furniture, the wheel and the people stay the size they were: the ship is roomier, the sailors walk easier.
 * The thrust is per unit mass (ShipPhysics.sailForce: sailK × the open share of the sails × the wind²) — the speed stays the same; the turning circle ×k.
 */
function grow(c, k = SHIP_SCALE) {
    const o = { ...c };
    for (const f of ['L', 'B', 'draft', 'deck', 'turnR']) o[f] = r1(c[f] * k);
    if (c.lower != null) o.lower = r1(c.lower * k);
    // (a deck above the main deck is raised only ×KH of its old height over what it stands on: a cabin twelve metres high and stairs fifteen long would be a cathedral)
    const KH = 1.4, D2 = c.deck * k, Q2 = D2 + (c.quarter.y - c.deck) * KH;
    const box = (b, base, base2) => (b ? { y: r1(base2 + (b.y - base) * KH), z0: r1(b.z0 * k), z1: r1(b.z1 * k) } : b);
    o.quarter = box(c.quarter, c.deck, D2); o.poop = box(c.poop, c.quarter.y, Q2); o.fore = box(c.fore, c.deck, D2);
    o.masts = c.masts.map((m) => ({ ...m, z: r1(m.z * k), h: r1(m.h * k) }));
    o.cannons = Math.round(c.cannons * k);
    o.hp = Math.round(c.hp * k);
    o.pierLayer = Math.round(c.pierLayer + (c.deck * k - c.deck) * 0.9); // (the pier top stays about a metre under the main deck)
    o.crew = {};
    for (const [role, n] of Object.entries(c.crew)) o.crew[role] = n <= 1 || c.crew.blackbeard ? n : Math.round(n * 1.5); // (the black ship's skeletons stay twelve: the author's number)
    return o;
}

const FIRST = {
    pinnace: {
        id: 'pinnace', ru: 'Пинас', L: 44, B: 12, draft: 3.2, deck: 4.6, lower: null,
        quarter: { y: 10.2, z0: 8, z1: 22 }, poop: null, fore: null,
        masts: [{ id: 'fore', z: -9, h: 34 }, { id: 'main', z: 3, h: 40 }],
        crew: { captain: 1, boatswain: 0, sailor: 3 },
        hp: 160, floodVol: 0.35,
        sailK: 0.0045, c1: 0.015, c2: 0.00138, turnR: 50, yawD1: 0.30, lateenFrac: 0, waveLag: 0.8,
        cannons: 2, // per side (main deck)
        pierLayer: 3,
    },
    fluyt: {
        id: 'fluyt', ru: 'Флейт', L: 60, B: 15, draft: 4.0, deck: 5.4, lower: 0.6,
        quarter: { y: 11.2, z0: 12, z1: 30 }, poop: null, fore: { y: 10.6, z0: -30, z1: -21 },
        masts: [{ id: 'fore', z: -16, h: 44 }, { id: 'main', z: 1, h: 52 }, { id: 'mizzen', z: 19, h: 30 }],
        crew: { captain: 1, boatswain: 1, sailor: 4 },
        hp: 260, floodVol: 0.6,
        sailK: 0.003, c1: 0.015, c2: 0.00116, turnR: 70, yawD1: 0.24, lateenFrac: 0.15, waveLag: 1.1,
        cannons: 3,
        pierLayer: 4,
    },
    galleon: {
        id: 'galleon', ru: 'Галеон', L: 80, B: 20, draft: 5.0, deck: 6.0, lower: 0.6,
        quarter: { y: 12.0, z0: 14, z1: 40 }, poop: { y: 17.6, z0: 29, z1: 40 }, fore: { y: 11.6, z0: -40, z1: -27 },
        masts: [{ id: 'fore', z: -22, h: 56 }, { id: 'main', z: -1, h: 66 }, { id: 'mizzen', z: 23, h: 36 }],
        crew: { captain: 1, boatswain: 1, sailor: 8 },
        hp: 420, floodVol: 1.0,
        sailK: 0.002, c1: 0.02, c2: 0.00022, turnR: 90, yawD1: 0.20, lateenFrac: 0.15, waveLag: 1.5,
        cannons: 4,
        pierLayer: 5,
    },
    // Captain Black Moustache's black ship (Blackbeard.js): one in the world, out on the open sea, never in a
    // port. Bigger than a galleon, a towering stern, a long forecastle; its crew — the captain and his
    // skeletons. `magic`: while it is not taken, no spell harms it (Ships.cursed).
    blackship: {
        id: 'blackship', ru: 'Чёрный корабль', L: 92, B: 22, draft: 5.6, deck: 6.6, lower: 0.6,
        quarter: { y: 13.2, z0: 14, z1: 46 }, poop: { y: 19.8, z0: 30, z1: 46 }, fore: { y: 12.6, z0: -46, z1: -31 },
        masts: [{ id: 'fore', z: -24, h: 62 }, { id: 'main', z: -2, h: 74 }, { id: 'mizzen', z: 24, h: 44 }],
        crew: { blackbeard: 1, skeleton: 12 },
        hp: 600, floodVol: 1.2,
        // 40 % faster than any other ship under the same wind — always, whoever sails it (the author): its sails draw
        // harder, its hull slips through the water, its cursed keel cuts its own bow wave (hullK, ShipPhysics) —
        // tests/unit/blackbeard.test.js checks the 1.4
        sailK: 0.008, c1: 0.012, c2: 0.00016, hullK: 1.3, turnR: 85, yawD1: 0.22, lateenFrac: 0.15, waveLag: 1.6,
        shipName: 'Чёрный Призрак',
        cannons: 5,
        pierLayer: 5,
        magic: true, look: 'black', // (ShipModel SHIP_LOOKS.black)
    },
};
export const SHIP_CLASSES = Object.fromEntries(Object.entries(FIRST).map(([id, c]) => [id, grow(c)]));

export const RAIL = 2.4; // the bulwark above every deck
export const HELM_LOCK = 0.75 * Math.PI; // the wheel turns ±⅜ of a turn: hard over in one sweep of the hand round the rim
// (at ±⅝ a natural quarter turn of the hand gave hardly any rudder — the ship barely answered)

export const SHIP_NAMES = [
    'Золотая Лань', 'Морская Звезда', 'Буревестник', 'Святая Анна', 'Северный Ветер', 'Чёрный Лебедь',
    'Королева Моря', 'Летучая Рыба', 'Отважный', 'Серебряная Чайка', 'Дельфин', 'Полярная Звезда',
    'Смелая Мария', 'Морской Волк', 'Утренняя Заря', 'Белый Кит', 'Благая Весть', 'Синяя Птица',
];

/** Ships of a sea castle's port by its style (the «sea» session asks for these). */
export const PORT_SHIPS = {
    grand: ['galleon', 'fluyt', 'pinnace'],
    fortress: ['galleon', 'pinnace'],
    compact: ['fluyt'],
};

function strHash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

/** A ship's name (always the same for the same id). */
export function shipName(id) {
    return SHIP_NAMES[strHash(String(id)) % SHIP_NAMES.length];
}

export { strHash };
