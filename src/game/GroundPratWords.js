/**
 * GroundPratWords.js — how «Ground Prat» is said: both words, one right after the other («граунд прат»), the way a
 * Russian ear writes them. «Ground» or «Prat» alone is nothing (no spell, no everyday word turns into one), and
 * «Protection …» is never «Ground Prat» (the first word must be «ground»).
 */
const GROUND = /^(?:граунд|граундд|граунт|грауд|грааунд|грануд|граун|ground|grount|groud|гроунд|гроун|гравнд)$/;
const PRAT = /^(?:прат|праат|пратт|прэт|прет|брат|прат[еи]|протект|протекшн|протекшен|протэкт|протекшин|protect|protection|prat|pratt|pret|brat)$/;

/** «Ground Prat» said as a whole → true. */
export function groundPratWords(text) {
    const s = String(text || '').toLowerCase().replace(/ё/g, 'е');
    const w = s.split(/[^a-zа-я]+/).filter(Boolean);
    // glued («граундпрат»)
    if (w.some((x) => /^(?:граун[дт]{1,2}(?:прат|прэт|брат|протект|протекшн)|groundprat)$/.test(x))) return true;
    for (let i = 0; i + 1 < w.length; i++) if (GROUND.test(w[i]) && PRAT.test(w[i + 1])) return true;
    return false;
}
