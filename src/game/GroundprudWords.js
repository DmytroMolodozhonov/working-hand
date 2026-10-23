/**
 * GroundprudWords.js — how «Groundprud» is said: the one word (the author: «граунтпруд»), or its two halves one
 * right after the other («граунд пруд»), the way a Russian ear writes them. «Ground» alone is nothing, and
 * the everyday «пруд» (a pond) alone or in talk never casts: it must follow «граунд / граунт».
 */
const GROUND = /^(?:граунд|граундд|граунт|грауд|грааунд|гроунд|ground|grount)$/;
const PRUD = /^(?:пруд|прут|прюд|прууд|prud|proud)$/;

/** «Groundprud» said as a whole → true. */
export function groundprudWords(text) {
    const s = String(text || '').toLowerCase().replace(/ё/g, 'е');
    const w = s.split(/[^a-zа-я]+/).filter(Boolean);
    if (w.some((x) => /^(?:граун[дт]{1,2}(?:пруд|прут|прюд)|ground(?:prud|proud))$/.test(x))) return true;
    for (let i = 0; i + 1 < w.length; i++) if (GROUND.test(w[i]) && PRUD.test(w[i + 1])) return true;
    return false;
}
