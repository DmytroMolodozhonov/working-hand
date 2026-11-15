/**
 * ElementVortexWords.js — how «Fire Vortex» and «Air Vortex» are said (the author 15.11): both words together, the element first.
 * «вортекс» alone is the water's («Water Vortex»), «граунд вортекс» the earth's (GroundVortexWords.js); «fire» / «air» alone in talk never cast these.
 */
const FIRE = /^(?:fire|файр|фаер|файер|фаир|фаєр|fyre)$/;
const AIR = /^(?:air|эйр|эир|аир|ер|эр|ayr|ear|eir)$/;
const VORTEX = /^(?:вортекс|вортэкс|вортикс|вортекз|вортес|вортакс|vortex|vortec|vortx)$/;
const FIRE_RUN = /^(?:файрвортекс|фаервортекс|файервортекс|firevortex)$/;
const AIR_RUN = /^(?:эйрвортекс|эирвортекс|airvortex|аирвортекс)$/;
const words = (text) => String(text || '').toLowerCase().replace(/ё/g, 'е').split(/[^a-zа-я]+/).filter(Boolean);
const pair = (text, A, RUN) => {
    const w = words(text);
    if (w.some((x) => RUN.test(x))) return true;
    for (let i = 0; i + 1 < w.length; i++) if (A.test(w[i]) && VORTEX.test(w[i + 1])) return true;
    return false;
};
export const fireVortexWords = (t) => pair(t, FIRE, FIRE_RUN);
export const airVortexWords = (t) => pair(t, AIR, AIR_RUN);
