// StallZones.js — a counter has two parts: where the GOODS lie and an EMPTY place for the coins (the author 19.11: «прилавки маленькие, всё забито товарами,
// легко обронить деньги — сделать пустое место, куда деньги можно класть; и не только в городе, а везде»). Pure (node-testable).
//
// The wizards' lane of generation ≥ 34 builds its counters wide with a rune plate of real blocks (WizardVillages: `goodsRect` / `payRect` are given).
// Every other counter (the castles' markets, the hamlets', the tower's, the pawnshops, the settlements' shops, the Creative market) is split here from its
// own rectangle: the long side's last `payN` blocks are the plate (a rune tray drawn on it: CounterTrays.js), the rest is for the goods.
//   length 2 or less: no split (the counter is too small — the goods lie as before);  3: 1 plate block;  4 and more: 2.
// Rectangles are the counter's own ({x0, x1, z0, z1, top}, block centres: the counter covers x0 − 0.5 … x1 + 0.5).
export const PAY_BLOCKS = (n) => (n >= 4 ? 2 : n >= 3 ? 1 : 0);

/** → { goods: rect, pay: rect | null, explicit: bool } of a stall. */
export function zonesOf(stall) {
    const c = stall?.counter;
    if (!c) return { goods: null, pay: null, explicit: false };
    if (stall.goodsRect && stall.payRect) return { goods: stall.goodsRect, pay: stall.payRect, explicit: true };
    const along = c.x1 - c.x0 >= c.z1 - c.z0;
    const n = (along ? c.x1 - c.x0 : c.z1 - c.z0) + 1, k = PAY_BLOCKS(n);
    if (!k) return { goods: c, pay: null, explicit: false };
    const goods = along ? { ...c, x1: c.x1 - k } : { ...c, z1: c.z1 - k };
    const pay = along ? { ...c, x0: c.x1 - k + 1 } : { ...c, z0: c.z1 - k + 1 };
    return { goods, pay, explicit: false };
}

/** The middle of the coin plate (a point on the counter top), or null. */
export function payPoint(stall) {
    const { pay } = zonesOf(stall);
    return pay ? { x: (pay.x0 + pay.x1) / 2, y: pay.top, z: (pay.z0 + pay.z1) / 2 } : null;
}
