/**
 * ShipTypes.js — the three kinds of 17th-century ships (pure data, Node-testable).
 *
 * Ship-local axes: x = starboard, y = up from the waterline, z = aft (the bow is −z,
 * the way the hero faces −Z). Everything is built to the hero's scale (~2.2× real).
 *
 * Physics numbers (per unit mass): sailK — thrust per (apparent wind)² per open sail,
 * c1/c2 — linear/quadratic water drag, kRud — rudder turning, yawD1 — yaw damping,
 * waveLag — how slowly the hull follows the waves (heavier = slower).
 */

export const SHIP_CLASSES = {
    pinnace: {
        id: 'pinnace', ru: 'Пинас', L: 44, B: 12, draft: 3.2, deck: 4.6, lower: null,
        quarter: { y: 10.2, z0: 8, z1: 22 }, poop: null, fore: null,
        masts: [{ id: 'fore', z: -9, h: 34 }, { id: 'main', z: 3, h: 40 }],
        crew: { captain: 1, boatswain: 0, sailor: 3 },
        hp: 160, floodVol: 0.35,
        sailK: 0.0045, c1: 0.015, c2: 0.00138, kRud: 0.0026, yawD1: 0.30, lateenFrac: 0, waveLag: 0.8,
        cannons: 2, // per side (main deck)
        pierLayer: 3,
    },
    fluyt: {
        id: 'fluyt', ru: 'Флейт', L: 60, B: 15, draft: 4.0, deck: 5.4, lower: 0.6,
        quarter: { y: 11.2, z0: 12, z1: 30 }, poop: null, fore: { y: 10.6, z0: -30, z1: -21 },
        masts: [{ id: 'fore', z: -16, h: 44 }, { id: 'main', z: 1, h: 52 }, { id: 'mizzen', z: 19, h: 30 }],
        crew: { captain: 1, boatswain: 1, sailor: 4 },
        hp: 260, floodVol: 0.6,
        sailK: 0.003, c1: 0.015, c2: 0.00116, kRud: 0.0016, yawD1: 0.24, lateenFrac: 0.15, waveLag: 1.1,
        cannons: 3,
        pierLayer: 4,
    },
    galleon: {
        id: 'galleon', ru: 'Галеон', L: 80, B: 20, draft: 5.0, deck: 6.0, lower: 0.6,
        quarter: { y: 12.0, z0: 14, z1: 40 }, poop: { y: 17.6, z0: 29, z1: 40 }, fore: { y: 11.6, z0: -40, z1: -27 },
        masts: [{ id: 'fore', z: -22, h: 56 }, { id: 'main', z: -1, h: 66 }, { id: 'mizzen', z: 23, h: 36 }],
        crew: { captain: 1, boatswain: 1, sailor: 8 },
        hp: 420, floodVol: 1.0,
        sailK: 0.002, c1: 0.02, c2: 0.00022, kRud: 0.0011, yawD1: 0.20, lateenFrac: 0.15, waveLag: 1.5,
        cannons: 4,
        pierLayer: 5,
    },
};

export const RAIL = 2.4; // the bulwark above every deck
export const HELM_LOCK = 2.5 * Math.PI; // the wheel turns ±1.25 turns

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
