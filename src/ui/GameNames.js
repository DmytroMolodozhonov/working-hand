/**
 * GameNames.js — the game's name and the names of the modes, in one place.
 *
 * The player sees «Волшебство только начинается» and the modes
 *   Творческий ('creative') · Выживание ('freeworld')
 * plus «Карты» (maps) as a separate entry. The old «Хардкор» is gone: an old
 * 'survival' world or invitation without a map opens as 'freeworld' (`legacyMode`). The internal values ('creative',
 * 'survival', 'freeworld', the 'zns-*' storage keys, window.__zns) never
 * change: saves, settings and multiplayer stay compatible with older versions.
 */

export const GAME_NAME = 'Волшебство только начинается';

/** The order of the first choice in the menu. */
export const MODE_ORDER = ['creative', 'freeworld'];

export const MODES = {
    creative: { label: 'Творческий', icon: '🏗️', hint: 'Всё открыто: стройте, пробуйте заклинания, зомби — по желанию' },
    freeworld: { label: 'Выживание', icon: '🌍', hint: 'Бесконечный мир: здоровье, мана, сундуки, свитки и дуэли с друзьями' },
};

/** «Карты»: hand-made maps from the map editor (internally a 'survival' game with a map — that internal value stays for maps only). */
export const MAPS_ENTRY = { label: 'Карты', icon: '🗺️', hint: 'Пройдите карту до финиша' };

/** A world/server mode from an older version: the removed «Хардкор» ('survival', no map) is now 'freeworld'. */
export function legacyMode(mode, map) {
    return mode === 'survival' && !map ? 'freeworld' : mode;
}

/** The player-facing name of an internal mode ('creative' | 'survival' | 'freeworld'); '' if unknown. */
export function modeLabel(mode) {
    return MODES[legacyMode(mode)]?.label || '';
}

/** The same with its icon («🌍 Выживание»). */
export function modeTitle(mode) {
    const m = MODES[legacyMode(mode)];
    return m ? `${m.icon} ${m.label}` : '';
}
