// Count Sracula's castle: the castle from the ridge and from the side, the count in his hall, the bats, the crypt; his portrait for the Codex.
//   node tools/shot.mjs vampire        → docs/media/shots/vampire/*.png + assets/bosses/vampire.png (→ .webp: ffmpeg)
export default async function (h) {
    const g = h.g, V = g.vampire, P = V?.plan;
    if (!P) { h.log('no castle in this world'); return; }
    const a = P.approach, F = P.floor;
    await h.go(a.x, a.y + 2.2, a.z);
    await h.go(P.x, F + 6, P.z); // (the castle's own land loaded)
    await h.until(() => V.count, 30000);
    h.log({ count: !!V.count, bats: V.bats.length, guards: V.guards.length, dark: V.skyDark });
    // 1. from the ridge: the bridge leading to the castle
    const dx = P.x - a.x, dz = P.z - a.z, L = Math.hypot(dx, dz), ux = dx / L, uz = dz / L;
    await h.go(a.x, a.y + 2.2, a.z);
    h.bare();
    h.cam([a.x - ux * 30 + uz * 14, a.y + 14, a.z - uz * 30 - ux * 14], [P.x, F + 22, P.z]);
    await h.shot('1-approach', { settle: 60 });
    // 2. from the side: the crag, the gorge, the spires
    h.cam([P.x + uz * 150 - ux * 40, F + 30, P.z - ux * 150 - uz * 40], [P.x, F + 10, P.z]);
    await h.shot('2-side', { settle: 60, light: 1.6 }); // (under his clouds: a little more light, only for the picture)
    // 3. the count, risen to talk to a guest, by his throne
    await h.go(P.hall.x, P.hall.y + 2.2, P.hall.z);
    V._wake('guest');
    await h.frames(30);
    const k = V.count;
    // in front of the throne, on the hall's floor (the throne itself stands on a dais: inside it he would be hidden)
    const fx = P.hall.x - P.throne.x, fz = P.hall.z - P.throne.z, fl = Math.hypot(fx, fz) || 1;
    k.pos.set(P.throne.x + fx / fl * 7, F + 0.5, P.throne.z + fz / fl * 7);
    k.yaw = Math.atan2(fx, fz) + Math.PI;
    k.parleyT = -1e9; // (no warnings, no attack while the pictures are taken)
    await h.frames(30);
    const gp = k.model.group.getWorldPosition(new h.THREE.Vector3());
    h.log({ mode: k.mode, visible: k.model.group.visible, inScene: !!k.model.group.parent, pos: [k.pos.x, k.pos.y, k.pos.z].map(Math.round), group: [gp.x, gp.y, gp.z].map(Math.round), hero: [P.hall.x, P.hall.y, P.hall.z].map(Math.round) });
    h.view(k.model.group, { d: 5, up: 1.6, at: 2.2 });
    await h.shot('3-count', { light: 1.3 });
    await h.shot('portrait', { to: 'assets/bosses/vampire.png', settle: 1, light: 1.3 });
    h.view(k.model.group, { d: 20, up: 7, at: 3 });
    await h.shot('4-hall');
    // 5. the bats round a spire
    const r = P.roosts[1];
    h.cam([r.x + 14, r.y + 2, r.z + 14], [r.x, r.y, r.z]);
    await h.shot('5-bats');
    // 6. the coffin in the crypt
    h.cam([P.crypt.x + 4, F + 4.5, P.crypt.z + 4], [P.coffin.x, F + 1, P.coffin.z]);
    await h.shot('6-crypt', { light: 1.6 });
}
