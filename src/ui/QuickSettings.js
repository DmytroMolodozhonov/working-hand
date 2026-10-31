/**
 * QuickSettings.js — the numbers of the settings that sit in «Общие настройки» (Escape → «Общие настройки», or the main menu → «Общие настройки»):
 * the camera smoothness, the sensitivity, the minimap's size, the slots' size and the hand version.
 *
 * Only the rules are here (the table, the limits, the reset, the store rules) — no page: the controls live ONCE, in index.html
 * (#tab-settings), and are remembered in 'zns-settings' by main.js. The limits here and in the page are the same numbers:
 * tests/unit/settings-sync.test.js.
 */

/** The sliders: id of the settings' control, limits, the usual value, words for the player. */
export const QUICK = [
    { id: 'cam-smooth', label: 'Плавность камеры', min: 0, max: 95, step: 5, def: 70, unit: '%', hint: 'Чем больше, тем мягче и медленнее камера и руки героя следуют за вашими движениями. Меньше — быстрее, но заметнее дрожь.' },
    { id: 'cam-sens', label: 'Чувствительность', min: 10, max: 100, step: 5, def: 100, unit: '%', hint: 'Чем больше, тем сильнее поворачивается камера от ваших движений.' },
    { id: 'minimap-size', label: 'Размер мини-карты', min: 60, max: 200, step: 10, def: 120, unit: '%', hint: 'Мини-карта в углу экрана.', preview: 'map' },
    { id: 'hotbar-size', label: 'Размер панели предметов', min: 70, max: 160, step: 10, def: 100, unit: '%', hint: 'Ячейки с вещами внизу экрана.', preview: 'bar' },
];
/** The hand versions, in plain words (the value is what the settings' radio buttons carry). */
export const HAND_VERSIONS = [
    { v: 'v2', name: 'V2 — точная' },
    { v: 'v3', name: 'V3 — стабильная' },
    { v: 'v4', name: 'V4 — новая, каждый сустав' },
    { v: 'v5', name: 'V5 — новая, крупный план (видеокарта)' },
];
export const HAND_DEFAULT = 'v3';

export const quickDef = (id) => QUICK.find((q) => q.id === id) || null;

/** A value kept inside the limits and on the step; junk → the usual value. */
export function quickClamp(id, v) {
    const q = quickDef(id);
    if (!q) return v;
    let n = typeof v === 'number' ? v : parseFloat(v);
    if (!Number.isFinite(n)) return q.def;
    n = Math.max(q.min, Math.min(q.max, n));
    n = Math.round((n - q.min) / q.step) * q.step + q.min;
    return Math.max(q.min, Math.min(q.max, n));
}
export const quickIsDefault = (id, v) => quickClamp(id, v) === quickDef(id)?.def;
export const quickText = (id, v) => `${quickClamp(id, v)}${quickDef(id)?.unit || ''}`;
/** The hand version to show: a known one, or the usual. */
export const handClamp = (v) => (HAND_VERSIONS.some((h) => h.v === v) ? v : HAND_DEFAULT);

/**
 * The rules over a store { get(id), set(id, value) } — the store is the settings' controls.
 * set() applies at once (the control's own event) and is kept by the saving of the settings.
 */
export function quickSet(store, id, v) {
    const n = quickClamp(id, v);
    store.set(id, n);
    return n;
}
export const quickReset = (store, id) => quickSet(store, id, quickDef(id).def);
export const quickGet = (store, id) => quickClamp(id, store.get(id));
/** Values from the saved settings (JSON of 'zns-settings') → clamped, so an old or broken record never goes out of the screen. */
export function quickFromSaved(saved) {
    const out = {};
    for (const q of QUICK) out[q.id] = quickClamp(q.id, saved?.[q.id] ?? q.def);
    out.handVersion = handClamp(saved?.handVersion);
    return out;
}
/** Preview size (0–1 of the box) for a slider's value: the little mock-up next to it. */
export const previewScale = (id, v) => {
    const q = quickDef(id);
    return q ? Math.max(0.2, Math.min(1, quickClamp(id, v) / q.max)) : 1;
};
