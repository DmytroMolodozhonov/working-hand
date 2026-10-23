/**
 * VisibleGodiWords.js — how «Visible Godi» is said (the author, by voice): «визибл годи» — and as a Russian ear writes it:
 * «визибл гоуди», «визибл гади», «визибл боди»; in Latin «visible godi» / «visible body». Both words, one right after the
 * other (or run together): «визибл» alone, «годи» alone, «видимый» and everyday talk never cast it. «Инвизибл» (the other
 * spell, Invisibility) is a different word — whole words only, so «инвизибл боди» is not this spell.
 */
const VISIBLE = /^(?:визибл|визибал|визибел|визибль|визиболл|визыбл|визабл|визебл|визибьл|visible|visibl|visibel|vizible|vizibl)$/;
const GODI = /^(?:годи|гоуди|гади|годе|годди|гоудэ|гоуде|гэди|боди|бади|буди|godi|gody|goudi|goddy|gadi|body|bodi)$/;
const RUN_TOGETHER = /^(?:визибл|визибал|визибел|визибль|визыбл|visible|visibl)(?:годи|гоуди|гади|годе|годди|боди|бади|godi|gody|body)$/;

/** «Visible Godi» said as a whole → true. */
export function visibleGodiWords(text) {
    const s = String(text || '').toLowerCase().replace(/ё/g, 'е');
    const w = s.split(/[^a-zа-я]+/).filter(Boolean);
    if (w.some((x) => RUN_TOGETHER.test(x))) return true;
    for (let i = 0; i + 1 < w.length; i++) if (VISIBLE.test(w[i]) && GODI.test(w[i + 1])) return true;
    return false;
}
