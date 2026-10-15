/**
 * ShipTypes.js — the three kinds of 17th-century ships (pure data, Node-testable).
 *
 * Ship-local axes: x = starboard, y = up from the waterline, z = aft (the bow is −z,
 * the way the hero faces −Z). Everything is built to the hero's scale (~2.2× real).
 *
 * Physics numbers (per unit mass): sailK — thrust per (apparent wind)² per open sail,
 * c1/c2 — linear/quadratic water drag, turnR — the turning circle's radius (m) with the wheel hard over,
 * yawD1 — how quickly the yaw follows the rudder at rest (faster under way),
 * waveLag — how slowly the hull follows the waves (heavier = slower).
 */

export const SHIP_CLASSES = {
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
        sailK: 0.0024, c1: 0.02, c2: 0.0002, turnR: 85, yawD1: 0.22, lateenFrac: 0.15, waveLag: 1.6,
        cannons: 5,
        pierLayer: 5,
        magic: true, look: 'black', // (ShipModel SHIP_LOOKS.black)
    },
};

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
