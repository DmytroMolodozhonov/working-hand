// DealGuard.js — while I buy or sell, no spell goes off by accident (the author 19.11: «когда я покупал, случайно сказал Вингардиум Левиоса —
// заклинание продублировало товар, и я купил два по двойной цене… человек, который покупает или продаёт, скорее всего ничего не хочет
// навредить. Максимум Люмос или Люмос Максима»).
//
// A deal is on when a merchant stands near (CoinDeal: awake, alive, not an enemy, his market open) AND I stand at his counter (≤ NEAR_COUNTER m).
// Then only light is allowed (Lumos, Lumos Maxima, Nox) and «стоп»; any other spell is not cast, a short line says «finish the deal first»
// (once in a while — not at every word: HINT_S). A fight (I was hurt, a foe near, a duel) ends the guard at once: a hero attacked at a market
// must still be able to defend himself. Creative: the same (the Creative market has sellers too) — but a free test hero is not blocked while he
// holds no goods: the guard works only while a merchant's open market is near, nothing else.
//
// Not here: what the spells do to goods (Levitation / the swarm never lift an unpaid good — Levitation._candidates, ItemSwarmRules.itemRefusal).

export const DEAL_GUARD = {
    NEAR_COUNTER: 6.5, // m from the merchant: at his counter, not just passing by
    HINT_S: 5, // s between two hints
};

export const DEAL_ALLOWED = new Set(['Lumos', 'LumosMaxima', 'LumosFlashlight', 'LumosAhead', 'LumosFollowing', 'Nox', 'Stand', 'Stop', 'Pause']);

export const DEAL_HINT = '🤝 Сначала завершите сделку — не колдуйте у прилавка (разрешены только «Lumos» и «Lumos Maxima»)';

/** Is this spell refused now? (pure: the state decides). state: {deal, near2, fight}. */
export function dealRefuses(name, { deal, near2, fight } = {}) {
    if (!name || DEAL_ALLOWED.has(name)) return false;
    if (!deal || fight) return false;
    return near2 <= DEAL_GUARD.NEAR_COUNTER * DEAL_GUARD.NEAR_COUNTER;
}
