// The wizards' market lane: the new wide counters (generation 34) — the display part, the rune plate for the coins, the pawnshop.
//   node tools/shot.mjs wiz-counter → docs/media/shots/wiz-counter/*.png
export default async function (h) {
    const g = h.g, V = g.terrain?.data?.villages?.spawnVillage?.();
    if (!V) { h.log('no wizards settlement near the spawn'); return; }
    const stalls = V.stalls.filter((s) => s.counter);
    h.log({ stalls: stalls.map((s) => s.trade + (s.goodsRect ? ' wide' : ' old')) });
    const first = stalls.find((s) => s.trade === 'potions' || s.trade === 'wands') || stalls[0];
    const pawn = stalls.find((s) => s.pawn) || stalls[stalls.length - 1];
    h.bare(); h.time(0.3);
    for (const [name, s] of [['1-shop', first], ['2-pawn', pawn]]) {
        const c = s.counter, cx = (c.x0 + c.x1) / 2, cz = (c.z0 + c.z1) / 2, y = c.top;
        await h.go(s.front.x, s.front.y + 2.2, s.front.z);
        await h.frames(60);
        const dx = s.front.x - cx, dz = s.front.z - cz, L = Math.hypot(dx, dz) || 1;
        h.cam([cx + dx / L * 9 + (dz / L) * 3, y + 5, cz + dz / L * 9 - (dx / L) * 3], [cx, y + 1, cz]);
        await h.shot(name, { settle: 40 });
        h.cam([cx + dx / L * 5, y + 9, cz + dz / L * 5], [cx, y, cz]);
        await h.shot(name + '-top', { settle: 10 });
    }
}
