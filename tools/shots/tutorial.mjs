// «Обучение» (Tutorial.js): the land, the panel of the stages, the narrator's words — and a few stages walked by hand.
//   node tools/shot.mjs tutorial --mode tutorial
export default async function (h) {
    const g = h.g, T = g.tutorial;
    const me = g.character.group.position;
    h.log('tutorial', !!T, 'stage', T?.stage, 'step', T?.step, 'frozen', T?.frozen, 'zombies', g.zombies.length, 'hero', [me.x, me.y, me.z].map(Math.round));
    await h.frames(60);
    await h.page('1-start', 30);
    h.log('said', T._said?.slice(0, 80));
    // the hill: from the hero's place, looking north
    h.cam([0, 14, 16], [0, 12, -12]);
    await h.shot('2-hill', { settle: 10 });
    h.cam([0, 60, 70], [0, 10, 0]);
    await h.shot('3-meadow', { settle: 10 });
    window.__shotCam = null; g.character.group.visible = true;
    // the duel stage: the wizard on the meadow
    try { T._start(8); } catch (e) { h.log('start 8 failed', String(e)); }
    await h.frames(90);
    const w = T.ctx.wiz || null;
    h.log('wizard', !!w, w && [w.hp, !!w.model?.heldTool, w.foe ? 1 : 0], 'stage', T.stage, 'said', T._said?.slice(0, 60));
    await h.page('4-duel', 10);
    // the end: the bosses
    try { T._start(10); } catch (e) { h.log('start 10 failed', String(e)); }
    await h.frames(20);
    await h.page('5-bosses', 5);
    T.step = T.stages[10].steps.length - 1; T._next(); await h.frames(10);
    await h.page('6-finish', 5);
    h.log('done', T.done, 'others', { animals: g.animals?.list?.length ?? g.animals?.animals?.length, birds: g.books?.birds?.size, zombies: g.zombies.length });
}
