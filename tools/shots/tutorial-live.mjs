// «Обучение»: the stall's merchant and his goods, the duel's wizard really fighting (TutorialLand has no castles: CastleLife's own places).
//   node tools/shot.mjs tutorial-live --mode tutorial
export default async function (h) {
    const g = h.g, T = g.tutorial, L = g.castleLife;
    await h.frames(30);
    T._start(8); await h.frames(10);
    g.character.group.position.set(20, 12.6, 4.5); window.__pin = [20, 12.6, 4.5];
    const mer = () => [...L.byId.values()].find((v) => v.cs?.def?.id === 'tutorial-market');
    await h.until(() => !!mer(), 30000);
    await h.frames(120);
    const m = mer();
    h.log('merchant', !!m, m && m.role, 'goods', m ? L.talk._goodsOf(m).length : -1);
    g.faceYaw?.(Math.PI); await h.frames(20);
    await h.page('live-market', 10);
    window.__pin = null;
    T._start(9); await h.frames(30);
    const t0 = performance.now(), hp0 = g.combat.hp;
    let seen = null;
    while (performance.now() - t0 < 90000) {
        await h.frames(10);
        const v = T.ctx.wiz;
        if (v) seen = { hp: v.hp, foe: v.foe, W: !!v.W, job: v.job, x: Math.round(v.x), z: Math.round(v.z), step: T.step, eng: v.engage && { role: v.engage.role, t: +(v.engage.t || 0).toFixed(1), level: v.engage.level }, mode: v.mode, flee: v.fleeT, cd: +(v.castCd || 0).toFixed(1), mana: Math.round(v.mana || 0), fear: v.fear, hostile: [...v.cs.hostile.entries()].map(([k, t]) => [k, Math.round((t - Date.now()) / 1000)]), me: g.localId, dbg: (() => { try { const F = L.wizards.fight, fp = L._playerPos(v.foe), d = fp ? Math.hypot(fp.x - v.x, fp.z - v.z) : -1; return { fp: fp && [fp.x, fp.y, fp.z].map(Math.round), d: Math.round(d), ready: F._castReady(v, d), clear: fp ? F.clearShot(v, fp) : null, wt: v.wt && v.wt.role, castT: v.castT, prep: !!v.prep, clash: !!v.clash, mana: v.mana, range: v.W.range }; } catch (e) { return String(e); } })() };
        if (v && !h._n) h._n = 0;
        if (v && (h._n++ % 40) === 0) h.log('w', JSON.stringify(seen));
        if (T.step >= 2 && v && !h._shot) { h._shot = 1; await h.page('live-duel', 30); }
    }
    h.log('wizard', JSON.stringify(seen), 'hero hp', hp0, '→', g.combat.hp, 'duel', !!g.duel?.active, 'events', JSON.stringify(T.events));
}
