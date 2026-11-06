// «Почти стал богом»: the ascension (the pillar of the Sun's light, the hero lifted, the burst) and the Hall of the Sun.
//   node tools/shot.mjs godhood       → docs/media/shots/godhood/*.png
export default async function (h) {
    const g = h.g, G = g.godhood;
    if (!G) { h.log('no godhood'); return; }
    const me = g.character.group.position;
    await h.frames(30);
    h.log('noMagic before', G.noMagic);
    G.ascend(true);
    const c = () => G.cer;
    const at = async (t) => { await h.until(() => !c() || c().t >= t, 20000); };
    // a camera off to the side, looking at the hero in the light
    const base = me.clone();
    const side = () => h.cam([base.x + 12, base.y + 4, base.z + 14], [base.x, base.y + 3, base.z]);
    await at(1.5); side(); await h.shot('1-light-comes', { settle: 0 });
    await at(4.5); side(); await h.shot('2-lifted-pain', { settle: 0 });
    await at(7.35); side(); await h.shot('3-burst', { settle: 0 });
    await at(8.2); h.cam([base.x + 30, base.y + 18, base.z + 30], [base.x, base.y, base.z]); await h.shot('4-ring', { settle: 0 });
    await h.until(() => !c(), 8000);
    h.log('god', G.god, 'immortal', G.immortal, 'mana', g.combat?.maxFatigue);
    // the Hall
    G.enterHall();
    await h.until(() => !G.hall, 60000);
    const S = (await import('/src/world/SunHallPlan.js')).SUN_HALL;
    await h.frames(60);
    h.bare();
    h.cam([S.CX, S.F + 4, S.CZ + 18], [S.CX, S.F + 4, S.CZ - 15]);
    await h.shot('5-hall', { settle: 30 });
    h.cam([S.CX + 2, S.F + 2.5, S.CZ - 9], [S.CX, S.F, S.CZ - 15]);
    await h.shot('6-golden-book', { settle: 10 });
    h.cam([S.CX, S.F + 20, S.CZ + 6], [S.CX, S.F - 1, S.CZ]);
    await h.shot('7-pentagram', { settle: 10 });
    h.cam([S.CX + 50, S.F + 20, S.CZ + 60], [S.CX, S.F + 8, S.CZ]);
    await h.shot('8-hall-outside', { settle: 10 });
}
