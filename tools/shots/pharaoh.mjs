// Pharaoh Sandy for the Codex: risen in the burial chamber, before his golden sarcophagus; his portrait → assets/bosses/pharaoh.png
//   node tools/shot.mjs pharaoh
export default async function (h) {
    const g = h.g, Ph = g.pharaoh, P = Ph?.plan;
    if (!P) { h.log('no pyramids in this world'); return; }
    await h.go(P.pharaoh.x + 6, P.pharaoh.y + 2.2, P.pharaoh.z, true);
    await h.until(() => Ph.pharaoh, 40000);
    const c = Ph.pharaoh;
    h.log({ on: Ph.on, mode: c?.mode });
    Ph.wakePharaoh('guest', g.localId);
    await h.frames(10);
    c.mode = 'fight'; c.foe = null; c.cool = 1e9; c.waveCool = c.locustCool = c.curseCool = 1e9;
    Ph._thinkPharaoh = () => {}; // (he stands still while the pictures are taken)
    c.model.group.visible = true;
    c.pos.set(P.pharaoh.x + Math.cos(c.yaw) * 2.8, P.pharaoh.y - 2.0 + 1.5, P.pharaoh.z - Math.sin(c.yaw) * 2.8);
    await h.frames(30);
    h.bare();
    h.view(c.model.group, { d: 5.5, up: 1.8, at: 2.4 });
    await h.shot('1-pharaoh', { settle: 20 });
    await h.shot('portrait', { to: 'assets/bosses/pharaoh.png', settle: 1 });
    h.view(c.model.group, { d: 11, up: 3.5, at: 2.2 });
    await h.shot('2-wide', { settle: 20 });
}
