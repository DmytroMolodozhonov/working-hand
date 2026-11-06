// Captain Blackbeard for the Codex: alone on his deck (the crew hidden — no skeleton in front); portrait → assets/bosses/blackbeard.png
//   node tools/shot.mjs blackbeard
export default async function (h) {
    const g = h.g, B = g.blackbeard;
    const ship = B._ensure();
    if (!ship) { h.log('no black ship'); return; }
    await h.go(ship.st.x, 30, ship.st.z, true);
    const crew = () => [...g.ships.crew.byId.values()];
    const find = () => crew().find((v) => v.role === 'blackbeard' && !v.dead);
    await h.until(find, 30000);
    const v = find();
    if (!v) { h.log('no captain'); return; }
    h.hold(crew());
    await h.frames(30);
    for (const o of crew()) if (o !== v) o.group.visible = false; // (only the captain in the picture)
    h.bare();
    h.view(v.group, { d: 6, up: 1.8, at: 1.4 });
    await h.shot('1-captain', { settle: 20 });
    await h.shot('portrait', { to: 'assets/bosses/blackbeard.png', settle: 1 });
}
