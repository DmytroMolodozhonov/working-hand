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
export const MODE_ORDER = ['creative', 'freeworld', 'school']; // («Школа Акселдорф» — a world of its own kind, the author 07.11)

export const MODES = {
    creative: { label: 'Творческий', icon: '🏗️', hint: 'Всё открыто: стройте, пробуйте заклинания, зомби — по желанию' },
    freeworld: { label: 'Выживание', icon: '🌍', hint: 'Бесконечный мир: здоровье, мана, сундуки, свитки и дуэли с друзьями' },
    // («Школа Акселдорф»: a new world like the others, saved and continued from the list — internally a 'freeworld' game with `school`)
    school: { label: 'Школа Акселдорф', icon: '🏰', wip: true, hint: 'Год в школе волшебства: уроки защиты, зельеварения, пентаграмм и истории мира вместе с другими учениками. ⚠️ Режим ещё в разработке — многое будет дополняться' },
};

/** «Карты»: hand-made maps from the map editor (internally a 'survival' game with a map — that internal value stays for maps only). */
export const MAPS_ENTRY = { label: 'Карты', icon: '🗺️', hint: 'Пройдите карту до финиша' };

/** «Обучение» (Tutorial.js): a small bounded map where the hero learns the game step by step (internally a 'freeworld' game with `tutorial`). */
export const SCHOOL_ENTRY = { label: 'Школа Акселдорф', icon: '🏰', hint: 'Год в школе волшебства: уроки защиты, зельеварения, пентаграмм и истории мира вместе с другими учениками. Выпускник уходит в мир Выживания со всем, чему научился' };
export const TUTORIAL_ENTRY = { label: 'Обучение', icon: '🎓', hint: 'Пошаговое обучение: камера и микрофон, взгляд, руки и палочка, заклинания, вещи, ходьба и первый бой. Начните с него, если играете впервые' };

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
