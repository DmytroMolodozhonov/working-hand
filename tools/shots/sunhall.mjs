// The Hall of the Sun alone (Godhood.enterHall): built, then looked at from inside and outside.
//   node tools/shot.mjs sunhall       → docs/media/shots/sunhall/*.png
export default async function (h) {
    const g = h.g, G = g.godhood;
    G.state.god = true;
    G.enterHall();
    await h.until(() => !G.hall, 90000);
    const S = (await import('/src/world/SunHallPlan.js')).SUN_HALL, d = g.world.terrain.data;
    const count = () => { let n = 0; for (let x = -24; x <= 24; x += 4) for (let z = -24; z <= 24; z += 4) if (d.get(S.CX + x, S.F - 1, S.CZ + z) !== 0) n++; return n; };
    h.log('placed; floor cells', count(), 'marker', d.get(S.CX, S.F - 1, S.CZ), 'hero', g.character.group.position.toArray().map(Math.round));
    await h.frames(400);
    h.log('after 400 frames: floor cells', count(), 'meshes pending', g.world.terrain?._pending?.size ?? '?');
    h.bare();
    h.cam([S.CX, S.F + 4, S.CZ + 18], [S.CX, S.F + 4, S.CZ - 15]);
    await h.shot('1-inside', { settle: 60 });
    h.cam([S.CX + 3, S.F + 2.5, S.CZ - 9], [S.CX, S.F, S.CZ - 15]);
    await h.shot('2-book', { settle: 10 });
    h.cam([S.CX, S.F + 20, S.CZ + 6], [S.CX, S.F - 1, S.CZ]);
    await h.shot('3-pentagram', { settle: 10 });
    h.cam([S.CX + 50, S.F + 20, S.CZ + 60], [S.CX, S.F + 8, S.CZ]);
    await h.shot('4-outside', { settle: 30 });
}
