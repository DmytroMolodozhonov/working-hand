/**
 * NihilisWords.js — how «Nihilis Atra» is said: «нихилис атра» / «нигилис атра» — and as a Russian ear writes it. BOTH words, one right after the
 * other: «нигилист» (an everyday word), «нихилис» alone and «атра» alone never cast it. Not close to any other spell's sound (checked by tests/unit/nihilis.test.js).
 */
const FIRST = /^(?:нихилис|нигилис|нихилес|нигилес|нихилус|нигилус|нихилис[тс]|найхилис|найгилис|нихилиз|нигилиз|nihilis|nihilus|nihilles|nihilys|nigilis|nihilis[ts])$/;
const SECOND = /^(?:атра|атрэ|этра|атро|аттра|атрах|atra|attra|atrah|atre)$/;
const RUN_TOGETHER = /^(?:нихилис|нигилис|нихилес|нихилус|nihilis|nihilus)(?:атра|атрэ|этра|atra|attra)$/;

/** «Nihilis Atra» said as a whole → true. */
export function nihilisWords(text) {
    const s = String(text || '').toLowerCase().replace(/ё/g, 'е');
    const w = s.split(/[^a-zа-я]+/).filter(Boolean);
    if (w.some((x) => RUN_TOGETHER.test(x))) return true;
    for (let i = 0; i + 1 < w.length; i++) if (FIRST.test(w[i]) && SECOND.test(w[i + 1])) return true;
    return false;
}

/** Phrases for the listener (SpellSpotter): the Russian writing, with its variants. */
export const NIHILIS_SAID = ['нихилис атра', 'нигилис атра', 'нихилес атра', 'нихилус атра', 'нигилус атра', 'нихилис этра', 'нихилис атрэ'];
