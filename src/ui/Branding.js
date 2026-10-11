/**
 * Branding.js — the game's name and the names of the modes, in one place.
 *
 * The player sees «Волшебство только начинается» and the modes
 *   Творческий ('creative') · Хардкор ('survival') · Выживание ('freeworld')
 * plus «Карты» (maps) as a separate entry. The internal values ('creative',
 * 'survival', 'freeworld', the 'zns-*' storage keys, window.__zns) never
 * change: saves, settings and multiplayer stay compatible with older versions.
 */

export const GAME_NAME = 'Волшебство только начинается';

/** The order of the first choice in the menu. */
export const MODE_ORDER = ['creative', 'survival', 'freeworld'];

export const MODES = {
    creative: { label: 'Творческий', icon: '🏗️', hint: 'Всё открыто: стройте, пробуйте заклинания, зомби — по желанию' },
    survival: { label: 'Хардкор', icon: '💀', hint: 'Вечная ночь и толпы зомби — продержитесь как можно дольше' },
    freeworld: { label: 'Выживание', icon: '🌍', hint: 'Бесконечный мир: здоровье, мана, сундуки, свитки и дуэли с друзьями' },
};

/** «Карты»: hand-made maps from the map editor (internally a 'survival' game with a map). */
export const MAPS_ENTRY = { label: 'Карты', icon: '🗺️', hint: 'Пройдите карту до финиша' };

/** The player-facing name of an internal mode ('creative' | 'survival' | 'freeworld'); '' if unknown. */
export function modeLabel(mode) {
    return MODES[mode]?.label || '';
}

/** The same with its icon («🌍 Выживание»). */
export function modeTitle(mode) {
    const m = MODES[mode];
    return m ? `${m.icon} ${m.label}` : '';
}
