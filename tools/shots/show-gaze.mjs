// «Показать жителю»: the leading hand held up and pointing — the people near look that way (ShowGaze.js). A check in the real game + a picture.
//   ZNS_CHROME=… node tools/shot.mjs show-gaze → docs/media/shots/show-gaze/*.png
export default async function (h) {
    const g = h.g, V = g.terrain?.data?.villages?.spawnVillage?.();
    if (!V) { h.log('no settlement'); return; }
    const s = V.stalls.find((q) => q.counter) || V.stalls[0];
    await h.go(s.front.x, s.front.y + 2.2, s.front.z);
    await h.frames(120);
    const people = [...g.castleLife.byId.values()].filter((v) => !v.dead && Math.hypot(v.x - s.front.x, v.z - s.front.z) < 20);
    h.log({ people: people.length, near: people.map((v) => [v.id, Math.round(Math.hypot(v.x - s.front.x, v.z - s.front.z))]) });
    const talk = g.castleLife.talk, sg = talk.showGaze;
    const me = g.character.group.position;
    // the hand: raised and pointing along +x (a fixed ray), as a steady hero would hold it
    const side = g.dom || 'right';
    const raise = g.character.isArmRaised;
    g.character.isArmRaised = (sd) => sd === side;
    const ray = g.duel._myRay;
    g.duel._myRay = (sd, o, d) => { o.copy({ x: me.x, y: me.y + 1.5, z: me.z }); d.set(1, 0.05, 0).normalize(); return true; };
    h.bare(); h.time(0.3);
    await h.frames(240);
    const out = people.map((v) => ({ id: v.id, glance: v.glance ? [Math.round(v.glance.x), Math.round(v.glance.z), !!v.glance.show] : null }));
    h.log({ looking: out.filter((o) => o.glance).length, of: out.length, detail: out });
    if (people[0]) { h.view(people[0].model.group, { d: 6, up: 1.6, at: 2.2 }); await h.shot('1-looks', { settle: 5 }); }
    g.character.isArmRaised = raise; g.duel._myRay = ray;
    await h.frames(60);
    h.log({ after: people.map((v) => !!v.glance) });
    void sg;
}
