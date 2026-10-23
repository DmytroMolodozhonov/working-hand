/**
 * GroundVortexWords.js — how «Ground Vortex» and its «Shield» are said.
 *   «Ground Vortex» («граунд вортекс», «граунт вортекс»): both words together, "ground" before "vortex" — «вортекс» alone is the
 *   water's («Water Vortex»), «граунд» alone / «ground» in talk never casts. «Groundprud» is a different word (one token).
 *   «Shield» (the word of the English, «шилд», «шиелд», «шильд»): only the word itself — a Russian «щит» stays «Protection».
 *   It does something only while the vortex circles (GroundVortex.sayShield); in talk it is just a word the game ignores otherwise.
 */
const GROUND = /^(?:граунд|граунт|граун|ground|grount|grand|граунды)$/;
const VORTEX = /^(?:вортекс|вортэкс|вортикс|вортекз|вортес|вортакс|vortex|vortec|vortx)$/;
const RUN = /^(?:граундвортекс|граунтвортекс|groundvortex|гроундвортекс)$/;
const SHIELD = /^(?:shield|shields|shild|шилд|шилт|шиелд|шильд|шилда|шиэлд)$/;

const words = (text) => String(text || '').toLowerCase().replace(/ё/g, 'е').split(/[^a-zа-я]+/).filter(Boolean);

/** «Ground Vortex» said as a whole → true. */
export function groundVortexWords(text) {
    const w = words(text);
    if (w.some((x) => RUN.test(x))) return true;
    for (let i = 0; i + 1 < w.length; i++) if (GROUND.test(w[i]) && VORTEX.test(w[i + 1])) return true;
    return false;
}

/** «Shield» said (the word alone, or the last word of a short phrase: «ну шилд»). */
export function shieldWords(text) {
    const w = words(text);
    return w.length > 0 && w.length <= 2 && w.some((x) => SHIELD.test(x));
}
