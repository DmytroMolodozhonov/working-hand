// «Обучение», покупка: the whole deal walked by the game's own calls — pouch out of the pocket, onto the counter, the labels,
// a good named, paid, the change, the tutorial's checks at every step. node tools/shot.mjs tutorial-buy --mode tutorial
export default async function (h) {
    const g = h.g, T = g.tutorial, L = g.castleLife, talk = L.talk;
    const log = (...a) => h.log(...a);
    await h.frames(30);
    T._start(8); await h.frames(10);
    const st0 = () => T._mdef?.stalls?.[0];
    await h.until(() => !!st0(), 10000);
    const st = st0();
    const F = st.front;
    g.character.group.position.set(F.x, 12.6, F.z); g.faceYaw?.(0);
    const mer = () => [...L.byId.values()].find((v) => v.cs?.def?.id === 'tutorial-market');
    await h.until(() => !!mer() && talk._goodsOf(mer()).length > 0, 40000);
    const v = mer();
    log('merchant', !!v, 'goods', talk._goodsOf(v).map((x) => x.item.kind + ':' + x.item.shop?.price).join(','), 'coins', g.inventory.coins(), 'step', T.step, T._said.slice(0, 40));
    await h.until(() => T.step >= 1, 30000);
    { const me = g.character.group.position; log('why deal', JSON.stringify({ role: v.role, trader: talk._trader(v), foe: v.foe, sleep: v.sleep, flee: v.fleeT, d: Math.hypot(v.x - me.x, v.z - me.z).toFixed(1), vx: v.x.toFixed(1), vz: v.z.toFixed(1), me: [me.x.toFixed(1), me.z.toFixed(1)], closed: L.night?.closed?.(), isNight: g.isNight, mode: g.config.mode, look: g.coinDeal._look, near: g.coinDeal._near })); }
    log('at stall → step', T.step, 'deal open', g.coinDeal._open, 'mayTake', g.coinDeal.mayTake(), 'pouch cell shown', g.inventory.pouchCell?.style.display !== 'none');
    // the pocket touch with the empty off hand
    const off = g.off || 'left';
    const took = g.inventory.takeNext(off);
    await h.frames(10);
    const hp = g.items.held[off];
    log('takeNext', took, 'held', hp?.item.kind, hp?.item.count, 'step', T.step, T._said.slice(0, 40));
    // a few seconds in the hand: does it fall out by itself?
    await h.frames(120);
    log('after 120 frames held', g.items.held[off]?.item.kind || 'NOTHING', 'loose coins', [...g.items.loose.values()].filter((x) => x.item.kind === 'coins').length);
    // put it on the counter (released over the counter's middle, a little above)
    const c = st.counter;
    const it = g.items.releaseHand(off);
    const Lc = g.items.spawnLoose(it, new h.THREE.Vector3((c.x0 + c.x1) / 2, c.top + 0.6, c.z1 - 0.2), { broadcast: false });
    for (let i = 0; i < 40; i++) { await h.frames(5); if (Lc.rest) break; }
    log('on counter: rest', Lc.rest, 'pos', [Lc.model.position.x, Lc.model.position.y, Lc.model.position.z].map((n) => n.toFixed(2)).join(','), 'counterCoins', talk._counterCoins(st0() && L.castles.get('tutorial-market').def, 0).length, 'step', T.step, 'labels', talk._labelText?.size);
    await h.frames(60);
    log('labels after 60f', talk._labelText?.size, 'purse', JSON.stringify(talk.purse && { uid: talk.purse.uid }), 'step', T.step, T._said.slice(0, 50));
    await h.until(() => T.step >= 3, 30000);
    // name the first good
    const goods = talk._goodsOf(v);
    const want = goods[0];
    const { ITEM_INFO } = await import('/src/game/ItemTypes.js');
    const nm = (ITEM_INFO[want.item.kind]?.name || want.item.kind).toLowerCase();
    log('naming', nm, 'price', want.item.shop.price);
    const ok = talk._payByName(v, nm);
    for (let i = 0; i < 20; i++) await h.frames(10);
    log('payByName', ok, 'paid', !!want.item.shop?.paid, 'bought', T.ctx.bought, 'step', T.step, 'coins belt', g.inventory.coins(), 'counter coins', talk._counterCoins(L.castles.get('tutorial-market').def, 0).map((x) => x.item.count).join(','), 'labels', talk._labelText?.size);
    await h.page('buy-paid', 10);
    log('said', T._said.slice(0, 80));
}
