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
    // the camera on the far side of him from the sarcophagus (the lid would be in front of his face), the chamber lit a little for the picture
    const ux = Math.cos(c.yaw), uz = -Math.sin(c.yaw), hp = c.pos, look = [hp.x, hp.y + 3.0, hp.z];
    h.cam([hp.x - ux * 5.2 + uz * 0.8, hp.y + 3.3, hp.z - uz * 5.2 - ux * 0.8], look);
    await h.shot('1-pharaoh', { settle: 20, light: 2.2 });
    await h.shot('portrait', { to: 'assets/bosses/pharaoh.png', settle: 1, light: 2.2 });
    h.cam([hp.x - ux * 10 + uz * 3, hp.y + 5, hp.z - uz * 10 - ux * 3], [hp.x, hp.y + 2.2, hp.z]);
    await h.shot('2-wide', { settle: 20, light: 2.2 });
}
