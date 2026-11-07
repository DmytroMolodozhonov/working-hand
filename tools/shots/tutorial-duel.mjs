// «Обучение»: the duel's demo (the wizard's «Экспеллиармус» knocks the hero's wand out) and the zombies of the last fight.
//   node tools/shot.mjs tutorial-duel --mode tutorial
export default async function (h) {
    const g = h.g, T = g.tutorial;
    await h.frames(30);
    T._start(9); await h.frames(20);
    // the wand in the leading hand (as the step «Достаньте палочку» ends)
    const inv = g.inventory, i = inv.slots.findIndex((s) => s?.kind === 'wand');
    if (i >= 0) { g.items.takeIntoHand(inv.slots[i], g.dom || 'right', { closed: true }); inv.slots[i] = null; inv._render(); }
    await h.until(() => T.step >= 2, 60000);
    h.log('step', T.step, 'wiz', !!T.ctx.wiz, 'wand in hand', T._wandInHand());
    await h.until(() => T.ctx.demoCast || T.ctx.demoDone, 90000);
    h.log('demoCast', !!T.ctx.demoCast, 'demoDone', !!T.ctx.demoDone);
    await h.until(() => T.ctx.demoDone, 60000);
    h.log('after demo: wand in hand', T._wandInHand(), 'loose wands', [...g.items.loose.values()].filter((L) => L.item.kind === 'wand').length, 'step', T.step);
    await h.page('duel-demo', 5);
    // the zombies
    T._start(10);
    await h.until(() => T.step >= 1, 60000);
    for (let k = 0; k < 6; k++) {
        await h.frames(60);
        const zs = T.zombies || [];
        h.log('zombies', zs.length, 'in game', g.zombies.length, zs.map((z) => [Math.round(z.group.position.x), Math.round(z.group.position.z), z.isDead ? 'dead' : z.isFrozen ? 'frozen' : z.isSleeping ? 'sleep' : 'ok', g.zombies.includes(z) ? 'in' : 'GONE'].join(':')).join(' '), 'step', T.step, 'stage', T.stage);
    }
    await h.page('zombies', 5);
}
